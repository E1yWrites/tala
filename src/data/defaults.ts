import type { AppSettings } from '@/types/models'

export const DEFAULT_SETTINGS: AppSettings = {
  key: 'app',
  theme: 'system',
  editorFontSize: 15,
  editorLineHeight: 1.7,
  autosaveEnabled: true,
  confirmBeforeDelete: true,
  viewDensity: 'comfortable',
  sortKey: 'updated-desc',
  profile: {
    name: 'Lorenz Lanz Malabanan',
    role: 'Student',
  },
  seededAt: null,
}

/**
 * Crayon-box palette for tags — cycled in order of tag creation.
 * Keys are persisted on stored tags, so they must remain stable; only the
 * hand-drawn styling mapped to each key may change.
 */
export const TAG_COLORS: Record<
  string,
  { label: string; chip: string; dot: string }
> = {
  iris: {
    label: 'Red marker',
    chip: 'bg-accent/10 text-accent border-accent/40',
    dot: 'bg-accent',
  },
  teal: {
    label: 'Ballpoint blue',
    chip: 'bg-ballpoint/10 text-ballpoint border-ballpoint/40',
    dot: 'bg-ballpoint',
  },
  amber: {
    label: 'Post-it yellow',
    chip: 'bg-postit/60 text-[#8a7500] border-postit dark:text-postit-ink',
    dot: 'bg-postit',
  },
  rose: {
    label: 'Crayon orange',
    chip: 'bg-[#f08c00]/15 text-[#b26a00] dark:text-[#ffc078] border-[#f08c00]/40',
    dot: 'bg-[#f08c00]',
  },
  sky: {
    label: 'Marker purple',
    chip: 'bg-[#9775fa]/15 text-[#7048e8] dark:text-[#d0bfff] border-[#9775fa]/40',
    dot: 'bg-[#9775fa]',
  },
  lime: {
    label: 'Crayon green',
    chip: 'bg-[#4c9e6b]/15 text-[#2f7d51] dark:text-[#96d2ae] border-[#4c9e6b]/40',
    dot: 'bg-[#4c9e6b]',
  },
}

export const TAG_COLOR_KEYS = Object.keys(TAG_COLORS)
