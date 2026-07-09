import type { BrowserWindow } from 'electron'

type StageAlwaysOnTopLevel = Parameters<BrowserWindow['setAlwaysOnTop']>[1]
type StageAlwaysOnTopLifecycleEvent = 'focus' | 'restore' | 'show'

interface StageAlwaysOnTopWindow {
  moveTop: () => void
  setAlwaysOnTop: (flag: boolean, level?: StageAlwaysOnTopLevel, relativeLevel?: number) => void
}

interface StageAlwaysOnTopManagedWindow extends StageAlwaysOnTopWindow {
  off: (event: StageAlwaysOnTopLifecycleEvent, listener: () => void) => void
  on: (event: StageAlwaysOnTopLifecycleEvent, listener: () => void) => void
}

const stageAlwaysOnTopLevel = 'screen-saver'
const stageAlwaysOnTopRelativeLevel = 1

/**
 * Re-applies the stage window's topmost layer.
 *
 * Screen recorders can briefly promote their own capture or control windows
 * above Electron's `alwaysOnTop` window. Repeating the same layer request and
 * moving the window to the top restores AIRI without changing focus policy.
 */
export function applyStageAlwaysOnTop(window: StageAlwaysOnTopWindow): void {
  window.setAlwaysOnTop(true, stageAlwaysOnTopLevel, stageAlwaysOnTopRelativeLevel)
  window.moveTop()
}

/**
 * Owns the main stage window topmost lifecycle.
 *
 * `setAlwaysOnTop(true)` is not a permanent Z-order guarantee on Windows when
 * other tools, such as screen recorders, temporarily manipulate topmost state.
 * The controller keeps the user's setting as the source of truth and reasserts
 * the Electron layer while the setting is enabled.
 */
export function createStageAlwaysOnTopController(
  window: StageAlwaysOnTopManagedWindow,
  options: {
    reassertDelayMs?: number
    reassertIntervalMs?: number
  } = {},
) {
  const reassertDelayMs = options.reassertDelayMs ?? 250
  const reassertIntervalMs = options.reassertIntervalMs ?? 2000
  let enabled = false
  let delayedReassertTimer: ReturnType<typeof setTimeout> | undefined
  let intervalReassertTimer: ReturnType<typeof setInterval> | undefined

  function clearDelayedReassert() {
    if (!delayedReassertTimer)
      return

    clearTimeout(delayedReassertTimer)
    delayedReassertTimer = undefined
  }

  function clearIntervalReassert() {
    if (!intervalReassertTimer)
      return

    clearInterval(intervalReassertTimer)
    intervalReassertTimer = undefined
  }

  function reassert() {
    if (!enabled)
      return

    applyStageAlwaysOnTop(window)
  }

  function scheduleReassert() {
    if (!enabled)
      return

    clearDelayedReassert()
    delayedReassertTimer = setTimeout(() => {
      delayedReassertTimer = undefined
      reassert()
    }, reassertDelayMs)
  }

  function setEnabled(nextEnabled: boolean) {
    enabled = nextEnabled
    clearDelayedReassert()

    if (!nextEnabled) {
      clearIntervalReassert()
      window.setAlwaysOnTop(false)
      return
    }

    reassert()

    if (!intervalReassertTimer) {
      intervalReassertTimer = setInterval(reassert, reassertIntervalMs)
    }
  }

  const lifecycleEvents = ['show', 'restore', 'focus'] as const
  lifecycleEvents.forEach(event => window.on(event, scheduleReassert))

  function dispose() {
    enabled = false
    clearDelayedReassert()
    clearIntervalReassert()
    lifecycleEvents.forEach(event => window.off(event, scheduleReassert))
  }

  return {
    dispose,
    reassert,
    setEnabled,
  }
}
