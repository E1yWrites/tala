import { useEffect, useState } from 'react'
import { db } from '@/database/db'

/** Binary data is never loaded at boot: components fetch it by id when they need it. */
export async function getBlob(id: string): Promise<Blob | undefined> {
  return (await db.blobs.get(id))?.data
}

/** Object URL for a stored blob, revoked when the component unmounts or the id changes. */
export function useBlobUrl(id: string | undefined): string | null {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    setUrl(null)
    if (!id) return
    let made: string | null = null
    let stale = false
    void getBlob(id).then((blob) => {
      if (stale || !blob) return
      made = URL.createObjectURL(blob)
      setUrl(made)
    })
    return () => {
      stale = true
      if (made) URL.revokeObjectURL(made)
    }
  }, [id])
  return url
}
