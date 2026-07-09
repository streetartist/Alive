import { defineInvokeEventa } from '@moeru/eventa'

export type DesktopControlMouseButton = 'left' | 'middle' | 'right'

export interface DesktopControlPoint {
  x: number
  y: number
}

export interface DesktopControlRectangle {
  x: number
  y: number
  width: number
  height: number
}

export interface DesktopControlDisplaySnapshot {
  id: number
  scaleFactor: number
  bounds: DesktopControlRectangle
  workArea: DesktopControlRectangle
}

export interface ElectronDesktopSnapshot {
  platform: NodeJS.Platform
  cursor: DesktopControlPoint
  displays: DesktopControlDisplaySnapshot[]
}

export type ElectronDesktopControlAction
  = | {
    action: 'move'
    x: number
    y: number
  }
  | {
    action: 'click'
    x: number
    y: number
    button: DesktopControlMouseButton
    clickCount: number
  }
  | {
    action: 'drag'
    fromX: number
    fromY: number
    toX: number
    toY: number
    button: DesktopControlMouseButton
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

export interface ElectronDesktopControlResult {
  action: ElectronDesktopControlAction['action']
  cursor: DesktopControlPoint
  message: string
}

export const electronDesktopGetSnapshot = defineInvokeEventa<ElectronDesktopSnapshot>('eventa:invoke:electron:desktop-control:get-snapshot')
export const electronDesktopRunAction = defineInvokeEventa<ElectronDesktopControlResult, ElectronDesktopControlAction>('eventa:invoke:electron:desktop-control:run-action')
