import type { createContext } from '@moeru/eventa/adapters/electron/main'
import type {
  DesktopControl,
  DesktopControlAction,
  DesktopControlPolicyUpdate,
} from '@proj-airi/desktop-control'

import { useLogg } from '@guiiai/logg'
import { defineInvokeHandler } from '@moeru/eventa'
import { createDesktopControl } from '@proj-airi/desktop-control'
import { BrowserWindow, dialog, globalShortcut, screen } from 'electron'

import {
  electronDesktopClearEmergencyStop,
  electronDesktopEmergencyStop,
  electronDesktopGetPolicy,
  electronDesktopGetSnapshot,
  electronDesktopRunAction,
  electronDesktopSetPolicy,
} from '../../../shared/eventa'
import { createDesktopControlConfig } from '../../configs/desktop-control'
import { onAppBeforeQuit } from '../../libs/bootkit/lifecycle'

type EventaMainContext = ReturnType<typeof createContext>['context']

const log = useLogg('desktop-control').useGlobalConfig()

// NOTICE:
// Do not use Ctrl+Shift+Esc — Windows reserves it for Task Manager, so
// globalShortcut.register returns false every time.
// Prefer an F-key chord that apps can own on Windows/macOS.
/** Emergency kill-switch accelerator (global). */
const EMERGENCY_STOP_ACCELERATOR = 'CommandOrControl+Shift+F12'

let controlPromise: Promise<DesktopControl> | undefined
let emergencyShortcutRegistered = false

function loadPersistedPolicy() {
  const config = createDesktopControlConfig()
  const value = config.get()
  return {
    enabled: value?.enabled ?? false,
    requireUserConfirmation: value?.requireUserConfirmation ?? true,
    maxListedWindows: value?.maxListedWindows ?? 12,
  }
}

function persistPolicy(update: DesktopControlPolicyUpdate) {
  const config = createDesktopControlConfig()
  const current = config.get() ?? {
    enabled: false,
    requireUserConfirmation: true,
    maxListedWindows: 12,
  }
  config.update({
    enabled: update.enabled ?? current.enabled,
    requireUserConfirmation: update.requireUserConfirmation ?? current.requireUserConfirmation,
    maxListedWindows: update.maxListedWindows ?? current.maxListedWindows,
  })
}

async function confirmWithDialog(_action: DesktopControlAction, label: string): Promise<boolean> {
  const options = {
    type: 'warning' as const,
    title: 'Desktop control',
    message: 'Allow AIRI to control the desktop?',
    detail: [
      `Action: ${label}`,
      '',
      'Only allow if you trust this action.',
      `Emergency stop: ${EMERGENCY_STOP_ACCELERATOR}`,
    ].join('\n'),
    buttons: ['Deny', 'Allow'],
    defaultId: 0,
    cancelId: 0,
    noLink: true,
  }

  const focused = BrowserWindow.getFocusedWindow()
  const result = focused
    ? await dialog.showMessageBox(focused, options)
    : await dialog.showMessageBox(options)

  return result.response === 1
}

function getDesktopControl(): Promise<DesktopControl> {
  if (!controlPromise) {
    const persisted = loadPersistedPolicy()
    controlPromise = createDesktopControl({
      getElectronScreen: () => screen,
      policy: {
        enabled: persisted.enabled,
        requireUserConfirmation: persisted.requireUserConfirmation,
        maxListedWindows: persisted.maxListedWindows,
        killSwitched: false,
      },
      confirmAction: confirmWithDialog,
      onAudit: (entry) => {
        log.withFields({
          action: entry.action,
          outcome: entry.outcome,
          summary: entry.summary,
          detail: entry.detail,
        }).log('desktop-control audit')
      },
    })
  }
  return controlPromise
}

function registerEmergencyStopShortcut(control: DesktopControl) {
  if (emergencyShortcutRegistered)
    return

  try {
    const ok = globalShortcut.register(EMERGENCY_STOP_ACCELERATOR, () => {
      const policy = control.emergencyStop()
      log.withFields({ policy }).warn('Desktop control emergency stop armed')
      for (const window of BrowserWindow.getAllWindows()) {
        dialog.showMessageBox(window, {
          type: 'warning',
          title: 'Desktop control stopped',
          message: 'Desktop control emergency stop is active.',
          detail: 'Input injection is disabled until you clear the emergency stop and re-enable desktop control.',
          buttons: ['OK'],
        }).catch(() => {})
      }
    })
    emergencyShortcutRegistered = ok
    if (!ok)
      log.warn(`Failed to register emergency stop shortcut ${EMERGENCY_STOP_ACCELERATOR}`)
  }
  catch (error) {
    log.withError(error).warn('Failed to register desktop-control emergency stop shortcut')
  }
}

/**
 * Registers Eventa handlers for desktop snapshot, policy, and input control.
 *
 * Security model:
 * - Fail-closed (`enabled` defaults false, persisted)
 * - Mutating actions require optional OS confirmation dialog
 * - Global emergency stop shortcut kill-switches injection
 */
export function createDesktopControlService(params: { context: EventaMainContext }) {
  defineInvokeHandler(params.context, electronDesktopGetSnapshot, async () => {
    const control = await getDesktopControl()
    registerEmergencyStopShortcut(control)
    return await control.getSnapshot()
  })

  defineInvokeHandler(params.context, electronDesktopRunAction, async (payload) => {
    const control = await getDesktopControl()
    registerEmergencyStopShortcut(control)
    return await control.runAction(payload)
  })

  defineInvokeHandler(params.context, electronDesktopGetPolicy, async () => {
    const control = await getDesktopControl()
    return control.getPolicy()
  })

  defineInvokeHandler(params.context, electronDesktopSetPolicy, async (update) => {
    const control = await getDesktopControl()
    // Only forward defined keys so partial updates do not wipe other fields
    // (e.g. toggling `enabled` must not clear `requireUserConfirmation`).
    const patch: DesktopControlPolicyUpdate = {}
    if (update.enabled !== undefined)
      patch.enabled = update.enabled
    if (update.requireUserConfirmation !== undefined)
      patch.requireUserConfirmation = update.requireUserConfirmation
    if (update.maxListedWindows !== undefined)
      patch.maxListedWindows = update.maxListedWindows

    const next = control.setPolicy(patch)
    persistPolicy({
      enabled: next.enabled,
      requireUserConfirmation: next.requireUserConfirmation,
      maxListedWindows: next.maxListedWindows,
    })
    registerEmergencyStopShortcut(control)
    return next
  })

  defineInvokeHandler(params.context, electronDesktopEmergencyStop, async () => {
    const control = await getDesktopControl()
    const next = control.emergencyStop()
    persistPolicy({ enabled: false })
    return next
  })

  defineInvokeHandler(params.context, electronDesktopClearEmergencyStop, async () => {
    const control = await getDesktopControl()
    return control.clearEmergencyStop()
  })

  onAppBeforeQuit(() => {
    if (emergencyShortcutRegistered) {
      try {
        globalShortcut.unregister(EMERGENCY_STOP_ACCELERATOR)
      }
      catch {
        // ignore
      }
      emergencyShortcutRegistered = false
    }
  })
}
