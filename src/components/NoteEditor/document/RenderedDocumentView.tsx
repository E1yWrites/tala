import { useEffect, useState } from 'react'
import { assetRepository } from '@/database/repositories/assetRepository'
import { assetText } from '@/lib/documents/assets'
import type { DocumentRecord } from '@/types/models'

/* ---------------------------------------------------------------------------
   Read-only "preserve appearance" surface: the self-contained HTML rendering
   produced at import time, shown in a sandboxed frame (no scripts, no
   navigation, no same-origin access) so converter output can never touch
   the app.
--------------------------------------------------------------------------- */

export function RenderedDocumentView({ document }: { document: DocumentRecord }): React.ReactNode {
  const [html, setHtml] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setHtml(null)
    setError(null)
    assetRepository
      .get(document.assetId)
      .then((asset) => {
        if (cancelled) return
        if (!asset) {
          setError('The rendered document is missing from storage.')
          return
        }
        setHtml(assetText(asset))
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err))
      })
    return () => {
      cancelled = true
    }
  }, [document.assetId])

  if (error) {
    return (
      <div className="rounded-wobbly-md border-2 border-dashed border-accent/50 bg-accent/[0.06] p-4 text-sm text-accent">
        {error}
      </div>
    )
  }
  if (html === null) {
    return <div className="grid min-h-[40vh] place-items-center text-sm text-faint">Opening document…</div>
  }
  return (
    <iframe
      title={document.source.fileName}
      sandbox=""
      srcDoc={html}
      className="block h-[calc(100vh-220px)] min-h-[480px] w-full rounded-wobbly-md border-2 border-lineSoft bg-[#e9e6df] dark:bg-[#2a2a2c]"
      data-testid="rendered-document"
    />
  )
}
