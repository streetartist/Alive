/**
 * Cross-platform desktop control contracts used by AIRI main-process services.
 */

export type DesktopMouseButton = 'left' | 'middle' | 'right'

export interface DesktopPoint {
  x: number
  y: number
}

export interface DesktopRectangle {
  x: number
  y: number
  width: number
  height: number
}

export interface DesktopDisplaySnapshot {
  id: number
  scaleFactor: number
  bounds: DesktopRectangle
  workArea: DesktopRectangle
}

export interface DesktopWindowInfo {
  /** Window title as reported by the OS. */
  title: string
  /** Global desktop bounds of the window. */
  region: DesktopRectangle
}

export interface DesktopControlSnapshot {
  platform: NodeJS.Platform
  cursor: DesktopPoint
  displays: DesktopDisplaySnapshot[]
  /** Foreground window when available. */
  activeWindow?: DesktopWindowInfo
  /** Top windows (bounded list) for agent routing. */
  windows?: DesktopWindowInfo[]
  /** Current control policy snapshot. */
  policy: DesktopControlPolicy
}

export type DesktopControlAction
  = | {
    action: 'move'
    x: number
    y: number
  }
  | {
    action: 'click'
    x: number
    y: number
    button: DesktopMouseButton
    clickCount: number
  }
  | {
    action: 'drag'
    fromX: number
    fromY: number
    toX: number
    toY: number
    button: DesktopMouseButton
    durationMs: number
  }
  | {
    action: 'scroll'
    x: number
    y: number
    deltaX: number
    deltaY: number
  }
  | {
    action: 'typeText'
    text: string
  }
  | {
    action: 'hotkey'
    keys: string[]
  }
  | {
    action: 'focusWindow'
    /** Case-insensitive substring match against window titles. */
    titleIncludes: string
  }
  | {
    action: 'clipboardWrite'
    text: string
  }
  | {
    action: 'clipboardRead'
  }

export interface DesktopControlResult {
  action: DesktopControlAction['action']
  cursor: DesktopPoint
  message: string
  clipboardText?: string
  window?: DesktopWindowInfo
}

/**
 * Runtime policy for desktop injection.
 *
 * Defaults are fail-closed: disabled until the user enables control.
 */
export interface DesktopControlPolicy {
  /** Master switch. When false, mutating actions are rejected. @default false */
  enabled: boolean
  /**
   * When true, mutating actions call `confirmAction` before injection.
   * @default true
   */
  requireUserConfirmation: boolean
  /**
   * Emergency kill switch. When true, all mutating actions fail until cleared.
   * @default false
   */
  killSwitched: boolean
  /**
   * Max windows listed in snapshots.
   * @default 12
   */
  maxListedWindows: number
}

export type DesktopControlPolicyUpdate = Partial<Pick<
  DesktopControlPolicy,
  'enabled' | 'requireUserConfirmation' | 'maxListedWindows'
>>

export interface DesktopControlAuditEntry {
  at: number
  action: DesktopControlAction['action']
  /** Short human label, never full password-length secrets beyond truncation. */
  summary: string
  outcome: 'allowed' | 'denied' | 'failed' | 'confirmed' | 'rejected-by-user' | 'kill-switched' | 'disabled'
  detail?: string
}

/**
 * Display/source rectangle in the same global desktop coordinate space as
 * mouse injection (physical pixels).
 */
export interface FrameToGlobalMappingInput {
  /** X in the captured frame image. */
  frameX: number
  /** Y in the captured frame image. */
  frameY: number
  /** Captured frame width in pixels. */
  frameWidth: number
  /** Captured frame height in pixels. */
  frameHeight: number
  /**
   * Desktop region corresponding to the full capture source.
   * For a full-screen source, use the matching display `bounds`.
   */
  sourceBounds: DesktopRectangle
}

export interface DesktopControl {
  getSnapshot: () => Promise<DesktopControlSnapshot>
  runAction: (action: DesktopControlAction) => Promise<DesktopControlResult>
  getPolicy: () => DesktopControlPolicy
  setPolicy: (update: DesktopControlPolicyUpdate) => DesktopControlPolicy
  /** Arms kill switch — all mutating actions fail until {@link clearEmergencyStop}. */
  emergencyStop: () => DesktopControlPolicy
  clearEmergencyStop: () => DesktopControlPolicy
}

export interface CreateDesktopControlOptions {
  getElectronScreen?: () => ElectronScreenLike | undefined
  /**
   * Initial policy. Defaults are fail-closed (`enabled: false`).
   */
  policy?: Partial<DesktopControlPolicy>
  /**
   * Host-provided confirmation (e.g. Electron dialog).
   * Required when `requireUserConfirmation` is true for mutating actions.
   */
  confirmAction?: (action: DesktopControlAction, label: string) => Promise<boolean>
  /** Optional audit sink for allow/deny/execute outcomes. */
  onAudit?: (entry: DesktopControlAuditEntry) => void
}

/** Minimal Electron `screen` surface used for snapshot. */
export interface ElectronScreenLike {
  getCursorScreenPoint: () => DesktopPoint
  getAllDisplays: () => Array<{
    id: number
    scaleFactor: number
    bounds: DesktopRectangle
    workArea: DesktopRectangle
  }>
}
