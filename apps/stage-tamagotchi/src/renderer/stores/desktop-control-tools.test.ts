import { describe, expect, it } from 'vitest'

import { shouldRegisterDesktopControlTools } from './desktop-control-tools'

describe('shouldRegisterDesktopControlTools', () => {
  it('registers only when enabled and not kill-switched', () => {
    expect(shouldRegisterDesktopControlTools({
      enabled: true,
      killSwitched: false,
    })).toBe(true)
  })

  it('does not register when desktop control is disabled', () => {
    expect(shouldRegisterDesktopControlTools({
      enabled: false,
      killSwitched: false,
    })).toBe(false)
  })

  it('does not register while emergency stop is armed', () => {
    expect(shouldRegisterDesktopControlTools({
      enabled: true,
      killSwitched: true,
    })).toBe(false)
  })
})
