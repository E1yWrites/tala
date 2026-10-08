import { useMemo, useState, type ReactNode } from 'react'
import { WeekConstellation } from '@/coach/WeekConstellation'
import { listTasks } from '@/library/tasks'
import { usePageStore } from '@/store/pageStore'
import {
  Archive,
  CheckSquare,
  ChevronRight,
  CalendarCheck,
  CalendarDays,
  MoreHorizontal,
  NotebookText,
  PanelLeft,
  Plus,
  Search,
  Settings as SettingsIcon,
  Star,
  Trash2,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { Avatar } from '../UI/Avatar'
import { useNoteStore } from '@/store/noteStore'
import { useFolderStore } from '@/store/folderStore'
import { useTagStore } from '@/store/tagStore'
import { usePrefsStore } from '@/store/prefsStore'
import { useUIStore } from '@/store/uiStore'
import { useSettingsStore } from '@/store/settingsStore'
import type { ViewKind, ViewRef } from '@/types/models'
import { cn } from '@/utils/cn'
import { formatRelative } from '@/utils/dates'
import { folderColor } from '@/utils/folderColor'
import { downloadBackup } from '@/utils/exportImport'
import { Tooltip } from '../UI/Tooltip'
import { ThemeToggle } from '../UI/ThemeToggle'
import { useTick } from '@/hooks/useTick'
import { DropdownMenu, type MenuItem } from '../UI/DropdownMenu'
import { ConfirmDialog } from '../UI/ConfirmDialog'
import { shortcut } from '@/utils/keys'

/** Initials on the rail: a star-yellow chip, readable on green in both themes. */
const RAIL_AVATAR = 'border-transparent bg-gold font-semibold text-gold-fg'

/** The app icon (public/, precached by the service worker). */
const APP_ICON = `${import.meta.env.BASE_URL}app-icon-192.png`

/** Quiet icon button on the green rail. */
const RAIL_ICON_BTN =
  'grid size-9 shrink-0 place-items-center rounded-control text-rail-muted transition-colors hover:bg-rail-active hover:text-rail-fg [@media(pointer:coarse)]:size-11'

interface NavItemSpec {
  /** Stable identity for list keys / aria. */
  id: string
  label: string
  icon: LucideIcon
  count?: number
}

export function Sidebar({
  variant,
}: {
  variant: 'dock' | 'drawer'
}): ReactNode {
  useTick(60_000) // keep relative recency labels fresh
  const notes = useNoteStore((s) => s.notes)
  const pagesByNote = usePageStore((s) => s.pagesByNote)
  const folders = useFolderStore((s) => s.folders)
  const tags = useTagStore((s) => s.tags)
  const activeView = useUIStore((s) => s.activeView)
  const setView = useUIStore((s) => s.setView)
  const toggleSidebar = usePrefsStore((s) => s.toggleSidebar)
  const openModal = useUIStore((s) => s.openModal)
  const setSidebarDrawer = useUIStore((s) => s.setSidebarDrawer)
  const deleteFolder = useFolderStore((s) => s.deleteFolder)
  const expandedFolderIds = useFolderStore((s) => s.expandedFolderIds)
  const toggleFolderExpand = useFolderStore((s) => s.toggleFolderExpand)
  const moveFolder = useFolderStore((s) => s.moveFolder)
  const [pendingFolderDelete, setPendingFolderDelete] = useState<{
    id: string
    name: string
    count: number
  } | null>(null)
  const settings = useSettingsStore((s) => s.settings)

  const counts = useMemo(() => {
    const live = notes.filter((n) => !n.isDeleted && !n.isArchived)
    const perFolder = new Map<string, number>()
    const perTag = new Map<string, number>()
    for (const n of live) {
      if (n.folderId) perFolder.set(n.folderId, (perFolder.get(n.folderId) ?? 0) + 1)
      for (const t of n.tagIds) perTag.set(t, (perTag.get(t) ?? 0) + 1)
    }
    return {
      all: live.length,
      favorites: live.filter((n) => n.isFavorite).length,
      archive: notes.filter((n) => !n.isDeleted && n.isArchived).length,
      trash: notes.filter((n) => n.isDeleted).length,
      perFolder,
      perTag,
    }
  }, [notes])

  const openTasks = useMemo(
    () => listTasks(notes, pagesByNote).filter((t) => !t.checked).length,
    [notes, pagesByNote],
  )

  const lastBackupAt = usePrefsStore((s) => s.coach.lastBackupAt)
  const quietMode = usePrefsStore((s) => s.quietMode)
  const toggleQuietMode = usePrefsStore((s) => s.toggleQuietMode)

  const primaryItems: NavItemSpec[] = [
    { id: 'home', label: 'Today', icon: CalendarCheck },
    { id: 'agenda', label: 'Upcoming', icon: CalendarDays },
    { id: 'all', label: 'All Notes', icon: NotebookText, count: counts.all },
    { id: 'favorites', label: 'Starred', icon: Star, count: counts.favorites },
    { id: 'tasks', label: 'Tasks', icon: CheckSquare, count: openTasks },
  ]

  const topTags = useMemo(
    () =>
      [...tags]
        .map((t) => ({ tag: t, count: counts.perTag.get(t.id) ?? 0 }))
        .sort((a, b) => b.count - a.count || a.tag.name.localeCompare(b.tag.name))
        .slice(0, 10),
    [tags, counts.perTag],
  )

  const navigate = (view: ViewRef): void => {
    setView(view)
    if (variant === 'drawer') setSidebarDrawer(false)
  }

  return (
    <nav
      aria-label="Library"
      className={cn(
        'flex h-full flex-col border-r border-rail-line bg-rail px-3 pb-3 pt-4 text-rail-fg',
        variant === 'drawer' ? 'w-64' : 'w-full',
      )}
    >
      {/* Brand, with "Hide sidebar" first: the views put "Show sidebar" in this same spot */}
      <div className="flex items-center gap-1">
        {variant === 'dock' && <CollapseButton onClick={toggleSidebar} />}
        <button
          type="button"
          className="flex min-w-0 items-center gap-2.5 rounded-control px-1.5 py-0.5"
          onClick={() => navigate({ kind: 'home' })}
          aria-label="Tala home"
        >
          <img src={APP_ICON} alt="" width={30} height={30} className="size-[30px] rounded-[8px]" draggable={false} />
          <span className="truncate text-[21px] font-bold tracking-[-0.02em]">Tala</span>
        </button>
      </div>

      {/* New note: the one gold control */}
      <button
        type="button"
        onClick={() => openModal({ kind: 'new-note' })}
        className="mt-4 flex h-11 w-full items-center justify-center gap-2 rounded-card bg-gold text-[15px] font-semibold text-gold-fg transition-[filter,transform] duration-150 hover:brightness-105 active:scale-[0.98]"
      >
        <Plus size={18} strokeWidth={2.4} aria-hidden="true" />
        New note
      </button>

      <div className="-mx-1 mt-4 min-h-0 flex-1 overflow-y-auto px-1 pb-4 no-scrollbar [mask-image:linear-gradient(to_bottom,black_calc(100%-20px),transparent)]">
        <ul className="flex flex-col gap-0.5">
          {primaryItems.map((item) => (
            <li key={item.id}>
              <NavItemButton
                item={item}
                active={activeView.kind === item.id}
                onSelect={() => navigate({ kind: item.id as ViewKind })}
              />
            </li>
          ))}
          <li>
            <NavItemButton
              item={{ id: 'search', label: 'Search', icon: Search }}
              hint={shortcut('K')}
              active={false}
              onSelect={() => {
                if (variant === 'drawer') setSidebarDrawer(false)
                openModal({ kind: 'search' })
              }}
            />
          </li>
        </ul>

        {/* Folders */}
        <SectionHeader
          label="Folders"
          actionLabel="Create folder"
          onAction={() => openModal({ kind: 'folder-editor' })}
        />
        {folders.length === 0 ? (
          <button
            type="button"
            onClick={() => openModal({ kind: 'folder-editor' })}
            className="mx-1 mt-1 flex w-[calc(100%-0.5rem)] items-center gap-2 rounded-control border border-dashed border-rail-line px-2.5 py-2 text-left text-xs text-rail-muted transition-colors hover:border-rail-muted hover:text-rail-fg"
          >
            <Plus size={14} aria-hidden="true" />
            One folder per class keeps a term tidy
          </button>
        ) : (
          <FolderTree
            folders={folders}
            parentId={null}
            depth={0}
            activeView={activeView}
            navigate={navigate}
            counts={counts.perFolder}
            openModal={openModal}
            notes={notes}
            expandedFolderIds={expandedFolderIds}
            toggleFolderExpand={toggleFolderExpand}
            moveFolder={moveFolder}
            setPendingFolderDelete={setPendingFolderDelete}
          />
        )}

        {/* Tags */}
        {topTags.length > 0 && (
          <>
            <SectionHeader label="Tags" />
            <div className="mt-1.5 flex flex-wrap gap-1.5 px-1">
              {topTags.map(({ tag, count }) => {
                const active = activeView.kind === 'tag' && activeView.refId === tag.id
                return (
                  <button
                    key={tag.id}
                    type="button"
                    onClick={() => navigate({ kind: 'tag', refId: tag.id })}
                    aria-current={active ? 'page' : undefined}
                    className={cn(
                      'inline-flex h-7 items-center gap-1 rounded-full border px-2.5 text-xs transition-colors',
                      active
                        ? 'border-rail-fg bg-rail-fg text-rail'
                        : 'border-rail-line text-rail-muted hover:border-rail-muted hover:text-rail-fg',
                    )}
                  >
                    #{tag.name}
                    <span className="tabular-nums opacity-70">{count}</span>
                  </button>
                )
              })}
            </div>
          </>
        )}
      </div>

      {/* The week, plotted */}
      <WeekConstellation tone="rail" className="mt-3" />

      {/* Archive and Trash sit apart from the working items */}
      <div className="mt-3 flex items-center gap-0.5 border-t border-rail-line pt-2">
        <RailIconLink
          label={`Archive${counts.archive ? ` (${counts.archive})` : ''}`}
          active={activeView.kind === 'archive'}
          onClick={() => navigate({ kind: 'archive' })}
          icon={Archive}
        />
        <RailIconLink
          label={`Trash${counts.trash ? ` (${counts.trash})` : ''}`}
          active={activeView.kind === 'trash'}
          onClick={() => navigate({ kind: 'trash' })}
          icon={Trash2}
        />
        <span className="flex-1" />
        <ThemeToggle className="text-rail-muted hover:bg-rail-active hover:text-rail-fg" />
      </div>

      {/* Profile: a menu for the profile, Quiet mode and backups; the gear opens Settings */}
      <div className="mt-1 flex items-center gap-1">
        <div className="min-w-0 flex-1">
          <DropdownMenu
            side="top"
            align="start"
            items={[
              { id: 'profile', label: 'Edit name and profile', onSelect: () => navigate({ kind: 'settings' }) },
              { id: 'picture', label: 'Change picture', onSelect: () => openModal({ kind: 'profile-picture' }) },
              { id: 'quiet', label: 'Quiet mode (Bituin)', checked: quietMode, onSelect: toggleQuietMode },
              { id: 'sep', label: '', type: 'separator', onSelect: () => {} },
              { id: 'backup', label: 'Back up now', onSelect: () => void downloadBackup() },
            ]}
            trigger={(props) => (
              <button
                {...props}
                type="button"
                aria-label={`${settings.profile.name || 'Profile'}: profile, Quiet mode and backup`}
                className="flex w-full items-center gap-2.5 rounded-control px-1 py-1 text-left transition-colors hover:bg-rail-active"
              >
                <Avatar src={settings.profile.avatar} name={settings.profile.name} size="sm" className={RAIL_AVATAR} />
                <span className="min-w-0 flex-1 leading-tight">
                  <span className="block truncate text-sm font-semibold">{settings.profile.name || 'You'}</span>
                  <span className="block truncate text-[11.5px] text-rail-muted">
                    {lastBackupAt ? `Backed up ${formatRelative(lastBackupAt)}` : 'No backup yet'}
                  </span>
                </span>
              </button>
            )}
          />
        </div>
        <Tooltip label="Settings" side="top">
          <button
            type="button"
            onClick={() => navigate({ kind: 'settings' })}
            aria-label="Settings"
            aria-current={activeView.kind === 'settings' ? 'page' : undefined}
            className={cn(RAIL_ICON_BTN, activeView.kind === 'settings' && 'bg-rail-active text-rail-fg')}
          >
            <SettingsIcon size={18} />
          </button>
        </Tooltip>
      </div>

      {pendingFolderDelete !== null && (
        <ConfirmDialog
          open
          standalone
          title={`Delete “${pendingFolderDelete.name}”?`}
          message={
            pendingFolderDelete.count > 0
              ? `Its ${pendingFolderDelete.count} note${pendingFolderDelete.count === 1 ? '' : 's'} will stay in All Notes. This can't be undone.`
              : "This folder is empty. This can't be undone."
          }
          confirmLabel="Delete folder"
          onCancel={() => setPendingFolderDelete(null)}
          onConfirm={() => {
            void deleteFolder(pendingFolderDelete.id)
            setPendingFolderDelete(null)
          }}
        />
      )}
    </nav>
  )
}

/* ------------------------------ Sub-components ----------------------------- */

/** Recursive folder tree with expand/collapse and per-folder actions. */
function FolderTree(props: {
  folders: ReturnType<typeof useFolderStore.getState>['folders']
  parentId: string | null
  depth: number
  activeView: { kind: string; refId?: string | undefined }
  navigate: (view: ViewRef) => void
  counts: Map<string, number>
  openModal: ReturnType<typeof useUIStore.getState>['openModal']
  notes: ReturnType<typeof useNoteStore.getState>['notes']
  expandedFolderIds: Set<string>
  toggleFolderExpand: (id: string) => void
  moveFolder: (id: string, newParentId: string | null) => Promise<boolean>
  setPendingFolderDelete: (d: { id: string; name: string; count: number }) => void
}): ReactNode {
  const children = props.folders
    .filter((f) => f.parentId === props.parentId)
    .sort((a, b) => a.name.localeCompare(b.name))

  return (
    <ul className="mt-1 flex flex-col gap-0.5">
      {children.map((folder) => {
        const subfolders = props.folders.filter((f) => f.parentId === folder.id)
        const isExpanded = props.expandedFolderIds.has(folder.id)
        const active = props.activeView.kind === 'folder' && props.activeView.refId === folder.id
        return (
          <li key={folder.id}>
            <div className="group/f relative flex items-center">
              {subfolders.length > 0 ? (
                <button
                  type="button"
                  onClick={() => props.toggleFolderExpand(folder.id)}
                  aria-label={isExpanded ? 'Collapse folder' : 'Expand folder'}
                  aria-expanded={isExpanded}
                  className={cn(
                    'grid w-5 shrink-0 place-items-center text-rail-muted transition-transform duration-100',
                    isExpanded && 'rotate-90',
                  )}
                  style={{ marginLeft: `${props.depth * 14}px` }}
                >
                  <ChevronRight size={12} />
                </button>
              ) : (
                <span
                  className="w-5 shrink-0"
                  style={{ marginLeft: `${props.depth * 14}px` }}
                />
              )}
              <NavItemInline
                active={active}
                onClick={() => props.navigate({ kind: 'folder', refId: folder.id })}
                icon={<span className="size-2 rounded-full" style={{ background: folderColor(folder.id) }} />}
                label={folder.name}
                count={props.counts.get(folder.id)}
              />
              <DropdownMenu
                align="end"
                items={[
                  {
                    id: 'rename',
                    label: 'Rename folder',
                    onSelect: () => props.openModal({ kind: 'folder-editor', folderId: folder.id }),
                  },
                  {
                    id: 'new-subfolder',
                    label: 'New subfolder',
                    onSelect: () => props.openModal({ kind: 'folder-editor', parentId: folder.id }),
                  },
                  ...props.folders
                    .filter((f) => f.id !== folder.id && f.parentId !== folder.id)
                    .map<MenuItem>((f) => ({
                      id: `move-${f.id}`,
                      label: `Move into “${f.name}”`,
                      onSelect: () => void props.moveFolder(folder.id, f.id),
                    })),
                  {
                    id: 'move-root',
                    label: 'Move to root',
                    onSelect: () => void props.moveFolder(folder.id, null),
                  },
                  {
                    id: 'delete',
                    label: 'Delete folder',
                    danger: true,
                    onSelect: () =>
                      props.setPendingFolderDelete({
                        id: folder.id,
                        name: folder.name,
                        count: props.notes.filter(
                          (n) => n.folderId === folder.id && !n.isDeleted,
                        ).length,
                      }),
                  },
                ]}
                trigger={(triggerProps) => (
                  <button
                    {...triggerProps}
                    type="button"
                    aria-label={`Options for folder ${folder.name}`}
                    className="absolute right-1 grid size-7 place-items-center rounded-control text-rail-muted opacity-0 transition-opacity hover:bg-rail-active hover:text-rail-fg focus-visible:opacity-100 group-hover/f:opacity-100 [@media(pointer:coarse)]:opacity-50"
                  >
                    <MoreHorizontal size={15} />
                  </button>
                )}
              />
            </div>
            {isExpanded && subfolders.length > 0 && (
              <FolderTree {...props} parentId={folder.id} depth={props.depth + 1} />
            )}
          </li>
        )
      })}
    </ul>
  )
}

function NavItemButton({
  item,
  active,
  hint,
  onSelect,
}: {
  item: NavItemSpec
  active: boolean
  hint?: string
  onSelect: () => void
}): ReactNode {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'group flex h-9 w-full items-center gap-3 rounded-control px-2.5 text-[14px] font-medium transition-colors duration-100 [@media(pointer:coarse)]:h-11',
        active ? 'bg-rail-active text-rail-fg' : 'text-rail-fg/90 hover:bg-rail-active/60 hover:text-rail-fg',
      )}
    >
      <item.icon
        size={18}
        strokeWidth={active ? 2.2 : 1.8}
        aria-hidden="true"
        className={active ? 'text-gold' : 'text-rail-muted group-hover:text-rail-fg'}
      />
      <span className="flex-1 truncate text-left">{item.label}</span>
      {hint ? (
        <span className="text-[11px] text-rail-muted">{hint}</span>
      ) : (
        !!item.count &&
        item.count > 0 && (
          <span className={cn('text-xs tabular-nums', active ? 'text-rail-fg/80' : 'text-rail-muted')}>
            {item.count > 999 ? '999+' : item.count}
          </span>
        )
      )}
    </button>
  )
}

