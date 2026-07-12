import type { CompanionLifeBehaviorKind, CompanionLifeBehaviorState } from '@proj-airi/companion-core'

import { useLocalStorageManualReset } from '@proj-airi/stage-shared/composables'
import { defineStore } from 'pinia'
import { shallowRef } from 'vue'

/** Persistent preferences and ephemeral presentation state for Desktop Life. */
export const useCompanionLifeStore = defineStore('companion-life', () => {
  const enabled = useLocalStorageManualReset<boolean>('settings/companion-life/enabled', true)
  const morningGreetingEnabled = useLocalStorageManualReset<boolean>('settings/companion-life/morning-greeting-enabled', true)
  const idleMinutes = useLocalStorageManualReset<number>('settings/companion-life/idle-minutes', 30)
  const behaviorStateByCharacter = useLocalStorageManualReset<Record<string, CompanionLifeBehaviorState>>(
    'state/companion-life/behavior-by-character',
    {},
  )
  const message = shallowRef('')
  const activeBehavior = shallowRef<CompanionLifeBehaviorKind>()
  let messageTimer: ReturnType<typeof setTimeout> | undefined

  function behaviorStateFor(characterId: string) {
    return behaviorStateByCharacter.value[characterId] ?? {}
  }

  function recordBehavior(characterId: string, state: CompanionLifeBehaviorState) {
    behaviorStateByCharacter.value = {
      ...behaviorStateByCharacter.value,
      [characterId]: state,
    }
  }

  function clearMessage() {
    if (messageTimer !== undefined)
      clearTimeout(messageTimer)
    messageTimer = undefined
    message.value = ''
    activeBehavior.value = undefined
  }

  function presentBehavior(kind: CompanionLifeBehaviorKind, text: string, durationMs = 10_000) {
    clearMessage()
    activeBehavior.value = kind
    message.value = text
    messageTimer = setTimeout(clearMessage, Math.max(1_000, durationMs))
  }

  return {
    enabled,
    morningGreetingEnabled,
    idleMinutes,
    message,
    activeBehavior,
    behaviorStateFor,
    recordBehavior,
    presentBehavior,
    clearMessage,
  }
})
