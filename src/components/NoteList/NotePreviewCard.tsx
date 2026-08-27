import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  Clock,
  Copy,
  Hash,
  Pencil,
  Share2,
  Trash2,
} from 'lucide-react'
import { toast } from 'sonner'
import type { Note } from '@/types/models'
import { useNoteStore } from '@/store/noteStore'
import { useUIStore } from '@/store/uiStore'
import { useTagStore } from '@/store/tagStore'
import { useSettingsStore } from '@/store/settingsStore'
import { displayTitle } from '@/utils/noteFilters'
import { docPreview, countTasks } from '@/utils/doc'
import { formatRelative, formatFull } from '@/utils/dates'
import { cn } from '@/utils/cn'
import { confirmAction } from './noteActions'

/* ---------------------------------------------------------------------------
   Floating note preview card — appears on long-press of a note row/card.
   Shows expanded content preview, metadata, tags, and an action menu.
   Closes on outside click, Escape, or scroll.
--------------------------------------------------------------------------- */

interface NotePreviewCardProps {
  note: Note
  anchor: { x: number; y: number }
  onClose: () => void
  onOpen: () => void
}

function computePosition(
  anchor: { x: number; y: number },
  cardW: number,
  cardH: number,
): { left: number; top: number } {
  const pad = 12
  const vw = document.documentElement.clientWidth
  const vh = document.documentElement.clientHeight
  const bottomNav = vw < 768 ? 64 : 0

  let left = anchor.x - cardW / 2
  left = Math.max(pad, Math.min(left, vw - cardW - pad))

  let top = anchor.y - cardH - 8
  if (top < pad) top = anchor.y + 8
  if (top + cardH > vh - pad - bottomNav) top = vh - cardH - pad - bottomNav

  return { left, top }
}

