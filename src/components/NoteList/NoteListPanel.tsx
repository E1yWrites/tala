import { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import {
  AlignJustify,
  Archive,
  CheckSquare,
  Filter,
  FilterActive,
  LayoutGrid,
  Menu,
  MoreHorizontal,
  NotebookText,
  Pin,
  Plus,
  Rows3,
  Search,
  SlidersHorizontal,
  Sort,
  Star,
  Trash2,
  TrashFilled,
  X,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useNoteStore } from '@/store/noteStore'
import { useFolderStore } from '@/store/folderStore'
import { useTagStore } from '@/store/tagStore'
import { useUIStore } from '@/store/uiStore'
import { useSettingsStore } from '@/store/settingsStore'
import type { Note, SortKey, ViewDensity, ViewRef } from '@/types/models'
import { notesForView, sortNotes, viewMeta, searchableText } from '@/utils/noteFilters'
import { cn } from '@/utils/cn'
import { Button } from '../UI/Button'
import { DropdownMenu, type MenuItem } from '../UI/DropdownMenu'
import { toast } from 'sonner'
import { buildNoteMenu, confirmAction, deleteForeverAndPrune } from './noteActions'
import { EmptyState } from '../UI/EmptyState'
import { Skeleton } from '../UI/Skeleton'
import { Tooltip } from '../UI/Tooltip'
import { NoteGridCard, NoteRow } from './NoteListItem'
import { NotePreviewCard } from './NotePreviewCard'
import { useLongPress } from '@/hooks/useLongPress'

interface NoteListPanelProps {
  view: ViewRef
  onOpenSidebar?: () => void
}

const SORT_LABELS: Record<SortKey, string> = {
  'updated-desc': 'Last edited first',
  'updated-asc': 'Oldest edited first',
  'created-desc': 'Newest created',
  'title-asc': 'Title A → Z',
  'title-desc': 'Title Z → A',
}

export function NoteListPanel({
  view,
  onOpenSidebar,
}: NoteListPanelProps): React.ReactNode {
  const allNotes = useNoteStore((s) => s.notes)
  const hydrated = useNoteStore((s) => s.hydrated)
  const folders = useFolderStore((s) => s.folders)
  const tags = useTagStore((s) => s.tags)

  const searchQuery = useUIStore((s) => s.searchQuery)
  const setSearchQuery = useUIStore((s) => s.setSearchQuery)
  const filterTagIds = useUIStore((s) => s.filterTagIds)
  const filterFavoritesOnly = useUIStore((s) => s.filterFavoritesOnly)
  const toggleFilterTag = useUIStore((s) => s.toggleFilterTag)
  const toggleFilterFavorites = useUIStore((s) => s.toggleFilterFavorites)
  const clearFilters = useUIStore((s) => s.clearFilters)
  const selectedNoteId = useUIStore((s) => s.selectedNoteId)
  const selectNote = useUIStore((s) => s.selectNote)
  const openModal = useUIStore((s) => s.openModal)
  const setView = useUIStore((s) => s.setView)
  const multiSelectMode = useUIStore((s) => s.multiSelectMode)
  const selectedNoteIds = useUIStore((s) => s.selectedNoteIds)
  const enterMultiSelectMode = useUIStore((s) => s.enterMultiSelectMode)
  const exitMultiSelectMode = useUIStore((s) => s.exitMultiSelectMode)
  const toggleNoteSelection = useUIStore((s) => s.toggleNoteSelection)
  const selectAllNotes = useUIStore((s) => s.selectAllNotes)
  const deselectAllNotes = useUIStore((s) => s.deselectAllNotes)

  const viewDensity = useSettingsStore((s) => s.settings.viewDensity)
  const sortKey = useSettingsStore((s) => s.settings.sortKey)
  const updateSettings = useSettingsStore((s) => s.update)

  // '/' (from the global hotkey layer) focuses this panel's search field
  const searchInputRef = useRef<HTMLInputElement>(null)
  useEffect(() => {
    const onFocusSearch = (): void => searchInputRef.current?.focus()
    window.addEventListener('tala:focus-search', onFocusSearch)
    return () => window.removeEventListener('tala:focus-search', onFocusSearch)
  }, [])


  const meta = viewMeta(view, folders, tags)
  const surface: 'live' | 'archive' | 'trash' =
    view.kind === 'trash' ? 'trash' : view.kind === 'archive' ? 'archive' : 'live'

  const visibleNotes = useMemo(() => {
    let list = notesForView(allNotes, view)
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      list = list.filter((n) => searchableText(n).toLowerCase().includes(q))
    }
    if (filterFavoritesOnly) list = list.filter((n) => n.isFavorite)
    if (filterTagIds.length > 0) {
      list = list.filter((n) => filterTagIds.every((t) => n.tagIds.includes(t)))
    }
    return sortNotes(list, sortKey, surface === 'live')
  }, [allNotes, view, searchQuery, filterFavoritesOnly, filterTagIds, sortKey, surface])

  // Prune stale selectedNoteIds when the visible list changes (search/filter)
  useEffect(() => {
    if (!multiSelectMode || selectedNoteIds.length === 0) return
    const visibleIds = new Set(visibleNotes.map((n) => n.id))
    const pruned = selectedNoteIds.filter((id) => visibleIds.has(id))
    if (pruned.length !== selectedNoteIds.length) {
      useUIStore.setState({ selectedNoteIds: pruned })
    }
  }, [visibleNotes, multiSelectMode, selectedNoteIds])

  const hasActiveFilters = filterFavoritesOnly || filterTagIds.length > 0

  /* ------------------------------- Menus ---------------------------------- */

  const filterItems: MenuItem[] = [
    {
      id: 'fav-only',
      label: 'Favorites only',
      checked: filterFavoritesOnly,
      onSelect: toggleFilterFavorites,
    },
    ...tags
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name))
      .slice(0, 14)
      .map<MenuItem>((tag) => ({
        id: `tag-${tag.id}`,
        label: `#${tag.name}`,
        checked: filterTagIds.includes(tag.id),
        onSelect: () => toggleFilterTag(tag.id),
      })),
    ...(hasActiveFilters
      ? [
          {
            id: 'clear-filters',
            label: 'Clear filters',
            danger: true,
            onSelect: clearFilters,
          } satisfies MenuItem,
        ]
      : []),
  ]

  const sortItems: MenuItem[] = (
    ['updated-desc', 'updated-asc', 'created-desc', 'title-asc', 'title-desc'] as SortKey[]
  ).map((key) => ({
    id: key,
    label: SORT_LABELS[key],
    checked: sortKey === key,
    onSelect: () => updateSettings({ sortKey: key }),
  }))

  const densities: Array<{ value: ViewDensity; icon: LucideIcon; label: string }> = [
    { value: 'compact', icon: AlignJustify, label: 'Compact list' },
    { value: 'comfortable', icon: Rows3, label: 'Comfortable list' },
    { value: 'grid', icon: LayoutGrid, label: 'Grid' },
  ]

  /* ------------------------------ Empty states ---------------------------- */

  const isEmptyLibrary =
    hydrated &&
    visibleNotes.length === 0 &&
    !searchQuery.trim() &&
    !hasActiveFilters &&
    allNotes.filter((n) => !n.isDeleted && !n.isArchived).length === 0 &&
    (view.kind === 'all' || view.kind === 'home')

  function renderEmptyState(): React.ReactNode {
    if (searchQuery.trim()) {
      return (
        <EmptyState
          icon={Search}
          title="No matches"
          description={`Nothing found for “${searchQuery.trim()}”. Try different keywords.`}
        />
      )
    }
    if (hasActiveFilters && visibleNotes.length === 0) {
      return (
        <EmptyState
          icon={SlidersHorizontal}
          title="No results with these filters"
          action={
            <Button size="sm" onClick={clearFilters}>
              Clear filters
            </Button>
          }
        />
      )
    }
    switch (view.kind) {
      case 'favorites':
        return (
          <EmptyState
            icon={Star}
            title="No favorites yet"
            description="Star the notes you keep coming back to and they will show up here."
          />
        )
      case 'pinned':
        return (
          <EmptyState
            icon={Pin}
            title="Nothing pinned"
            description="Pin important notes to keep them at the top of your lists."
          />
        )
      case 'recent':
        return (
          <EmptyState
            icon={CheckSquare}
            title="All quiet this week"
            description="Notes you edit in the last 7 days will appear here."
          />
        )
      case 'archive':
        return (
          <EmptyState
            icon={Archive}
            title="Archive is empty"
            description="Archived notes are out of the way but never lost."
          />
        )
      case 'trash':
        return (
          <EmptyState
            icon={Trash2}
            title="Trash is empty"
            description="Deleted notes rest here until you remove them for good."
          />
        )
      default:
        if (isEmptyLibrary) {
          return (
            <EmptyState
              icon={NotebookText}
              title="No notes yet"
              description="Create your first note and start capturing your ideas."
              action={
                <Button variant="primary" size="sm" onClick={() => openModal({ kind: 'new-note' })}>
                  <Plus size={15} />
                  Create note
                </Button>
              }
            />
          )
        }
        return (
          <EmptyState
            icon={NotebookText}
            title="Nothing here yet"
            description="This place fills up as you create and organize notes."
            action={
              <Button variant="primary" size="sm" onClick={() => openModal({ kind: 'new-note' })}>
                <Plus size={15} />
                New note
              </Button>
            }
          />
        )
    }
  }

  /* -------------------------------- Render -------------------------------- */

  const [previewNoteState, setPreviewNoteState] = useState<{ note: Note; anchor: { x: number; y: number } } | null>(null)

  const closePreview = useCallback(() => setPreviewNoteState(null), [])

  const showPreview = useCallback((note: Note, e: React.MouseEvent | React.TouchEvent) => {
    if (multiSelectMode) return
    const clientX = 'touches' in e ? e.touches[0]?.clientX ?? 0 : e.clientX
    const clientY = 'touches' in e ? e.touches[0]?.clientY ?? 0 : e.clientY
    setPreviewNoteState({ note, anchor: { x: clientX, y: clientY } })
  }, [multiSelectMode])

  return (
    <section
      aria-label={`${meta.title} — note list`}
      className="flex h-full min-h-0 flex-col bg-canvas lg:border-r-2 lg:border-line"
    >
      {/* Header */}
      <header className="flex items-center gap-2 px-4 pb-2 pt-4">
        {onOpenSidebar && (
          <button
            type="button"
            onClick={onOpenSidebar}
            aria-label="Open navigation"
            className="grid size-8 shrink-0 place-items-center rounded-wobbly-sm text-muted hover:bg-raise hover:text-ink lg:hidden"
          >
            <Menu size={18} strokeWidth={2.5} />
          </button>
        )}
        <div className="min-w-0 flex-1">
          <h1 className="truncate font-display text-xl leading-snug">{meta.title}</h1>
          <p className="text-xs text-faint">
            {hydrated
              ? `${visibleNotes.length} ${visibleNotes.length === 1 ? 'note' : 'notes'}${meta.description ? ` · ${meta.description}` : ''}`
              : 'Loading…'}
          </p>
        </div>
        <Tooltip label="New note" side="bottom">
          <button
            type="button"
            onClick={() =>
              openModal({ kind: 'new-note' })
            }
            aria-label="New note"
            className="grid size-9 shrink-0 place-items-center rounded-wobbly-sm border-[3px] border-line bg-postit text-postit-ink shadow-sketch-sm transition-all duration-100 hover:bg-accent hover:text-accent-fg active:translate-x-[3px] active:translate-y-[3px] active:shadow-none"
          >
            <Plus size={20} strokeWidth={2.5} />
          </button>
        </Tooltip>
      </header>

      {/* Search + toolbar */}
      <div className="flex flex-col gap-2 px-4 pb-2 pt-1">
        <div className="relative">
          <Search
            size={18}
            aria-hidden="true"
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint"
          />
          <input
            ref={searchInputRef}
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search in view…"
            aria-label={`Search ${meta.title}`}
            className="h-10 w-full rounded-wobbly-md border-2 border-line bg-panel pl-9 pr-8 text-sm text-ink transition-colors placeholder:text-faint focus:border-ballpoint focus:ring-2 focus:ring-ballpoint/20"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              aria-label="Clear search"
              className="absolute right-2.5 top-1/2 grid size-5 -translate-y-1/2 place-items-center rounded-wobbly-sm text-faint transition-colors hover:bg-raise hover:text-ink"
            >
              <X size={14} strokeWidth={2.5} />
            </button>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          {!multiSelectMode ? (
            <>
              <DropdownMenu
                align="start"
                className="max-h-[320px] overflow-y-auto"
                items={filterItems}
                trigger={(props) => (
                  <ToolbarButton
                    {...props}
                    active={hasActiveFilters}
                    label="Filter"
                    Icon={hasActiveFilters ? FilterActive : Filter}
                  />
                )}
              />
              <DropdownMenu
                align="start"
                items={sortItems}
                trigger={(props) => <ToolbarButton {...props} active={false} label="Sort" Icon={Sort} />}
              />

              <div className="ml-auto flex items-center gap-1">
                {visibleNotes.length > 0 && (
                  <Tooltip label="Select notes" side="bottom">
                    <button
                      type="button"
                      onClick={enterMultiSelectMode}
                      aria-label="Select notes"
                      className="grid size-7 place-items-center rounded-[6px_3px_7px_3px] text-faint hover:text-ink transition-colors"
                    >
                      <CheckSquare size={16} strokeWidth={2.5} />
                    </button>
                  </Tooltip>
                )}
                <div className="flex items-center rounded-wobbly-sm border-2 border-line bg-panel p-0.5">
                  {densities.map(({ value, icon: Icon, label }) => (
                    <Tooltip key={value} label={label}>
                      <button
                        type="button"
                        onClick={() => updateSettings({ viewDensity: value })}
                        aria-pressed={viewDensity === value}
                        aria-label={label}
                        className={cn(
                          'grid size-7 place-items-center rounded-[6px_3px_7px_3px] transition-colors',
                          viewDensity === value
                            ? 'bg-postit text-postit-ink'
                            : 'text-faint hover:text-ink',
                        )}
                      >
                        <Icon size={16} strokeWidth={2.5} />
                      </button>
                    </Tooltip>
                  ))}
                </div>
              </div>
            </>
          ) : (
            <div className="flex w-full items-center gap-2">
              <button
                type="button"
                onClick={exitMultiSelectMode}
                className="grid size-7 shrink-0 place-items-center rounded-wobbly-sm text-muted hover:text-ink transition-colors"
                aria-label="Cancel selection"
              >
                <X size={16} strokeWidth={2.5} />
              </button>
              <span className="text-sm font-medium text-ink">
                {selectedNoteIds.length} selected
              </span>
              <div className="ml-auto flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    const allSelected = visibleNotes.length > 0 && visibleNotes.every((n) => selectedNoteIds.includes(n.id))
                    if (allSelected) {
                      deselectAllNotes()
                    } else {
                      selectAllNotes(visibleNotes.map((n) => n.id))
                    }
                  }}
                  className="rounded-wobbly-sm px-2 py-1 text-xs font-medium text-muted hover:bg-raise hover:text-ink transition-colors"
                >
                  {visibleNotes.length > 0 && visibleNotes.every((n) => selectedNoteIds.includes(n.id)) ? 'Deselect all' : 'Select all'}
                </button>
                {selectedNoteIds.length > 0 && (
                  <Button
                    size="sm"
                    variant="danger"
                    onClick={() => {
                      const count = selectedNoteIds.length
                      const label = count === 1 ? 'note' : 'notes'
                      if (surface === 'trash') {
                        confirmAction({
                          title: `Delete ${count} ${label} forever?`,
                          message: `This will permanently delete ${count} ${label}. This cannot be undone.`,
                          confirmLabel: 'Delete forever',
                          onConfirm: () => {
                            void deleteForeverAndPrune([...selectedNoteIds]).then((ok) => {
                              if (ok) {
                                toast.success(`${count} ${label} deleted`)
                                exitMultiSelectMode()
                              }
                            })
                          },
                        })
                      } else {
                        confirmAction({
                          title: `Move ${count} ${label} to trash?`,
                          message: `${count} ${label} will be moved to the trash. You can restore them later.`,
                          confirmLabel: 'Move to trash',
                          onConfirm: () => {
                            const { trashNotes } = useNoteStore.getState()
                            trashNotes(selectedNoteIds)
                            toast.success(`${count} ${label} moved to trash`)
                            exitMultiSelectMode()
                          },
                        })
                      }
                    }}
                  >
                    <Trash2 size={14} />
                    {surface === 'trash' ? 'Delete forever' : 'Move to trash'}
                  </Button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Trash banner */}
      {view.kind === 'trash' && visibleNotes.length > 0 && (
        <div className="mx-4 mb-2 flex items-center justify-between gap-3 rounded-wobbly-md border-2 border-dashed border-accent/50 bg-accent/[0.06] px-3 py-2">
          <p className="text-xs leading-snug text-muted">
            Deleted notes stay here until removed permanently.
          </p>
          <Button
            size="sm"
            variant="ghost"
            className="shrink-0 text-accent"
            onClick={() =>
              confirmAction({
                title: 'Empty trash?',
                message: `All ${visibleNotes.length} trashed ${visibleNotes.length === 1 ? 'note' : 'notes'} will be permanently deleted. This cannot be undone.`,
                confirmLabel: 'Empty trash',
                onConfirm: () => {
                  const ids = visibleNotes.filter((n) => n.isDeleted).map((n) => n.id)
                  void deleteForeverAndPrune(ids).then((ok) => {
                    if (ok) toast.success('Trash emptied')
                  })
                },
              })
            }
          >
            <TrashFilled size={16} />
            Empty trash
          </Button>
        </div>
      )}

      {/* Content */}
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        {!hydrated ? (
          <div className="flex flex-col gap-2.5 px-3 pb-6 pt-1">
            {Array.from({ length: 7 }).map((_, i) => (
              <div key={i} className="rounded-wobbly-md border-2 border-dashed border-lineSoft p-3">
                <Skeleton className="h-3.5 w-1/2" />
                <Skeleton className="mt-2 h-2.5 w-full" />
                <Skeleton className="mt-1.5 h-2 w-1/3" />
              </div>
            ))}
          </div>
        ) : visibleNotes.length === 0 ? (
          renderEmptyState()
        ) : viewDensity === 'grid' ? (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(190px,1fr))] gap-4 p-4 pt-3 xl:grid-cols-[repeat(auto-fill,minmax(220px,1fr))]">
            {visibleNotes.map((note, i) => (
              <LongPressWrapper key={note.id} note={note} onPreview={showPreview}>
                <NoteGridCardWithMenu
                  note={note}
                  surface={surface}
                  index={i}
                  selected={selectedNoteId === note.id}
                  multiSelected={multiSelectMode && selectedNoteIds.includes(note.id)}
                  onSelect={() =>
                    multiSelectMode
                      ? toggleNoteSelection(note.id)
                      : selectNote(note.id)
                  }
                />
              </LongPressWrapper>
            ))}
          </div>
        ) : (
          <div className="flex flex-col gap-0.5 px-2.5 pb-8 pt-0.5">
            {visibleNotes.map((note) => (
              <LongPressWrapper key={note.id} note={note} onPreview={showPreview}>
                <NoteRowWithMenu
                  note={note}
                  surface={surface}
                  density={viewDensity === 'compact' ? 'compact' : 'comfortable'}
                  selected={selectedNoteId === note.id}
                  multiSelected={multiSelectMode && selectedNoteIds.includes(note.id)}
                  onSelect={() =>
                    multiSelectMode
                      ? toggleNoteSelection(note.id)
                      : selectNote(note.id)
                  }
                />
              </LongPressWrapper>
            ))}
          </div>
        )}
      </div>

      {/* Long-press preview card */}
      {previewNoteState && (
        <NotePreviewCard
          note={previewNoteState.note}
          anchor={previewNoteState.anchor}
          onClose={closePreview}
          onOpen={() => setView({ kind: 'all' })}
        />
      )}
    </section>
  )
}

