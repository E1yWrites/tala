import { useMemo } from 'react'
import { CheckSquare, CheckCircle2, FileText, PenLine, PinFilled } from 'lucide-react'
import { FavoriteStar } from '../UI/FavoriteStar'
import type { Note } from '@/types/models'
import { useTagStore } from '@/store/tagStore'
import { useUIStore } from '@/store/uiStore'
import { displayTitle } from '@/utils/noteFilters'
import { pagesTasks, pagesText, textPreview } from '@/utils/doc'
import { useNotePages } from '@/store/pageStore'
import { formatRelative } from '@/utils/dates'
import { highlightText } from '@/utils/search'
import { cn } from '@/utils/cn'
import { catalogNumbers, formatCatalog } from '@/utils/catalog'
import { useNoteStore } from '@/store/noteStore'
import { TagChip } from '../UI/TagChip'

/* ------------------------------ Small helpers ------------------------------ */

export function Highlighted({
  text,
  query,
  className,
}: {
  text: string
  query: string
  className?: string
}): React.ReactNode {
  if (!query.trim()) return <span className={className}>{text}</span>
  const segments = highlightText(text, query)
  return (
    <span className={className}>
      {segments.map((seg, i) =>
        seg.hit ? (
          <mark
            key={i}
            className="rounded-[2px] bg-gold-soft px-0.5 text-gold-ink"
          >
            {seg.text}
          </mark>
        ) : (
          <span key={i}>{seg.text}</span>
        ),
      )}
    </span>
  )
}

function TaskBadge({ total, done }: { total: number; done: number }): React.ReactNode {
  const complete = done === total
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center gap-1 whitespace-nowrap text-xs tabular-nums',
        complete ? 'text-accent' : 'text-faint',
      )}
      title={`${done} of ${total} tasks completed`}
    >
      <CheckSquare size={13} aria-hidden="true" />
      {done}/{total}
    </span>
  )
}

/* -------------------------------- Note row -------------------------------- */

interface NoteRowProps {
  note: Note
  surface: 'live' | 'archive' | 'trash'
  density: 'compact' | 'comfortable'
  selected: boolean
  multiSelected?: boolean
  onSelect: () => void
}

export function NoteRow({
  note,
  surface,
  density,
  selected,
  multiSelected,
  onSelect,
}: NoteRowProps): React.ReactNode {
  const tags = useTagStore((s) => s.tags)
  const searchQuery = useUIStore((s) => s.searchQuery)
  const catalog = useNoteStore((s) => catalogNumbers(s.notes).get(note.id))
  const tagMap = useMemo(() => new Map(tags.map((t) => [t.id, t])), [tags])
  const noteTags = note.tagIds.map((id) => tagMap.get(id)).filter((t) => t !== undefined)
  const pages = useNotePages(note.id)
  const hasInk = useNoteStore((s) => pagesHaveInk(s.inkDocs, pages))
  const tasks = useMemo(() => pagesTasks(pages), [pages])
  const title = displayTitle(note)
  const preview = textPreview(pagesText(pages), 110)
  const isPdf = pages.some((p) => p.pdfPage !== undefined || !!p.backgroundBlobId)

  return (
    <div
      role="button"
      tabIndex={0}
      aria-current={selected ? 'page' : undefined}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.target !== e.currentTarget) return // nested buttons handle their own keys
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onSelect()
        }
      }}
      className={cn(
        'group relative w-full cursor-pointer rounded-control px-3 outline-none transition-colors duration-100',
        'focus-visible:ring-2 focus-visible:ring-ballpoint',
        density === 'compact' ? 'py-2' : 'py-2.5',
        multiSelected
          ? 'bg-accent-soft shadow-[inset_0_0_0_1px_rgb(var(--c-accent))]'
          : selected
            ? 'bg-selected shadow-[inset_1px_0_0_rgb(var(--c-ink))]'
            : 'hover:bg-raise/70',
      )}
    >
      {multiSelected && (
        <CheckCircle2
          size={18}
          aria-hidden="true"
          className="pointer-events-none absolute right-2 top-2.5 text-accent"
        />
      )}
      {!selected && !multiSelected && (
        <span aria-hidden="true" className="pointer-events-none absolute inset-x-3 bottom-0 border-t border-lineSoft group-hover:border-transparent" />
      )}

      <div className="flex items-baseline gap-2 pr-7 [@media(pointer:coarse)]:pr-9">
        {catalog !== undefined && (
          <span className="shrink-0 text-[11.5px] font-medium tabular-nums text-faint">{formatCatalog(catalog)}</span>
        )}
        <h3
          className={cn(
            'min-w-0 flex-1 truncate font-semibold tracking-[-0.005em] text-ink',
            density === 'compact' ? 'text-[13.5px]' : 'text-[14.5px]',
          )}
        >
          <Highlighted text={title} query={searchQuery} />
        </h3>
        {density === 'compact' && (
          <time className="shrink-0 text-xs tabular-nums text-faint" dateTime={new Date(note.updatedAt).toISOString()}>
            {formatRelative(note.updatedAt)}
          </time>
        )}
      </div>

      {density === 'comfortable' && preview && (
        <p className="mt-0.5 truncate pr-7 text-[13px] leading-snug text-muted [@media(pointer:coarse)]:pr-9">
          <Highlighted text={preview} query={searchQuery} />
        </p>
      )}
      {density === 'compact' && !note.title.trim() && preview && (
        <p className="mt-0.5 truncate text-xs text-faint">
          <Highlighted text={preview} query={searchQuery} />
        </p>
      )}

      {density === 'comfortable' && (
        <div className="mt-1 flex min-w-0 items-center gap-3 overflow-hidden whitespace-nowrap text-xs text-faint">
          {note.isFavorite && <FavoriteStar size={13} className="shrink-0" />}
          <time className="shrink-0 tabular-nums" dateTime={new Date(note.updatedAt).toISOString()}>
            {formatRelative(note.updatedAt)}
          </time>
          {note.isPinned && surface === 'live' && <PinFilled size={13} aria-label="Pinned" className="shrink-0 text-muted" />}
          <span className="inline-flex shrink-0 items-center gap-1 tabular-nums">
            <FileText size={13} aria-hidden="true" />
            {isPdf ? 'PDF · ' : ''}
            {pages.length} {pages.length === 1 ? 'pg' : 'pgs'}
          </span>
          {hasInk && (
            <span className="inline-flex shrink-0 items-center gap-1">
              <PenLine size={13} aria-hidden="true" />
              Ink
            </span>
          )}
          {tasks.total > 0 && <TaskBadge total={tasks.total} done={tasks.completed} />}
          {noteTags.length > 0 && (
            <span className="flex min-w-0 gap-1 overflow-hidden">
              {noteTags.slice(0, 2).map((tag) => (
                <TagChip key={tag.id} tag={tag} />
              ))}
            </span>
          )}
        </div>
      )}
    </div>
  )
}

