import type { Tool } from '@xsai/shared-chat'
import type { JsonSchema } from 'xsschema'

import type {
  ControlApiExpressionOperationResponse,
  ControlApiExpressionSetRequest,
  ControlApiExpressionSnapshot,
  ControlApiExpressionToggleRequest,
  ControlApiLive2DMotionPlayRequest,
  ControlApiLive2DMotionSnapshot,
  ControlApiLive2DViewResetRequest,
  ControlApiLive2DViewSetRequest,
  ControlApiLive2DViewSnapshot,
} from '../../../../shared/eventa'

import {
  defaultControlConfig,
  useExpressionStore,
  useL2dViewControl,
  useLive2dParams,
} from '@proj-airi/stage-ui-live2d/stores'
import { rawTool } from '@xsai/tool'
import { toJsonSchema } from 'xsschema'
import { z } from 'zod'

interface Live2DControlRuntime {
  expressionList: () => ControlApiExpressionSnapshot
  expressionSet: (payload: ControlApiExpressionSetRequest) => ControlApiExpressionOperationResponse
  expressionToggle: (payload: ControlApiExpressionToggleRequest) => ControlApiExpressionOperationResponse
  expressionResetAll: () => ControlApiExpressionOperationResponse
  viewGet: () => ControlApiLive2DViewSnapshot
  viewSet: (payload: ControlApiLive2DViewSetRequest) => ControlApiLive2DViewSnapshot
  viewReset: (payload: ControlApiLive2DViewResetRequest) => ControlApiLive2DViewSnapshot
  motionList: () => ControlApiLive2DMotionSnapshot
  motionPlay: (payload: ControlApiLive2DMotionPlayRequest) => ControlApiLive2DMotionSnapshot
}

interface Live2DControlToolDeps {
  runtime?: Live2DControlRuntime
}

const expressionParams = z.object({
  action: z.enum(['list', 'set', 'toggle', 'reset']).describe('Choose one: list, set, toggle, reset.'),
  name: z.string().describe('Preset expression name. Required for set/toggle; use an empty string for list/reset.'),
  value: z.number().describe('Preset value for set. Use 1 to activate and 0 to deactivate. Ignored by list/toggle/reset.'),
  durationSeconds: z.number().min(0).describe('Seconds before auto-reset. Use 0 for no auto-reset.'),
}).strict()

const viewParams = z.object({
  action: z.enum(['get', 'set', 'moveBy', 'reset']).describe('Choose one: get, set, moveBy, reset.'),
  x: z.number().min(defaultControlConfig.x.min).max(defaultControlConfig.x.max).describe('Live2D horizontal offset in percent of stage width. For moveBy, this is a delta.'),
  y: z.number().min(defaultControlConfig.y.min).max(defaultControlConfig.y.max).describe('Live2D vertical offset in percent of stage height. For moveBy, this is a delta.'),
  scale: z.number().min(-defaultControlConfig.scale.max).max(defaultControlConfig.scale.max).describe('Live2D scale factor for set. For moveBy, this delta is added to the current scale.'),
}).strict()

const motionParams = z.object({
  action: z.enum(['list', 'play']).describe('Choose one: list, play.'),
  group: z.string().describe('Motion group name to play, e.g. Idle or TapBody. Use an empty string for list.'),
  index: z.number().int().min(-1).describe('Motion index to play. Use -1 to let the Live2D runtime choose the default index.'),
}).strict()

type ExpressionToolInput = z.infer<typeof expressionParams>
type ViewToolInput = z.infer<typeof viewParams>
type MotionToolInput = z.infer<typeof motionParams>

function createExpressionSnapshot(): ControlApiExpressionSnapshot {
  const expressionStore = useExpressionStore()

  return {
    modelId: expressionStore.modelId,
    groups: Array.from(expressionStore.expressionGroups.values()).map(group => ({
      name: group.name,
      active: expressionStore.activeExpressionGroups.has(group.name),
      exposedToLlm: expressionStore.isExposedToLlm(group.name),
      parameters: group.parameters.map(parameter => ({
        parameterId: parameter.parameterId,
        blend: parameter.blend,
        value: parameter.value,
      })),
    })),
    llmMode: expressionStore.llmMode,
    llmExposed: Object.fromEntries(expressionStore.llmExposed),
  }
}

