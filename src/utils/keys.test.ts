import { describe, expect, it } from 'vitest'
import { modLabel } from './keys'

describe('modLabel', () => {
  it('uses ⌘ on Apple platforms and Ctrl elsewhere', () => {
    expect(modLabel('MacIntel')).toBe('⌘')
    expect(modLabel('iPad')).toBe('⌘')
    expect(modLabel('Win32')).toBe('Ctrl')
    expect(modLabel('Linux x86_64')).toBe('Ctrl')
  })
})
