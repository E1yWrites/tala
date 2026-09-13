import type { DocumentRecord } from '@/types/models'
import { FORMAT_LABEL } from '@/lib/documents/formats'

/** One-line description of an imported document for list previews. */
export function describeDocument(doc: DocumentRecord | undefined): string {
  if (!doc) return ''
  const label = FORMAT_LABEL[doc.source.format]
  if (doc.kind === 'pdf') {
    const n = doc.pages?.length ?? 0
    return `${label} · ${n} page${n === 1 ? '' : 's'}`
  }
  if (doc.kind === 'rendered-html') return `${label} · original layout`
  return `${label} attached`
}
