import { useExpressionStore } from '@proj-airi/stage-ui-live2d/stores'
import { useLlmToolsStore } from '@proj-airi/stage-ui/stores/llm-tools'
import { useLlmToolsetPromptsStore } from '@proj-airi/stage-ui/stores/llm-toolset-prompts'
import { defineStore } from 'pinia'
import { watch } from 'vue'

import { buildLive2DControlToolsetPrompt, live2dControlTools } from './tools/builtin/live2d-control'

/**
 * Registers AIRI's Live2D stage view tool and speech-timed ACT guidance.
 *
 * Expression / emotion / motion are driven by `<|ACT|>` markers. The toolset
 * prompt re-renders whenever the loaded model's exp3 preset list changes.
 */
export const useTamagotchiLive2DControlToolsStore = defineStore('tamagotchi-live2d-control-tools', () => {
  const llmToolsStore = useLlmToolsStore()
  const llmToolsetPromptsStore = useLlmToolsetPromptsStore()
  const expressionStore = useExpressionStore()

  let stopExpressionWatch: (() => void) | undefined
  let refreshQueued = false

  function expressionCatalogKey() {
    return [
      expressionStore.modelId,
      ...Array.from(expressionStore.expressionGroups.keys()),
    ].join('\0')
  }

  async function refresh() {
    const expressionNames = Array.from(expressionStore.expressionGroups.keys())

    llmToolsetPromptsStore.registerToolsetPrompts('live2d-control', [{
      id: 'live2d-control-policy',
      title: 'Live2D Control',
      content: buildLive2DControlToolsetPrompt(expressionNames),
    }])

    return llmToolsStore.registerTools('live2d-control', live2dControlTools())
  }

  function ensureExpressionCatalogWatch() {
    if (stopExpressionWatch)
      return

    stopExpressionWatch = watch(
      expressionCatalogKey,
      () => {
        if (refreshQueued)
          return
        refreshQueued = true
        void refresh()
          .catch((error) => {
            console.warn('[live2d-control-tools] Failed to refresh after expression catalog change:', error)
          })
          .finally(() => {
            refreshQueued = false
          })
      },
    )
  }

  async function start() {
    ensureExpressionCatalogWatch()
    return refresh()
  }

  function dispose() {
    stopExpressionWatch?.()
    stopExpressionWatch = undefined
    llmToolsStore.clearTools('live2d-control')
    llmToolsetPromptsStore.clearToolsetPrompts('live2d-control')
  }

  return {
    dispose,
    refresh,
    start,
  }
})