function createExpressionOperation(result: unknown, ok = true): ControlApiExpressionOperationResponse {
  return {
    ok,
    result,
    expressions: createExpressionSnapshot(),
  }
}

function assertPresetExpressionAvailable(snapshot: ControlApiExpressionSnapshot, name: string) {
  const expressionName = name.trim()
  const expression = snapshot.groups.find(group => group.name === expressionName)
  if (!expression)
    throw new Error(`Live2D preset expression not found: ${expressionName || '(empty)'}`)
  if (!expression.exposedToLlm)
    throw new Error(`Live2D preset expression "${expressionName}" is not exposed to LLM tools.`)

  return expressionName
}

function createStoreRuntime(): Live2DControlRuntime {
  const expressionStore = useExpressionStore()
  const viewControl = useL2dViewControl()
  const live2dParamsStore = useLive2dParams()

  function viewSnapshot(): ControlApiLive2DViewSnapshot {
    return {
      position: {
        x: viewControl.position.value.x,
        y: viewControl.position.value.y,
      },
      scale: viewControl.scale.value,
    }
  }

  function motionSnapshot(): ControlApiLive2DMotionSnapshot {
    return {
      current: { ...live2dParamsStore.currentMotion },
      available: live2dParamsStore.availableMotions.map(motion => ({ ...motion })),
    }
  }

  return {
    expressionList: () => createExpressionSnapshot(),
    expressionSet: (payload) => {
      const result = expressionStore.set(payload.name, payload.value, payload.duration)
      return createExpressionOperation(result, result.success)
    },
    expressionToggle: (payload) => {
      const result = expressionStore.toggle(payload.name, payload.duration)
      return createExpressionOperation(result, result.success)
    },
    expressionResetAll: () => {
      const result = expressionStore.resetAll()
      return createExpressionOperation(result, result.success)
    },
    viewGet: () => viewSnapshot(),
    viewSet: (payload) => {
      if (payload.x !== undefined)
        viewControl.set('x', payload.x)
      if (payload.y !== undefined)
        viewControl.set('y', payload.y)
      if (payload.scale !== undefined)
        viewControl.set('scale', payload.scale)
      return viewSnapshot()
    },
    viewReset: (payload) => {
      const controls = payload.controls?.length ? payload.controls : ['x', 'y', 'scale'] as const
      for (const control of controls)
        viewControl.set(control)
      return viewSnapshot()
    },
    motionList: () => motionSnapshot(),
    motionPlay: (payload) => {
      live2dParamsStore.currentMotion = {
        group: payload.group,
        ...(payload.index === undefined ? {} : { index: payload.index }),
      }
      return motionSnapshot()
    },
  }
}

function resolveRuntime(deps?: Live2DControlToolDeps): Live2DControlRuntime {
  return deps?.runtime ?? createStoreRuntime()
}

function formatExpressionList(snapshot: ControlApiExpressionSnapshot): string {
  const exposed = snapshot.groups
    .filter(group => group.exposedToLlm)
    .map(group => `${group.name}${group.active ? ' (active)' : ''}`)

  if (!snapshot.modelId)
    return 'No Live2D model is currently loaded.'

  if (exposed.length === 0) {
    return [
      `Live2D model: ${snapshot.modelId}`,
      `LLM expression mode: ${snapshot.llmMode}`,
      'No preset expressions are currently exposed to LLM tools.',
    ].join('\n')
  }

  return [
    `Live2D model: ${snapshot.modelId}`,
    `LLM expression mode: ${snapshot.llmMode}`,
    `Exposed preset expressions: ${exposed.join(', ')}`,
  ].join('\n')
}

export async function executeLive2DExpressionAction(input: ExpressionToolInput, deps?: Live2DControlToolDeps): Promise<string> {
  const runtime = resolveRuntime(deps)
  const snapshot = runtime.expressionList()

  if (input.action === 'list')
    return formatExpressionList(snapshot)

  if (!snapshot.modelId)
    throw new Error('No Live2D model is currently loaded.')

  if (input.action === 'reset') {
    const result = runtime.expressionResetAll()
    return `Reset Live2D preset expressions. ${formatExpressionList(result.expressions)}`
  }

  const name = assertPresetExpressionAvailable(snapshot, input.name)
  const duration = input.durationSeconds > 0 ? input.durationSeconds : undefined

  if (input.action === 'toggle') {
    const result = runtime.expressionToggle({ name, duration })
    return `Toggled Live2D preset expression "${name}". ${JSON.stringify(result.result)}`
  }

  const result = runtime.expressionSet({ name, value: input.value, duration })
  return `Set Live2D preset expression "${name}" to ${input.value}. ${JSON.stringify(result.result)}`
}

