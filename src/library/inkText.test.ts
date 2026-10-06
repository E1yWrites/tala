import Dexie from 'dexie'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '@/database/db'
import { useNoteStore } from '@/store/noteStore'
import { usePageStore } from '@/store/pageStore'
import { usePrefsStore } from '@/store/prefsStore'
import type { InkDoc, InkStroke } from '@/types/ink'
import { buildSearchDocs, runSearch } from '@/utils/search'
import { builtInEngine, indexPage, recognizePage, startInkIndexer, unindexedPages } from './inkText'
import type { HandwritingEngine } from './inkText'
import { createNote, flush, markOnDisk, saveInk } from './notes'

vi.stubGlobal('window', globalThis)

const stroke = (id: string, x: number, y0: number, y1: number): InkStroke => ({
  id, tool: 'pen', color: '#000', size: 3, points: [{ x, y: y0 }, { x: x + 8, y: y1 }],
})
const doc = (...strokes: InkStroke[]): InkDoc => ({ v: 1, width: 700, height: 480, strokes })

/** Reads each line as the ids of its strokes, so tests can see the grouping. */
const fakeEngine: HandwritingEngine = {
  label: 'fake',
  recognizeLine: async (strokes) => (strokes.some((s) => s.id.startsWith('mito')) ? 'mitochondria' : strokes.map((s) => s.id).join(' ')),
}

beforeEach(async () => {
  db.close()
  await Dexie.delete('tala')
  await db.open()
  useNoteStore.setState({ notes: [], inkDocs: {}, hydrated: false })
  usePageStore.setState({ pagesByNote: {}, hydrated: false })
  usePrefsStore.setState({ handwritingSearch: false })
  markOnDisk([])
})
afterEach(() => vi.useRealTimers())

describe('built-in engine', () => {
  it('is absent where the browser has no recognizer (iPad Safari, desktop Chrome)', async () => {
    expect(await builtInEngine({}, undefined)).toBeNull()
    expect(await builtInEngine({ createHandwritingRecognizer: async () => ({}) }, class {})).toBeNull() // no support query
  })

  it('feeds strokes with increasing timestamps and returns the top prediction', async () => {
    const added: number[][] = []
    class FakeStroke {
      pts: number[] = []
      addPoint(p: { t?: number }) { this.pts.push(p.t ?? -1) }
    }
    const nav = {
      queryHandwritingRecognizerSupport: async () => ({ languages: true }),
      createHandwritingRecognizer: async () => ({
        startDrawing: () => ({
          addStroke: (s: FakeStroke) => added.push(s.pts),
          getPrediction: async () => [{ text: 'enzyme' }, { text: 'en zyme' }],
        }),
        finish() {},
      }),
    }
    const eng = await builtInEngine(nav, FakeStroke)
    expect(eng).not.toBeNull()
    expect(await eng!.recognizeLine([stroke('a', 0, 0, 10), stroke('b', 20, 0, 10)])).toBe('enzyme')
    // time never runs backwards, and a pause separates strokes
    expect(added[0]).toEqual([0, 10])
    expect(added[1]![0]!).toBeGreaterThan(added[0]![1]!)
  })
})

describe('recognizing and searching handwriting', () => {
  it('reads line by line and joins them', async () => {
    const d = doc(stroke('mito1', 10, 10, 40), stroke('b', 10, 100, 130), stroke('c', 40, 102, 128))
    expect(await recognizePage(d, fakeEngine)).toBe('mitochondria\nb c')
  })

  it('stores the text on the page and search finds the note by a handwritten word', async () => {
    const n = createNote({ title: 'Cell biology' })
    await flush()
    const pageId = usePageStore.getState().pagesByNote[n.id]![0]!.id
    useNoteStore.setState((s) => ({ inkDocs: { ...s.inkDocs, [pageId]: doc(stroke('mito1', 10, 10, 40)) } }))
    saveInk(n.id, pageId, doc(stroke('mito1', 10, 10, 40)))
    await flush()

    expect(await indexPage(n.id, pageId, fakeEngine)).toBe(true)
    await flush()
    expect((await db.pages.get(pageId))!.inkText).toBe('mitochondria')

    const docs = buildSearchDocs(useNoteStore.getState().notes, [], [], usePageStore.getState().pagesByNote)
    expect(runSearch(docs, 'mitochondria').map((h) => h.note.id)).toEqual([n.id])
    expect(runSearch(docs, 'ribosome')).toEqual([])
  })

  it('leaves no engine, no change', async () => {
    const n = createNote({ title: 'T' })
    await flush()
    const pageId = usePageStore.getState().pagesByNote[n.id]![0]!.id
    // (in node there is no built-in recognizer)
    expect(await indexPage(n.id, pageId)).toBe(false)
  })

  it('"read existing handwriting" covers only pages never read', async () => {
    const a = createNote({ title: 'A' })
    const b = createNote({ title: 'B' })
    await flush()
    const pa = usePageStore.getState().pagesByNote[a.id]![0]!.id
    const pb = usePageStore.getState().pagesByNote[b.id]![0]!.id
    useNoteStore.setState({ inkDocs: { [pa]: doc(stroke('a1', 0, 0, 10)), [pb]: doc(stroke('b1', 0, 0, 10)) } })
    usePageStore.setState((s) => ({ pagesByNote: { ...s.pagesByNote, [b.id]: s.pagesByNote[b.id]!.map((p) => ({ ...p, inkText: 'done already' })) } }))
    expect(unindexedPages()).toEqual([{ noteId: a.id, pageId: pa }])
  })
})

describe('background indexing', () => {
  it('waits for the pen to go quiet, and only runs when the experiment is on', async () => {
    const n = createNote({ title: 'T' })
    await flush()
    const pageId = usePageStore.getState().pagesByNote[n.id]![0]!.id
    const d = doc(stroke('mito1', 10, 10, 40))
    useNoteStore.setState({ inkDocs: { [pageId]: d } })

    const resolve = vi.fn(async () => fakeEngine)
    startInkIndexer(resolve)
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })

    saveInk(n.id, pageId, d) // pref off: nothing scheduled
    vi.advanceTimersByTime(30_000)
    expect(resolve).not.toHaveBeenCalled()

    usePrefsStore.setState({ handwritingSearch: true })
    saveInk(n.id, pageId, d)
    saveInk(n.id, pageId, d) // a second stroke restarts the wait
    vi.advanceTimersByTime(5_000)
    expect(resolve).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(2_000)
    expect(resolve).toHaveBeenCalledTimes(1)
  })
})
