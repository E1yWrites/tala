import { useState } from 'react'
import { X } from 'lucide-react'
import { toast } from 'sonner'
import { useTagStore } from '@/store/tagStore'
import { useNoteStore } from '@/store/noteStore'
import { useUIStore } from '@/store/uiStore'
import { Modal } from '@/components/UI/Modal'
import { TagChip } from '@/components/UI/TagChip'
import { TAG_COLORS } from '@/data/defaults'
import type { Tag } from '@/types/models'
import { cn } from '@/utils/cn'

const COLOR_KEYS = Object.keys(TAG_COLORS)

/** Manage the tags attached to one note: add (new or existing), remove, recolor. */
export function TagEditorModal({ noteId }: { noteId: string }): React.ReactNode {
  const tags = useTagStore((s) => s.tags)
  const notes = useNoteStore((s) => s.notes)
  const ensureTag = useTagStore((s) => s.ensureTag)
  const patchNote = useNoteStore((s) => s.patchNote)
  const closeAllModals = useUIStore((s) => s.closeAllModals)

  const [input, setInput] = useState('')

  const note = notes.find((n) => n.id === noteId)
  if (!note) {
    return (
      <Modal title="Edit tags" onClose={closeAllModals} size="sm">
        <p className="p-4 text-xs text-muted">This note no longer exists.</p>
      </Modal>
    )
  }
  // Stable snapshot for use inside async callbacks
  const currentTagIds = note.tagIds

  const tagById = new Map(tags.map((t) => [t.id, t]))
  const applied: Tag[] = []
  for (const id of note.tagIds) {
    const t = tagById.get(id)
    if (t) applied.push(t)
  }
  const usageCount = (tagId: string): number =>
    notes.reduce((acc, n) => acc + (n.tagIds.includes(tagId) ? 1 : 0), 0)

  const suggestions = tags
    .filter((t) => !currentTagIds.includes(t.id))
    .sort((a, b) => usageCount(b.id) - usageCount(a.id))
    .slice(0, 8)

  async function addTag(raw: string): Promise<void> {
    const name = raw.trim().replace(/^#/, '').toLowerCase()
    if (!name) return
    if (applied.some((t) => t.name === name)) {
      toast.info(`“${name}” is already on this note`)
      return
    }
    const tag = await ensureTag(name)
    if (!tag) return
    await patchNote(noteId, { tagIds: [...currentTagIds, tag.id] })
    setInput('')
  }

  async function removeTag(tagId: string): Promise<void> {
    await patchNote(noteId, {
      tagIds: currentTagIds.filter((id) => id !== tagId),
    })
  }

  function cycleColor(tagId: string): void {
    const tag = tagById.get(tagId)
    if (!tag) return
    const idx = COLOR_KEYS.indexOf(tag.color)
    const next = COLOR_KEYS[(idx + 1) % COLOR_KEYS.length] ?? 'iris'
    useTagStore.getState().updateTag(tagId, { color: next })
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>): void {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      void addTag(input)
    }
  }

  return (
    <Modal title="Edit tags" subtitle={note.title || 'Untitled'} onClose={closeAllModals} size="sm">
      {/* Applied tags */}
      <div className="flex min-h-10 flex-wrap items-center gap-1.5 rounded-wobbly-md border-2 border-line bg-canvas p-2">
        {applied.length === 0 && (
          <span className="px-1 text-[11px] text-faint">No tags yet</span>
        )}
        {applied.map((tag) => (
          <span key={tag.id} className="group relative">
            <button
              type="button"
              onClick={() => cycleColor(tag.id)}
              title="Click to change color"
              className="cursor-pointer"
            >
              <TagChip tag={tag} />
            </button>
            <button
              type="button"
              onClick={() => void removeTag(tag.id)}
              aria-label={`Remove tag ${tag.name}`}
              className="absolute -top-1.5 -right-1.5 grid size-4 place-items-center rounded-full border border-line bg-panel text-faint opacity-50 transition group-hover:opacity-100 hover:text-accent focus-visible:opacity-100"
            >
              <X className="size-2.5" />
            </button>
          </span>
        ))}
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Add a tag…"
          aria-label="Add a tag"
          maxLength={24}
          className="min-w-28 flex-1 bg-transparent px-1 text-xs outline-none placeholder:text-faint"
        />
      </div>

      {/* Suggestions */}
      {suggestions.length > 0 && (
        <>
          <p className="mt-3 mb-1.5 text-[13px] text-muted underline decoration-wavy decoration-lineSoft/70 underline-offset-4">
            Suggestions
          </p>
          <div className="flex flex-wrap gap-1.5">
            {suggestions.map((tag) => (
              <button
                key={tag.id}
                type="button"
                onClick={() => void addTag(tag.name)}
                title={`Used on ${usageCount(tag.id)} note${usageCount(tag.id) === 1 ? '' : 's'}`}
                className={cn(
                  'rounded-full border border-line bg-canvas px-2.5 py-1 text-[11px] font-medium',
                  'transition hover:border-accent hover:bg-accent-soft hover:text-accent',
                )}
              >
                + {tag.name}
              </button>
            ))}
          </div>
        </>
      )}

      <p className="mt-3 text-[11px] leading-relaxed text-faint">
        Press Enter or comma to add · hover a chip&rsquo;s × to remove · click a chip to recolor it.
      </p>
    </Modal>
  )
}
