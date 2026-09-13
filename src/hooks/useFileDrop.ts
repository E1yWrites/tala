import { useEffect, useState } from 'react'
import { useUIStore } from '@/store/uiStore'
import { extensionOf, ACCEPTED_EXTENSIONS } from '@/lib/documents/formats'

/* ---------------------------------------------------------------------------
   App-wide drag & drop for documents and Tala packages. Works in browsers
   and in the Tauri shell (tauri.conf.json sets dragDropEnabled: false so the
   webview receives ordinary HTML5 drag events). Image drops are left to the
   editor, which handles them itself.
--------------------------------------------------------------------------- */

const isDocument = (name: string): boolean => (ACCEPTED_EXTENSIONS as readonly string[]).includes(extensionOf(name))
const isPackage = (name: string): boolean => extensionOf(name) === '.zip'

function hasFiles(e: DragEvent): boolean {
  return Array.from(e.dataTransfer?.types ?? []).includes('Files')
}

/** Returns true while a file drag hovers the window (for a drop hint overlay). */
export function useFileDrop(): boolean {
  const [dragging, setDragging] = useState(false)

  useEffect(() => {
    let depth = 0
    const onEnter = (e: DragEvent): void => {
      if (!hasFiles(e)) return
      depth++
      setDragging(true)
    }
    const onLeave = (e: DragEvent): void => {
      if (!hasFiles(e)) return
      depth = Math.max(0, depth - 1)
      if (depth === 0) setDragging(false)
    }
    const onOver = (e: DragEvent): void => {
      if (!hasFiles(e)) return
      // Claim the drop so the browser doesn't navigate to the file
      e.preventDefault()
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy'
    }
    const onDrop = (e: DragEvent): void => {
      depth = 0
      setDragging(false)
      if (!hasFiles(e) || e.defaultPrevented) return
      const files = Array.from(e.dataTransfer?.files ?? [])
      const docs = files.filter((f) => isDocument(f.name))
      const packages = files.filter((f) => isPackage(f.name))
      if (docs.length === 0 && packages.length === 0) return
      e.preventDefault()
      const ui = useUIStore.getState()
      if (ui.modalStack.length > 0) return
      if (packages.length > 0) ui.openModal({ kind: 'import-package', file: packages[0] })
      else ui.openModal({ kind: 'import-document', files: docs })
    }
    window.addEventListener('dragenter', onEnter)
    window.addEventListener('dragleave', onLeave)
    window.addEventListener('dragover', onOver)
    window.addEventListener('drop', onDrop)
    return () => {
      window.removeEventListener('dragenter', onEnter)
      window.removeEventListener('dragleave', onLeave)
      window.removeEventListener('dragover', onOver)
      window.removeEventListener('drop', onDrop)
    }
  }, [])

  return dragging
}
