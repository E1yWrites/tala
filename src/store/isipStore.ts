import { create } from 'zustand'
import type { IsipEntry } from '@/types/models'

/** Isip Entries as plain state, oldest first. Every mutation goes through `src/library/isip.ts`. */
export const useIsipStore = create<{ entries: IsipEntry[] }>(() => ({ entries: [] }))
