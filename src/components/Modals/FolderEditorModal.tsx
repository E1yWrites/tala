import { useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import type { Folder } from '@/types/models'
import { useFolderStore } from '@/store/folderStore'
import { useUIStore } from '@/store/uiStore'
import { Modal } from '@/components/UI/Modal'
import { Button } from '@/components/UI/Button'
import { ConfirmDialog } from '@/components/UI/ConfirmDialog'
import { useNoteStore } from '@/store/noteStore'

/** Create a new folder (optionally inside `parentId`), or rename/delete an existing one. */
export function FolderEditorModal({
  folderId,
  parentId,
}: {
  folderId: string | null
  parentId?: string | null
}): React.ReactNode {
  const folders = useFolderStore((s) => s.folders)
  const createFolder = useFolderStore((s) => s.createFolder)
  const renameFolder = useFolderStore((s) => s.renameFolder)
  const deleteFolder = useFolderStore((s) => s.deleteFolder)
  const closeAllModals = useUIStore((s) => s.closeAllModals)

  const existing: Folder | undefined = folders.find((f) => f.id === folderId)
  const [name, setName] = useState(existing?.name ?? '')
  const [selectedParent, setSelectedParent] = useState<string | null>(parentId ?? existing?.parentId ?? null)
  const inputRef = useRef<HTMLInputElement>(null)
  // SubmitEvent carries no isComposing — track IME state on the input itself
  const composingRef = useRef(false)

  /** Folders that can act as a parent: not self, not a descendant (no cycles). */
  const validParents = useMemo(() => {
    if (existing) {
      const id = existing.id
      const bad = new Set<string>([id])
      // Collect all descendants of `existing`
      const collect = (pid: string): void => {
        for (const f of folders) {
          if (f.parentId === pid && !bad.has(f.id)) {
            bad.add(f.id)
            collect(f.id)
          }
        }
      }
      collect(id)
      return folders.filter((f) => !bad.has(f.id))
    }
    return folders
  }, [folders, existing])

  useEffect(() => {
    if (existing) return
    // Pre-fill with a sensible unique name for quick creation
    let candidate = 'New Folder'
    let n = 2
    const siblings = folders.filter((f) => f.parentId === selectedParent)
    while (siblings.some((f) => f.name.toLowerCase() === candidate.toLowerCase())) {
      candidate = `New Folder ${n++}`
    }
    setName(candidate)
    window.setTimeout(() => {
      inputRef.current?.focus()
      inputRef.current?.select()
    }, 30)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function submit(): Promise<void> {
    const trimmed = name.trim()
    if (!trimmed) {
      inputRef.current?.focus()
      return
    }
    if (existing) {
      if (trimmed !== existing.name) {
        const ok = await renameFolder(existing.id, trimmed)
        if (!ok) return // duplicate name — toast already shown by the store
        toast.success('Folder renamed')
      }
      if (selectedParent !== existing.parentId) {
        const ok = await useFolderStore.getState().moveFolder(existing.id, selectedParent)
        if (!ok) return
      }
    } else {
      const duplicate = folders.some(
        (f) => f.parentId === selectedParent && f.name.toLowerCase() === trimmed.toLowerCase(),
      )
      if (duplicate) {
        toast.info(`Folder “${trimmed}” already exists`)
        return
      }
      const created = await createFolder(trimmed, selectedParent)
      if (!created) return
      toast.success(`Folder “${trimmed}” created`)
    }
    closeAllModals()
  }

  const [confirmDelete, setConfirmDelete] = useState(false)

  const pendingCountRef = useRef(0)

  async function remove(): Promise<void> {
    if (!existing) return
    const liveCount = useNoteStore
      .getState()
      .notes.filter((n) => n.folderId === existing.id && !n.isDeleted).length
    setConfirmDelete(true)
    pendingCountRef.current = liveCount
  }

  async function performRemove(): Promise<void> {
    if (!existing) return
    const ok = await deleteFolder(existing.id)
    if (!ok) return // failure — error toast already shown by the store
    toast.success(`Folder “${existing.name}” deleted`, {
      description:
        pendingCountRef.current > 0
          ? `${pendingCountRef.current} note${pendingCountRef.current === 1 ? '' : 's'} kept in All Notes.`
          : undefined,
    })
    closeAllModals()
  }

  if (confirmDelete && existing) {
    const count = pendingCountRef.current
    return (
      <ConfirmDialog
        open
        standalone
        title={`Delete “${existing.name}”?`}
        message={
          count > 0
            ? `Its ${count} note${count === 1 ? '' : 's'} will stay in All Notes. Subfolders are deleted too. This can't be undone.`
            : "This folder is empty. This can't be undone."
        }
        confirmLabel="Delete folder"
        onConfirm={() => void performRemove()}
        onCancel={() => setConfirmDelete(false)}
      />
    )
  }

  return (
    <Modal
      title={existing ? 'Rename folder' : 'New folder'}
      onClose={closeAllModals}
      size="sm"
    >
      <form
        onSubmit={(e) => {
          e.preventDefault()
          if (composingRef.current) return
          void submit()
        }}
      >
        <input
          ref={inputRef}
          value={name}
          onChange={(e) => setName(e.target.value)}
          onCompositionStart={() => {
            composingRef.current = true
          }}
          onCompositionEnd={() => {
            composingRef.current = false
          }}
          placeholder="Folder name"
          aria-label="Folder name"
          maxLength={40}
          className="h-10 w-full rounded-card border border-lineSoft bg-canvas px-3 text-sm outline-none transition focus:border-ballpoint focus:ring-2 focus:ring-ballpoint/20"
        />

        {!existing && (
          <label className="mt-3 block">
            <span className="text-xs text-faint">Parent folder</span>
            <select
              value={selectedParent ?? ''}
              onChange={(e) => setSelectedParent(e.target.value === '' ? null : e.target.value)}
              aria-label="Parent folder"
              className="mt-1 h-9 w-full rounded-card border border-lineSoft bg-canvas px-2 text-sm outline-none focus:border-ballpoint focus:ring-2 focus:ring-ballpoint/20"
            >
              <option value="">Root (no parent)</option>
              {validParents.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
          </label>
        )}

        {existing && validParents.length > 0 && (
          <label className="mt-3 block">
            <span className="text-xs text-faint">Move to parent</span>
            <select
              value={selectedParent ?? ''}
              onChange={(e) => setSelectedParent(e.target.value === '' ? null : e.target.value)}
              aria-label="Parent folder"
              className="mt-1 h-9 w-full rounded-card border border-lineSoft bg-canvas px-2 text-sm outline-none focus:border-ballpoint focus:ring-2 focus:ring-ballpoint/20"
            >
              <option value="">Root (no parent)</option>
              {validParents.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
          </label>
        )}

        <p className="mt-1.5 text-[11px] text-faint">
          {existing ? '' : `${folders.length} folder${folders.length === 1 ? '' : 's'} so far`}
        </p>

        <div className="mt-4 flex items-center justify-between gap-2">
          {existing ? (
            <Button type="button" variant="ghost" size="sm" onClick={() => void remove()}>
              Delete folder
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button type="button" variant="outline" size="sm" onClick={closeAllModals}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" size="sm">
              {existing ? 'Save' : 'Create'}
            </Button>
          </div>
        </div>
      </form>
    </Modal>
  )
}