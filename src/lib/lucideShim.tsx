/**
 * lucide-react shim.
 *
 * Vite resolves every `import { ... } from 'lucide-react'` in the app to this
 * module (see `resolve.alias` in vite.config.ts). Icons are plain lucide line
 * icons; this file only adds the few app-specific slot names (filled/active
 * variants) that lucide itself does not export.
 */
import * as Lucide from 'lucide-react/dist/esm/lucide-react.mjs'

export * from 'lucide-react/dist/esm/lucide-react.mjs'

export const CheckSoft = Lucide.Check
export const PinFilled = Lucide.Pin
export const StarFilled = Lucide.Star
export const TrashFilled = Lucide.Trash2
export const FilterActive = Lucide.Filter
export const Sort = Lucide.ArrowUpDown
export const SortActive = Lucide.ArrowUpDown
