import { db } from '@/database/db'
import type { RecordingRecord } from '@/types/models'

/* ---------------------------------------------------------------------------
   Lecture audio, read side. Rows are light; the bytes live in `audioChunks`
   and are fetched only when someone plays or saves a recording. The capture
   side (the only writer of new chunks) is recorder.ts.
--------------------------------------------------------------------------- */

export async function listRecordings(noteId: string): Promise<RecordingRecord[]> {
  return (await db.recordings.where('noteId').equals(noteId).toArray()).sort((a, b) => a.startedAt - b.startedAt)
}

/** True when the audio itself is on this device (a restored backup keeps the row but not the bytes). */
export async function hasAudio(id: string): Promise<boolean> {
  return (await db.audioChunks.where('recordingId').equals(id).count()) > 0
}

/** The whole recording as one Blob, or null when no audio is stored. Chunks are joined in order. */
export async function getRecordingBlob(rec: Pick<RecordingRecord, 'id' | 'mime'>): Promise<Blob | null> {
  const chunks = await db.audioChunks.where('recordingId').equals(rec.id).toArray()
  if (chunks.length === 0) return null
  chunks.sort((a, b) => a.seq - b.seq)
  return new Blob(
    chunks.map((c) => c.data),
    { type: rec.mime },
  )
}

export async function deleteRecording(id: string): Promise<void> {
  await db.transaction('rw', db.recordings, db.audioChunks, async () => {
    await db.audioChunks.where('recordingId').equals(id).delete()
    await db.recordings.delete(id)
  })
}

/**
 * Boot-time recovery: a row still marked `recording` means the app died mid
 * lecture. What was written is kept and playable; the row just stops claiming
 * to be live. Returns the rows it changed so the caller can say so.
 */
export async function interruptStale(): Promise<RecordingRecord[]> {
  const stale = (await db.recordings.toArray()).filter((r) => r.status === 'recording')
  if (stale.length === 0) return []
  const fixed = stale.map((r) => ({ ...r, status: 'interrupted' as const }))
  await db.recordings.bulkPut(fixed)
  return fixed
}

/** "mm:ss", or "h:mm:ss" past an hour. */
export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const p = (n: number): string => String(n).padStart(2, '0')
  return h > 0 ? `${h}:${p(m)}:${p(s)}` : `${m}:${p(s)}`
}

/** File extension for a saved recording, from its MIME type. */
export function audioExtension(mime: string): string {
  if (mime.includes('mp4') || mime.includes('aac')) return 'm4a'
  if (mime.includes('ogg')) return 'ogg'
  if (mime.includes('webm')) return 'webm'
  return 'audio'
}
