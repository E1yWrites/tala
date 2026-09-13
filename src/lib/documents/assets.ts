import type { AssetRecord } from '@/types/models'
import { assetRepository } from '@/database/repositories/assetRepository'
import { createId } from '@/utils/id'

/* ---------------------------------------------------------------------------
   Asset helpers: content hashing, dedupe-aware asset creation and blob URLs.
   Assets are immutable — the same bytes always map to the same record, so a
   PDF imported twice costs one copy on disk.
--------------------------------------------------------------------------- */

export async function sha256Hex(data: ArrayBuffer | Uint8Array): Promise<string> {
  const buf = data instanceof Uint8Array
    ? data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer
    : data
  const digest = await crypto.subtle.digest('SHA-256', buf)
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('')
}

/** Builds an asset record (not persisted). The bytes are copied. */
export async function buildAsset(data: ArrayBuffer | Uint8Array, mime: string): Promise<AssetRecord> {
  const copy = data instanceof Uint8Array
    ? data.slice().buffer
    : data.slice(0)
  return {
    id: createId(),
    mime,
    bytes: copy.byteLength,
    sha256: await sha256Hex(copy),
    data: copy,
    createdAt: Date.now(),
  }
}

/**
 * Returns an existing asset with identical content, or the freshly built one
 * flagged `isNew` so the caller can include it in its write transaction.
 */
export async function resolveAsset(
  data: ArrayBuffer | Uint8Array,
  mime: string,
): Promise<{ asset: AssetRecord; isNew: boolean }> {
  const built = await buildAsset(data, mime)
  const existing = await assetRepository.findBySha(built.sha256)
  if (existing && existing.bytes === built.bytes) return { asset: existing, isNew: false }
  return { asset: built, isNew: true }
}

/** The asset's bytes as a Blob (object URLs, downloads, viewers). */
export const assetBlob = (asset: AssetRecord): Blob => new Blob([asset.data], { type: asset.mime })

/** The asset's bytes decoded as UTF-8 text (rendered HTML documents). */
export const assetText = (asset: AssetRecord): string => new TextDecoder().decode(asset.data)

const urlCache = new Map<string, { url: string; refs: number }>()

/** Object URL for an asset blob, reference counted so views can share it. */
export function acquireAssetUrl(asset: AssetRecord): string {
  const hit = urlCache.get(asset.id)
  if (hit) {
    hit.refs++
    return hit.url
  }
  const url = URL.createObjectURL(assetBlob(asset))
  urlCache.set(asset.id, { url, refs: 1 })
  return url
}

export function releaseAssetUrl(assetId: string): void {
  const hit = urlCache.get(assetId)
  if (!hit) return
  hit.refs--
  if (hit.refs <= 0) {
    URL.revokeObjectURL(hit.url)
    urlCache.delete(assetId)
  }
}

/** Triggers a browser download of an asset (used for "Download original"). */
export function downloadAsset(asset: AssetRecord, fileName: string): void {
  const url = URL.createObjectURL(assetBlob(asset))
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  document.body.appendChild(a)
  a.click()
  a.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}
