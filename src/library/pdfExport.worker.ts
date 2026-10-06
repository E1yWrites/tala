import { buildPdf } from './pdfExport.core'
import type { ExportInput } from './pdfExport.core'

/** Runs the export off the main thread so a long note never freezes the pen. */
addEventListener('message', (e: MessageEvent<ExportInput>) => {
  const post = self as unknown as Worker
  buildPdf(e.data).then(
    (bytes) => post.postMessage({ ok: true, bytes }, [bytes.buffer]),
    (err: unknown) => post.postMessage({ ok: false, error: String(err) }),
  )
})