function ToolbarButton({
  label,
  Icon,
  active,
  ...rest
}: {
  label: string
  Icon: LucideIcon
  active: boolean
} & React.ComponentPropsWithoutRef<'button'>): React.ReactNode {
  return (
    <button
      type="button"
      {...rest}
      aria-label={label}
      className={cn(
        'inline-flex h-7 items-center gap-1.5 rounded-wobbly-sm border border-transparent px-2 text-xs transition-colors',
        active
          ? 'border-ballpoint/50 bg-ballpoint-soft text-ballpoint'
          : 'text-muted hover:border-lineSoft hover:bg-panel hover:text-ink',
      )}
    >
      <Icon size={17} aria-hidden="true" />
      {label}
    </button>
  )
}

function NoteRowWithMenu(props: {
  note: Note
  surface: 'live' | 'archive' | 'trash'
  density: 'compact' | 'comfortable'
  selected: boolean
  multiSelected?: boolean
  onSelect: () => void
}): React.ReactNode {
  return (
    <div className="group relative">
      <NoteRow {...props} />
      {!props.multiSelected && (
        <div className="absolute right-2 top-2 z-10 opacity-0 transition-opacity duration-100 focus-within:opacity-100 group-hover:opacity-100 [@media(hover:none)]:opacity-100">
          <DropdownMenu
            items={buildNoteMenu(props.note, { surface: props.surface })}
            trigger={(menuProps) => (
              <button
                {...menuProps}
                type="button"
                aria-label="Note options"
                className="grid size-7 place-items-center rounded-wobbly-sm border-2 border-line bg-overlay text-faint shadow-sketch-sm transition-colors hover:text-ink"
              >
                <MoreHorizontal size={16} aria-hidden="true" />
              </button>
            )}
          />
        </div>
      )}
    </div>
  )
}

