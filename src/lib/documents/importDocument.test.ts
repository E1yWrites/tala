import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '@/database/db'
import { useNoteStore } from '@/store/noteStore'
import { makeDocx, makeOleStub, makePdf, makePptx, toFile } from '@/test/fixtures'
import { ImportCancelledError, importDocumentFile } from './importDocument'
import { MalformedFileError, UnsupportedFileError, detectFormat } from './formats'
import { docxToEditable, pptxToEditable, sanitizeHtml } from './office'
import { assetText } from './assets'

async function resetDb(): Promise<void> {
  await Promise.all([
    db.notes.clear(),
    db.documents.clear(),
    db.assets.clear(),
    db.pageInk.clear(),
    db.inkDocs.clear(),
  ])
  useNoteStore.setState({ notes: [], inkDocs: {}, documents: {}, pageInkLoaded: {} })
}

describe('format detection', () => {
  it('recognises PDF by signature regardless of name', async () => {
    const pdf = await makePdf([{ w: 200, h: 200 }])
    expect(detectFormat('weird.bin', pdf)).toBe('pdf')
  })
  it('separates DOCX/PPTX by extension, rejects mismatched ZIPs', () => {
    const docx = makeDocx({ paragraphs: [{ text: 'x' }] })
    expect(detectFormat('a.docx', docx)).toBe('docx')
    expect(detectFormat('a.pptx', docx)).toBe('pptx')
    expect(() => detectFormat('a.zip', docx)).toThrow(UnsupportedFileError)
    expect(() => detectFormat('a.pdf', docx)).toThrow(UnsupportedFileError)
  })
  it('recognises legacy OLE containers and refuses unknown bytes', () => {
    expect(detectFormat('old.doc', makeOleStub())).toBe('doc')
    expect(detectFormat('old.ppt', makeOleStub())).toBe('ppt')
    expect(() => detectFormat('notes.txt', new TextEncoder().encode('hello'))).toThrow(UnsupportedFileError)
    expect(() => detectFormat('broken.docx', new TextEncoder().encode('hello'))).toThrow(MalformedFileError)
  })
})

describe('PDF import', () => {
  beforeEach(resetDb)

  it('creates a note, a pdf document with a page model and one asset', async () => {
    const bytes = await makePdf([
      { w: 300, h: 400, text: 'hello' },
      { w: 500, h: 200 },
    ])
    const result = await importDocumentFile(toFile(bytes, 'Lecture 1.pdf', 'application/pdf'))
    expect(result.representation).toBe('pdf')
    expect(result.note.title).toBe('Lecture 1')
    expect(result.document?.kind).toBe('pdf')
    expect(result.document?.pages).toHaveLength(2)
    expect(result.document?.pages?.[0]).toMatchObject({ sourceIndex: 0, width: 300, height: 400, rotation: 0 })
    expect(result.document?.pages?.[1]).toMatchObject({ sourceIndex: 1, width: 500, height: 200 })

    // Persisted, transactionally, and mirrored into the store
    expect(await db.notes.get(result.note.id)).toMatchObject({ documentId: result.document!.id })
    expect(await db.documents.get(result.document!.id)).toBeTruthy()
    const asset = await db.assets.get(result.document!.assetId)
    expect(asset?.mime).toBe('application/pdf')
    expect(asset?.bytes).toBe(bytes.length)
    expect(useNoteStore.getState().notes[0]?.id).toBe(result.note.id)
    expect(useNoteStore.getState().documents[result.document!.id]).toBeTruthy()
  })

  it('dedupes identical files into one asset', async () => {
    const bytes = await makePdf([{ w: 100, h: 100 }])
    const a = await importDocumentFile(toFile(bytes, 'a.pdf', 'application/pdf'))
    const b = await importDocumentFile(toFile(bytes, 'b.pdf', 'application/pdf'))
    expect(a.document!.assetId).toBe(b.document!.assetId)
    expect(await db.assets.count()).toBe(1)
    expect(await db.documents.count()).toBe(2)
  })

  it('rejects damaged PDFs without writing anything', async () => {
    const junk = new TextEncoder().encode('%PDF-1.7\nthis is not really a pdf')
    await expect(importDocumentFile(toFile(junk, 'bad.pdf', 'application/pdf'))).rejects.toThrow(MalformedFileError)
    expect(await db.notes.count()).toBe(0)
    expect(await db.assets.count()).toBe(0)
  })

  it('rejects unsupported and empty files', async () => {
    await expect(importDocumentFile(toFile(new TextEncoder().encode('hi'), 'x.txt', 'text/plain'))).rejects.toThrow(UnsupportedFileError)
    await expect(importDocumentFile(toFile(new Uint8Array(0), 'empty.pdf', 'application/pdf'))).rejects.toThrow(MalformedFileError)
    expect(await db.notes.count()).toBe(0)
  })

  it('honours cancellation before anything is written', async () => {
    const bytes = await makePdf([{ w: 100, h: 100 }])
    const ctl = new AbortController()
    ctl.abort()
    await expect(importDocumentFile(toFile(bytes, 'a.pdf', 'application/pdf'), { signal: ctl.signal })).rejects.toThrow(ImportCancelledError)
    expect(await db.notes.count()).toBe(0)
  })
})

