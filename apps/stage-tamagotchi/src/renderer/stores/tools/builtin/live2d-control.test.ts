import type { ControlApiExpressionOperationResponse, ControlApiExpressionSnapshot } from '../../../../shared/eventa'
import type { Live2DControlRuntime } from './live2d-control'

import { describe, expect, it, vi } from 'vitest'

import { installStrictToolSchemaMatchers } from '../testing/strict-tool-schema'
import { live2dControlTools } from './live2d-control'

installStrictToolSchemaMatchers()

function makeRuntime(): Live2DControlRuntime {
  const expressionSnapshot: ControlApiExpressionSnapshot = {
    modelId: 'KITU_RE23.model3.json',
    groups: [
      {
        name: 'Happy',
        active: false,
        exposedToLlm: true,
        parameters: [{ parameterId: 'ParamHappy', blend: 'Add', value: 1 }],
      },
      {
        name: 'Hidden',
        active: false,
        exposedToLlm: false,
        parameters: [{ parameterId: 'ParamHidden', blend: 'Add', value: 1 }],
      },
    ],
    llmMode: 'custom',
    llmExposed: { Happy: true, Hidden: false },
  }
  const operationResponse = (result: unknown): ControlApiExpressionOperationResponse => ({
    ok: true,
    result,
    expressions: {
      modelId: 'KITU_RE23.model3.json',
      groups: [],
      llmMode: 'custom',
      llmExposed: { Happy: true },
    },
  })

  return {
    expressionList: vi.fn(() => expressionSnapshot),
    expressionSet: vi.fn(payload => operationResponse({ success: true, payload })),
    expressionToggle: vi.fn(payload => operationResponse({ success: true, payload })),
    expressionResetAll: vi.fn(() => operationResponse({ success: true })),
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
    motionList: vi.fn(() => ({
      current: { group: 'Idle', index: 0 },
      available: [
        { motionName: 'Idle', motionIndex: 0, fileName: 'idle.motion3.json' },
        { motionName: 'TapBody', motionIndex: 1, fileName: 'tap.motion3.json' },
      ],
    })),
    motionPlay: vi.fn(payload => ({
      current: {
        group: payload.group,
        ...(payload.index === undefined ? {} : { index: payload.index }),
      },
      available: [
        { motionName: 'Idle', motionIndex: 0, fileName: 'idle.motion3.json' },
        { motionName: 'TapBody', motionIndex: 1, fileName: 'tap.motion3.json' },
      ],
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
  it('exposes provider-safe strict schemas', async () => {
    const tools = await live2dControlTools({ runtime: makeRuntime() })

    expect(tools.map(tool => tool.function.name)).toEqual([
      'live2d_expression',
      'live2d_view',
      'live2d_motion',
    ])
    expect(tools).toSatisfyStrictToolSchemas()
  })

  it('lists only LLM-exposed preset expressions', async () => {
    const { tool } = await getTool('live2d_expression')

    const result = await tool.execute({
      action: 'list',
      name: '',
      value: 0,
      durationSeconds: 0,
    }, { toolCallId: 'call-1', messages: [] })

    expect(result).toContain('Happy')
    expect(result).not.toContain('Hidden')
  })

  it('does not set preset expressions hidden from LLM tools', async () => {
    const { runtime, tool } = await getTool('live2d_expression')

    await expect(tool.execute({
      action: 'set',
      name: 'Hidden',
      value: 1,
      durationSeconds: 0,
    }, { toolCallId: 'call-1', messages: [] })).rejects.toThrow('not exposed')
    expect(runtime.expressionSet).not.toHaveBeenCalled()
  })

  it('sets exposed preset expressions through the runtime', async () => {
    const { runtime, tool } = await getTool('live2d_expression')

    const result = await tool.execute({
      action: 'set',
      name: 'Happy',
      value: 1,
      durationSeconds: 2,
    }, { toolCallId: 'call-1', messages: [] })

    expect(result).toContain('Set Live2D preset expression "Happy"')
    expect(runtime.expressionSet).toHaveBeenCalledWith({ name: 'Happy', value: 1, duration: 2 })
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

  it('plays available Live2D motions through the runtime', async () => {
    const { runtime, tool } = await getTool('live2d_motion')

    const result = await tool.execute({
      action: 'play',
      group: 'TapBody',
      index: 1,
    }, { toolCallId: 'call-1', messages: [] })

    expect(result).toContain('Playing Live2D motion')
    expect(runtime.motionPlay).toHaveBeenCalledWith({ group: 'TapBody', index: 1 })
  })
})
