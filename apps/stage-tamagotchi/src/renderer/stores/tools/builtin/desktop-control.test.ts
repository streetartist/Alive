import type { DesktopControlInvokers } from './desktop-control'

import { describe, expect, it, vi } from 'vitest'

import { installStrictToolSchemaMatchers } from '../testing/strict-tool-schema'
import { desktopControlTools } from './desktop-control'

installStrictToolSchemaMatchers()

function makeInvokers(overrides?: Partial<DesktopControlInvokers>): DesktopControlInvokers {
  return {
    getSnapshot: vi.fn(async () => ({
      platform: 'win32' as const,
      cursor: { x: 10, y: 20 },
      displays: [{
        id: 1,
        scaleFactor: 1,
        bounds: { x: 0, y: 0, width: 1920, height: 1080 },
        workArea: { x: 0, y: 0, width: 1920, height: 1040 },
      }],
      policy: {
        enabled: true,
        requireUserConfirmation: true,
        killSwitched: false,
        maxListedWindows: 12,
      },
    })),
    runAction: vi.fn(async payload => ({
      action: payload.action,
      cursor: { x: 100, y: 200 },
      message: `Desktop action completed: ${payload.action}`,
    })),
    getPolicy: vi.fn(async () => ({
      enabled: true,
      requireUserConfirmation: true,
      killSwitched: false,
      maxListedWindows: 12,
    })),
    ...overrides,
  }
}

async function getTool(name: string, deps: Parameters<typeof desktopControlTools>[0] = {}) {
  const tools = await desktopControlTools(deps)
  const tool = tools.find(candidate => candidate.function.name === name)
  if (!tool)
    throw new Error(`Tool not found: ${name}`)
  return tool
}

describe('desktop control tools', () => {
  it('exposes provider-safe strict schemas without soft confirmation fields', async () => {
    const tools = await desktopControlTools({
      observeScreen: async () => 'ok',
      invokers: makeInvokers(),
      sleep: async () => {},
    })

    expect(tools.map(tool => tool.function.name)).toEqual([
      'screen_sources',
      'screen_observe',
      'desktop_move',
      'desktop_click',
      'desktop_drag',
      'desktop_scroll',
      'desktop_type_text',
      'desktop_hotkey',
      'desktop_focus_window',
      'desktop_clipboard_write',
      'desktop_clipboard_read',
      'desktop_wait',
    ])
    expect(tools).toSatisfyStrictToolSchemas()

    const click = tools.find(tool => tool.function.name === 'desktop_click')!
    const parameters = click.function.parameters as { properties?: Record<string, unknown> }
    expect(parameters.properties).not.toHaveProperty('confirmed')
    expect(parameters.properties).not.toHaveProperty('confirmationCode')
  })

  it('refuses mutating actions when desktop control is disabled', async () => {
    const invokers = makeInvokers({
      getPolicy: vi.fn(async () => ({
        enabled: false,
        requireUserConfirmation: true,
        killSwitched: false,
        maxListedWindows: 12,
      })),
    })
    const tool = await getTool('desktop_click', { invokers })

    const result = await tool.execute({
      x: 300,
      y: 400,
      button: 'left',
      clickCount: 1,
    }, { toolCallId: 'call-1', messages: [] })

    expect(result).toContain('disabled')
    expect(invokers.runAction).not.toHaveBeenCalled()
  })

  it('executes a click through the Electron invoker when enabled', async () => {
    const invokers = makeInvokers()
    const tool = await getTool('desktop_click', { invokers })

    const result = await tool.execute({
      x: 300,
      y: 400,
      button: 'left',
      clickCount: 2,
    }, { toolCallId: 'call-1', messages: [] })

    expect(result).toContain('Desktop action completed: click')
    expect(invokers.runAction).toHaveBeenCalledWith({
      action: 'click',
      x: 300,
      y: 400,
      button: 'left',
      clickCount: 2,
    })
  })

  it('focuses windows by title substring', async () => {
    const invokers = makeInvokers({
      runAction: vi.fn(async payload => ({
        action: payload.action,
        cursor: { x: 1, y: 2 },
        message: 'Desktop action completed: focusWindow',
        window: { title: 'Notepad', region: { x: 0, y: 0, width: 100, height: 100 } },
      })),
    })
    const tool = await getTool('desktop_focus_window', { invokers })

    const result = await tool.execute({
      titleIncludes: 'Note',
    }, { toolCallId: 'call-1', messages: [] })

    expect(result).toContain('focusWindow')
    expect(invokers.runAction).toHaveBeenCalledWith({
      action: 'focusWindow',
      titleIncludes: 'Note',
    })
  })
})
