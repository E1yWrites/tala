/** Asks the browser to keep this site's data when storage runs low. Best effort: iOS Safari only grants it to installed apps. */
export async function requestPersistence(): Promise<boolean | null> {
  try {
    if (!navigator.storage?.persist) return null
    return (await navigator.storage.persisted()) || (await navigator.storage.persist())
  } catch {
    return null
  }
}

/** Whether the browser has promised not to clear our data (null when it can't say). */
export async function isPersisted(): Promise<boolean | null> {
  try {
    return (await navigator.storage?.persisted?.()) ?? null
  } catch {
    return null
  }
}