/** Wrapper that adds long-press (touch) and right-click (desktop) preview to any note element. */
function LongPressWrapper({
  note,
  onPreview,
  children,
}: {
  note: Note
  onPreview: (note: Note, e: React.MouseEvent | React.TouchEvent) => void
  children: React.ReactNode
}): React.ReactNode {
  const lp = useLongPress({ onLongPress: (e) => onPreview(note, e) })
  return (
    <div
      {...lp}
      onContextMenu={(e) => {
        e.preventDefault()
        onPreview(note, e)
      }}
    >
      {children}
    </div>
  )
}

function NoteGridCardWithMenu(props: {
  note: Note
  surface: 'live' | 'archive' | 'trash'
  index: number
  selected: boolean
  multiSelected?: boolean
  onSelect: () => void
}): React.ReactNode {
  return (
    <div className="group/card relative">
      <NoteGridCard {...props} />
      {!props.multiSelected && (
        <div className="absolute right-2 top-2 z-10 opacity-0 transition-opacity duration-100 focus-within:opacity-100 group-hover/card:opacity-100 [@media(hover:none)]:opacity-100">
          <DropdownMenu
            items={buildNoteMenu(props.note, { surface: props.surface })}
            trigger={(menuProps) => (
              <button
                {...menuProps}
                type="button"
                aria-label="Note options"
                className="grid size-7 place-items-center rounded-wobbly-sm border-2 border-line bg-overlay text-faint shadow-sketch-sm transition-colors hover:text-ink"
              >
                <MoreHorizontal size={16} aria-hidden="true" />
              </button>
            )}
          />
        </div>
      )}
    </div>
  )
}
