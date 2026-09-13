import { beforeEach, describe, expect, it } from 'vitest'
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate'
import { db } from '@/database/db'
import { useNoteStore } from '@/store/noteStore'
import { makePdf, toFile } from '@/test/fixtures'
import { importDocumentFile } from '@/lib/documents/importDocument'
import { pageInkKey } from '@/types/models'
import type { Note } from '@/types/models'
import {
  buildPackage,
  importPackage,
  isSafeEntryPath,
  PackageError,
  readPackage,
} from './talaPackage'

async function resetDb(): Promise<void> {
  await Promise.all([
    db.notes.clear(),
    db.inkDocs.clear(),
    db.pageInk.clear(),
    db.documents.clear(),
    db.assets.clear(),
    db.folders.clear(),
    db.tags.clear(),
  ])
  useNoteStore.setState({ notes: [], inkDocs: {}, documents: {}, pageInkLoaded: {} })
}

function plainNote(id: string, title: string, extra: Partial<Note> = {}): Note {
  const now = Date.now()
  return {
    id,
    title,
    content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: `body of ${title}` }] }] },
    ink: null,
    folderId: null,
    tagIds: [],
    isPinned: false,
    isFavorite: false,
    isArchived: false,
    isDeleted: false,
    deletedAt: null,
    createdAt: now,
    updatedAt: now,
    ...extra,
  }
}

describe('path safety', () => {
  it('accepts plain relative paths and rejects traversal / absolute paths', () => {
    expect(isSafeEntryPath('notes/a.json')).toBe(true)
    expect(isSafeEntryPath('ink/a/pages/b.json')).toBe(true)
    expect(isSafeEntryPath('../etc/passwd')).toBe(false)
    expect(isSafeEntryPath('notes/../../x')).toBe(false)
    expect(isSafeEntryPath('/abs.json')).toBe(false)
    expect(isSafeEntryPath('C:/x.json')).toBe(false)
    expect(isSafeEntryPath('a\\b.json')).toBe(false)
    expect(isSafeEntryPath('a//b')).toBe(false)
    expect(isSafeEntryPath('')).toBe(false)
  })
})