function formatViewSnapshot(snapshot: ControlApiLive2DViewSnapshot): string {
  return `Live2D view: x=${snapshot.position.x.toFixed(1)}%, y=${snapshot.position.y.toFixed(1)}%, scale=${snapshot.scale.toFixed(2)}.`
}

export async function executeLive2DViewAction(input: ViewToolInput, deps?: Live2DControlToolDeps): Promise<string> {
  const runtime = resolveRuntime(deps)

  if (input.action === 'get')
    return formatViewSnapshot(runtime.viewGet())

  if (input.action === 'reset')
    return formatViewSnapshot(runtime.viewReset({}))

  if (input.action === 'moveBy') {
    const current = runtime.viewGet()
    return formatViewSnapshot(runtime.viewSet({
      x: current.position.x + input.x,
      y: current.position.y + input.y,
      scale: current.scale + input.scale,
    }))
  }

  return formatViewSnapshot(runtime.viewSet({
    x: input.x,
    y: input.y,
    scale: input.scale,
  }))
}

function formatMotionSnapshot(snapshot: ControlApiLive2DMotionSnapshot): string {
  const motions = snapshot.available.map(motion => `${motion.motionName}[${motion.motionIndex}] (${motion.fileName})`)
  return [
    `Current Live2D motion: ${snapshot.current.group}${snapshot.current.index === undefined ? '' : `[${snapshot.current.index}]`}`,
    motions.length ? `Available motions: ${motions.join(', ')}` : 'No Live2D motions are currently available.',
  ].join('\n')
}

export async function executeLive2DMotionAction(input: MotionToolInput, deps?: Live2DControlToolDeps): Promise<string> {
  const runtime = resolveRuntime(deps)
  const snapshot = runtime.motionList()

  if (input.action === 'list')
    return formatMotionSnapshot(snapshot)

  const group = input.group.trim()
  if (!group)
    throw new Error('Motion group is required when action is play.')

  const index = input.index >= 0 ? input.index : undefined
  if (snapshot.available.length > 0) {
    const exists = snapshot.available.some(motion =>
      motion.motionName === group && (index === undefined || motion.motionIndex === index),
    )
    if (!exists)
      throw new Error(`Live2D motion not found: ${group}${index === undefined ? '' : `[${index}]`}`)
  }

  const next = runtime.motionPlay({ group, index })
  return `Playing Live2D motion. ${formatMotionSnapshot(next)}`
}

async function toolSchema(schema: z.ZodTypeAny): Promise<JsonSchema> {
  return await toJsonSchema(schema) as JsonSchema
}

/**
 * Creates AIRI's Live2D character control tools.
 *
 * These tools expose only character-local state: preset expressions, model
 * offset/scale, and model motion groups. They do not control the OS desktop.
 */
export async function live2dControlTools(deps: Live2DControlToolDeps = {}): Promise<Tool[]> {
  return [
    rawTool({
      name: 'live2d_expression',
      description: 'List, set, toggle, or reset Live2D preset expressions exposed to LLM tools.',
      execute: params => executeLive2DExpressionAction(params as ExpressionToolInput, deps),
      parameters: await toolSchema(expressionParams),
    }),
    rawTool({
      name: 'live2d_view',
      description: 'Get, set, move, or reset the Live2D character position and scale inside the stage. X/Y use percent offsets from center.',
      execute: params => executeLive2DViewAction(params as ViewToolInput, deps),
      parameters: await toolSchema(viewParams),
    }),
    rawTool({
      name: 'live2d_motion',
      description: 'List or play Live2D model motion groups by group name and index.',
      execute: params => executeLive2DMotionAction(params as MotionToolInput, deps),
      parameters: await toolSchema(motionParams),
    }),
  ]
}

export type { Live2DControlRuntime, Live2DControlToolDeps }