function NavItemInline({
  active,
  onClick,
  icon,
  label,
  count,
}: {
  active: boolean
  onClick: () => void
  icon: ReactNode
  label: ReactNode
  count?: number
}): ReactNode {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'flex h-8 min-w-0 flex-1 items-center gap-2.5 rounded-control px-1.5 text-[13.5px] transition-colors [@media(pointer:coarse)]:h-10',
        active ? 'bg-rail-active text-rail-fg' : 'text-rail-fg/85 hover:bg-rail-active/60 hover:text-rail-fg',
      )}
    >
      <span className="grid size-4 shrink-0 place-items-center" aria-hidden="true">{icon}</span>
      <span className="min-w-0 flex-1 truncate text-left">{label}</span>
      {!!count && count > 0 && <span className="pr-1 text-xs tabular-nums text-rail-muted group-hover/f:invisible [@media(pointer:coarse)]:invisible">{count}</span>}
    </button>
  )
}

function SectionHeader({
  label,
  actionLabel,
  onAction,
}: {
  label: string
  actionLabel?: string
  onAction?: () => void
}): ReactNode {
  return (
    <div className="mt-5 flex items-center justify-between px-2.5">
      <p className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-rail-muted">{label}</p>
      {onAction && (
        <Tooltip label={actionLabel ?? ''}>
          <button
            type="button"
            onClick={onAction}
            aria-label={actionLabel}
            className="-mr-1.5 grid size-7 place-items-center rounded-control text-rail-muted transition-colors hover:bg-rail-active hover:text-rail-fg"
          >
            <Plus size={15} strokeWidth={2.2} />
          </button>
        </Tooltip>
      )}
    </div>
  )
}

function RailIconLink({
  label,
  icon: Icon,
  active,
  onClick,
}: {
  label: string
  icon: LucideIcon
  active: boolean
  onClick: () => void
}): ReactNode {
  return (
    <Tooltip label={label} side="top">
      <button
        type="button"
        onClick={onClick}
        aria-label={label}
        aria-current={active ? 'page' : undefined}
        className={cn(RAIL_ICON_BTN, active && 'bg-rail-active text-rail-fg')}
      >
        <Icon size={18} />
      </button>
    </Tooltip>
  )
}

function CollapseButton({ onClick }: { onClick: () => void }): ReactNode {
  return (
    <Tooltip label="Hide sidebar" side="right">
      <button type="button" onClick={onClick} aria-label="Hide sidebar" className={cn(RAIL_ICON_BTN, 'hidden lg:grid')}>
        <PanelLeft size={18} />
      </button>
    </Tooltip>
  )
}
