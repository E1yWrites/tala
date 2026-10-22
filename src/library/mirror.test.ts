import Dexie from 'dexie'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '@/database/db'
import { useNoteStore } from '@/store/noteStore'
import { usePageStore } from '@/store/pageStore'
import { createPdfNote, flush, markOnDisk, savePageContent, createNote } from './notes'

// The App Store app, with Capacitor's Filesystem as an in-memory folder
const disk = new Map<string, string>()
vi.mock('@/utils/native', () => ({
  isNative: () => true,
  toBase64: async (b: Blob) => Buffer.from(await b.arrayBuffer()).toString('base64'),
}))
vi.mock('@capacitor/filesystem', () => {
  const missing = () => Promise.reject(new Error('File does not exist'))
  return {
    Directory: { Library: 'LIBRARY' },
    Encoding: { UTF8: 'utf8' },
    Filesystem: {
      writeFile: async ({ path, data }: { path: string; data: string }) => void disk.set(path, data),
      readFile: async ({ path }: { path: string }) => (disk.has(path) ? { data: disk.get(path)! } : missing()),
      deleteFile: async ({ path }: { path: string }) => (disk.delete(path) ? undefined : missing()),
      rename: async ({ from, to }: { from: string; to: string }) => {
        disk.set(to, disk.get(from)!)
        disk.delete(from)
      },
      readdir: async ({ path }: { path: string }) => ({
        files: [...disk.keys()].filter((k) => k.startsWith(`${path}/`)).map((k) => ({ name: k.slice(path.length + 1) })),
      }),
      rmdir: async ({ path }: { path: string }) => {
        for (const k of [...disk.keys()]) if (k.startsWith(`${path}/`)) disk.delete(k)
      },
    },
  }
})
const store = new Map<string, string>()
;(globalThis as { localStorage?: unknown }).localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
}

const { deleteMirror, restoreIfEvicted, writeMirror } = await import('./mirror')

const doc = (text: string) => ({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] })

/** iOS evicting the webview: IndexedDB and localStorage both gone. The app's folder stays. */
async function evict(): Promise<void> {
  await flush()
  db.close()
  await Dexie.delete('tala')
  await db.open()
  store.clear()
  useNoteStore.setState({ notes: [], inkDocs: {}, hydrated: false })
  usePageStore.setState({ pagesByNote: {}, hydrated: false })
  markOnDisk([])
}

beforeEach(async () => {
  await evict()
  await deleteMirror()
  disk.clear()
})

describe('library mirror (App Store app)', () => {
  it('brings the library back after iOS clears the webview storage', async () => {
    const n = createNote({ title: 'Calc' })
    await savePageContent(n.id, n.id, doc('P150 lunch'))
    await createPdfNote({ title: 'Syllabus', folderId: null, pdf: new Blob(['%PDF-1'], { type: 'application/pdf' }), pages: [{ w: 595, h: 842, text: 'week 1' }] })
    await writeMirror()

    await evict()
    expect(await restoreIfEvicted()).toBe(true)
    expect((await db.notes.toArray()).map((x) => x.title).sort()).toEqual(['Calc', 'Syllabus'])
    expect((await db.pages.get(n.id))?.text).toBe('P150 lunch')
    const [blob] = await db.blobs.toArray()
    expect(await blob!.data.text()).toBe('%PDF-1')
    expect(blob!.data.type).toBe('application/pdf')
  })

  it('leaves a library the user emptied alone', async () => {
    createNote({ title: 'Calc' })
    await writeMirror()
    await db.notes.clear() // Clear all: IndexedDB empty, but localStorage (the marker) survives
    expect(await restoreIfEvicted()).toBe(false)
    expect(await db.notes.count()).toBe(0)
  })

  it('never restores over notes, and erase removes the copy', async () => {
    createNote({ title: 'Calc' })
    await writeMirror()
    store.clear()
    expect(await restoreIfEvicted()).toBe(false) // notes still there
    await deleteMirror()
    expect([...disk.keys()]).toEqual([])
  })

  it('drops deleted PDFs from the copy', async () => {
    const pdf = await createPdfNote({ title: 'Old', folderId: null, pdf: new Blob(['%PDF-1']), pages: [{ w: 1, h: 1, text: '' }] })
    await writeMirror()
    expect([...disk.keys()].filter((k) => k.startsWith('mirror/blobs/'))).toHaveLength(1)
    const { deleteForever } = await import('./notes')
    await deleteForever([pdf.id])
    await writeMirror()
    expect([...disk.keys()].filter((k) => k.startsWith('mirror/blobs/'))).toHaveLength(0)
  })
})
