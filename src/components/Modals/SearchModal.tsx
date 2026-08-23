import { useEffect, useMemo, useRef, useState } from 'react'
import { CornerDownLeft, Search } from 'lucide-react'
import type { Note } from '@/types/models'
import { useNoteStore } from '@/store/noteStore'
import { useTagStore } from '@/store/tagStore'
import { useFolderStore } from '@/store/folderStore'
import { useUIStore } from '@/store/uiStore'
import {
  buildSearchDocs,
  highlightText,
  runSearch,
} from '@/utils/search'
import { docToPlainText } from '@/utils/doc'
import { formatRelative } from '@/utils/dates'
import { Modal } from '@/components/UI/Modal'
import { Kbd } from '@/components/UI/Kbd'
import { TagChip } from '@/components/UI/TagChip'
import { cn } from '@/utils/cn'

/**
 * Spotlight-style search over titles, content, tags and folders.
 * Arrow keys navigate, Enter opens, Esc closes.
 */
export function SearchModal(): React.ReactNode {
  const notes = useNoteStore((s) => s.notes)
  const tags = useTagStore((s) => s.tags)
  const folders = useFolderStore((s) => s.folders)
  const selectNote = useUIStore((s) => s.selectNote)
  const closeAllModals = useUIStore((s) => s.closeAllModals)
  const setView = useUIStore((s) => s.setView)

  const [query, setQuery] = useState('')
  const [activeIdx, setActiveIdx] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  const docs = useMemo(
    () => buildSearchDocs(notes.filter((n) => !n.isDeleted), tags, folders),
    [notes, tags, folders],
  )
  const hits = useMemo(() => runSearch(docs, query), [docs, query])
  const results: Note[] = query.trim() ? hits.map((h) => h.note) : recentNotes(notes)

  useEffect(() => setActiveIdx(0), [query])

  function choose(noteId: string): void {
    const note = notes.find((n) => n.id === noteId)
    if (!note) return
    closeAllModals()
    // Jump to the list that actually contains the note
    setView(
      note.isArchived
        ? { kind: 'archive' }
        : note.folderId
          ? { kind: 'folder', refId: note.folderId }
          : { kind: 'all' },
    )
    selectNote(noteId)
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLDivElement>): void {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIdx((i) => Math.min(i + 1, results.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIdx((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const pick = results[activeIdx]
      if (pick) choose(pick.id)
    }
  }

  return (
    <Modal
      title={null}
      onClose={() => closeAllModals()}
      size="lg"
      onKeyDownCapture={onKeyDown}
      initialFocus={false}
    >
      <div className="flex items-center gap-2 border-b-2 border-line px-4">
        <Search className="size-4 shrink-0 text-faint" aria-hidden="true" />
        <input
          ref={inputRef}
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search notes…"
          aria-label="Search notes"
          autoComplete="off"
          spellCheck={false}
          className="h-12 w-full bg-transparent text-sm outline-none placeholder:text-faint"
        />
      </div>

      <div
        id="search-results-list"
        className="max-h-[50vh] overflow-y-auto p-1.5"
        role="listbox"
        aria-label="Search results"
        aria-activedescendant={results[activeIdx] ? `search-result-${results[activeIdx]!.id}` : undefined}
      >
        {results.length === 0 ? (
          <p className="px-3 py-8 text-center text-xs text-muted">
            No notes match &ldquo;{query}&rdquo;
          </p>
        ) : (
          <>
            {!query.trim() && (
              <p className="px-2.5 pt-1.5 pb-1 text-[13px] text-muted underline decoration-wavy decoration-lineSoft/70 underline-offset-4">
                Jump back in
              </p>
            )}
            {results.map((note, i) => (
              <ResultRow
                key={note.id}
                id={`search-result-${note.id}`}
                note={note}
                active={i === activeIdx}
                query={query}
                onHover={() => setActiveIdx(i)}
                onChoose={() => choose(note.id)}
              />
            ))}
          </>
        )}
      </div>

      <div className="flex items-center gap-4 border-t-2 border-line px-4 py-2 text-[11px] text-faint">
        <span className="inline-flex items-center gap-1">
          <Kbd>↑</Kbd>
          <Kbd>↓</Kbd> navigate
        </span>
        <span className="inline-flex items-center gap-1">
          <Kbd>
            <CornerDownLeft className="size-2.5" />
          </Kbd>{' '}
          open
        </span>
        <span className="ml-auto">{results.length} result{results.length === 1 ? '' : 's'}</span>
      </div>
    </Modal>
  )
}

function recentNotes(notes: Note[]): Note[] {
  return [...notes]
    .filter((n) => !n.isDeleted && !n.isArchived)
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, 8)
}

function ResultRow({
  id,
  note,
  active,
  query,
  onHover,
  onChoose,
}: {
  id: string
  note: Note
  active: boolean
  query: string
  onHover: () => void
  onChoose: () => void
}): React.ReactNode {
  const allTags = useTagStore((s) => s.tags)
  const tagNameById = new Map(allTags.map((t) => [t.id, t]))
  const body = docToPlainText(note.content)
  const preview = body || 'Empty note'

  return (
    <button
      type="button"
      id={id}
      role="option"
      aria-selected={active}
      onMouseMove={onHover}
      onClick={onChoose}
      className={cn(
        'flex w-full items-start gap-3 rounded-wobbly-sm px-2.5 py-2 text-left transition',
        active ? 'bg-postit text-postit-ink' : 'hover:bg-canvas',
      )}
    >
      <div className="min-w-0 flex-1">
        <Highlighted text={note.title || 'Untitled'} query={query} className="block truncate text-[13px]" />
        <Highlighted text={preview} query={query} className="mt-0.5 line-clamp-2 text-xs leading-snug text-muted" />
        {note.tagIds.length > 0 && (
          <span className="mt-1 flex flex-wrap gap-1">
            {note.tagIds.slice(0, 4).map((id) => {
              const tag = tagNameById.get(id)
              return tag ? <TagChip key={id} tag={tag} size="sm" /> : null
            })}
          </span>
        )}
      </div>
      <span className="shrink-0 pt-0.5 text-[11px] tabular-nums text-faint">{formatRelative(note.updatedAt)}</span>
    </button>
  )
}

function Highlighted({
  text,
  query,
  className,
}: {
  text: string
  query: string
  className?: string
}): React.ReactNode {
  const segments = highlightText(text, query, 220)
  return (
    <span className={className}>
      {segments.map((seg, i) =>
        seg.hit ? (
          <mark key={i} className="rounded-[3px_2px_4px_2px] bg-postit px-0.5 text-inherit dark:text-postit-ink">
            {seg.text}
          </mark>
        ) : (
          <span key={i}>{seg.text}</span>
        ),
      )}
    </span>
  )
}

