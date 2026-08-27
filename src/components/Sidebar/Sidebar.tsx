import { useMemo, useState, type ReactNode } from 'react'
import { TalaMark } from '@/components/Brand/TalaMark'
import {
  Archive,
  Clock,
  Folder as FolderIcon,
  MoreHorizontal,
  NotebookText,
  PanelLeft,
  PanelRight,
  Pin,
  Plus,
  Settings as SettingsIcon,
  Star,
  Trash2,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

const ICON_SIZE = 24
const ICON_CONTAINER = 'grid size-7 shrink-0 place-items-center overflow-visible'
const BOTTOM_ICON_SIZE = 26
const BOTTOM_ICON_CONTAINER = 'grid size-full place-items-center overflow-visible'
import { Avatar } from '../UI/Avatar'
import { useNoteStore } from '@/store/noteStore'
import { useFolderStore } from '@/store/folderStore'
import { useTagStore } from '@/store/tagStore'
import { useUIStore } from '@/store/uiStore'
import { useSettingsStore } from '@/store/settingsStore'
import type { ViewKind, ViewRef } from '@/types/models'
import { cn } from '@/utils/cn'
import { Tooltip } from '../UI/Tooltip'
import { ThemeToggle } from '../UI/ThemeToggle'
import { useTick } from '@/hooks/useTick'
import { DropdownMenu } from '../UI/DropdownMenu'
import { ConfirmDialog } from '../UI/ConfirmDialog'

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
  const folders = useFolderStore((s) => s.folders)
  const tags = useTagStore((s) => s.tags)
  const activeView = useUIStore((s) => s.activeView)
  const setView = useUIStore((s) => s.setView)
  const collapsed = useUIStore((s) => s.sidebarCollapsed)
  const toggleSidebar = useUIStore((s) => s.toggleSidebar)
  const openModal = useUIStore((s) => s.openModal)
  const setSidebarDrawer = useUIStore((s) => s.setSidebarDrawer)
  const deleteFolder = useFolderStore((s) => s.deleteFolder)
  const [pendingFolderDelete, setPendingFolderDelete] = useState<{
    id: string
    name: string
    count: number
  } | null>(null)
  const settings = useSettingsStore((s) => s.settings)

  const isCollapsed = collapsed && variant === 'dock'

  const counts = useMemo(() => {
    const live = notes.filter((n) => !n.isDeleted && !n.isArchived)
    const weekAgo = Date.now() - 7 * 86_400_000
    const perFolder = new Map<string, number>()
    const perTag = new Map<string, number>()
    for (const n of live) {
      if (n.folderId) perFolder.set(n.folderId, (perFolder.get(n.folderId) ?? 0) + 1)
      for (const t of n.tagIds) perTag.set(t, (perTag.get(t) ?? 0) + 1)
    }
    return {
      all: live.length,
      favorites: live.filter((n) => n.isFavorite).length,
      pinned: live.filter((n) => n.isPinned).length,
      recent: live.filter((n) => n.updatedAt >= weekAgo).length,
      archive: notes.filter((n) => !n.isDeleted && n.isArchived).length,
      trash: notes.filter((n) => n.isDeleted).length,
      perFolder,
      perTag,
    }
  }, [notes])

  const libraryItems: NavItemSpec[] = [
    { id: 'all', label: 'All Notes', icon: NotebookText, count: counts.all },
    { id: 'favorites', label: 'Favorites', icon: Star, count: counts.favorites },
    { id: 'pinned', label: 'Pinned', icon: Pin, count: counts.pinned },
    { id: 'recent', label: 'Recent', icon: Clock, count: counts.recent },
    { id: 'archive', label: 'Archive', icon: Archive, count: counts.archive },
    { id: 'trash', label: 'Trash', icon: Trash2, count: counts.trash },
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

      className={cn(
        'flex h-full flex-col border-r-2 border-line bg-panel',
        variant === 'drawer' ? 'w-60' : 'w-full',
        isCollapsed ? 'items-center px-1.5 py-3' : 'px-3 py-3',
      )}
    >
      {/* Brand */}
      <div className={cn('flex items-center gap-2.5 px-1', isCollapsed && 'px-0 justify-center')}>
        <button
          type="button"
          className="grid size-9 shrink-0 -rotate-3 place-items-center rounded-wobbly-sm transition-transform duration-150 hover:rotate-0"
          onClick={() => navigate({ kind: 'home' })}
          aria-label="Tala home"
        >
          <TalaMark size={30} className="text-accent" />
        </button>
        {!isCollapsed && (
          <div className="min-w-0">
            <p className="font-display text-lg leading-none">
              tala<span className="text-accent">.</span>
            </p>
            <p className="mt-0.5 truncate text-xs leading-none text-faint">Pagtatala, made simple.</p>
          </div>
        )}
      </div>

      {/* New note */}
      <div className={cn('mt-4', isCollapsed && 'mt-3')}>
        {isCollapsed ? (
          <Tooltip label="New note" side="right">
            <button
              type="button"
              onClick={() => openModal({ kind: 'new-note' })}
              aria-label="New note"
              className="grid size-9 place-items-center rounded-wobbly-sm border-[3px] border-line bg-postit text-postit-ink shadow-sketch-sm transition-all duration-100 hover:bg-accent hover:text-accent-fg active:translate-x-[3px] active:translate-y-[3px] active:shadow-none"
            >
              <Plus size={20} strokeWidth={2.5} />
            </button>
          </Tooltip>
        ) : (
          <button
            type="button"
            onClick={() => openModal({ kind: 'new-note' })}
            className="flex h-10 w-full items-center gap-2 rounded-wobbly border-[3px] border-line bg-postit px-4 text-[15px] text-postit-ink shadow-sketch transition-all duration-100 hover:bg-accent hover:text-accent-fg hover:shadow-sketch-sm hover:translate-x-[2px] hover:translate-y-[2px] active:translate-x-[4px] active:translate-y-[4px] active:shadow-none"
          >
            <span className={ICON_CONTAINER} aria-hidden="true">
              <Plus size={ICON_SIZE} strokeWidth={2.5} />
            </span>
            New Note
          </button>
        )}
      </div>

      {/* Library */}
      <ul className="mt-4 flex flex-col gap-0.5 overflow-y-auto no-scrollbar">
        {libraryItems.map((item) => (
          <li key={item.id}>
            <NavItemButton
              item={item}
              active={activeView.kind === item.id}
              collapsed={isCollapsed}
              onSelect={() => navigate({ kind: item.id as ViewKind })}
            />
          </li>
        ))}
      </ul>

      {!isCollapsed && (
        <div className="mt-5 min-h-0 flex-1 overflow-y-auto">
          {/* Folders */}
          <SectionHeader
            label="Folders"
            actionLabel="Create folder"
            onAction={() => openModal({ kind: 'folder-editor' })}
          />
          {folders.length === 0 ? (
            <p className="px-2 py-1 text-xs text-faint">No folders yet</p>
          ) : (
            <ul className="mt-1 flex flex-col gap-0.5">
              {folders.map((folder) => {
                const active = activeView.kind === 'folder' && activeView.refId === folder.id
                return (
                  <li key={folder.id} className="group/f relative flex items-center">
                    <NavItemInline
                      active={active}
                      onClick={() => navigate({ kind: 'folder', refId: folder.id })}
                      icon={<FolderIcon size={ICON_SIZE} strokeWidth={2} />}
                      label={folder.name}
                      count={counts.perFolder.get(folder.id)}
                    />
                    <DropdownMenu
                      align="end"
                      items={[
                        {
                          id: 'rename',
                          label: 'Rename folder',
                          onSelect: () => openModal({ kind: 'folder-editor', folderId: folder.id }),
                        },
                        {
                          id: 'delete',
                          label: 'Delete folder',
                          danger: true,
                          onSelect: () =>
                            setPendingFolderDelete({
                              id: folder.id,
                              name: folder.name,
                              count: notes.filter(
                                (n) => n.folderId === folder.id && !n.isDeleted,
                              ).length,
                            }),
                        },
                      ]}
                      trigger={(props) => (
                        <button
                          {...props}
                          type="button"
                          aria-label={`Options for folder ${folder.name}`}
                          className="absolute right-1 grid size-6 place-items-center rounded-wobbly-sm text-faint opacity-40 transition-opacity hover:bg-raise hover:text-ink focus-visible:opacity-100 group-hover/f:opacity-100"
                        >
                          <MoreHorizontal size={13} />
                        </button>
                      )}
                    />
                  </li>
                )
              })}
            </ul>
          )}

          {/* Tags */}
          <SectionHeader label="Tags" />
          {topTags.length === 0 ? (
            <p className="px-2 py-1 text-xs text-faint">No tags yet</p>
          ) : (
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
                      'inline-flex h-6 items-center gap-1 rounded-wobbly-sm border px-2 text-xs transition-colors',
                      active
                        ? 'border-ballpoint/60 bg-ballpoint-soft text-ballpoint'
                        : 'border-lineSoft bg-canvas text-muted hover:border-ballpoint/40 hover:text-ink',
                    )}
                  >
                    #{tag.name}
                    <span className="text-[10px] opacity-60">{count}</span>
                  </button>
                )
              })}
            </div>
          )}
        </div>
      )}

      {isCollapsed && <div className="min-h-0 flex-1" />}

      {/* Bottom area */}
      <div className={cn('mt-auto flex flex-col gap-0.5 pt-3', isCollapsed ? 'items-center' : '')}>
        {!isCollapsed && (
          <NavItemButton
            item={{ id: 'quick-actions', label: 'Quick actions…', icon: Plus }}
            active={false}
            collapsed={isCollapsed}
            onSelect={() => openModal({ kind: 'palette' })}
          />
        )}
        <div className={cn('flex items-center gap-1', isCollapsed ? 'flex-col' : '')}>
          <ThemeToggle collapsed={isCollapsed} />
          <SettingsButton collapsed={isCollapsed} onClick={() => navigate({ kind: 'settings' })} />
          {variant === 'dock' && (
            <CollapseButton collapsed={isCollapsed} onClick={toggleSidebar} />
          )}
        </div>

        {/* Profile — display only. Editing lives in Settings → Profile. */}
        {isCollapsed ? (
          <Tooltip label={settings.profile.name || 'Profile'} side="right">
            <span className="mt-2 inline-flex" title={settings.profile.name}>
              <Avatar
                src={settings.profile.avatar}
                name={settings.profile.name}
                size="sm"
                className="rotate-3"
              />
            </span>
          </Tooltip>
        ) : (
          <div className="mt-2">
            <div className="flex items-center gap-2.5 rounded-wobbly-sm p-1.5">
              <Avatar
                src={settings.profile.avatar}
                name={settings.profile.name}
                size="md"
              />
              <span className="min-w-0 flex-1 text-left">
                <span className="block truncate text-sm leading-tight">{settings.profile.name}</span>
                <span className="block truncate text-xs text-faint">{settings.profile.role}</span>
              </span>
            </div>
          </div>
        )}
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

