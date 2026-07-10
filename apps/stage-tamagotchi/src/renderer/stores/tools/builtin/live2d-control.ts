import type { Tool } from '@xsai/shared-chat'
import type { JsonSchema } from 'xsschema'

import type {
  ControlApiLive2DViewResetRequest,
  ControlApiLive2DViewSetRequest,
  ControlApiLive2DViewSnapshot,
} from '../../../../shared/eventa'

import {
  defaultControlConfig,
  useL2dViewControl,
} from '@proj-airi/stage-ui-live2d/stores'
import { rawTool } from '@xsai/tool'
import { toJsonSchema } from 'xsschema'
import { z } from 'zod'

interface Live2DControlRuntime {
  viewGet: () => ControlApiLive2DViewSnapshot
  viewSet: (payload: ControlApiLive2DViewSetRequest) => ControlApiLive2DViewSnapshot
  viewReset: (payload: ControlApiLive2DViewResetRequest) => ControlApiLive2DViewSnapshot
}

interface Live2DControlToolDeps {
  runtime?: Live2DControlRuntime
}

const viewParams = z.object({
  action: z.enum(['get', 'set', 'moveBy', 'reset']).describe('Choose one: get, set, moveBy, reset.'),
  x: z.number().min(defaultControlConfig.x.min).max(defaultControlConfig.x.max).describe('Live2D horizontal offset in percent of stage width. For moveBy, this is a delta.'),
  y: z.number().min(defaultControlConfig.y.min).max(defaultControlConfig.y.max).describe('Live2D vertical offset in percent of stage height. For moveBy, this is a delta.'),
  scale: z.number().min(-defaultControlConfig.scale.max).max(defaultControlConfig.scale.max).describe('Live2D scale factor for set. For moveBy, this delta is added to the current scale.'),
}).strict()

type ViewToolInput = z.infer<typeof viewParams>

function createStoreRuntime(): Live2DControlRuntime {
  const viewControl = useL2dViewControl()

  function viewSnapshot(): ControlApiLive2DViewSnapshot {
    return {
      position: {
        x: viewControl.position.value.x,
        y: viewControl.position.value.y,
      },
      scale: viewControl.scale.value,
    }
  }

  return {
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
  }
}

function resolveRuntime(deps?: Live2DControlToolDeps): Live2DControlRuntime {
  return deps?.runtime ?? createStoreRuntime()
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

async function toolSchema(schema: z.ZodTypeAny): Promise<JsonSchema> {
  return await toJsonSchema(schema) as JsonSchema
}

/**
 * Builds Live2D performance guidance for the system toolset supplement.
 *
 * Expression names are model-specific exp3 group names injected at runtime.
 * Emotions stay on the fixed ACT emotion vocabulary; they are not expression names.
 */
export function buildLive2DControlToolsetPrompt(expressionNames: readonly string[]): string {
  const expressionList = expressionNames.length > 0
    ? expressionNames.map(name => `- ${name}`).join('\n')
    : '- (no Live2D expression presets loaded yet — do not invent expression names)'

  return [
    'Live2D stage view tool and current expression catalog:',
    '',
    '1) Expression presets available on the loaded model (use exact names in ACT.expression):',
    expressionList,
    '',
    '2) live2d_view tool: get/set/moveBy/reset character stage offset (x/y percent) and scale.',
  ].join('\n')
}

/** @deprecated Prefer {@link buildLive2DControlToolsetPrompt} with live expression names. */
export const LIVE2D_CONTROL_TOOLSET_PROMPT = buildLive2DControlToolsetPrompt([])

/**
 * Creates AIRI's Live2D stage view tools.
 *
 * Speech-timed emotion / motion / expression use `<|ACT|>` / `<|DELAY|>` markers.
 */
export async function live2dControlTools(deps: Live2DControlToolDeps = {}): Promise<Tool[]> {
  return [
    rawTool({
      name: 'live2d_view',
      description: 'Get, set, move, or reset the Live2D character position and scale inside the stage. X/Y use percent offsets from center.',
      execute: params => executeLive2DViewAction(params as ViewToolInput, deps),
      parameters: await toolSchema(viewParams),
    }),
  ]
}

export type { Live2DControlRuntime, Live2DControlToolDeps }
