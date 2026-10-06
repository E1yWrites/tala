import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { Download, Mic, Pause, Play, Square, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import type { RecordingRecord } from '@/types/models'
import {
  describeMicError,
  isRecordingSupported,
  startRecording,
  stopRecording,
  useRecorderStore,
} from '@/library/recorder'
import {
  audioExtension,
  deleteRecording,
  formatDuration,
  getRecordingBlob,
  hasAudio,
  listRecordings,
} from '@/library/recordings'
import { useTick } from '@/hooks/useTick'
import { downloadBlob } from '@/utils/markdown'
import { Button } from '@/components/UI/Button'
import { cn } from '@/utils/cn'

/* ---------------------------------------------------------------------------
   Lecture audio for one note: record, replay, save, delete. One <audio> plays
   at a time. Strokes written during a recording carry a timestamp, so the
   editor can call `seekToTime(ts)` to replay what was said when they were drawn.
--------------------------------------------------------------------------- */

/** Seconds of lead-in so a tapped word is heard from just before it was written. */
const LEAD_IN_S = 2

export interface RecordingsHandle {
  /** Play the recording that covers `ts` (epoch ms) from just before that moment. False when none does. */
  seekToTime: (ts: number) => Promise<boolean>
}

interface Player {
  recId: string | null
  playing: boolean
  /** Seconds. */
  pos: number
  error: string | null
}

/** One shared <audio> element: choosing another recording replaces the source. */
function useAudioPlayer(): Player & {
  play: (rec: RecordingRecord, fromSec?: number) => Promise<void>
  pause: () => void
  seek: (sec: number) => void
} {
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const urlRef = useRef<string | null>(null)
  const [state, setState] = useState<Player>({ recId: null, playing: false, pos: 0, error: null })

  const release = useCallback(() => {
    audioRef.current?.pause()
    audioRef.current = null
    if (urlRef.current) URL.revokeObjectURL(urlRef.current)
    urlRef.current = null
  }, [])
  useEffect(() => release, [release])

  const play = useCallback(
    async (rec: RecordingRecord, fromSec = 0): Promise<void> => {
      if (state.recId !== rec.id || !audioRef.current) {
        release()
        const blob = await getRecordingBlob(rec)
        if (!blob) {
          setState({ recId: rec.id, playing: false, pos: 0, error: 'The audio is not on this device.' })
          return
        }
        const url = URL.createObjectURL(blob)
        const a = new Audio(url)
        urlRef.current = url
        audioRef.current = a
        a.addEventListener('timeupdate', () => setState((s) => ({ ...s, pos: a.currentTime })))
        a.addEventListener('play', () => setState((s) => ({ ...s, playing: true })))
        a.addEventListener('pause', () => setState((s) => ({ ...s, playing: false })))
        a.addEventListener('ended', () => setState((s) => ({ ...s, playing: false })))
        a.addEventListener('error', () =>
          setState((s) => ({ ...s, playing: false, error: 'This browser cannot play that recording.' })),
        )
        // A chunked WebM has no duration, which also breaks seeking: scanning to the end teaches the browser.
        a.addEventListener('loadedmetadata', () => {
          if (a.duration === Infinity) {
            a.currentTime = 1e101
            a.addEventListener('timeupdate', () => (a.currentTime = 0), { once: true })
          }
        })
        setState({ recId: rec.id, playing: false, pos: 0, error: null })
        if (a.readyState < 1) await new Promise<void>((r) => a.addEventListener('loadedmetadata', () => r(), { once: true }))
        if (audioRef.current !== a) return // replaced while loading
      }
      const a = audioRef.current!
      // wait out the Infinity-duration scan before moving the playhead
      await new Promise((r) => setTimeout(r, a.duration === Infinity ? 150 : 0))
      a.currentTime = Math.max(0, fromSec)
      await a.play().catch(() => setState((s) => ({ ...s, error: 'Playback was blocked. Tap play again.' })))
    },
    [release, state.recId],
  )

  const pause = useCallback(() => audioRef.current?.pause(), [])
  const seek = useCallback((sec: number) => {
    if (audioRef.current) audioRef.current.currentTime = Math.max(0, sec)
  }, [])

  return { ...state, play, pause, seek }
}

export const RecordingsPanel = forwardRef<RecordingsHandle, { noteId: string; open: boolean; readOnly?: boolean }>(
  function RecordingsPanel({ noteId, open, readOnly }, ref) {
    const active = useRecorderStore((s) => s.active)
    const version = useRecorderStore((s) => s.version)
    const [recordings, setRecordings] = useState<RecordingRecord[]>([])
    const [missing, setMissing] = useState<Set<string>>(new Set())
    const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
    const [starting, setStarting] = useState(false)
    const player = useAudioPlayer()
    useTick(1000) // elapsed time of a live recording

    const recordingHere = active?.noteId === noteId
    const supported = isRecordingSupported()

    useEffect(() => {
      let stale = false
      void (async () => {
        const rows = await listRecordings(noteId)
        const gone = new Set<string>()
        for (const r of rows) if (r.status !== 'recording' && !(await hasAudio(r.id))) gone.add(r.id)
        if (stale) return
        setRecordings(rows)
        setMissing(gone)
      })()
      return () => {
        stale = true
      }
    }, [noteId, version])

    useImperativeHandle(
      ref,
      () => ({
        seekToTime: async (ts) => {
          const rows = await listRecordings(noteId)
          const rec = rows.find((r) => ts >= r.startedAt && ts <= r.startedAt + Math.max(r.durationMs, 1000) + 1000)
          if (!rec || !(await hasAudio(rec.id))) return false
          await player.play(rec, (ts - rec.startedAt) / 1000 - LEAD_IN_S)
          return true
        },
      }),
      [noteId, player],
    )

    async function onRecord(): Promise<void> {
      setStarting(true)
      try {
        await startRecording(noteId)
      } catch (err) {
        toast.error(describeMicError(err))
      } finally {
        setStarting(false)
      }
    }

    async function onSave(rec: RecordingRecord): Promise<void> {
      const blob = await getRecordingBlob(rec)
      if (!blob) {
        toast.error('The audio is not on this device.')
        return
      }
      downloadBlob(`lecture-${new Date(rec.startedAt).toISOString().slice(0, 16).replace(/[:T]/g, '-')}.${audioExtension(rec.mime)}`, blob)
    }

    async function onDelete(rec: RecordingRecord): Promise<void> {
      if (player.recId === rec.id) player.pause()
      await deleteRecording(rec.id)
      setConfirmDelete(null)
      setRecordings((rs) => rs.filter((r) => r.id !== rec.id))
    }

    if (!open) return null

    return (
      <section aria-label="Lecture audio" className="mx-6 mt-3 rounded-card border border-lineSoft bg-panel p-3 shadow-rest">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-[13px] font-medium text-ink">Lecture audio</h2>
          {supported && !readOnly && (
            <div className="ml-auto">
              {recordingHere ? (
                <Button size="sm" variant="danger" onClick={() => void stopRecording()} aria-label="Stop recording">
                  <Square size={12} aria-hidden="true" />
                  Stop · <Elapsed since={active.startedAt} />
                </Button>
              ) : (
                <Button
                  size="sm"
                  variant="primary"
                  disabled={starting || !!active}
                  onClick={() => void onRecord()}
                  aria-label="Start recording"
                >
                  <Mic size={14} aria-hidden="true" />
                  Record
                </Button>
              )}
            </div>
          )}
        </div>

        {!supported && (
          <p className="mt-2 text-xs text-faint">This browser can’t record audio. Playback of saved lectures still works.</p>
        )}
        {active && !recordingHere && (
          <p className="mt-2 text-xs text-faint">A lecture is being recorded in another note.</p>
        )}
        {recordingHere && (
          <p className="mt-2 text-xs text-muted">
            Recording. Keep Tala open and the screen on. Everything you write now is timed to the audio.
          </p>
        )}

        {recordings.length === 0 && !recordingHere && (
          <p className="mt-2 text-xs text-faint">No lectures yet. Press Record, then write as usual.</p>
        )}

        <ul className="mt-2 flex flex-col gap-2">
          {recordings.map((rec) => {
            const live = rec.status === 'recording'
            const noAudio = missing.has(rec.id)
            const current = player.recId === rec.id
            const durationS = rec.durationMs / 1000
            return (
              <li key={rec.id} className="rounded-control border border-lineSoft bg-canvas p-2">
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    disabled={live || noAudio}
                    aria-label={current && player.playing ? 'Pause' : 'Play'}
                    onClick={() => (current && player.playing ? player.pause() : void player.play(rec, current ? player.pos : 0))}
                    className="grid size-8 place-items-center rounded-full bg-accent text-white transition-opacity disabled:opacity-40"
                  >
                    {current && player.playing ? <Pause size={14} aria-hidden="true" /> : <Play size={14} aria-hidden="true" />}
                  </button>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13px] text-ink">
                      {new Date(rec.startedAt).toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' })}
                      <span className="ml-2 tabular-nums text-faint">{formatDuration(rec.durationMs)}</span>
                    </div>
                    {live && <div className="text-xs text-accent">Recording…</div>}
                    {rec.status === 'interrupted' && !noAudio && (
                      <div className="text-xs text-faint">Stopped early. {formatDuration(rec.durationMs)} was saved.</div>
                    )}
                    {noAudio && <div className="text-xs text-faint">The audio is not in this backup.</div>}
                  </div>
                  {!live && !noAudio && (
                    <button type="button" aria-label="Save audio file" onClick={() => void onSave(rec)} className={ICON_BTN}>
                      <Download size={14} aria-hidden="true" />
                    </button>
                  )}
                  {!live &&
                    (confirmDelete === rec.id ? (
                      <Button size="sm" variant="danger-outline" onClick={() => void onDelete(rec)}>
                        Delete for good
                      </Button>
                    ) : (
                      <button type="button" aria-label="Delete recording" onClick={() => setConfirmDelete(rec.id)} className={ICON_BTN}>
                        <Trash2 size={14} aria-hidden="true" />
                      </button>
                    ))}
                </div>
                {current && !live && !noAudio && (
                  <div className="mt-2 flex items-center gap-2">
                    <span className="w-10 text-right text-[11px] tabular-nums text-faint">{formatDuration(player.pos * 1000)}</span>
                    <input
                      type="range"
                      aria-label="Playback position"
                      min={0}
                      max={Math.max(1, Math.round(durationS))}
                      step={1}
                      value={Math.min(player.pos, durationS)}
                      onChange={(e) => player.seek(Number(e.target.value))}
                      className="h-1 flex-1 accent-[rgb(var(--c-accent))]"
                    />
                  </div>
                )}
                {current && player.error && <p className="mt-1 text-xs text-danger">{player.error}</p>}
              </li>
            )
          })}
        </ul>

        {recordings.length > 0 && (
          <p className="mt-2 text-xs text-faint">
            Tip: pick the lasso and tap handwriting you wrote during a lecture to hear what was said at that moment.
          </p>
        )}
      </section>
    )
  },
)

const ICON_BTN = cn(
  'grid size-8 place-items-center rounded-control text-muted transition-colors hover:bg-raise hover:text-ink',
  '[@media(pointer:coarse)]:size-10',
)

function Elapsed({ since }: { since: number }): React.ReactNode {
  return <span className="tabular-nums">{formatDuration(Date.now() - since)}</span>
}
