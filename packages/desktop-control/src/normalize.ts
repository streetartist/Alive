import type { DesktopControlAction, DesktopMouseButton } from './types'

import { assertHotkeyNotDangerous } from './policy'

const MAX_TEXT_LENGTH = 2000
const MAX_DRAG_DURATION_MS = 5000
const MAX_CLICK_COUNT = 3
const MAX_SCROLL_DELTA = 6000
const MAX_CLIPBOARD_LENGTH = 20_000
const MAX_TITLE_INCLUDES_LENGTH = 200

const SUPPORTED_BUTTONS = new Set<DesktopMouseButton>(['left', 'middle', 'right'])

const SUPPORTED_HOTKEY_PARTS = new Set([
  'alt',
  'backspace',
  'ctrl',
  'control',
  'delete',
  'down',
  'end',
  'enter',
  'escape',
  'esc',
  'home',
  'left',
  'pagedown',
  'pageup',
  'right',
  'shift',
  'space',
  'tab',
  'up',
  'win',
  'meta',
  'cmd',
  'command',
])

for (let index = 1; index <= 12; index += 1)
  SUPPORTED_HOTKEY_PARTS.add(`f${index}`)
for (let index = 0; index <= 9; index += 1)
  SUPPORTED_HOTKEY_PARTS.add(`${index}`)
for (let charCode = 97; charCode <= 122; charCode += 1)
  SUPPORTED_HOTKEY_PARTS.add(String.fromCharCode(charCode))

function assertFiniteNumber(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value))
    throw new TypeError(`${field} must be a finite number`)
  return value
}

function assertIntegerInRange(value: unknown, field: string, min: number, max: number): number {
  const number = assertFiniteNumber(value, field)
  if (!Number.isInteger(number) || number < min || number > max)
    throw new TypeError(`${field} must be an integer between ${min} and ${max}`)
  return number
}

function assertButton(value: unknown): DesktopMouseButton {
  if (typeof value !== 'string' || !SUPPORTED_BUTTONS.has(value as DesktopMouseButton))
    throw new TypeError('button must be one of: left, middle, right')
  return value as DesktopMouseButton
}

/**
 * Normalizes a hotkey token to a stable lowercase id.
 *
 * Before:
 * - "Control_L", "Ctrl", "ARROWLEFT"
 *
 * After:
 * - "control", "ctrl", "left"
 */
export function normalizeHotkeyPart(value: unknown): string {
  if (typeof value !== 'string')
    throw new TypeError('hotkey entries must be strings')

  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/^control_[lr]$/, 'control')
    .replace(/^ctrl_[lr]$/, 'ctrl')
    .replace(/^alt_[lr]$/, 'alt')
    .replace(/^shift_[lr]$/, 'shift')
    .replace(/^meta_[lr]$/, 'meta')
    .replace(/^arrow/, '')

  if (!SUPPORTED_HOTKEY_PARTS.has(normalized)) {
    throw new TypeError(
      `Unsupported hotkey part "${value}". Use letters, digits, F1-F12, Ctrl, Alt, Shift, Meta/Win/Cmd, arrows, Enter, Tab, Escape, Backspace, Delete, Home, End, PageUp, PageDown, or Space.`,
    )
  }

  return normalized
}

/**
 * Validates and normalizes a desktop control action payload.
 */
export function normalizeDesktopControlAction(payload: DesktopControlAction): DesktopControlAction {
  if (!payload || typeof payload !== 'object')
    throw new TypeError('desktop action payload must be an object')

  switch (payload.action) {
    case 'move':
      return {
        action: 'move',
        x: assertFiniteNumber(payload.x, 'x'),
        y: assertFiniteNumber(payload.y, 'y'),
      }
    case 'click':
      return {
        action: 'click',
        x: assertFiniteNumber(payload.x, 'x'),
        y: assertFiniteNumber(payload.y, 'y'),
        button: assertButton(payload.button),
        clickCount: assertIntegerInRange(payload.clickCount, 'clickCount', 1, MAX_CLICK_COUNT),
      }
    case 'drag':
      return {
        action: 'drag',
        fromX: assertFiniteNumber(payload.fromX, 'fromX'),
        fromY: assertFiniteNumber(payload.fromY, 'fromY'),
        toX: assertFiniteNumber(payload.toX, 'toX'),
        toY: assertFiniteNumber(payload.toY, 'toY'),
        button: assertButton(payload.button),
        durationMs: assertIntegerInRange(payload.durationMs, 'durationMs', 0, MAX_DRAG_DURATION_MS),
      }
    case 'scroll':
      return {
        action: 'scroll',
        x: assertFiniteNumber(payload.x, 'x'),
        y: assertFiniteNumber(payload.y, 'y'),
        deltaX: assertIntegerInRange(payload.deltaX, 'deltaX', -MAX_SCROLL_DELTA, MAX_SCROLL_DELTA),
        deltaY: assertIntegerInRange(payload.deltaY, 'deltaY', -MAX_SCROLL_DELTA, MAX_SCROLL_DELTA),
      }
    case 'typeText': {
      if (typeof payload.text !== 'string')
        throw new TypeError('text must be a string')
      if (payload.text.length > MAX_TEXT_LENGTH)
        throw new TypeError(`text must be at most ${MAX_TEXT_LENGTH} characters`)
      return {
        action: 'typeText',
        text: payload.text,
      }
    }
    case 'hotkey': {
      if (!Array.isArray(payload.keys) || payload.keys.length < 1 || payload.keys.length > 4)
        throw new TypeError('keys must contain 1 to 4 entries')
      const keys = payload.keys.map(normalizeHotkeyPart)
      assertHotkeyNotDangerous(keys)
      return {
        action: 'hotkey',
        keys,
      }
    }
    case 'focusWindow': {
      if (typeof payload.titleIncludes !== 'string' || !payload.titleIncludes.trim())
        throw new TypeError('titleIncludes must be a non-empty string')
      const titleIncludes = payload.titleIncludes.trim()
      if (titleIncludes.length > MAX_TITLE_INCLUDES_LENGTH)
        throw new TypeError(`titleIncludes must be at most ${MAX_TITLE_INCLUDES_LENGTH} characters`)
      return {
        action: 'focusWindow',
        titleIncludes,
      }
    }
    case 'clipboardWrite': {
      if (typeof payload.text !== 'string')
        throw new TypeError('text must be a string')
      if (payload.text.length > MAX_CLIPBOARD_LENGTH)
        throw new TypeError(`clipboard text must be at most ${MAX_CLIPBOARD_LENGTH} characters`)
      return {
        action: 'clipboardWrite',
        text: payload.text,
      }
    }
    case 'clipboardRead':
      return { action: 'clipboardRead' }
    default:
      throw new TypeError(`Unsupported desktop action: ${(payload as { action?: unknown }).action ?? '<missing>'}`)
  }
}

export {
  MAX_CLICK_COUNT,
  MAX_CLIPBOARD_LENGTH,
  MAX_DRAG_DURATION_MS,
  MAX_SCROLL_DELTA,
  MAX_TEXT_LENGTH,
  MAX_TITLE_INCLUDES_LENGTH,
}
