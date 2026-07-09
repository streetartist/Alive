import type {
  ExpressionEntry,
  ExpressionGroupDefinition,
} from '@proj-airi/stage-ui-live2d'

import type {
  ModelSettingsLive2DExpressionLlmMode,
  ModelSettingsLive2DExpressionSnapshot,
} from './runtime'

export interface CreateLive2DExpressionSnapshotOptions {
  /** Named expression groups parsed from model3.json and exp3 files. */
  groups: Iterable<ExpressionGroupDefinition>
  /** Runtime expression entries keyed by Live2D parameter ID. */
  expressions: Map<string, ExpressionEntry>
  /** Expression groups explicitly activated by UI/tools in the runtime owner. */
  activeExpressionGroups?: ReadonlySet<string>
  /** Current LLM exposure mode in the model-owning renderer. */
  llmMode: ModelSettingsLive2DExpressionLlmMode
  /** Per-expression LLM exposure flags used in custom mode. */
  llmExposed: Map<string, boolean>
  /** Snapshot timestamp. Defaults to `Date.now()`. */
  updatedAt?: number
}

/**
 * Converts the Live2D expression store into a structured-clone-safe settings snapshot.
 *
 * Pinia stores are scoped per renderer window, so Electron settings windows cannot
 * read the model-owning stage window's expression store directly. This snapshot is
 * intentionally plain arrays/objects so it can cross `BroadcastChannel` unchanged.
 */
export function createLive2DExpressionSnapshot(
  options: CreateLive2DExpressionSnapshotOptions,
): ModelSettingsLive2DExpressionSnapshot {
  const groups = Array.from(options.groups).map(group => ({
    name: group.name,
    active: options.activeExpressionGroups?.has(group.name) ?? isGroupActive(group, options.expressions),
    exposedToLlm: options.llmMode === 'all'
      ? true
      : options.llmMode === 'custom' && (options.llmExposed.get(group.name) ?? false),
    parameters: group.parameters.map(param => ({
      parameterId: param.parameterId,
      value: param.value,
    })),
  }))

  return {
    groups,
    llmMode: options.llmMode,
    llmExposed: Object.fromEntries(options.llmExposed),
    updatedAt: options.updatedAt ?? Date.now(),
  }
}

function isGroupActive(
  group: ExpressionGroupDefinition,
  expressions: Map<string, ExpressionEntry>,
): boolean {
  return group.parameters.some((parameter) => {
    if (parameter.value === 0)
      return false

    const entry = expressions.get(parameter.parameterId)
    return entry != null && entry.currentValue === parameter.value
  })
}
