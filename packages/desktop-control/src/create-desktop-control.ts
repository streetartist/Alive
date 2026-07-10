import type {
  CreateDesktopControlOptions,
  DesktopControl,
  DesktopControlAction,
  DesktopControlPolicy,
  DesktopControlPolicyUpdate,
  DesktopControlResult,
} from './types'

import {
  createAuditEntry,
  DEFAULT_DESKTOP_CONTROL_POLICY,
  isMutatingDesktopAction,
  labelDesktopAction,
  resolveDesktopControlPolicy,
} from './policy'
import { createNutSnapshot, runNutAction } from './nut-driver'
import { normalizeDesktopControlAction } from './normalize'

/**
 * Creates a cross-platform desktop control controller backed by nut.js.
 *
 * Call stack:
 *
 * createDesktopControl
 *   -> policy gate (enabled / kill switch / confirm)
 *     -> {@link runNutAction}
 *       -> @nut-tree-fork/nut-js mouse/keyboard/window/clipboard
 */
export async function createDesktopControl(options: CreateDesktopControlOptions = {}): Promise<DesktopControl> {
  let policy: DesktopControlPolicy = resolveDesktopControlPolicy(
    DEFAULT_DESKTOP_CONTROL_POLICY,
    options.policy,
  )

  const audit = (action: DesktopControlAction, outcome: Parameters<typeof createAuditEntry>[1], detail?: string) => {
    options.onAudit?.(createAuditEntry(action, outcome, detail))
  }

  // Touch native path early so import failures surface at create time.
  await createNutSnapshot(options.getElectronScreen, {
    maxListedWindows: policy.maxListedWindows,
    includeWindows: false,
  })

  async function runAction(payload: DesktopControlAction): Promise<DesktopControlResult> {
    const action = normalizeDesktopControlAction(payload)

    if (policy.killSwitched) {
      audit(action, 'kill-switched')
      throw new Error('Desktop control is kill-switched. Clear emergency stop before injecting input.')
    }

    if (isMutatingDesktopAction(action) && !policy.enabled) {
      audit(action, 'disabled')
      throw new Error('Desktop control is disabled. Enable it in settings before injecting input.')
    }

    if (isMutatingDesktopAction(action) && policy.requireUserConfirmation) {
      if (!options.confirmAction) {
        audit(action, 'denied', 'confirmAction handler missing')
        throw new Error('Desktop control requires user confirmation but no confirmAction handler is configured.')
      }

      const label = labelDesktopAction(action)
      const allowed = await options.confirmAction(action, label)
      if (!allowed) {
        audit(action, 'rejected-by-user', label)
        throw new Error(`User rejected desktop action: ${label}`)
      }
      audit(action, 'confirmed', label)
    }

    try {
      const result = await runNutAction(action)
      audit(action, 'allowed')
      return result
    }
    catch (error) {
      audit(action, 'failed', error instanceof Error ? error.message : String(error))
      throw error
    }
  }

  return {
    getSnapshot: async () => {
      const snapshot = await createNutSnapshot(options.getElectronScreen, {
        maxListedWindows: policy.maxListedWindows,
        includeWindows: true,
      })
      return {
        ...snapshot,
        policy: { ...policy },
      }
    },
    runAction,
    getPolicy: () => ({ ...policy }),
    setPolicy: (update: DesktopControlPolicyUpdate) => {
      policy = resolveDesktopControlPolicy(policy, update)
      return { ...policy }
    },
    emergencyStop: () => {
      policy = { ...policy, killSwitched: true, enabled: false }
      return { ...policy }
    },
    clearEmergencyStop: () => {
      policy = { ...policy, killSwitched: false }
      return { ...policy }
    },
  }
}