function NavItemButton({
  item,
  active,
  collapsed,
  onSelect,
}: {
  item: NavItemSpec
  active: boolean
  collapsed: boolean
  onSelect: () => void
}): ReactNode {
  const content = (
    <button
      type="button"
      onClick={onSelect}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'group flex h-8 w-full items-center gap-2.5 rounded-wobbly-sm px-2 text-[15px] transition-colors duration-100',
        collapsed && 'justify-center px-0',
        active ? 'bg-postit text-postit-ink' : 'text-muted hover:bg-raise hover:text-ink',
      )}
    >
      <span className={ICON_CONTAINER} aria-hidden="true">
        <item.icon size={ICON_SIZE} strokeWidth={active ? 2.5 : 2} />
      </span>
      {!collapsed && (
        <>
          <span className="flex-1 truncate text-left">{item.label}</span>
          {!!item.count && item.count > 0 && (
            <span
              className={cn(
                'rounded-wobbly-sm px-1.5 text-[11px] tabular-nums',
                active ? 'bg-panel/70 text-postit-ink' : 'bg-raise text-faint',
              )}
            >
              {item.count > 99 ? '99+' : item.count}
            </span>
          )}
        </>
      )}
    </button>
  )
  return collapsed ? (
    <Tooltip label={item.label} side="right">
      {content}
    </Tooltip>
  ) : (
    content
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
        'flex h-8 min-w-0 flex-1 items-center gap-2 rounded-wobbly-sm pl-1.5 pr-1.5 text-xs transition-colors',
        active ? 'bg-postit text-postit-ink' : 'text-muted hover:bg-raise hover:text-ink',
      )}
    >
      <span className={cn(ICON_CONTAINER, active ? 'text-accent' : 'text-faint')}>{icon}</span>
      <span className="min-w-0 flex-1 truncate text-left">{label}</span>
      {!!count && count > 0 && <span className="text-[10px] tabular-nums text-faint">{count}</span>}
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
    <div className="flex items-center justify-between px-2 pt-1">
      <p className="text-[13px] text-muted underline decoration-wavy decoration-lineSoft/70 underline-offset-4">
        {label}
      </p>
      {onAction && (
        <Tooltip label={actionLabel ?? ''}>
          <button
            type="button"
            onClick={onAction}
            aria-label={actionLabel}
            className="grid size-5 place-items-center rounded-wobbly-sm text-faint transition-colors hover:bg-raise hover:text-ink"
          >
            <Plus size={12} strokeWidth={2.5} />
          </button>
        </Tooltip>
      )}
    </div>
  )
}

