import type {
  DesktopControlAction,
  DesktopControlResult,
  DesktopControlSnapshot,
  DesktopMouseButton,
  DesktopPoint,
  DesktopWindowInfo,
  ElectronScreenLike,
} from './types'

import process from 'node:process'

import { errorMessageFrom } from '@moeru/std'
import {
  Button,
  clipboard,
  getActiveWindow,
  getWindows,
  keyboard,
  mouse,
  Point,
  straightTo,
} from '@nut-tree-fork/nut-js'

import { mapHotkeyPartToNutKey } from './hotkeys'
import { normalizeDesktopControlAction } from './normalize'

const MOUSE_AUTO_DELAY_MS = 8
const KEYBOARD_AUTO_DELAY_MS = 12

function scrollStepsFromDelta(delta: number): number {
  if (delta === 0)
    return 0
  return Math.max(1, Math.min(50, Math.round(Math.abs(delta) / 120) || 1))
}

function toButton(button: DesktopMouseButton): Button {
  switch (button) {
    case 'left':
      return Button.LEFT
    case 'middle':
      return Button.MIDDLE
    case 'right':
      return Button.RIGHT
    default:
      return Button.LEFT
  }
}

function point(x: number, y: number): Point {
  return new Point(Math.round(x), Math.round(y))
}

async function readCursor(): Promise<DesktopPoint> {
  const position = await mouse.getPosition()
  return { x: position.x, y: position.y }
}

async function describeWindow(windowLike: {
  getTitle: () => Promise<string>
  getRegion: () => Promise<{ left: number, top: number, width: number, height: number }>
}): Promise<DesktopWindowInfo> {
  const [title, region] = await Promise.all([
    windowLike.getTitle(),
    windowLike.getRegion(),
  ])

  return {
    title,
    region: {
      x: region.left,
      y: region.top,
      width: region.width,
      height: region.height,
    },
  }
}

/**
 * Lists top-level windows (bounded) for agent routing.
 */
export async function listDesktopWindows(max: number): Promise<DesktopWindowInfo[]> {
  try {
    const windows = await getWindows()
    const limited = windows.slice(0, Math.max(1, max))
    const infos: DesktopWindowInfo[] = []
    for (const window of limited) {
      try {
        infos.push(await describeWindow(window))
      }
      catch {
        // Skip windows that fail title/region queries.
      }
    }
    return infos
  }
  catch {
    return []
  }
}

export async function readActiveWindow(): Promise<DesktopWindowInfo | undefined> {
  try {
    return await describeWindow(await getActiveWindow())
  }
  catch {
    return undefined
  }
}

async function focusWindowByTitleIncludes(titleIncludes: string): Promise<DesktopWindowInfo> {
  const needle = titleIncludes.trim().toLowerCase()
  const windows = await getWindows()
  for (const window of windows) {
    let title = ''
    try {
      title = await window.getTitle()
    }
    catch {
      continue
    }
    if (!title.toLowerCase().includes(needle))
      continue

    const focused = await window.focus()
    if (!focused)
      throw new Error(`Failed to focus window matching "${titleIncludes}".`)

    return await describeWindow(window)
  }

  throw new Error(`No window title includes "${titleIncludes}".`)
}

async function executeAction(action: DesktopControlAction): Promise<Partial<DesktopControlResult>> {
  mouse.config.autoDelayMs = MOUSE_AUTO_DELAY_MS
  keyboard.config.autoDelayMs = KEYBOARD_AUTO_DELAY_MS

  switch (action.action) {
    case 'move': {
      await mouse.setPosition(point(action.x, action.y))
      return {}
    }
    case 'click': {
      await mouse.setPosition(point(action.x, action.y))
      const button = toButton(action.button)
      for (let index = 0; index < action.clickCount; index += 1)
        await mouse.click(button)
      return {}
    }
    case 'drag': {
      const button = toButton(action.button)
      await mouse.setPosition(point(action.fromX, action.fromY))
      if (action.durationMs > 0) {
        const distance = Math.hypot(action.toX - action.fromX, action.toY - action.fromY)
        mouse.config.mouseSpeed = Math.max(100, Math.round((distance / action.durationMs) * 1000))
      }
      await mouse.pressButton(button)
      try {
        await mouse.move(straightTo(point(action.toX, action.toY)))
      }
      finally {
        await mouse.releaseButton(button)
      }
      return {}
    }
    case 'scroll': {
      await mouse.setPosition(point(action.x, action.y))
      const vertical = scrollStepsFromDelta(action.deltaY)
      if (action.deltaY > 0)
        await mouse.scrollDown(vertical)
      else if (action.deltaY < 0)
        await mouse.scrollUp(vertical)

      const horizontal = scrollStepsFromDelta(action.deltaX)
      if (action.deltaX > 0)
        await mouse.scrollRight(horizontal)
      else if (action.deltaX < 0)
        await mouse.scrollLeft(horizontal)
      return {}
    }
    case 'typeText': {
      await keyboard.type(action.text)
      return {}
    }
    case 'hotkey': {
      const keys = action.keys.map(mapHotkeyPartToNutKey)
      await keyboard.pressKey(...keys)
      await keyboard.releaseKey(...keys)
      return {}
    }
    case 'focusWindow': {
      const window = await focusWindowByTitleIncludes(action.titleIncludes)
      return { window }
    }
    case 'clipboardWrite': {
      await clipboard.setContent(action.text)
      return {}
    }
    case 'clipboardRead': {
      const clipboardText = await clipboard.getContent()
      return { clipboardText }
    }
    default: {
      const neverAction: never = action
      throw new TypeError(`Unsupported action: ${(neverAction as { action?: string }).action}`)
    }
  }
}

export async function createNutSnapshot(
  getElectronScreen: (() => ElectronScreenLike | undefined) | undefined,
  options: {
    maxListedWindows: number
    includeWindows: boolean
  },
): Promise<Omit<DesktopControlSnapshot, 'policy'>> {
  const electronScreen = getElectronScreen?.()
  const base = electronScreen
    ? {
        platform: process.platform,
        cursor: (() => {
          const cursor = electronScreen.getCursorScreenPoint()
          return { x: cursor.x, y: cursor.y }
        })(),
        displays: electronScreen.getAllDisplays().map(display => ({
          id: display.id,
          scaleFactor: display.scaleFactor,
          bounds: { ...display.bounds },
          workArea: { ...display.workArea },
        })),
      }
    : {
        platform: process.platform,
        cursor: await readCursor(),
        displays: [],
      }

  const [activeWindow, windows] = await Promise.all([
    readActiveWindow(),
    options.includeWindows ? listDesktopWindows(options.maxListedWindows) : Promise.resolve(undefined),
  ])

  return {
    ...base,
    ...(activeWindow ? { activeWindow } : {}),
    ...(windows ? { windows } : {}),
  }
}

/**
 * Runs a normalized desktop action via nut.js (no policy checks).
 */
export async function runNutAction(payload: DesktopControlAction): Promise<DesktopControlResult> {
  const action = normalizeDesktopControlAction(payload)

  try {
    const extras = await executeAction(action)
    const cursor = await readCursor()
    return {
      action: action.action,
      cursor,
      message: `Desktop action completed: ${action.action}`,
      ...extras,
    }
  }
  catch (error) {
    const message = errorMessageFrom(error) ?? 'Desktop action failed'
    if (process.platform === 'darwin' && /not authorized|accessibility|permission/i.test(message)) {
      throw new Error(
        `${message}. On macOS, grant Accessibility permission to AIRI (System Settings → Privacy & Security → Accessibility).`,
      )
    }
    throw error instanceof Error ? error : new Error(message)
  }
}
