import type { DocumentFormat } from '@/types/models'

/* ---------------------------------------------------------------------------
   File-format detection for the document importer. Extension and MIME type
   are hints only — the bytes decide, so a renamed or mislabelled file is
   reported honestly instead of being handed to the wrong converter.
--------------------------------------------------------------------------- */

export const ACCEPTED_EXTENSIONS = ['.pdf', '.doc', '.docx', '.ppt', '.pptx'] as const

export const FORMAT_LABEL: Record<DocumentFormat, string> = {
  pdf: 'PDF',
  docx: 'Word document',
  doc: 'Word 97–2003 document',
  pptx: 'PowerPoint presentation',
  ppt: 'PowerPoint 97–2003 presentation',
}

export const FORMAT_MIME: Record<DocumentFormat, string> = {
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  doc: 'application/msword',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  ppt: 'application/vnd.ms-powerpoint',
}

/** Hard ceiling for a single imported file (the whole file is read once). */
export const MAX_IMPORT_BYTES = 200 * 1024 * 1024

export class UnsupportedFileError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'UnsupportedFileError'
  }
}

export class MalformedFileError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'MalformedFileError'
  }
}

export function extensionOf(name: string): string {
  const i = name.lastIndexOf('.')
  return i === -1 ? '' : name.slice(i).toLowerCase()
}

function formatFromExtension(name: string): DocumentFormat | null {
  switch (extensionOf(name)) {
    case '.pdf':
      return 'pdf'
    case '.docx':
      return 'docx'
    case '.doc':
      return 'doc'
    case '.pptx':
      return 'pptx'
    case '.ppt':
      return 'ppt'
    default:
      return null
  }
}

const isZip = (b: Uint8Array): boolean => b.length >= 4 && b[0] === 0x50 && b[1] === 0x4b && (b[2] === 3 || b[2] === 5 || b[2] === 7)
const isOle = (b: Uint8Array): boolean =>
  b.length >= 8 &&
  b[0] === 0xd0 && b[1] === 0xcf && b[2] === 0x11 && b[3] === 0xe0 &&
  b[4] === 0xa1 && b[5] === 0xb1 && b[6] === 0x1a && b[7] === 0xe1

/** `%PDF-` may sit after a little junk (some generators prepend a BOM/newline). */
function isPdf(b: Uint8Array): boolean {
  const head = new TextDecoder('latin1').decode(b.subarray(0, Math.min(b.length, 1024)))
  return head.includes('%PDF-')
}

/**
 * Decides the format from the leading bytes plus the file name. OOXML
 * (docx/pptx) and legacy OLE (doc/ppt) containers share signatures, so the
 * extension disambiguates between siblings — never between families.
 */
export function detectFormat(fileName: string, head: Uint8Array): DocumentFormat {
  const hinted = formatFromExtension(fileName)
  if (isPdf(head)) return 'pdf'
  if (isZip(head)) {
    if (hinted === 'docx' || hinted === 'pptx') return hinted
    throw new UnsupportedFileError(
      hinted
        ? `“${fileName}” is not a valid ${FORMAT_LABEL[hinted]} — it looks like a different kind of file.`
        : `“${fileName}” is a ZIP-based file Tala does not recognise. Supported: PDF, DOCX, PPTX, DOC, PPT.`,
    )
  }
  if (isOle(head)) {
    if (hinted === 'doc' || hinted === 'ppt') return hinted
    throw new UnsupportedFileError(
      `“${fileName}” is a legacy Office file — rename it with a .doc or .ppt extension, or save it as .docx / .pptx.`,
    )
  }
  if (hinted) {
    throw new MalformedFileError(
      `“${fileName}” could not be read as a ${FORMAT_LABEL[hinted]}. The file may be damaged or empty.`,
    )
  }
  throw new UnsupportedFileError(
    `“${fileName}” is not a supported document. Supported: PDF, DOCX, PPTX, DOC, PPT.`,
  )
}

/** Reads the first `n` bytes of a File/Blob. */
export async function readHead(file: Blob, n = 1024): Promise<Uint8Array> {
  const buf = await file.slice(0, n).arrayBuffer()
  return new Uint8Array(buf)
}

/** Validates size + signature and returns the detected format. */
export async function inspectFile(file: File): Promise<DocumentFormat> {
  if (file.size === 0) throw new MalformedFileError(`“${file.name}” is empty.`)
  if (file.size > MAX_IMPORT_BYTES) {
    throw new UnsupportedFileError(
      `“${file.name}” is ${Math.round(file.size / 1024 / 1024)} MB — the limit is ${MAX_IMPORT_BYTES / 1024 / 1024} MB.`,
    )
  }
  return detectFormat(file.name, await readHead(file))
}