function SettingsButton({
  collapsed,
  onClick,
}: {
  collapsed: boolean
  onClick: () => void
}): ReactNode {
  const btn = (
    <button
      type="button"
      onClick={onClick}
      aria-label="Settings"
      className={cn(
        'grid size-9 place-items-center rounded-wobbly-sm text-muted transition-colors hover:bg-raise hover:text-ink',
      )}
    >
      <span className={BOTTOM_ICON_CONTAINER} aria-hidden="true">
        <SettingsIcon size={BOTTOM_ICON_SIZE} />
      </span>
    </button>
  )
  return collapsed ? (
    <Tooltip label="Settings" side="right">
      {btn}
    </Tooltip>
  ) : (
    btn
  )
}

function CollapseButton({
  collapsed,
  onClick,
}: {
  collapsed: boolean
  onClick: () => void
}): ReactNode {
  return (
    <Tooltip label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'} side="top">
      <button
        type="button"
        onClick={onClick}
        aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        className="hidden size-9 place-items-center rounded-wobbly-sm text-muted transition-colors hover:bg-raise hover:text-ink lg:grid"
      >
        <span className={BOTTOM_ICON_CONTAINER} aria-hidden="true">
          {collapsed ? (
            <PanelRight size={BOTTOM_ICON_SIZE} strokeWidth={2} />
          ) : (
            <PanelLeft size={BOTTOM_ICON_SIZE} strokeWidth={2} />
          )}
        </span>
      </button>
    </Tooltip>
  )
}
