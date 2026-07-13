import type { CompanionLifeBehaviorKind, CompanionLifeBehaviorState } from '@proj-airi/companion-core'
import type { MemoryScope } from '@proj-airi/memory'

import { useLocalStorageManualReset } from '@proj-airi/stage-shared/composables'
import { defineStore } from 'pinia'
import { shallowRef } from 'vue'

/** Persistent preferences and ephemeral presentation state for Desktop Life. */
export const useCompanionLifeStore = defineStore('companion-life', () => {
  const enabled = useLocalStorageManualReset<boolean>('settings/companion-life/enabled', true)
  const morningGreetingEnabled = useLocalStorageManualReset<boolean>('settings/companion-life/morning-greeting-enabled', true)
  const idleMinutes = useLocalStorageManualReset<number>('settings/companion-life/idle-minutes', 30)
  const behaviorStateByScope = useLocalStorageManualReset<Record<string, CompanionLifeBehaviorState>>(
    'state/companion-life/v2/behavior-by-scope',
    {},
  )
  const message = shallowRef('')
  const activeBehavior = shallowRef<CompanionLifeBehaviorKind>()
  let messageTimer: ReturnType<typeof setTimeout> | undefined

  function scopeKey(scope: MemoryScope) {
    return JSON.stringify([scope.ownerId, scope.characterId])
  }

  function ownerFromScopeKey(key: string) {
    try {
      const scope: unknown = JSON.parse(key)
      if (!Array.isArray(scope) || scope.length !== 2 || typeof scope[0] !== 'string' || typeof scope[1] !== 'string')
        return undefined
      return scope[0]
    }
    catch {
      return undefined
    }
  }

  function behaviorStateFor(scope: MemoryScope) {
    return behaviorStateByScope.value[scopeKey(scope)] ?? {}
  }

  function recordBehavior(scope: MemoryScope, state: CompanionLifeBehaviorState) {
    behaviorStateByScope.value = {
      ...behaviorStateByScope.value,
      [scopeKey(scope)]: state,
    }
  }

  /** Removes persisted scheduler history for one owner-character relationship. */
  function clearScope(scope: MemoryScope) {
    const key = scopeKey(scope)
    const { [key]: _removed, ...remaining } = behaviorStateByScope.value
    behaviorStateByScope.value = remaining
  }

  /** Removes persisted scheduler history for every character owned by one account. */
  function clearOwner(ownerId: string) {
    behaviorStateByScope.value = Object.fromEntries(
      // Unknown keys cannot be attributed safely, so owner-scoped cleanup leaves them untouched.
      Object.entries(behaviorStateByScope.value).filter(([key]) => ownerFromScopeKey(key) !== ownerId),
    )
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

  /** Restores global Desktop Life preferences and removes all persisted and presented behavior state. */
  function resetState() {
    enabled.reset()
    morningGreetingEnabled.reset()
    idleMinutes.reset()
    behaviorStateByScope.reset()
    clearMessage()
  }

  return {
    enabled,
    morningGreetingEnabled,
    idleMinutes,
    message,
    activeBehavior,
    behaviorStateFor,
    recordBehavior,
    clearScope,
    clearOwner,
    presentBehavior,
    clearMessage,
    resetState,
  }
})
