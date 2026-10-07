import { toast } from 'sonner'
import { create } from 'zustand'
import { db } from '@/database/db'
import type { RecordingRecord } from '@/types/models'
import { createId } from '@/utils/id'
import { formatDuration } from './recordings'

/* ---------------------------------------------------------------------------
   Lecture capture. The trust rule: audio must survive the app dying. So the
   browser is asked for a chunk every 5 s and every chunk goes straight into
   IndexedDB; the recording row is updated with each one, so a crash at minute 6
   leaves ~6 minutes playable and a row that boot turns into "interrupted".
   Duration is tracked here, never read from the media (a chunked WebM reports
   Infinity). Only one recording runs at a time.
--------------------------------------------------------------------------- */

export const CHUNK_MS = 5000

/** Preferred container first: Safari only does MP4, Chromium and Firefox do WebM/Ogg. */
const MIME_PREFERENCE = ['audio/mp4;codecs=mp4a.40.2', 'audio/mp4', 'audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus']

export function pickMime(isTypeSupported: (m: string) => boolean): string {
  return MIME_PREFERENCE.find((m) => isTypeSupported(m)) ?? ''
}

/** Everything the recorder takes from the browser, so tests can hand it fakes. */
export interface RecorderEnv {
  getStream: () => Promise<MediaStream>
  createRecorder: (stream: MediaStream, mime: string) => MediaRecorder
  isTypeSupported: (mime: string) => boolean
  now: () => number
  /** Keeps the screen (and so the page) awake; resolves to a release function, or null when unsupported. */
  acquireWakeLock: () => Promise<(() => void) | null>
}

export const isRecordingSupported = (): boolean =>
  typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== 'undefined'

function browserEnv(): RecorderEnv {
  return {
    getStream: () => navigator.mediaDevices.getUserMedia({ audio: true }),
    createRecorder: (stream, mime) => new MediaRecorder(stream, mime ? { mimeType: mime } : undefined),
    isTypeSupported: (m) => MediaRecorder.isTypeSupported(m),
    now: () => Date.now(),
    acquireWakeLock: async () => {
      try {
        const lock = await navigator.wakeLock?.request('screen')
        return lock ? () => void lock.release().catch(() => undefined) : null
      } catch {
        return null // denied or unsupported: recording still works, the screen just may sleep
      }
    },
  }
}

interface ActiveRecording {
  recordingId: string
  noteId: string
  startedAt: number
}

interface RecorderState {
  active: ActiveRecording | null
  /** Bumps whenever a recording row changes, so lists know to reload. */
  version: number
}

export const useRecorderStore = create<RecorderState>(() => ({ active: null, version: 0 }))
const bump = (): void => useRecorderStore.setState((s) => ({ version: s.version + 1 }))

interface Session extends ActiveRecording {
  env: RecorderEnv
  recorder: MediaRecorder
  stream: MediaStream
  seq: number
  bytes: number
  /** Serialises chunk writes so the database order equals the arrival order. */
  chain: Promise<void>
  releaseWakeLock: (() => void) | null
  onVisible: (() => void) | null
  finished: boolean
  /** The device ended the microphone (not the user): the row finishes as interrupted. */
  cutOff: boolean
  /** Resolves when the session is fully wrapped up (last chunk written, row finalized). */
  done: Promise<void>
  resolveDone: () => void
}

let session: Session | null = null

/** Plain-language reason a recording could not start. */
export function describeMicError(err: unknown): string {
  const name = (err as { name?: string })?.name
  if (name === 'NotAllowedError' || name === 'SecurityError') return 'The microphone is blocked. Allow it for Tala in your browser settings.'
  if (name === 'NotFoundError') return 'No microphone was found on this device.'
  return 'Could not start recording.'
}

async function writeChunk(s: Session, seq: number, data: Blob): Promise<void> {
  s.bytes += data.size
  const durationMs = s.env.now() - s.startedAt
  await db.transaction('rw', db.recordings, db.audioChunks, async () => {
    // the note (and its recording row) may have been deleted while recording
    if (!(await db.recordings.get(s.recordingId))) return
    await db.audioChunks.put({ recordingId: s.recordingId, seq, data })
    await db.recordings.update(s.recordingId, { chunkCount: seq + 1, bytes: s.bytes, durationMs })
  })
}

async function setStatus(s: Session, status: RecordingRecord['status']): Promise<void> {
  await db.recordings.update(s.recordingId, { status, durationMs: s.env.now() - s.startedAt })
}

