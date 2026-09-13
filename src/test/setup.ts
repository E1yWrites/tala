import 'fake-indexeddb/auto'
import { afterEach } from 'vitest'

// jsdom lacks a few browser APIs the app touches at module scope.
if (typeof window !== 'undefined') {
  if (!('ResizeObserver' in window)) {
    class RO {
      observe(): void {}
      unobserve(): void {}
      disconnect(): void {}
    }
    ;(window as unknown as { ResizeObserver: unknown }).ResizeObserver = RO
  }
  if (!('matchMedia' in window)) {
    ;(window as unknown as { matchMedia: unknown }).matchMedia = (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener(): void {},
      removeEventListener(): void {},
      addListener(): void {},
      removeListener(): void {},
      dispatchEvent(): boolean {
        return false
      },
    })
  }
  if (!('DOMRect' in window)) {
    ;(window as unknown as { DOMRect: unknown }).DOMRect = class {
      constructor(
        public x = 0,
        public y = 0,
        public width = 0,
        public height = 0,
      ) {}
      get left(): number { return this.x }
      get top(): number { return this.y }
      get right(): number { return this.x + this.width }
      get bottom(): number { return this.y + this.height }
    }
  }
}

afterEach(() => {
  // Each test file gets a fresh module graph, but keep DOM clean between tests.
  document.body.innerHTML = ''
})
