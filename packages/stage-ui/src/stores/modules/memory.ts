import type { MemoryAnnotation, MemoryCompletedTurn, MemoryMilestoneInput, MemoryRecallRequest, MemoryScope } from '@proj-airi/memory'

import { useLocalStorageManualReset } from '@proj-airi/stage-shared/composables'
import { defineStore } from 'pinia'
import { computed } from 'vue'

import { localMemoryBackend } from '../../services/memory/local-memory'

/**
 * User-facing memory configuration and adapter-neutral memory actions.
 *
 * Chat depends only on `recall` and `rememberTurn`; settings use the explicit
 * management actions. Keeping both behind this store lets a future remote
 * backend replace local IndexedDB without leaking transport details into UI.
 */
export const useMemoryStore = defineStore('memory', () => {
  const enabled = useLocalStorageManualReset<boolean>('settings/memory/enabled', true)
  const recallLimit = useLocalStorageManualReset<number>('settings/memory/recall-limit', 5)
  const promptCharacterBudget = useLocalStorageManualReset<number>('settings/memory/prompt-character-budget', 3000)

  const configured = computed(() => enabled.value)
  const backendId = localMemoryBackend.id

  async function recall(input: MemoryRecallRequest) {
    if (!enabled.value)
      return []

    const configuredLimit = Math.max(1, Math.min(20, Math.floor(recallLimit.value)))
    return await localMemoryBackend.recall({
      ...input,
      limit: Math.min(input.limit, configuredLimit),
    })
  }

  async function rememberTurn(input: MemoryCompletedTurn) {
    if (!enabled.value)
      return undefined
    return await localMemoryBackend.rememberTurn(input)
  }

  async function rememberMilestone(input: MemoryMilestoneInput) {
    if (!enabled.value)
      return undefined
    return await localMemoryBackend.rememberMilestone(input)
  }

  async function listMemories(scope: MemoryScope) {
    return await localMemoryBackend.list({ scope, limit: 500 })
  }

  async function forgetMemory(scope: MemoryScope, id: string) {
    await localMemoryBackend.remove({ scope, id })
  }

  async function annotateMemory(scope: MemoryScope, id: string, annotation: MemoryAnnotation) {
    return await localMemoryBackend.annotate({ scope, id, annotation })
  }

  async function clearMemories(scope: MemoryScope) {
    await localMemoryBackend.clear(scope)
  }

  async function clearOwner(ownerId: string) {
    await localMemoryBackend.clearOwner(ownerId)
  }

  function resetState() {
    enabled.reset()
    recallLimit.reset()
    promptCharacterBudget.reset()
  }

  return {
    enabled,
    recallLimit,
    promptCharacterBudget,
    configured,
    backendId,
    recall,
    rememberTurn,
    rememberMilestone,
    listMemories,
    annotateMemory,
    forgetMemory,
    clearMemories,
    clearOwner,
    resetState,
  }
})