describe('package round trip', () => {
  beforeEach(resetDb)

  it('exports a note with handwriting + a PDF document and imports it back intact', async () => {
    // A typed note with ink, in a folder with a tag
    await db.folders.put({ id: 'f1', name: 'School', createdAt: 1 })
    await db.tags.put({ id: 't1', name: 'math', color: 'blue', createdAt: 1 })
    const typed = plainNote('n1', 'Algebra', { folderId: 'f1', tagIds: ['t1'] })
    await db.notes.put(typed)
    await db.inkDocs.put({ noteId: 'n1', doc: { v: 1, width: 700, height: 480, strokes: [{ id: 's1', tool: 'pen', color: '#000', size: 3, points: [{ x: 1, y: 1 }, { x: 5, y: 9 }] }] } })
    // A PDF note with page ink
    const pdfBytes = await makePdf([{ w: 200, h: 300 }, { w: 200, h: 300 }])
    const imported = await importDocumentFile(toFile(pdfBytes, 'slides.pdf', 'application/pdf'))
    const page0 = imported.document!.pages![0]!
    const key = pageInkKey(imported.note.id, page0.id)
    await db.pageInk.put({ id: key, noteId: imported.note.id, pageId: page0.id, doc: { v: 1, width: 200, height: 300, strokes: [{ id: 'p1', tool: 'highlighter', color: '#ff0', size: 10, points: [{ x: 10, y: 10 }, { x: 100, y: 10 }] }] } })

    const zipped = await buildPackage({ noteIds: ['n1', imported.note.id] })
    const entries = unzipSync(zipped)
    expect(Object.keys(entries).sort()).toEqual(
      [
        'manifest.json',
        'notes/n1.json',
        `notes/${imported.note.id}.json`,
        'ink/n1.json',
        `ink/${imported.note.id}/pages/${page0.id}.json`,
        `documents/${imported.document!.id}.json`,
        `assets/${imported.document!.assetId}.pdf`,
        'metadata/folders.json',
        'metadata/tags.json',
      ].sort(),
    )
    const manifest = JSON.parse(strFromU8(entries['manifest.json']!))
    expect(manifest.format).toBe('tala-package')
    expect(manifest.formatVersion).toBe(1)
    expect(manifest.scope).toBe('note')
    expect(manifest.app.name).toBe('tala')
    expect(manifest.assets[0].sha256).toMatch(/^[0-9a-f]{64}$/)
    expect(manifest.assets[0].bytes).toBe(pdfBytes.length)

    // Import into an empty library
    await resetDb()
    const pkg = await readPackage(zipped)
    expect(pkg.notes).toHaveLength(2)
    const result = await importPackage(pkg)
    expect(result).toMatchObject({ notes: 2, documents: 1, assets: 1, copied: 0, skipped: 0 })

    const n1 = await db.notes.get('n1')
    expect(n1?.title).toBe('Algebra')
    expect(n1?.folderId).toBe('f1')
    expect(n1?.tagIds).toEqual(['t1'])
    expect((await db.inkDocs.get('n1'))?.doc.strokes).toHaveLength(1)
    const pdfNote = await db.notes.get(imported.note.id)
    expect(pdfNote?.documentId).toBe(imported.document!.id)
    const doc = await db.documents.get(imported.document!.id)
    expect(doc?.pages).toHaveLength(2)
    expect(doc?.pages?.[0]?.id).toBe(page0.id)
    const asset = await db.assets.get(imported.document!.assetId)
    expect(asset?.bytes).toBe(pdfBytes.length)
    expect(new Uint8Array(asset!.data)).toEqual(pdfBytes)
    expect((await db.pageInk.get(key))?.doc.strokes[0]?.id).toBe('p1')
    expect(await db.folders.count()).toBe(1)
    expect(await db.tags.count()).toBe(1)
  })

  it('keeps local data untouched on id collisions by importing copies (default)', async () => {
    await db.notes.put(plainNote('n1', 'Original'))
    const zipped = await buildPackage({ noteIds: ['n1'] })
    // Change the local note after export
    await db.notes.put(plainNote('n1', 'Edited locally'))
    const result = await importPackage(await readPackage(zipped))
    expect(result.copied).toBe(1)
    expect(await db.notes.count()).toBe(2)
    expect((await db.notes.get('n1'))?.title).toBe('Edited locally')
    expect((await db.notes.toArray()).some((n) => n.title === 'Original' && n.id !== 'n1')).toBe(true)
  })

  it('overwrite and skip policies', async () => {
    await db.notes.put(plainNote('n1', 'Original'))
    const zipped = await buildPackage({ noteIds: ['n1'] })
    await db.notes.put(plainNote('n1', 'Edited locally'))
    expect((await importPackage(await readPackage(zipped), { onConflict: 'skip' })).skipped).toBe(1)
    expect((await db.notes.get('n1'))?.title).toBe('Edited locally')
    expect((await importPackage(await readPackage(zipped), { onConflict: 'overwrite' })).overwritten).toBe(1)
    expect((await db.notes.get('n1'))?.title).toBe('Original')
    expect(await db.notes.count()).toBe(1)
  })

  it('maps folders and tags by name onto existing ones', async () => {
    await db.folders.put({ id: 'f-remote', name: 'Work', createdAt: 1 })
    await db.notes.put(plainNote('n1', 'Memo', { folderId: 'f-remote' }))
    const zipped = await buildPackage({ noteIds: ['n1'] })
    await resetDb()
    await db.folders.put({ id: 'f-local', name: 'work', createdAt: 1 })
    await importPackage(await readPackage(zipped))
    expect((await db.notes.get('n1'))?.folderId).toBe('f-local')
    expect(await db.folders.count()).toBe(1)
  })

  it('library scope carries settings and can replace everything', async () => {
    await db.notes.put(plainNote('old', 'Stale'))
    await db.notes.put(plainNote('n1', 'Keep'))
    const zipped = await buildPackage({})
    const pkg = await readPackage(zipped)
    expect(pkg.manifest.scope).toBe('library')
    expect(pkg.settings?.key).toBe('app')
    await db.notes.delete('n1')
    await db.notes.put(plainNote('extra', 'Added later'))
    await importPackage(pkg, { replaceLibrary: true })
    const titles = (await db.notes.toArray()).map((n) => n.title).sort()
    expect(titles).toEqual(['Keep', 'Stale'])
  })
})

