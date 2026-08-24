import { useMemo } from 'react'
import { CheckSquare, PinFilled, StarFilled } from 'lucide-react'
import type { Note } from '@/types/models'
import { useTagStore } from '@/store/tagStore'
import { useUIStore } from '@/store/uiStore'
import { displayTitle } from '@/utils/noteFilters'
import { docPreview, countTasks } from '@/utils/doc'
import { formatRelative } from '@/utils/dates'
import { highlightText } from '@/utils/search'
import { cn } from '@/utils/cn'
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
            className="rounded-[2px] bg-postit/90 px-0.5 text-postit-ink"
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
        'inline-flex items-center gap-1 rounded-wobbly-sm px-1.5 py-px text-[11px] font-medium tabular-nums',
        complete ? 'bg-ballpoint-soft text-ballpoint' : 'bg-panel text-muted border border-lineSoft',
      )}
      title={`${done} of ${total} tasks completed`}
    >
      <CheckSquare size={10} aria-hidden="true" />
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
  onSelect: () => void
}

export function NoteRow({
  note,
  surface,
  density,
  selected,
  onSelect,
}: NoteRowProps): React.ReactNode {
  const tags = useTagStore((s) => s.tags)
  const searchQuery = useUIStore((s) => s.searchQuery)
  const tagMap = useMemo(() => new Map(tags.map((t) => [t.id, t])), [tags])
  const noteTags = note.tagIds.map((id) => tagMap.get(id)).filter((t) => t !== undefined)
  const tasks = useMemo(() => countTasks(note.content), [note.content])
  const title = displayTitle(note)
  const preview = docPreview(note.content, 110)

  return (
    <div
      role="button"
      tabIndex={0}
      aria-current={selected ? 'true' : undefined}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.target !== e.currentTarget) return // nested buttons handle their own keys
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onSelect()
        }
      }}
      className={cn(
        'group relative w-full cursor-pointer rounded-wobbly-md border-2 px-3 transition-all duration-100 outline-none',
        'focus-visible:ring-2 focus-visible:ring-ballpoint/60 focus-visible:ring-offset-1 focus-visible:ring-offset-canvas focus-visible:border-transparent',
        density === 'compact' ? 'py-2' : 'py-2.5',
        selected
          ? 'border-line bg-postit/50'
          : 'border-transparent hover:border-lineSoft hover:bg-panel',
      )}
    >
      {!selected && (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-3 bottom-0 border-t-2 border-dashed border-lineSoft/70"
        />
      )}
      {note.isPinned && surface === 'live' && (
        <PinFilled
          size={14}
          aria-hidden="true"
          className="pointer-events-none absolute right-1.5 top-1.5 drop-shadow-sm"
        />
      )}

      <div className="flex items-baseline gap-1.5 pr-5">
        <h3
          className={cn(
            'min-w-0 flex-1 truncate',
            density === 'compact' ? 'text-[13px]' : 'text-[15px]',
          )}
        >
          <Highlighted text={title} query={searchQuery} />
        </h3>
        {note.isFavorite && (
          <StarFilled size={13} aria-hidden="true" className="shrink-0 self-center drop-shadow-sm" />
        )}
      </div>

      {density === 'comfortable' && preview && (
        <p className="mt-0.5 line-clamp-2 text-[13px] leading-relaxed text-muted">
          <Highlighted text={preview} query={searchQuery} />
        </p>
      )}
      {density === 'compact' && !note.title.trim() && preview && (
        <p className="mt-0.5 truncate text-xs text-faint">
          <Highlighted text={preview} query={searchQuery} />
        </p>
      )}

      <div className="mt-1 flex items-center gap-2 pr-5">
        <time className="shrink-0 text-xs tabular-nums text-faint" dateTime={new Date(note.updatedAt).toISOString()}>
          {formatRelative(note.updatedAt)}
        </time>
        {tasks.total > 0 && <TaskBadge total={tasks.total} done={tasks.completed} />}
        {density === 'comfortable' && noteTags.length > 0 && (
          <span className="flex min-w-0 gap-1 overflow-hidden">
            {noteTags.slice(0, 3).map((tag) => (
              <TagChip key={tag.id} tag={tag} />
            ))}
          </span>
        )}
      </div>
    </div>
  )
}

/* ------------------------------- Grid card -------------------------------- */

/** Alternating tilts so the grid reads like a wall of stuck-on notes. */
const TILTS = ['-rotate-[1.25deg]', 'rotate-[0.75deg]', '-rotate-[0.5deg]', 'rotate-[1deg]']

export function NoteGridCard({
  note,
  surface,
  selected,
  onSelect,
  index = 0,
}: Omit<NoteRowProps, 'density'> & { index?: number }): React.ReactNode {
  const tags = useTagStore((s) => s.tags)
  const searchQuery = useUIStore((s) => s.searchQuery)
  const tagMap = useMemo(() => new Map(tags.map((t) => [t.id, t])), [tags])
  const noteTags = note.tagIds.map((id) => tagMap.get(id)).filter((t) => t !== undefined)
  const tasks = useMemo(() => countTasks(note.content), [note.content])
  const title = displayTitle(note)
  const preview = docPreview(note.content, 180)

  return (
    <div
      role="button"
      tabIndex={0}
      aria-current={selected ? 'true' : undefined}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.target !== e.currentTarget) return // nested buttons handle their own keys
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onSelect()
        }
      }}
      className={cn(
        'group relative flex cursor-pointer flex-col rounded-wobbly-md border-2 border-line bg-postit p-4 text-postit-ink shadow-sketch-sm outline-none transition-all duration-150',
        TILTS[index % TILTS.length],
        'hover:rotate-0 hover:-translate-y-1 hover:shadow-sketch',
        'focus-visible:ring-2 focus-visible:ring-ballpoint/60',
        selected && 'border-accent border-[3px] shadow-sketch',
      )}
    >
      {/* Thumbtack for pinned notes */}
      {note.isPinned && surface === 'live' && (
        <PinFilled
          size={18}
          aria-hidden="true"
          className="pointer-events-none absolute -top-2.5 left-1/2 z-10 -translate-x-1/2 drop-shadow-sm"
        />
      )}

      <div className="mb-1.5 flex items-start gap-2">
        <h3 className="min-w-0 flex-1 truncate text-[15px]">
          <Highlighted text={title} query={searchQuery} />
        </h3>
        <span className="flex shrink-0 items-center gap-1 pt-0.5">
          {note.isFavorite && (
            <StarFilled size={15} aria-hidden="true" className="drop-shadow-sm" />
          )}
        </span>
      </div>

      {preview && (
        <p className="line-clamp-4 min-h-[3rem] text-[13px] leading-relaxed text-postit-ink/70">
          <Highlighted text={preview} query={searchQuery} />
        </p>
      )}

      <div className="mt-auto flex flex-wrap items-center gap-1.5 pt-3">
        {tasks.total > 0 && <TaskBadge total={tasks.total} done={tasks.completed} />}
        {noteTags.slice(0, 3).map((tag) => (
          <TagChip key={tag.id} tag={tag} />
        ))}
        <time
          className="ml-auto text-xs tabular-nums text-postit-ink/50"
          dateTime={new Date(note.updatedAt).toISOString()}
        >
          {formatRelative(note.updatedAt)}
        </time>
      </div>
    </div>
  )
}
