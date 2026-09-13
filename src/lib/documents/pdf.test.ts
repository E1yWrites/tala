import { describe, expect, it } from 'vitest'
import { PDFDocument } from 'pdf-lib'
import { makePdf } from '@/test/fixtures'
import type { DocumentRecord } from '@/types/models'
import type { InkDoc } from '@/types/ink'
import { buildPageModel, displaySize, exportAnnotatedPdf, openPdf } from './pdf'

async function importModel(bytes: Uint8Array): Promise<DocumentRecord> {
  const opened = await openPdf(bytes)
  const pages = await buildPageModel(opened.doc)
  await opened.destroy()
  return {
    id: 'doc1',
    noteId: 'note1',
    kind: 'pdf',
    source: { fileName: 'x.pdf', mime: 'application/pdf', bytes: bytes.length, format: 'pdf' },
    assetId: 'a1',
    originalAssetId: 'a1',
    pages,
    strategy: 'auto',
    importNote: null,
    createdAt: 0,
    updatedAt: 0,
  }
}

const inkFor = (page: { width: number; height: number }, strokes: InkDoc['strokes']): InkDoc => ({
  v: 1,
  width: page.width,
  height: page.height,
  strokes,
})

describe('PDF page model', () => {
  it('records one page per source page with sizes in points', async () => {
    const bytes = await makePdf([{ w: 612, h: 792 }, { w: 300, h: 150 }, { w: 200, h: 200 }])
    const doc = await importModel(bytes)
    expect(doc.pages?.map((p) => [p.sourceIndex, p.width, p.height])).toEqual([
      [0, 612, 792],
      [1, 300, 150],
      [2, 200, 200],
    ])
    expect(new Set(doc.pages!.map((p) => p.id)).size).toBe(3)
    expect(displaySize({ ...doc.pages![0]!, rotation: 90 })).toEqual({ width: 792, height: 612 })
  })
})

describe('annotated PDF export', () => {
  it('writes live pages in their current order and drops deleted ones', async () => {
    const bytes = await makePdf([{ w: 100, h: 100 }, { w: 200, h: 200 }, { w: 300, h: 300 }])
    const doc = await importModel(bytes)
    // Delete the middle page and reverse the rest
    doc.pages = [doc.pages![2]!, doc.pages![0]!]
    const out = await exportAnnotatedPdf({ document: doc, source: bytes, inkByPage: {} })
    const reread = await PDFDocument.load(out)
    expect(reread.getPageCount()).toBe(2)
    expect(reread.getPage(0).getSize()).toEqual({ width: 300, height: 300 })
    expect(reread.getPage(1).getSize()).toEqual({ width: 100, height: 100 })
  })

  it('stamps ink strokes and shapes as vector content on the right page', async () => {
    const bytes = await makePdf([{ w: 200, h: 200 }, { w: 200, h: 200 }])
    const doc = await importModel(bytes)
    const p2 = doc.pages![1]!
    const plain = await exportAnnotatedPdf({ document: doc, source: bytes, inkByPage: {} })
    const annotated = await exportAnnotatedPdf({
      document: doc,
      source: bytes,
      inkByPage: {
        [p2.id]: inkFor(p2, [
          { id: 's1', tool: 'pen', color: '#ff0000', size: 4, points: [{ x: 10, y: 10 }, { x: 150, y: 40 }, { x: 60, y: 120 }] },
          {
            id: 's2',
            tool: 'pen',
            color: '#0000ff',
            size: 2,
            shape: { kind: 'rect', closed: true, fill: '#00ff00' },
            points: [{ x: 20, y: 20 }, { x: 80, y: 20 }, { x: 80, y: 60 }, { x: 20, y: 60 }, { x: 20, y: 20 }],
          },
        ]),
      },
      textByPage: { [p2.id]: [{ id: 't', x: 10, y: 150, width: 100, text: 'note', size: 12, color: '#000000' }] },
    })
    const a = await PDFDocument.load(annotated)
    const b = await PDFDocument.load(plain)
    expect(a.getPageCount()).toBe(2)
    const streamLen = (d: PDFDocument, i: number): number => {
      const page = d.getPage(i)
      const contents = page.node.Contents()
      if (!contents) return 0
      const ctx = d.context
      const refs = 'asArray' in contents ? (contents as { asArray(): unknown[] }).asArray() : [contents]
      let total = 0
      for (const ref of refs) {
        const stream = ctx.lookup(ref as never) as { getContents?: () => Uint8Array } | undefined
        total += stream?.getContents?.().length ?? 0
      }
      return total
    }
    // Page 1 untouched, page 2 grew by the drawn paths + text
    expect(streamLen(a, 0)).toBe(streamLen(b, 0))
    expect(streamLen(a, 1)).toBeGreaterThan(streamLen(b, 1) + 100)
  })

  it('applies user page rotation on export', async () => {
    const bytes = await makePdf([{ w: 100, h: 200 }])
    const doc = await importModel(bytes)
    doc.pages![0]!.rotation = 90
    const out = await exportAnnotatedPdf({ document: doc, source: bytes, inkByPage: {} })
    const reread = await PDFDocument.load(out)
    expect(reread.getPage(0).getRotation().angle).toBe(90)
  })
})
