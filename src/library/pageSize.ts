import type { PageRecord, PageSize } from '@/types/models'

export const PAGE_SIZES = {
  a4: { w: 595, h: 842, kind: 'a4' },
  letter: { w: 612, h: 792, kind: 'letter' },
  slide: { w: 960, h: 540, kind: 'slide' },
} as const satisfies Record<string, PageSize>

/** Legacy rows have no size: treat them as A4. */
export const pageSize = (page: Pick<PageRecord, 'size'>): PageSize => page.size ?? PAGE_SIZES.a4
