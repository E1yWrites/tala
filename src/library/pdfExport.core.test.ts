import { PDFDocument } from '@cantoo/pdf-lib'
import { describe, expect, it } from 'vitest'
import type { InkDoc } from '@/types/ink'
import { buildPdf } from './pdfExport.core'
import type { ExportPage } from './pdfExport.core'

const ink: InkDoc = {
  v: 1,
  width: 600,
  height: 480,
  strokes: [
    { id: 'a', tool: 'pen', color: '#2563eb', size: 3, points: [{ x: 10, y: 10 }, { x: 80, y: 40 }, { x: 150, y: 20 }] },
    { id: 'b', tool: 'highlighter', color: '#facc15', size: 14, points: [{ x: 10, y: 60 }, { x: 200, y: 60 }] },
  ],
}

const page = (over: Partial<ExportPage> = {}): ExportPage => ({
  w: 595,
  h: 842,
  template: 'blank',
  ink: null,
  text: '',
  ...over,
})

async function reopen(bytes: Uint8Array): Promise<PDFDocument> {
  return PDFDocument.load(bytes)
}

describe('buildPdf', () => {
  it('writes one sheet per page at the page size, with ink as vector paths', async () => {
    const bytes = await buildPdf({ pages: [page({ ink }), page({ w: 960, h: 540 })] })
    const doc = await reopen(bytes)
    expect(doc.getPageCount()).toBe(2)
    expect(doc.getPage(1).getSize()).toEqual({ width: 960, height: 540 })
    // ink adds drawing operators to the content stream
    const plain = await buildPdf({ pages: [page()] })
    const inked = await buildPdf({ pages: [page({ ink })] })
    expect(inked.length).toBeGreaterThan(plain.length + 150)
  })

  it('continues long typed text on extra pages and survives characters Helvetica lacks', async () => {
    const text = Array.from({ length: 120 }, (_, i) => `Line ${i} with a word 日本語 and ñ`).join('\n')
    const doc = await reopen(await buildPdf({ pages: [page({ text })] }))
    expect(doc.getPageCount()).toBeGreaterThan(1)
  })

  it('copies pages of an original PDF in note order and draws ink over them', async () => {
    const orig = await PDFDocument.create()
    orig.addPage([300, 400])
    orig.addPage([500, 200])
    const original = (await orig.save()).slice().buffer as ArrayBuffer
    const bytes = await buildPdf({
      original,
      pages: [page({ pdfPage: 2, w: 500, h: 200, ink }), page({ pdfPage: 1, w: 300, h: 400 }), page()],
    })
    const doc = await reopen(bytes)
    expect(doc.getPageCount()).toBe(3)
    expect(doc.getPage(0).getSize()).toEqual({ width: 500, height: 200 })
    expect(doc.getPage(1).getSize()).toEqual({ width: 300, height: 400 })
  })

  it('draws ruled and grid paper without error', async () => {
    const doc = await reopen(await buildPdf({ pages: [page({ template: 'ruled' }), page({ template: 'grid' })] }))
    expect(doc.getPageCount()).toBe(2)
  })
})
