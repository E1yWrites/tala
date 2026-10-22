import { create } from 'zustand'
import type { IsipAliases } from '@/entries/parse'
import type { IsipEntry } from '@/types/models'

/** Isip Entries as plain state, oldest first, and the owner's name corrections. Every mutation goes through `src/library/isip.ts`. */
export const useIsipStore = create<{ entries: IsipEntry[]; aliases: IsipAliases }>(() => ({ entries: [], aliases: { exercise: {}, merchant: {} } }))
