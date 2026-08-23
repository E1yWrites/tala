/** Collision-resistant id generator (crypto-based, no dependency). */
export function createId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  // Fallback for very old browsers
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}
