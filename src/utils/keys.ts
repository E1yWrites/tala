/**
 * The modifier the shortcuts use (useHotkeys accepts Ctrl or ⌘), labelled the
 * way this device's keyboard prints it: ⌘ on Apple devices, Ctrl elsewhere.
 */
export function modLabel(platform: string): '⌘' | 'Ctrl' {
  return /Mac|iPhone|iPad|iPod/i.test(platform) ? '⌘' : 'Ctrl'
}

export const MOD: '⌘' | 'Ctrl' =
  typeof navigator === 'undefined' ? 'Ctrl' : modLabel(navigator.platform || navigator.userAgent)

/** "⌘K" on a Mac, "Ctrl K" elsewhere. */
export const shortcut = (key: string): string => (MOD === '⌘' ? `⌘${key}` : `Ctrl ${key}`)
