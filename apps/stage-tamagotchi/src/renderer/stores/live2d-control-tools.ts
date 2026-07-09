import { useLlmToolsStore } from '@proj-airi/stage-ui/stores/llm-tools'
import { defineStore } from 'pinia'

import { live2dControlTools } from './tools/builtin/live2d-control'

/**
 * Registers AIRI's Live2D character control tools into chat runtime.
 *
 * Use when:
 * - The Tamagotchi renderer should let the character control its Live2D
 *   preset expressions, model offset/scale, and model motion groups.
 */
export const useTamagotchiLive2DControlToolsStore = defineStore('tamagotchi-live2d-control-tools', () => {
  const llmToolsStore = useLlmToolsStore()

  async function refresh() {
    return llmToolsStore.registerTools('live2d-control', live2dControlTools())
  }

  function dispose() {
    llmToolsStore.clearTools('live2d-control')
  }

  return {
    dispose,
    refresh,
  }
})
