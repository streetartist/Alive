import type { DesktopControlInvokers } from './desktop-control'

import { describe, expect, it, vi } from 'vitest'

import { installStrictToolSchemaMatchers } from '../testing/strict-tool-schema'
import { desktopControlTools } from './desktop-control'

installStrictToolSchemaMatchers()

function makeInvokers(): DesktopControlInvokers {
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
    })),
    runAction: vi.fn(async payload => ({
      action: payload.action,
      cursor: { x: 100, y: 200 },
      message: `Desktop action completed: ${payload.action}`,
    })),
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
  it('exposes provider-safe strict schemas', async () => {
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
      'desktop_wait',
    ])
    expect(tools).toSatisfyStrictToolSchemas()
  })

  it('does not execute a desktop click before explicit confirmation', async () => {
    const invokers = makeInvokers()
    const tool = await getTool('desktop_click', { invokers })

    const result = await tool.execute({
      x: 300,
      y: 400,
      button: 'left',
      clickCount: 1,
      confirmed: false,
      confirmationCode: '',
    }, { toolCallId: 'call-1', messages: [] })

    expect(result).toContain('Confirmation required')
    expect(result).toContain('Confirmation code:')
    expect(invokers.runAction).not.toHaveBeenCalled()
  })

  it('rejects a confirmed desktop click without a matching confirmation code', async () => {
    const invokers = makeInvokers()
    const tool = await getTool('desktop_click', { invokers, makeConfirmationCode: () => 'CLICK1' })

    const result = await tool.execute({
      x: 300,
      y: 400,
      button: 'left',
      clickCount: 2,
      confirmed: true,
      confirmationCode: 'NOPE',
    }, { toolCallId: 'call-1', messages: [] })

    expect(result).toContain('missing, expired, or unknown')
    expect(invokers.runAction).not.toHaveBeenCalled()
  })

  it('executes a confirmed desktop click through the Electron invoker', async () => {
    const invokers = makeInvokers()
    const tool = await getTool('desktop_click', { invokers, makeConfirmationCode: () => 'CLICK1' })

    await tool.execute({
      x: 300,
      y: 400,
      button: 'left',
      clickCount: 2,
      confirmed: false,
      confirmationCode: '',
    }, { toolCallId: 'call-1', messages: [] })

    const result = await tool.execute({
      x: 300,
      y: 400,
      button: 'left',
      clickCount: 2,
      confirmed: true,
      confirmationCode: 'CLICK1',
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

  it('routes screen observation through an injected observer for tests', async () => {
    const observeScreen = vi.fn(async () => 'observed screen')
    const tool = await getTool('screen_observe', { observeScreen, invokers: makeInvokers() })

    const result = await tool.execute({
      sourceId: '',
      workloadId: 'screen:ui-automation',
      publishContext: true,
    }, { toolCallId: 'call-1', messages: [] })

    expect(result).toBe('observed screen')
    expect(observeScreen).toHaveBeenCalledWith({
      sourceId: '',
      workloadId: 'screen:ui-automation',
      publishContext: true,
    })
  })

  it('parses confirmed hotkeys into key arrays', async () => {
    const invokers = makeInvokers()
    const tool = await getTool('desktop_hotkey', { invokers, makeConfirmationCode: () => 'KEY123' })

    await tool.execute({
      hotkey: 'Ctrl+Shift+F',
      confirmed: false,
      confirmationCode: '',
    }, { toolCallId: 'call-1', messages: [] })

    await tool.execute({
      hotkey: 'Ctrl+Shift+F',
      confirmed: true,
      confirmationCode: 'KEY123',
    }, { toolCallId: 'call-1', messages: [] })

    expect(invokers.runAction).toHaveBeenCalledWith({
      action: 'hotkey',
      keys: ['Ctrl', 'Shift', 'F'],
    })
  })

  it('executes confirmed scroll actions through the Electron invoker', async () => {
    const invokers = makeInvokers()
    const tool = await getTool('desktop_scroll', { invokers, makeConfirmationCode: () => 'SCROLL' })

    await tool.execute({
      x: 500,
      y: 600,
      deltaX: 0,
      deltaY: 720,
      confirmed: false,
      confirmationCode: '',
    }, { toolCallId: 'call-1', messages: [] })

    const result = await tool.execute({
      x: 500,
      y: 600,
      deltaX: 0,
      deltaY: 720,
      confirmed: true,
      confirmationCode: 'SCROLL',
    }, { toolCallId: 'call-1', messages: [] })

    expect(result).toContain('Desktop action completed: scroll')
    expect(invokers.runAction).toHaveBeenCalledWith({
      action: 'scroll',
      x: 500,
      y: 600,
      deltaX: 0,
      deltaY: 720,
    })
  })
})
