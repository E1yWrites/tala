/**
 * Ambient types for the shim-only icon variants.
 *
 * `vite.config.ts` aliases `lucide-react` → `src/lib/lucideShim.tsx`, so at
 * runtime these names exist (they are `withDoodle` wrappers bound to state
 * variant artwork). The real package doesn't export them, so tsc needs this
 * augmentation for call sites that import them by name.
 */
import type { LucideIcon } from 'lucide-react'

declare module 'lucide-react' {
  export const StarFilled: LucideIcon
  export const PinFilled: LucideIcon
  export const TrashFilled: LucideIcon
  export const FilterActive: LucideIcon
  export const SortActive: LucideIcon
  export const Sort: LucideIcon
  export const CheckSoft: LucideIcon
}
