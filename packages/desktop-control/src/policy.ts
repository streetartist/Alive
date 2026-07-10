import type {
  DesktopControlAction,
  DesktopControlAuditEntry,
  DesktopControlPolicy,
  DesktopControlPolicyUpdate,
} from './types'

export const DEFAULT_DESKTOP_CONTROL_POLICY: DesktopControlPolicy = {
  enabled: false,
  requireUserConfirmation: true,
  killSwitched: false,
  maxListedWindows: 12,
}

/** Hotkey chords that must never be injected without an explicit allow-list expansion. */
const DANGEROUS_HOTKEY_SETS: string[][] = [
  ['alt', 'f4'],
  ['ctrl', 'alt', 'delete'],
  ['ctrl', 'shift', 'escape'],
  ['win', 'l'],
  ['meta', 'l'],
  ['cmd', 'q'],
  ['command', 'q'],
  ['alt', 'space'],
]

/**
 * Merges policy updates onto defaults / current state.
 *
 * Only defined fields in `update` are applied. Spreading `{ enabled: true }`
 * must not clobber `requireUserConfirmation` with `undefined`.
 */
export function resolveDesktopControlPolicy(
  base: DesktopControlPolicy,
  update?: DesktopControlPolicyUpdate,
): DesktopControlPolicy {
  const next: DesktopControlPolicy = { ...base }

  if (!update)
    return next

  if (update.enabled !== undefined)
    next.enabled = update.enabled
  if (update.requireUserConfirmation !== undefined)
    next.requireUserConfirmation = update.requireUserConfirmation
  if (update.maxListedWindows !== undefined) {
    next.maxListedWindows = Math.max(1, Math.min(50, Math.floor(update.maxListedWindows)))
  }

  return next
}

/**
 * Returns whether an action mutates desktop/input state.
 * Observation helpers (clipboardRead) are non-mutating for policy confirmation.
 */
export function isMutatingDesktopAction(action: DesktopControlAction): boolean {
  return action.action !== 'clipboardRead'
}

/**
 * Blocks known-dangerous hotkey chords.
 */
export function assertHotkeyNotDangerous(keys: string[]) {
  const normalized = keys.map(key => key.trim().toLowerCase())
  for (const banned of DANGEROUS_HOTKEY_SETS) {
    if (banned.length === normalized.length && banned.every((part, index) => part === normalized[index])) {
      throw new Error(`Hotkey "${keys.join('+')}" is blocked by desktop-control policy.`)
    }
  }
}

/**
 * Builds a short audit summary; truncates long typed text.
 */
export function summarizeDesktopAction(action: DesktopControlAction): string {
  switch (action.action) {
    case 'move':
      return `move(${Math.round(action.x)},${Math.round(action.y)})`
    case 'click':
      return `click ${action.button}x${action.clickCount} @(${Math.round(action.x)},${Math.round(action.y)})`
    case 'drag':
      return `drag (${Math.round(action.fromX)},${Math.round(action.fromY)})->(${Math.round(action.toX)},${Math.round(action.toY)})`
    case 'scroll':
      return `scroll @(${Math.round(action.x)},${Math.round(action.y)}) d=(${action.deltaX},${action.deltaY})`
    case 'typeText': {
      const text = action.text.length > 48 ? `${action.text.slice(0, 48)}…` : action.text
      return `typeText(${JSON.stringify(text)})`
    }
    case 'hotkey':
      return `hotkey(${action.keys.join('+')})`
    case 'focusWindow':
      return `focusWindow(titleIncludes=${JSON.stringify(action.titleIncludes)})`
    case 'clipboardWrite': {
      const text = action.text.length > 48 ? `${action.text.slice(0, 48)}…` : action.text
      return `clipboardWrite(${JSON.stringify(text)})`
    }
    case 'clipboardRead':
      return 'clipboardRead'
    default:
      return 'unknown'
  }
}

export function createAuditEntry(
  action: DesktopControlAction,
  outcome: DesktopControlAuditEntry['outcome'],
  detail?: string,
): DesktopControlAuditEntry {
  return {
    at: Date.now(),
    action: action.action,
    summary: summarizeDesktopAction(action),
    outcome,
    detail,
  }
}

/**
 * Human label for confirmation dialogs.
 */
export function labelDesktopAction(action: DesktopControlAction): string {
  return summarizeDesktopAction(action)
}
