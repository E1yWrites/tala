import { toast } from 'sonner'
import { buildPackage, PackageError, type ExportOptions } from './talaPackage'

function stamp(): string {
  const d = new Date()
  const p = (n: number): string => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

function saveBytes(bytes: Uint8Array, fileName: string): void {
  const blob = new Blob([bytes], { type: 'application/zip' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  document.body.appendChild(a)
  a.click()
  a.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/** Builds and downloads a package; surfaces progress and failures as toasts. */
export async function downloadPackage(opts: ExportOptions & { fileName?: string }): Promise<boolean> {
  const id = toast.loading('Packing…')
  try {
    const bytes = await buildPackage({
      ...opts,
      onProgress: (fraction, message) => toast.loading(`${message} ${Math.round(fraction * 100)}%`, { id }),
    })
    saveBytes(bytes, opts.fileName ?? (opts.noteIds ? `tala-notes-${stamp()}.zip` : `tala-library-${stamp()}.zip`))
    toast.success('Package ready', { id, description: `${Math.round(bytes.length / 1024)} KB` })
    return true
  } catch (err) {
    console.error('[tala] package export failed', err)
    toast.error(err instanceof PackageError ? err.message : 'Could not build the package', { id })
    return false
  }
}
