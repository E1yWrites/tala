import Dexie from 'dexie'
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '@/database/db'
import { useNoteStore } from '@/store/noteStore'
import { usePageStore } from '@/store/pageStore'
import { parseBackup, snapshotToZip } from '@/utils/exportImport'
import { markOnDisk, createNote, deleteForever, flush } from './notes'
import { CHUNK_MS, pickMime, resetRecorderForTests, startRecording, stopRecording, useRecorderStore } from './recorder'
import type { RecorderEnv } from './recorder'
import { audioExtension, formatDuration, getRecordingBlob, hasAudio, interruptStale, listRecordings } from './recordings'
import { dump, restore } from './snapshot'

/** A MediaRecorder that only does what the recorder asks of it; the test feeds chunks by hand. */
class FakeRecorder {
  state: 'inactive' | 'recording' = 'inactive'
  timeslice = 0
  ondataavailable: ((e: { data: Blob }) => void) | null = null
  onstop: (() => void) | null = null
  onerror: (() => void) | null = null
  start(timeslice: number): void {
    this.state = 'recording'
    this.timeslice = timeslice
  }
  stop(): void {
    this.state = 'inactive'
    // like the real thing: the last chunk is delivered before the stop event, both asynchronously
    queueMicrotask(() => {
      this.ondataavailable?.({ data: new Blob(['last']) })
      this.onstop?.()
    })
  }
  chunk(text: string): void {
    this.ondataavailable?.({ data: new Blob([text]) })
  }
}

function fakeEnv(clock: { t: number }) {
  const recorder = new FakeRecorder()
  let trackStopped = 0
  let wakeLocks = 0
  let released = 0
  const track = { stop: () => trackStopped++, onended: null as null | (() => void) }
  const stream = { getTracks: () => [track], getAudioTracks: () => [track] } as unknown as MediaStream
  const env: RecorderEnv = {
    getStream: async () => stream,
    createRecorder: () => recorder as unknown as MediaRecorder,
    isTypeSupported: (m) => m === 'audio/webm',
    now: () => clock.t,
    acquireWakeLock: async () => {
      wakeLocks++
      return () => void released++
    },
  }
  return { env, recorder, track, counts: () => ({ trackStopped, wakeLocks, released }) }
}

/** fake-indexeddb resolves on later ticks: wait for the condition instead of guessing a delay. */
async function until(cond: () => Promise<boolean> | boolean): Promise<void> {
  for (let i = 0; i < 200; i++) {
    if (await cond()) return
    await new Promise((r) => setTimeout(r, 5))
  }
  throw new Error('condition never became true')
}

beforeEach(async () => {
  db.close()
  await Dexie.delete('tala')
  await db.open()
  resetRecorderForTests()
  useNoteStore.setState({ notes: [], inkDocs: {}, hydrated: false })
  usePageStore.setState({ pagesByNote: {}, hydrated: false })
  markOnDisk([])
})

describe('pickMime / helpers', () => {
  it('prefers MP4 where the browser can, falls back through WebM', () => {
    expect(pickMime((m) => m.startsWith('audio/mp4'))).toBe('audio/mp4;codecs=mp4a.40.2')
    expect(pickMime((m) => m === 'audio/webm')).toBe('audio/webm')
    expect(pickMime(() => false)).toBe('')
  })
  it('formats durations and picks file extensions', () => {
    expect(formatDuration(65_000)).toBe('1:05')
    expect(formatDuration(3_725_000)).toBe('1:02:05')
    expect(audioExtension('audio/webm;codecs=opus')).toBe('webm')
    expect(audioExtension('audio/mp4')).toBe('m4a')
  })
})