export function NotePreviewCard({
  note,
  anchor,
  onClose,
  onOpen,
}: NotePreviewCardProps): React.ReactNode {
  const shellRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null)
  const tags = useTagStore((s) => s.tags)
  const inkDocs = useNoteStore((s) => s.inkDocs)
  const openModal = useUIStore((s) => s.openModal)
  const selectNote = useUIStore((s) => s.selectNote)

  const tagMap = new Map(tags.map((t) => [t.id, t]))
  const noteTags = note.tagIds.map((id) => tagMap.get(id)).filter(Boolean)
  const tasks = countTasks(note.content)
  const hasInk = Boolean(inkDocs[note.id]?.strokes?.length)
  const preview = docPreview(note.content, 300)

  const measure = useCallback(() => {
    const el = shellRef.current
    if (!el) return
    setPos(computePosition(anchor, el.offsetWidth, el.offsetHeight))
  }, [anchor])

  useLayoutEffect(measure, [measure])

  // Dismiss on outside click, Escape, scroll, resize
  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      if (shellRef.current && !shellRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
      }
    }
    window.addEventListener('pointerdown', onDown, true)
    window.addEventListener('keydown', onKey, true)
    window.addEventListener('scroll', onClose, true)
    window.addEventListener('resize', onClose)
    return () => {
      window.removeEventListener('pointerdown', onDown, true)
      window.removeEventListener('keydown', onKey, true)
      window.removeEventListener('scroll', onClose, true)
      window.removeEventListener('resize', onClose)
    }
  }, [onClose])

  const handleOpen = () => {
    onOpen()
    selectNote(note.id)
    onClose()
  }

  const handleDuplicate = () => {
    onClose()
    useNoteStore.getState().duplicateNote(note.id)
    toast.success('Note duplicated')
  }

  const handleTrash = () => {
    onClose()
    const { confirmBeforeDelete } = useSettingsStore.getState().settings
    const doTrash = (): void => {
      useNoteStore.getState().trashNotes([note.id])
      toast.success('Note moved to trash')
    }
    if (!confirmBeforeDelete) return doTrash()
    confirmAction({
      title: 'Move to trash?',
      message: `"${displayTitle(note)}" will be moved to the trash.`,
      confirmLabel: 'Move to trash',
      onConfirm: doTrash,
    })
  }

  const handleShare = () => {
    onClose()
    openModal({ kind: 'share', noteId: note.id })
  }

  return createPortal(
    <div
      ref={shellRef}
      role="dialog"
      aria-label={`Preview: ${displayTitle(note)}`}
      className={cn(
        'fixed z-[80] w-[320px] max-w-[90vw] rounded-wobbly-md border-2 border-line bg-panel/95 shadow-sketch-lg backdrop-blur-md',
        pos ? 'animate-scale-in' : 'invisible',
      )}
      style={{
        left: (pos ?? { left: -9999 }).left,
        top: (pos ?? { top: -9999 }).top,
      }}
    >
      {/* Header */}
      <div className="flex items-start gap-2 border-b-2 border-lineSoft px-4 pb-2 pt-3">
        <h3 className="min-w-0 flex-1 truncate font-display text-base leading-snug text-ink">
          {displayTitle(note)}
        </h3>
        <button
          type="button"
          onClick={handleOpen}
          className="shrink-0 rounded-wobbly-sm px-1.5 py-0.5 text-[11px] font-medium text-muted hover:bg-raise hover:text-ink transition-colors"
          aria-label="Open note"
        >
          <Pencil size={13} />
        </button>
      </div>

      {/* Content preview */}
      {preview && (
        <div className="px-4 py-2.5 text-[13px] leading-relaxed text-muted line-clamp-6">
          {preview}
        </div>
      )}

      {/* Ink indicator */}
      {hasInk && (
        <div className="mx-4 mb-1 flex items-center gap-1.5 text-[11px] text-faint">
          <span className="inline-block size-1.5 rounded-full bg-ballpoint" />
          Handwriting
        </div>
      )}

      {/* Tasks */}
      {tasks.total > 0 && (
        <div className="mx-4 mb-1 flex items-center gap-1.5 text-[11px] text-faint">
          <span className="inline-block size-1.5 rounded-full bg-accent" />
          {tasks.completed}/{tasks.total} tasks
        </div>
      )}

      {/* Tags */}
      {noteTags.length > 0 && (
        <div className="mx-4 mb-1 flex flex-wrap gap-1">
          {noteTags.map((tag) =>
            tag ? (
              <span
                key={tag.id}
                className="inline-flex items-center gap-0.5 rounded-wobbly-sm border border-lineSoft bg-canvas px-1.5 py-px text-[10px] text-faint"
              >
                <Hash size={8} />
                {tag.name}
              </span>
            ) : null,
          )}
        </div>
      )}

      {/* Dates */}
      <div className="flex items-center gap-3 border-t-2 border-lineSoft px-4 py-2 text-[11px] text-faint">
        <span className="flex items-center gap-1">
          <Clock size={10} />
          {formatRelative(note.updatedAt)}
        </span>
        <span>Created {formatFull(note.createdAt)}</span>
      </div>

      {/* Action bar */}
      <div className="flex items-center gap-1 border-t-2 border-lineSoft px-2 py-1.5">
        <ActionBtn icon={Pencil} label="Open" onClick={handleOpen} />
        <ActionBtn icon={Share2} label="Share" onClick={handleShare} />
        <ActionBtn icon={Copy} label="Duplicate" onClick={handleDuplicate} />
        <ActionBtn icon={Trash2} label="Trash" onClick={handleTrash} danger />
      </div>
    </div>,
    document.body,
  )
}

function ActionBtn({
  icon: Icon,
  label,
  onClick,
  danger,
}: {
  icon: React.ComponentType<{ size: number }>
  label: string
  onClick: () => void
  danger?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={cn(
        'flex flex-1 items-center justify-center gap-1 rounded-wobbly-sm py-1 text-[11px] font-medium transition-colors',
        danger
          ? 'text-accent hover:bg-accent/10'
          : 'text-muted hover:bg-raise hover:text-ink',
      )}
    >
      <Icon size={13} />
      {label}
    </button>
  )
}