/** True when any of these pages carries at least one stroke. */
function pagesHaveInk(inkDocs: Record<string, { strokes: unknown[] }>, pages: readonly { id: string }[]): boolean {
  return pages.some((p) => (inkDocs[p.id]?.strokes.length ?? 0) > 0)
}

/* ------------------------------- Grid card -------------------------------- */

/** Grid card: the same note as a clean tile. */
export function NoteGridCard({
  note,
  surface,
  selected,
  multiSelected,
  onSelect,
}: Omit<NoteRowProps, 'density'>): React.ReactNode {
  const tags = useTagStore((s) => s.tags)
  const searchQuery = useUIStore((s) => s.searchQuery)
  const tagMap = useMemo(() => new Map(tags.map((t) => [t.id, t])), [tags])
  const noteTags = note.tagIds.map((id) => tagMap.get(id)).filter((t) => t !== undefined)
  const pages = useNotePages(note.id)
  const tasks = useMemo(() => pagesTasks(pages), [pages])
  const title = displayTitle(note)
  const preview = textPreview(pagesText(pages), 180)

  return (
    <div
      role="button"
      tabIndex={0}
      aria-current={selected ? 'page' : undefined}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.target !== e.currentTarget) return // nested buttons handle their own keys
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onSelect()
        }
      }}
      className={cn(
        'group relative flex cursor-pointer flex-col rounded-card border border-lineSoft bg-panel p-4 text-ink outline-none transition-[border-color,box-shadow] duration-150',
        'hover:border-line hover:shadow-raise',
        'focus-visible:ring-2 focus-visible:ring-ballpoint',
        multiSelected && 'border-accent bg-accent-soft',
        selected && !multiSelected && 'border-ink',
      )}
    >
      {/* Selection indicator */}
      {multiSelected && (
        <CheckCircle2
          size={20}
          aria-hidden="true"
          className="pointer-events-none absolute right-2 top-2 z-10 text-accent"
        />
      )}

      <div className="mb-1.5 flex items-start gap-2">
        <h3 className="min-w-0 flex-1 truncate text-[15px] font-semibold">
          <Highlighted text={title} query={searchQuery} />
        </h3>
        <span className="flex shrink-0 items-center gap-1 pr-7 pt-0.5">
          {note.isFavorite && <FavoriteStar size={16} />}
          {note.isPinned && surface === 'live' && (
            <PinFilled size={15} aria-hidden="true" className="text-muted" />
          )}
        </span>
      </div>

      {preview && (
        <p className="line-clamp-4 min-h-[3rem] text-[13px] leading-relaxed text-muted">
          <Highlighted text={preview} query={searchQuery} />
        </p>
      )}

      <div className="mt-auto flex flex-wrap items-center gap-1.5 pt-3">
        {tasks.total > 0 && <TaskBadge total={tasks.total} done={tasks.completed} />}
        {noteTags.slice(0, 3).map((tag) => (
          <TagChip key={tag.id} tag={tag} />
        ))}
        <time
          className="ml-auto text-xs tabular-nums text-faint"
          dateTime={new Date(note.updatedAt).toISOString()}
        >
          {formatRelative(note.updatedAt)}
        </time>
      </div>
    </div>
  )
}
