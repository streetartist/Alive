import { describe, expect, it } from 'vitest'

import { normalizeDesktopControlAction, normalizeHotkeyPart } from './normalize'

describe('normalizeDesktopControlAction', () => {
  it('normalizes click payloads', () => {
    expect(normalizeDesktopControlAction({
      action: 'click',
      x: 10.2,
      y: 20,
      button: 'left',
      clickCount: 2,
    })).toEqual({
      action: 'click',
      x: 10.2,
      y: 20,
      button: 'left',
      clickCount: 2,
    })
  })

  it('rejects overlong text', () => {
    expect(() => normalizeDesktopControlAction({
      action: 'typeText',
      text: 'a'.repeat(2001),
    })).toThrow(/at most 2000/)
  })

  it('normalizes hotkey parts', () => {
    expect(normalizeDesktopControlAction({
      action: 'hotkey',
      keys: ['Ctrl', 'S'],
    })).toEqual({
      action: 'hotkey',
      keys: ['ctrl', 's'],
    })
  })

  it('blocks dangerous hotkeys', () => {
    expect(() => normalizeDesktopControlAction({
      action: 'hotkey',
      keys: ['Alt', 'F4'],
    })).toThrow(/blocked/)
  })

  it('normalizes focusWindow and clipboard actions', () => {
    expect(normalizeDesktopControlAction({
      action: 'focusWindow',
      titleIncludes: '  Chrome  ',
    })).toEqual({
      action: 'focusWindow',
      titleIncludes: 'Chrome',
    })
    expect(normalizeDesktopControlAction({ action: 'clipboardRead' })).toEqual({ action: 'clipboardRead' })
  })
})

describe('normalizeHotkeyPart', () => {
  it('accepts meta aliases', () => {
    expect(normalizeHotkeyPart('Win')).toBe('win')
    expect(normalizeHotkeyPart('Command')).toBe('command')
  })

  it('rejects unsupported keys', () => {
    expect(() => normalizeHotkeyPart('MediaPlay')).toThrow(/Unsupported hotkey part/)
  })
})
