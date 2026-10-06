import { groupIntoLines } from '@/canvas/inkLines'
import { useNoteStore } from '@/store/noteStore'
import { usePageStore } from '@/store/pageStore'
import { usePrefsStore } from '@/store/prefsStore'
import type { InkDoc, InkStroke } from '@/types/ink'
import { onInkSaved, setInkText } from './notes'

/* ---------------------------------------------------------------------------
   EXPERIMENT: handwriting search. Recognised text is stored per page
   (`PageRecord.inkText`) and searched like typed text. Opt-in (Settings), runs
   in the background a few seconds after the pen goes quiet, one page at a time.

   Engines: the browser's own Handwriting Recognition API when it has one
   (ChromeOS, some Android Chrome; nothing on iPad Safari yet). A downloadable
   model (TrOCR via transformers.js) would be a second engine behind the same
   interface; it is not included because its dependency tree is far heavier
   than this feature has earned (see CLAUDE.md).
--------------------------------------------------------------------------- */

export interface HandwritingEngine {
  readonly label: string
  /** The text of one line of strokes (already grouped, left to right). */
  recognizeLine: (strokes: InkStroke[]) => Promise<string>
}

/** Minimal typings for the Handwriting Recognition API (not in lib.dom). */
interface HwPoint { x: number; y: number; t?: number }
interface HwStroke { addPoint: (p: HwPoint) => void }
interface HwDrawing { addStroke: (s: HwStroke) => void; getPrediction: () => Promise<Array<{ text: string }>> }
interface HwRecognizer { startDrawing: (hints?: Record<string, unknown>) => HwDrawing; finish: () => void }
interface HwNavigator {
  queryHandwritingRecognizerSupport?: (q: { languages: string[] }) => Promise<{ languages?: boolean } | null>
  createHandwritingRecognizer?: (c: { languages: string[] }) => Promise<HwRecognizer>
}

const STROKE_GAP_MS = 300
const POINT_MS = 10

/** The browser's built-in recognizer, or null when this browser has none. */
export async function builtInEngine(nav: unknown = typeof navigator === 'undefined' ? undefined : navigator, StrokeCtor: unknown = (globalThis as { HandwritingStroke?: unknown }).HandwritingStroke): Promise<HandwritingEngine | null> {
  const n = nav as HwNavigator | undefined
  if (!n?.createHandwritingRecognizer || !n.queryHandwritingRecognizerSupport || typeof StrokeCtor !== 'function') return null
  try {
    if (!(await n.queryHandwritingRecognizerSupport({ languages: ['en'] }))?.languages) return null
  } catch {
    return null
  }
  let recognizer: HwRecognizer | null = null
  const Stroke = StrokeCtor as new () => HwStroke
  return {
    label: 'your browser’s built-in recognizer',
    async recognizeLine(strokes) {
      recognizer ??= await n.createHandwritingRecognizer!({ languages: ['en'] })
      const drawing = recognizer.startDrawing({ recognitionType: 'text', inputType: 'stylus' })
      let t = 0
      for (const s of strokes) {
        const hw = new Stroke()
        for (const p of s.points) {
          hw.addPoint({ x: p.x, y: p.y, t })
          t += POINT_MS
        }
        t += STROKE_GAP_MS
        drawing.addStroke(hw)
      }
      return (await drawing.getPrediction())[0]?.text ?? ''
    },
  }
}

let engine: Promise<HandwritingEngine | null> | null = null
/** The best engine this browser offers, probed once. */
export const getEngine = (): Promise<HandwritingEngine | null> => (engine ??= builtInEngine())

/** Recognise a whole page: line by line, joined with newlines. */
export async function recognizePage(doc: InkDoc, eng: HandwritingEngine): Promise<string> {
  const lines: string[] = []
  for (const line of groupIntoLines(doc.strokes)) {
    const text = (await eng.recognizeLine(line)).trim()
    if (text) lines.push(text)
  }
  return lines.join('\n')
}

/** Recognise one page and store the result. False when there is no engine. */
export async function indexPage(noteId: string, pageId: string, eng?: HandwritingEngine | null): Promise<boolean> {
  const e = eng ?? (await getEngine())
  if (!e) return false
  const doc = useNoteStore.getState().inkDocs[pageId]
  const text = doc && doc.strokes.length > 0 ? await recognizePage(doc, e) : ''
  await setInkText(noteId, pageId, text)
  return true
}

/** Pages with handwriting that have never been recognised. */
export function unindexedPages(): Array<{ noteId: string; pageId: string }> {
  const { inkDocs, notes } = useNoteStore.getState()
  const { pagesByNote } = usePageStore.getState()
  const out: Array<{ noteId: string; pageId: string }> = []
  for (const n of notes) {
    if (n.isDeleted) continue
    for (const p of pagesByNote[n.id] ?? []) {
      if (p.inkText === undefined && (inkDocs[p.id]?.strokes.length ?? 0) > 0) out.push({ noteId: n.id, pageId: p.id })
    }
  }
  return out
}

/** Index everything not yet indexed, one page at a time. Returns how many pages were read. */
export async function indexAllInk(onProgress?: (done: number, total: number) => void): Promise<number> {
  const eng = await getEngine()
  if (!eng) return 0
  const todo = unindexedPages()
  for (const [i, t] of todo.entries()) {
    onProgress?.(i, todo.length)
    await indexPage(t.noteId, t.pageId, eng)
  }
  onProgress?.(todo.length, todo.length)
  return todo.length
}

/* ------------------------- Background indexing -------------------------- */

const IDLE_MS = 6000
const timers = new Map<string, ReturnType<typeof setTimeout>>()
let queue: Promise<void> = Promise.resolve()

/** Registers the "handwriting changed" hook. Safe to call more than once. */
export function startInkIndexer(resolveEngine: () => Promise<HandwritingEngine | null> = getEngine): void {
  onInkSaved((noteId, pageId) => {
    if (!usePrefsStore.getState().handwritingSearch) return
    clearTimeout(timers.get(pageId))
    timers.set(
      pageId,
      setTimeout(() => {
        timers.delete(pageId)
        queue = queue
          .then(async () => {
            const e = await resolveEngine()
            if (e) await indexPage(noteId, pageId, e)
          })
          .catch((err) => console.error('[tala] handwriting indexing failed', err))
      }, IDLE_MS),
    )
  })
}