describe('recording a lecture', () => {
  it('writes every chunk straight to IndexedDB, in order, and finishes as complete', async () => {
    const clock = { t: 1_000_000 }
    const { env, recorder, counts } = fakeEnv(clock)
    const rec = await startRecording('note-1', env)

    expect(recorder.timeslice).toBe(CHUNK_MS)
    expect(useRecorderStore.getState().active?.noteId).toBe('note-1')
    expect(counts().wakeLocks).toBe(1)

    clock.t += 5000
    recorder.chunk('a')
    clock.t += 5000
    recorder.chunk('b')
    // mid-recording the data is already durable
    await until(async () => (await db.audioChunks.where('recordingId').equals(rec.id).count()) === 2)
    const mid = (await db.recordings.get(rec.id))!
    expect(mid).toMatchObject({ status: 'recording', chunkCount: 2, durationMs: 10_000, mime: 'audio/webm' })

    clock.t += 2000
    await stopRecording()

    const done = (await db.recordings.get(rec.id))!
    expect(done.status).toBe('complete')
    expect(done.durationMs).toBe(12_000) // our own clock, not the media's
    expect(done.chunkCount).toBe(3) // a, b and the final chunk delivered by stop()
    expect(useRecorderStore.getState().active).toBeNull()
    expect(counts()).toMatchObject({ trackStopped: 1, released: 1 })

    const blob = await getRecordingBlob(done)
    expect(blob!.type).toBe('audio/webm')
    expect(await blob!.text()).toBe('ablast')
    expect(await hasAudio(rec.id)).toBe(true)
  })

  it('refuses a second recording while one is running', async () => {
    const { env } = fakeEnv({ t: 1 })
    await startRecording('n', env)
    await expect(startRecording('n', fakeEnv({ t: 1 }).env)).rejects.toThrow(/already running/)
    await stopRecording()
  })

  it('leaves the row playable and interrupted when the microphone is taken away', async () => {
    const clock = { t: 0 }
    const { env, recorder, track } = fakeEnv(clock)
    const rec = await startRecording('n', env)
    clock.t += 5000
    recorder.chunk('x')
    await until(async () => (await db.audioChunks.count()) === 1)
    track.onended?.() // the OS ended the mic (iOS suspend, another app took the audio session)
    await until(async () => (await db.recordings.get(rec.id))!.status !== 'recording')
    expect((await db.recordings.get(rec.id))!.status).toBe('interrupted')
    expect(await hasAudio(rec.id)).toBe(true)
    expect(useRecorderStore.getState().active).toBeNull()
  })

  it('a mic that will not start leaves nothing behind', async () => {
    const env: RecorderEnv = { ...fakeEnv({ t: 0 }).env, getStream: async () => Promise.reject(Object.assign(new Error('x'), { name: 'NotAllowedError' })) }
    await expect(startRecording('n', env)).rejects.toThrow()
    expect(await db.recordings.count()).toBe(0)
    expect(useRecorderStore.getState().active).toBeNull()
  })
})

describe('after a crash', () => {
  it('boot turns a row stuck on "recording" into "interrupted" and keeps its audio', async () => {
    await db.recordings.put({ id: 'r', noteId: 'n', startedAt: 1, durationMs: 360_000, mime: 'audio/webm', status: 'recording', chunkCount: 72, bytes: 1 })
    await db.audioChunks.put({ recordingId: 'r', seq: 0, data: new Blob(['kept']) })

    const fixed = await interruptStale()
    expect(fixed.map((r) => [r.id, r.status, r.durationMs])).toEqual([['r', 'interrupted', 360_000]])
    expect((await listRecordings('n'))[0]!.status).toBe('interrupted')
    expect(await (await getRecordingBlob({ id: 'r', mime: 'audio/webm' }))!.text()).toBe('kept')
    expect(await interruptStale()).toEqual([]) // nothing left to fix
  })
})

describe('recordings and the library', () => {
  it('deleting a note removes its recordings and audio, and nobody else\'s', async () => {
    const a = createNote({ title: 'A' })
    const b = createNote({ title: 'B' })
    await flush()
    for (const [id, noteId] of [['ra', a.id], ['rb', b.id]] as const) {
      await db.recordings.put({ id, noteId, startedAt: 1, durationMs: 1, mime: 'audio/webm', status: 'complete', chunkCount: 1, bytes: 1 })
      await db.audioChunks.put({ recordingId: id, seq: 0, data: new Blob(['x']) })
    }
    await deleteForever([a.id])
    expect((await db.recordings.toArray()).map((r) => r.id)).toEqual(['rb'])
    expect(await db.audioChunks.count()).toBe(1)
  })

  it('a backup carries recording rows but never the audio, and restores them without claiming to be live', async () => {
    const n = createNote({ title: 'Lecture' })
    await flush()
    await db.recordings.put({ id: 'r', noteId: n.id, startedAt: 5, durationMs: 90_000, mime: 'audio/mp4', status: 'recording', chunkCount: 18, bytes: 1000 })
    await db.audioChunks.put({ recordingId: 'r', seq: 0, data: new Blob(['audio-bytes']) })
    await db.meta.put({ key: 'coach:weeklyGoal', value: 4 })

    const snap = await dump()
    expect(snap.audioChunks).toEqual([])
    expect(snap.recordings).toHaveLength(1)
    expect(snap.meta).toHaveLength(1)

    const zip = await snapshotToZip(snap)
    const text = await (await (await import('jszip')).default.loadAsync(await zip.arrayBuffer())).file('backup.json')!.async('string')
    expect(text).not.toContain('audio-bytes')
    const parsed = parseBackup(text)
    expect(parsed.recordings![0]).toMatchObject({ id: 'r', status: 'interrupted', durationMs: 90_000 })

    await restore({ notes: parsed.notes, folders: [], tags: [], recordings: parsed.recordings, meta: parsed.meta }, 'replace')
    expect((await db.recordings.get('r'))!.status).toBe('interrupted')
    expect(await hasAudio('r')).toBe(false) // row survived, bytes did not: the UI says "audio not in this backup"
    expect((await db.meta.get('coach:weeklyGoal'))!.value).toBe(4)
  })
})
