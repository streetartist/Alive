import type {
  ModelSettingsLive2DExpressionLlmMode,
  ModelSettingsRuntimeSnapshot,
} from '@proj-airi/stage-ui/components'

export const modelSettingsRuntimeSnapshotChannelName = 'airi-model-settings-runtime-snapshot'

/** Command sent from settings windows to the renderer that owns the Live2D runtime. */
export type ModelSettingsLive2DExpressionCommand
  = | { action: 'toggle', name: string }
    | { action: 'save-defaults' }
    | { action: 'reset-all' }
    | { action: 'set-llm-mode', mode: ModelSettingsLive2DExpressionLlmMode }
    | { action: 'set-llm-exposed', name: string, value: boolean }

export type ModelSettingsRuntimeChannelEvent
  = | { type: 'request-current' }
    | { type: 'snapshot', snapshot: ModelSettingsRuntimeSnapshot }
    | { type: 'owner-gone', ownerInstanceId: string }
    | { type: 'live2d-expression-command', command: ModelSettingsLive2DExpressionCommand }