describe('DOCX import', () => {
  beforeEach(resetDb)

  it('converts a simple document to editable Tala content (AUTO)', async () => {
    const bytes = makeDocx({
      paragraphs: [
        { text: 'Meeting notes', style: 'Heading1' },
        { text: 'First point', bold: true },
        { text: 'Second point' },
      ],
    })
    const result = await importDocumentFile(toFile(bytes, 'notes.docx', ''))
    expect(result.representation).toBe('editable')
    expect(result.document?.kind).toBe('original-only')
    expect(result.note.content?.content?.[0]?.type).toBe('heading')
    const text = JSON.stringify(result.note.content)
    expect(text).toContain('Meeting notes')
    expect(text).toContain('Second point')
    expect(text).toContain('"type":"bold"')
    // Original kept as an asset
    const original = await db.assets.get(result.document!.originalAssetId!)
    expect(original?.bytes).toBe(bytes.length)
  })

  it('AUTO preserves appearance when the layout would be lost (tables)', async () => {
    const bytes = makeDocx({ paragraphs: [{ text: 'Budget' }], table: true })
    const result = await importDocumentFile(toFile(bytes, 'budget.docx', ''))
    expect(result.representation).toBe('preserve')
    expect(result.document?.kind).toBe('rendered-html')
    expect(result.message.toLowerCase()).toContain('preserved')
    const html = assetText((await db.assets.get(result.document!.assetId))!)
    expect(html.startsWith('<!doctype html>')).toBe(true)
    expect(html).toContain('A1')
    // Text copy stays searchable
    expect(JSON.stringify(result.note.content)).toContain('Budget')
    // Original is a separate asset
    expect(result.document!.originalAssetId).not.toBe(result.document!.assetId)
  })

  it('explicit EDITABLE strategy overrides the fidelity heuristic', async () => {
    const bytes = makeDocx({ paragraphs: [{ text: 'Budget' }], table: true })
    const result = await importDocumentFile(toFile(bytes, 'budget.docx', ''), { strategy: 'editable' })
    expect(result.representation).toBe('editable')
    expect(result.warnings.some((w) => /table/i.test(w))).toBe(true)
  })

  it('explicit PRESERVE strategy renders even simple documents', async () => {
    const bytes = makeDocx({ paragraphs: [{ text: 'Plain' }] })
    const result = await importDocumentFile(toFile(bytes, 'plain.docx', ''), { strategy: 'preserve' })
    expect(result.representation).toBe('preserve')
    expect(result.document?.kind).toBe('rendered-html')
  })

  it('reports a malformed DOCX and writes nothing', async () => {
    const bad = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 1, 2, 3, 4, 5, 6])
    await expect(importDocumentFile(toFile(bad, 'bad.docx', ''))).rejects.toThrow(MalformedFileError)
    expect(await db.notes.count()).toBe(0)
  })

  it('strips scripts and remote images from converter output', () => {
    const out = sanitizeHtml('<p onclick="x()">a<script>alert(1)</script><img src="http://x/y.png"><a href="javascript:1">l</a></p>')
    expect(out).not.toContain('script')
    expect(out).not.toContain('onclick')
    expect(out).not.toContain('<img')
    expect(out).not.toContain('javascript:')
  })
})

describe('PPTX import', () => {
  beforeEach(resetDb)

  it('converts slides to an outline with one heading per slide', async () => {
    const bytes = makePptx([
      ['Quarterly review', 'Revenue up 12%'],
      ['Next steps', 'Hire two engineers'],
    ])
    const editable = await pptxToEditable(bytes.buffer.slice(0) as ArrayBuffer)
    expect(editable.text).toContain('Quarterly review')
    expect(editable.text).toContain('Hire two engineers')
    const headings = (editable.content.content ?? []).filter((n) => n.type === 'heading')
    expect(headings.length).toBe(2)

    const result = await importDocumentFile(toFile(bytes, 'review.pptx', ''))
    expect(result.representation).toBe('editable')
    expect(result.note.title).toBe('review')
    expect(await db.assets.count()).toBe(1)
  })

  it('PRESERVE lays slides out at their original size', async () => {
    const bytes = makePptx([['Title'], ['Second']])
    const result = await importDocumentFile(toFile(bytes, 'deck.pptx', ''), { strategy: 'preserve' })
    expect(result.document?.kind).toBe('rendered-html')
    const html = assetText((await db.assets.get(result.document!.assetId))!)
    expect(html).toContain('class="tala-slide"')
    expect(html).toContain('width:720pt')
    expect(html).toContain('Second')
  })
})

describe('legacy DOC / PPT', () => {
  beforeEach(resetDb)

  it('keeps the original as an attachment and explains the limitation', async () => {
    const result = await importDocumentFile(toFile(makeOleStub(), 'old.doc', 'application/msword'))
    expect(result.representation).toBe('original')
    expect(result.document?.kind).toBe('original-only')
    expect(result.document?.importNote).toMatch(/\.docx/)
    expect(result.note.content).toBeNull()
    expect(await db.assets.count()).toBe(1)
  })
})

describe('DOCX converter details', () => {
  it('extracts plain text and flags empty documents', async () => {
    const out = await docxToEditable(makeDocx({ paragraphs: [{ text: 'alpha' }, { text: 'beta' }] }).buffer.slice(0) as ArrayBuffer)
    expect(out.text).toBe('alpha\nbeta')
    expect(out.lossy).toBe(false)
    const empty = await docxToEditable(makeDocx({ paragraphs: [] }).buffer.slice(0) as ArrayBuffer)
    expect(empty.warnings.join(' ')).toMatch(/no readable text/i)
  })
})
