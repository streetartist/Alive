import type { ElectronDesktopControlPolicy } from '../../shared/eventa'

import { useElectronEventaInvoke } from '@proj-airi/electron-vueuse'
import { useLlmToolsStore } from '@proj-airi/stage-ui/stores/llm-tools'
import { defineStore } from 'pinia'

import { electronDesktopGetPolicy } from '../../shared/eventa'
import { desktopControlTools } from './tools/builtin/desktop-control'

/**
 * Whether desktop observation/control tools should be visible to the LLM.
 *
 * Tools (and their schemas/descriptions) are only registered when control is
 * enabled and not kill-switched. Closed desktop control must not inject tools.
 */
export function shouldRegisterDesktopControlTools(policy: Pick<ElectronDesktopControlPolicy, 'enabled' | 'killSwitched'>): boolean {
  return policy.enabled === true && policy.killSwitched !== true
}

/**
 * Registers AIRI's desktop observation and control tools into chat runtime.
 *
 * Registration is policy-gated: when desktop control is off (or kill-switched),
 * tools are cleared so the model does not see desktop_* / screen_* schemas.
 */
export const useTamagotchiDesktopControlToolsStore = defineStore('tamagotchi-desktop-control-tools', () => {
  const llmToolsStore = useLlmToolsStore()
  const getPolicy = useElectronEventaInvoke(electronDesktopGetPolicy)

  async function refresh() {
    let policy: ElectronDesktopControlPolicy
    try {
      policy = await getPolicy()
    }
    catch (error) {
      // Fail closed: if policy cannot be read, do not expose desktop tools.
      console.warn('[desktop-control-tools] Failed to read policy; clearing tools:', error)
      llmToolsStore.clearTools('desktop-control')
      return []
    }

    if (!shouldRegisterDesktopControlTools(policy)) {
      llmToolsStore.clearTools('desktop-control')
      return []
    }

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