/** Wraps up a session once, whichever way it ended. */
async function finish(s: Session, status: 'complete' | 'interrupted', message?: string): Promise<void> {
  if (s.finished) return
  s.finished = true
  if (s.onVisible) document.removeEventListener('visibilitychange', s.onVisible)
  s.releaseWakeLock?.()
  s.stream.getTracks().forEach((t) => t.stop())
  await s.chain
  try {
    await setStatus(s, status)
  } catch (err) {
    console.error('[tala] could not finalize recording', err)
  }
  if (session === s) {
    session = null
    useRecorderStore.setState({ active: null })
  }
  bump()
  s.resolveDone()
  if (message) toast.error(`${message} ${formatDuration(s.env.now() - s.startedAt)} was saved.`)
}

/** Starts recording for a note. Rejects with a readable message if the mic is unavailable. */
export async function startRecording(noteId: string, env: RecorderEnv = browserEnv()): Promise<RecordingRecord> {
  if (session) throw new Error('A recording is already running.')
  const stream = await env.getStream()
  const mime = pickMime(env.isTypeSupported)
  const startedAt = env.now()
  const row: RecordingRecord = {
    id: createId(),
    noteId,
    startedAt,
    durationMs: 0,
    mime,
    status: 'recording',
    chunkCount: 0,
    bytes: 0,
  }

  let recorder: MediaRecorder
  try {
    recorder = env.createRecorder(stream, mime)
    await db.recordings.put(row)
  } catch (err) {
    stream.getTracks().forEach((t) => t.stop())
    throw err
  }

  let resolveDone = (): void => undefined
  const done = new Promise<void>((r) => (resolveDone = r))
  const s: Session = {
    recordingId: row.id,
    noteId,
    startedAt,
    env,
    recorder,
    stream,
    seq: 0,
    bytes: 0,
    chain: Promise.resolve(),
    releaseWakeLock: null,
    onVisible: null,
    finished: false,
    cutOff: false,
    done,
    resolveDone,
  }
  session = s

  recorder.ondataavailable = (e) => {
    if (e.data.size === 0) return
    const seq = s.seq++
    s.chain = s.chain.then(() =>
      writeChunk(s, seq, e.data).catch((err) => {
        console.error('[tala] audio chunk write failed', err)
        // Most likely storage is full: stop cleanly and keep what we have
        if (!s.finished && recorder.state !== 'inactive') recorder.stop()
        toast.error('Storage is full, so the recording stopped. What was recorded is saved.')
      }),
    )
  }
  recorder.onstop = () =>
    void (s.cutOff ? finish(s, 'interrupted', 'The microphone stopped.') : finish(s, 'complete'))
  recorder.onerror = () => void finish(s, 'interrupted', 'Recording stopped unexpectedly.')
  // iOS ends the microphone when the app is suspended or another app takes the audio session
  stream.getAudioTracks().forEach((t) => {
    t.onended = () => {
      if (s.finished || recorder.state === 'inactive') return
      s.cutOff = true
      recorder.stop()
    }
  })

  recorder.start(CHUNK_MS)
  useRecorderStore.setState({ active: { recordingId: row.id, noteId, startedAt } })
  bump()

  s.releaseWakeLock = await env.acquireWakeLock()
  // A wake lock is released when the page is hidden; take it back when the user returns
  if (typeof document !== 'undefined') {
    s.onVisible = () => {
      if (document.visibilityState !== 'visible' || s.finished) return
      void env.acquireWakeLock().then((release) => {
        s.releaseWakeLock?.()
        s.releaseWakeLock = release
      })
    }
    document.addEventListener('visibilitychange', s.onVisible)
  }
  return row
}

/** Stops the running recording; resolves once its last chunk is on disk. */
export async function stopRecording(): Promise<void> {
  const s = session
  if (!s) return
  if (s.recorder.state !== 'inactive') s.recorder.stop() // onstop → finish()
  else await finish(s, 'complete')
  await s.done
}

/** Deleting a note while it records must not leave the microphone on. */
export function abortRecordingFor(noteIds: string[]): void {
  if (session && noteIds.includes(session.noteId) && session.recorder.state !== 'inactive') session.recorder.stop()
}

/** Test seam: drop any session state between tests. */
export function resetRecorderForTests(): void {
  session = null
  useRecorderStore.setState({ active: null, version: 0 })
}
