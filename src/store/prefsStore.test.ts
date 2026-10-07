import { beforeEach, describe, expect, it, vi } from 'vitest'

function stubStorage(initial: Record<string, string> = {}): Map<string, string> {
  const m = new Map(Object.entries(initial))
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
  })
  return m
}

/** The store hydrates when its module loads, so each case needs a fresh import. */
async function freshStore() {
  vi.resetModules()
  return (await import('./prefsStore')).usePrefsStore
}

beforeEach(() => vi.unstubAllGlobals())

describe('prefsStore', () => {
  it('starts from defaults on a fresh device', async () => {
    stubStorage()
    const s = (await freshStore()).getState()
    expect(s.sidebarCollapsed).toBe(false)
    expect(s.inkPrefs.tool).toBe('pen')
  })

  it('carries over the pre-store localStorage keys once', async () => {
    const m = stubStorage({
      'tala:sidebar-collapsed': '1',
      'tala:reading-layout': '1',
      'tala:ink-prefs': JSON.stringify({ tool: 'highlighter', color: '#ff0000', sizeIdx: 2, eraserMode: 'pixel' }),
    })
    const store = await freshStore()
    expect(store.getState().sidebarCollapsed).toBe(true)
    expect(store.getState().readingLayout).toBe(true)
    expect(store.getState().inkPrefs).toMatchObject({ tool: 'highlighter', color: '#ff0000', sizeIdx: 2, eraserMode: 'pixel' })
    // the next change writes the new key, which wins from then on
    store.getState().toggleSidebar()
    expect(JSON.parse(m.get('tala:prefs')!).state.sidebarCollapsed).toBe(false)
    expect((await freshStore()).getState().sidebarCollapsed).toBe(false)
  })

  it('sanitizes garbage instead of crashing the editor', async () => {
    stubStorage({
      'tala:prefs': JSON.stringify({
        version: 1,
        state: { sidebarCollapsed: 'yes', inkPrefs: { tool: 'laser', color: 'red', sizeIdx: 999, preset: 'nope', pencil: { doubleTap: 'explode' } } },
      }),
    })
    const s = (await freshStore()).getState()
    expect(s.sidebarCollapsed).toBe(false)
    expect(s.inkPrefs.tool).toBe('pen')
    expect(s.inkPrefs.color).toBe('#2563eb')
    expect(s.inkPrefs.sizeIdx).toBeLessThan(20) // clamped into the preset range
    expect(s.inkPrefs.preset).toBe('marker')
    expect(s.inkPrefs.pencil.doubleTap).toBe('eraser')
  })

  it('clamps pane widths and treats junk as the default', async () => {
    stubStorage({
      'tala:prefs': JSON.stringify({ version: 1, state: { sidebarWidth: 9999, listWidth: 'wide' } }),
    })
    const store = await freshStore()
    expect(store.getState().sidebarWidth).toBe(360)
    expect(store.getState().listWidth).toBeNull()
    store.getState().setSidebarWidth(10)
    store.getState().setListWidth(300.4)
    expect(store.getState().sidebarWidth).toBe(180)
    expect(store.getState().listWidth).toBe(300)
    store.getState().setListWidth(null)
    expect(store.getState().listWidth).toBeNull()
  })

  it('works without localStorage (private mode)', async () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('blocked')
      },
      setItem: () => {
        throw new Error('blocked')
      },
    })
    const store = await freshStore()
    store.getState().setInkPrefs({ color: '#00ff00' })
    expect(store.getState().inkPrefs.color).toBe('#00ff00')
  })
})
