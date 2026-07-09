import type { StageAvatarBoundsPayload, StageViewState } from '@proj-airi/stage-shared/godot-stage'

import type { StageModelRenderer } from '../../../../stores/settings/stage-model'

export type ModelSettingsRuntimeRenderer = 'disabled' | 'live2d' | 'vrm' | 'spine' | 'godot'
export type ModelSettingsRuntimePhase = 'pending' | 'loading' | 'binding' | 'mounted' | 'no-model' | 'error'
export type ModelSettingsLive2DExpressionLlmMode = 'all' | 'none' | 'custom'

/** Serializable view of one Live2D expression parameter inside a settings runtime snapshot. */
export interface ModelSettingsLive2DExpressionParameterSnapshot {
  /** Live2D parameter ID controlled by the expression. */
  parameterId: string
  /** Exp3 target value used by this expression group. */
  value: number
}

/** Serializable view of one named Live2D expression group for settings UI rendering. */
export interface ModelSettingsLive2DExpressionGroupSnapshot {
  /** Expression name declared by `FileReferences.Expressions[].Name`. */
  name: string
  /** Whether the runtime currently considers this expression group active. */
  active: boolean
  /** Whether this expression group is exposed to LLM tools in custom mode. */
  exposedToLlm: boolean
  /** Parameters that make up this expression group. */
  parameters: ModelSettingsLive2DExpressionParameterSnapshot[]
}

/** Live2D expression state mirrored from the renderer that owns the loaded model. */
export interface ModelSettingsLive2DExpressionSnapshot {
  /** Named expression groups available on the current model. */
  groups: ModelSettingsLive2DExpressionGroupSnapshot[]
  /** Runtime LLM exposure mode for expression tools. */
  llmMode: ModelSettingsLive2DExpressionLlmMode
  /** Per-expression exposure flags used when `llmMode` is `custom`. */
  llmExposed: Record<string, boolean>
  /** Snapshot timestamp; `0` means no expression runtime has reported yet. */
  updatedAt: number
}

/** Current model runtime state shared with model settings panels. */
export interface ModelSettingsRuntimeSnapshot {
  /** Renderer instance that owns this snapshot. */
  ownerInstanceId: string
  /** Runtime renderer currently driving the model. */
  renderer: ModelSettingsRuntimeRenderer
  /** Model load/bind lifecycle phase. */
  phase: ModelSettingsRuntimePhase
  /** Whether settings controls should avoid mutating the current model. */
  controlsLocked: boolean
  /** Whether a model preview/runtime surface exists. */
  previewAvailable: boolean
  /** Whether the owner can capture a preview frame. */
  canCapturePreview: boolean
  /** Live2D expression state mirrored from the model-owning renderer. */
  live2dExpressions: ModelSettingsLive2DExpressionSnapshot
  /** Last runtime error, if any. */
  lastError?: string
  /** Snapshot timestamp in epoch milliseconds. */
  updatedAt: number
}

export function createEmptyLive2DExpressionSnapshot(): ModelSettingsLive2DExpressionSnapshot {
  return {
    groups: [],
    llmMode: 'none',
    llmExposed: {},
    updatedAt: 0,
  }
}

export function createEmptyModelSettingsRuntimeSnapshot(
  overrides: Partial<ModelSettingsRuntimeSnapshot> = {},
): ModelSettingsRuntimeSnapshot {
  return {
    ownerInstanceId: '',
    renderer: 'disabled',
    phase: 'pending',
    controlsLocked: false,
    previewAvailable: false,
    canCapturePreview: false,
    live2dExpressions: createEmptyLive2DExpressionSnapshot(),
    updatedAt: 0,
    ...overrides,
  }
}

/** Clones Godot view state into a mutable settings draft, optionally preserving local FOV edits. */
export function cloneStageViewStateForDraft(
  state: StageViewState,
  options: {
    fovDeg?: number
  } = {},
): StageViewState {
  return {
    schemaVersion: state.schemaVersion,
    revision: state.revision,
    updatedAt: state.updatedAt,
    camera: {
      position: {
        x: state.camera.position.x,
        y: state.camera.position.y,
        z: state.camera.position.z,
      },
      yawDeg: state.camera.yawDeg,
      pitchDeg: state.camera.pitchDeg,
      fovDeg: options.fovDeg ?? state.camera.fovDeg,
    },
  }
}

/** Resolves the symmetric settings slider range from the model-load bootstrap snapshot. */
export function resolveGodotCameraPositionRange(options: {
  avatarBounds?: StageAvatarBoundsPayload | null
  loadTimeState: StageViewState | null
}): number {
  const maxDimension = options.avatarBounds?.maxDimension
  const avatarRange = typeof maxDimension === 'number'
    && Number.isFinite(maxDimension)
    && maxDimension > 0
    ? maxDimension * 4
    : 0
  const camera = options.loadTimeState?.camera.position
  const loadTimeCameraRange = camera
    ? Math.max(Math.abs(camera.x), Math.abs(camera.y), Math.abs(camera.z))
    : 0

  return Math.max(4, avatarRange, loadTimeCameraRange)
}

/** Resolves which settings component the model settings panel should mount. */
export function resolveModelSettingsPanelRenderer(options: {
  settingsRenderer: StageModelRenderer
  runtimeRenderer: ModelSettingsRuntimeRenderer
}): ModelSettingsRuntimeRenderer {
  if (options.settingsRenderer === 'godot')
    return 'godot'

  return options.runtimeRenderer
}

/** Maps component load state into the shared model settings runtime phase. */
export function resolveComponentStateToRuntimePhase(
  componentState: 'pending' | 'loading' | 'mounted',
  options: {
    hasModel?: boolean
  } = {},
): ModelSettingsRuntimePhase {
  if (options.hasModel === false)
    return 'no-model'

  return componentState
}
