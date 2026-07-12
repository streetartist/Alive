import type { Live2DControlRuntime } from './live2d-control'

import { describe, expect, it, vi } from 'vitest'

import { installStrictToolSchemaMatchers } from '../testing/strict-tool-schema'
import { buildLive2DControlToolsetPrompt, live2dControlTools } from './live2d-control'

installStrictToolSchemaMatchers()

function makeRuntime(): Live2DControlRuntime {
  return {
    viewGet: vi.fn(() => ({
      position: { x: 10, y: -5 },
      scale: 1,
    })),
    viewSet: vi.fn(payload => ({
      position: { x: payload.x ?? 0, y: payload.y ?? 0 },
      scale: payload.scale ?? 1,
    })),
    viewReset: vi.fn(() => ({
      position: { x: 0, y: 0 },
      scale: 1,
    })),
  }
}

async function getTool(name: string, runtime = makeRuntime()) {
  const tools = await live2dControlTools({ runtime })
  const tool = tools.find(candidate => candidate.function.name === name)
  if (!tool)
    throw new Error(`Tool not found: ${name}`)
  return { runtime, tool }
}

describe('live2d control tools', () => {
  it('exposes only the live2d_view tool (expressions use ACT markers)', async () => {
    const tools = await live2dControlTools({ runtime: makeRuntime() })

    expect(tools.map(tool => tool.function.name)).toEqual([
      'live2d_view',
    ])
    expect(tools).toSatisfyStrictToolSchemas()
  })

  it('lists live expression presets and speech-timed performance guidance', () => {
    const prompt = buildLive2DControlToolsetPrompt(['脸红', '星星眼', '水印开关'])

    expect(prompt).toContain('脸红')
    expect(prompt).toContain('星星眼')
    expect(prompt).toContain('水印开关')
    expect(prompt).toContain('live2d_view')
    expect(prompt).toContain('ACT.expression')
    expect(prompt).toContain('ACT.motion')
    expect(prompt).toContain('"emotion":"happy"')
    expect(prompt).not.toContain('live2d_expression')
  })

  it('moves the Live2D view relative to the current state', async () => {
    const { runtime, tool } = await getTool('live2d_view')

    const result = await tool.execute({
      action: 'moveBy',
      x: 5,
      y: 4,
      scale: 0.25,
    }, { toolCallId: 'call-1', messages: [] })

    expect(result).toContain('x=15.0%')
    expect(runtime.viewSet).toHaveBeenCalledWith({ x: 15, y: -1, scale: 1.25 })
  })
})
