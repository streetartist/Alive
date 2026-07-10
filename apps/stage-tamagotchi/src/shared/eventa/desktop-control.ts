import type {
  DesktopControlAction,
  DesktopControlPolicy,
  DesktopControlPolicyUpdate,
  DesktopControlResult,
  DesktopControlSnapshot,
} from '@proj-airi/desktop-control'

import { defineInvokeEventa } from '@moeru/eventa'

export type {
  DesktopControlAction as ElectronDesktopControlAction,
  DesktopControlPolicy as ElectronDesktopControlPolicy,
  DesktopControlPolicyUpdate as ElectronDesktopControlPolicyUpdate,
  DesktopControlResult as ElectronDesktopControlResult,
  DesktopControlSnapshot as ElectronDesktopSnapshot,
}

/** @deprecated Prefer ElectronDesktopControlAction from package types. Kept for older imports. */
export type DesktopControlMouseButton = 'left' | 'middle' | 'right'

export const electronDesktopGetSnapshot = defineInvokeEventa<DesktopControlSnapshot>('eventa:invoke:electron:desktop-control:get-snapshot')
export const electronDesktopRunAction = defineInvokeEventa<DesktopControlResult, DesktopControlAction>('eventa:invoke:electron:desktop-control:run-action')
export const electronDesktopGetPolicy = defineInvokeEventa<DesktopControlPolicy>('eventa:invoke:electron:desktop-control:get-policy')
export const electronDesktopSetPolicy = defineInvokeEventa<DesktopControlPolicy, DesktopControlPolicyUpdate>('eventa:invoke:electron:desktop-control:set-policy')
export const electronDesktopEmergencyStop = defineInvokeEventa<DesktopControlPolicy>('eventa:invoke:electron:desktop-control:emergency-stop')
export const electronDesktopClearEmergencyStop = defineInvokeEventa<DesktopControlPolicy>('eventa:invoke:electron:desktop-control:clear-emergency-stop')
