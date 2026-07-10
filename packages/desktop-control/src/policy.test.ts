import { describe, expect, it } from 'vitest'

import {
  assertHotkeyNotDangerous,
  DEFAULT_DESKTOP_CONTROL_POLICY,
  isMutatingDesktopAction,
  resolveDesktopControlPolicy,
  summarizeDesktopAction,
} from './policy'
import { normalizeDesktopControlAction } from './normalize'

describe('desktop control policy', () => {
  it('defaults to fail-closed', () => {
    expect(DEFAULT_DESKTOP_CONTROL_POLICY.enabled).toBe(false)
    expect(DEFAULT_DESKTOP_CONTROL_POLICY.requireUserConfirmation).toBe(true)
    expect(DEFAULT_DESKTOP_CONTROL_POLICY.killSwitched).toBe(false)
  })

  it('clamps maxListedWindows', () => {
    const policy = resolveDesktopControlPolicy(DEFAULT_DESKTOP_CONTROL_POLICY, { maxListedWindows: 999 })
    expect(policy.maxListedWindows).toBe(50)
  })

  it('does not clobber unspecified fields on partial update', () => {
    const base = resolveDesktopControlPolicy(DEFAULT_DESKTOP_CONTROL_POLICY, {
      enabled: true,
      requireUserConfirmation: true,
    })

    const onlyEnabled = resolveDesktopControlPolicy(base, { enabled: false })
    expect(onlyEnabled.enabled).toBe(false)
    expect(onlyEnabled.requireUserConfirmation).toBe(true)

    const onlyAlwaysAllow = resolveDesktopControlPolicy(base, { requireUserConfirmation: false })
    expect(onlyAlwaysAllow.enabled).toBe(true)
    expect(onlyAlwaysAllow.requireUserConfirmation).toBe(false)
  })

  it('ignores explicit undefined fields in the update object', () => {
    const base = resolveDesktopControlPolicy(DEFAULT_DESKTOP_CONTROL_POLICY, {
      enabled: true,
      requireUserConfirmation: false,
    })

    // Simulates IPC payloads that include missing keys as undefined.
    const next = resolveDesktopControlPolicy(base, {
      enabled: undefined,
      requireUserConfirmation: true,
      maxListedWindows: undefined,
    } as Parameters<typeof resolveDesktopControlPolicy>[1])

    expect(next.enabled).toBe(true)
    expect(next.requireUserConfirmation).toBe(true)
    expect(next.maxListedWindows).toBe(base.maxListedWindows)
  })

  it('treats clipboardRead as non-mutating', () => {
    expect(isMutatingDesktopAction({ action: 'clipboardRead' })).toBe(false)
    expect(isMutatingDesktopAction({ action: 'click', x: 1, y: 2, button: 'left', clickCount: 1 })).toBe(true)
  })

  it('blocks dangerous hotkeys during normalize', () => {
    expect(() => normalizeDesktopControlAction({
      action: 'hotkey',
      keys: ['Alt', 'F4'],
    })).toThrow(/blocked/)
  })

  it('summarizes long typeText', () => {
    const summary = summarizeDesktopAction({
      action: 'typeText',
      text: 'a'.repeat(80),
    })
    expect(summary.length).toBeLessThan(80)
    expect(summary).toContain('…')
  })

  it('assertHotkeyNotDangerous allows benign chords', () => {
    expect(() => assertHotkeyNotDangerous(['ctrl', 's'])).not.toThrow()
  })
})
