import { useLlmToolsStore } from '@proj-airi/stage-ui/stores/llm-tools'
import { defineStore } from 'pinia'

import { desktopControlTools } from './tools/builtin/desktop-control'

/**
 * Registers AIRI's desktop observation and control tools into chat runtime.
 *
 * Use when:
 * - The Tamagotchi renderer should let the character observe the user's screen
 * - Confirmed tool calls may control the Windows desktop through Electron main
 *
 * Returns:
 * - Store actions for refreshing and disposing the desktop-control runtime tools
 */
export const useTamagotchiDesktopControlToolsStore = defineStore('tamagotchi-desktop-control-tools', () => {
  const llmToolsStore = useLlmToolsStore()

  async function refresh() {
    return llmToolsStore.registerTools('desktop-control', desktopControlTools())
  }

  function dispose() {
    llmToolsStore.clearTools('desktop-control')
  }

  return {
    dispose,
    refresh,
  }
})