describe('package validation', () => {
  beforeEach(resetDb)

  const manifestFor = (notes: unknown[], extra: Record<string, unknown> = {}): Uint8Array =>
    strToU8(JSON.stringify({ format: 'tala-package', formatVersion: 1, app: { name: 'tala', version: '1.0.0', minFormatVersion: 1 }, exportedAt: 1, scope: 'note', notes, documents: [], assets: [], folders: null, tags: null, settings: null, ...extra }))

  it('rejects non-ZIP input and ZIPs without a manifest', async () => {
    await expect(readPackage(new TextEncoder().encode('{"app":"tala"}'))).rejects.toThrow(PackageError)
    await expect(readPackage(zipSync({ 'readme.txt': strToU8('hi') }))).rejects.toThrow(/manifest/)
  })

  it('rejects unknown format versions', async () => {
    const z = zipSync({ 'manifest.json': manifestFor([], { formatVersion: 99 }) })
    await expect(readPackage(z)).rejects.toThrow(/format version 99/)
  })

  it('rejects path traversal in manifest references and archive entries', async () => {
    const z = zipSync({
      'manifest.json': manifestFor([{ id: 'n1', title: 'x', path: '../notes/n1.json', ink: null, pageInk: [], documentId: null, updatedAt: 1 }]),
    })
    await expect(readPackage(z)).rejects.toThrow(/unsafe entry path/)
    const z2 = zipSync({ 'manifest.json': manifestFor([]), '../evil.json': strToU8('{}') })
    await expect(readPackage(z2)).rejects.toThrow(/unsafe entry path/)
  })

  it('rejects duplicate ids and missing referenced files', async () => {
    const note = JSON.stringify(plainNote('n1', 'x'))
    const dupe = zipSync({
      'manifest.json': manifestFor([
        { id: 'n1', title: 'x', path: 'notes/n1.json', ink: null, pageInk: [], documentId: null, updatedAt: 1 },
        { id: 'n1', title: 'y', path: 'notes/n1.json', ink: null, pageInk: [], documentId: null, updatedAt: 1 },
      ]),
      'notes/n1.json': strToU8(note),
    })
    await expect(readPackage(dupe)).rejects.toThrow(/duplicate note id/)
    const missing = zipSync({
      'manifest.json': manifestFor([{ id: 'n1', title: 'x', path: 'notes/n1.json', ink: 'ink/n1.json', pageInk: [], documentId: null, updatedAt: 1 }]),
      'notes/n1.json': strToU8(note),
    })
    await expect(readPackage(missing)).rejects.toThrow(/missing handwriting/)
  })

  it('rejects assets whose size or hash do not match, and documents without files', async () => {
    const note = plainNote('n1', 'x', { documentId: 'd1' })
    const docRec = { id: 'd1', noteId: 'n1', kind: 'original-only', source: { fileName: 'a.docx', mime: 'x', bytes: 3, format: 'docx' }, assetId: 'a1', originalAssetId: null, strategy: 'auto', importNote: null, createdAt: 1, updatedAt: 1 }
    const base = {
      'notes/n1.json': strToU8(JSON.stringify(note)),
      'documents/d1.json': strToU8(JSON.stringify(docRec)),
      'assets/a1.bin': strToU8('abc'),
    }
    const mk = (asset: Record<string, unknown>): Uint8Array =>
      zipSync({
        'manifest.json': manifestFor(
          [{ id: 'n1', title: 'x', path: 'notes/n1.json', ink: null, pageInk: [], documentId: 'd1', updatedAt: 1 }],
          { documents: [{ id: 'd1', noteId: 'n1', kind: 'original-only', format: 'docx', path: 'documents/d1.json', assetIds: ['a1'] }], assets: [asset] },
        ),
        ...base,
      })
    const badSize = mk({ id: 'a1', path: 'assets/a1.bin', mime: 'x', bytes: 999, sha256: 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad' })
    await expect(readPackage(badSize)).rejects.toThrow(/bytes/)
    const badHash = mk({ id: 'a1', path: 'assets/a1.bin', mime: 'x', bytes: 3, sha256: '0'.repeat(64) })
    await expect(readPackage(badHash)).rejects.toThrow(/integrity/)
    const good = mk({ id: 'a1', path: 'assets/a1.bin', mime: 'x', bytes: 3, sha256: 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad' })
    const pkg = await readPackage(good)
    expect(pkg.assets).toHaveLength(1)
    // Same manifest but the document's asset is not listed at all
    const noAsset = zipSync({
      'manifest.json': manifestFor(
        [{ id: 'n1', title: 'x', path: 'notes/n1.json', ink: null, pageInk: [], documentId: 'd1', updatedAt: 1 }],
        { documents: [{ id: 'd1', noteId: 'n1', kind: 'original-only', format: 'docx', path: 'documents/d1.json', assetIds: ['a1'] }] },
      ),
      ...base,
    })
    await expect(readPackage(noAsset)).rejects.toThrow(/missing file/)
    expect(await db.notes.count()).toBe(0)
  })

  it('a corrupt archive writes nothing', async () => {
    const zipped = zipSync({ 'manifest.json': manifestFor([]) })
    zipped[zipped.length - 3] ^= 0xff
    await expect(readPackage(zipped)).rejects.toThrow(PackageError)
    expect(await db.notes.count()).toBe(0)
  })
})
