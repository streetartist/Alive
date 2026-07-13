import type {
  CompanionIdentity,
  CompanionIdentityProfile,
  CompanionIdentityProfileUpdate,
  CompanionState,
} from '@proj-airi/companion-core'
import type { MemoryScope } from '@proj-airi/memory'
import type { ChatProvider } from '@xsai-ext/providers/utils'

import type { CompanionSnapshot } from '../../services/companion/local-companion'

import { errorMessageFrom } from '@moeru/std'
import { formatCompanionContextText, isCompanionReflectionDue } from '@proj-airi/companion-core'
import { generateText } from '@xsai/generate-text'
import { defineStore } from 'pinia'
import { shallowRef } from 'vue'

import { createLocalCompanionService } from '../../services/companion/local-companion'
import { generateCompanionReflection } from '../../services/companion/model-reflection'
import { createCompanionGrowthStageMilestone } from '../../services/companionGrowthMilestone'
import { useProvidersStore } from '../providers'
import { useAiriCardStore } from './airi-card'
import { useConsciousnessStore } from './consciousness'
import { useMemoryStore } from './memory'
import { usePersonalWorldStore } from './personal-world'

function scopeKey(scope: MemoryScope) {
  return JSON.stringify([scope.ownerId, scope.characterId])
}

/** Outcome of one requested companion reflection. */
export interface CompanionReflectionRunResult {
  state: CompanionState
  mode: 'model' | 'local' | 'not-due'
  /** Model failure that caused a safe local fallback. */
  fallbackReason?: string
}

/** Reactive facade over device-local companion state. */
export const useCompanionStore = defineStore('companion', () => {
  const airiCardStore = useAiriCardStore()
  const consciousnessStore = useConsciousnessStore()
  const memoryStore = useMemoryStore()
  const personalWorldStore = usePersonalWorldStore()
  const providersStore = useProvidersStore()
  const localCompanionService = createLocalCompanionService({
    async onGrowthStageTransition(transition) {
      const milestone = createCompanionGrowthStageMilestone(
        transition.scope,
        identityFor(transition.scope),
        transition.nextStage,
        transition.occurredAt,
      )
      if (milestone)
        await memoryStore.rememberMilestone(milestone)
    },
  })
  const states = shallowRef<Record<string, CompanionState>>({})
  const profiles = shallowRef<Record<string, CompanionIdentityProfile>>({})
  const pendingCompanionLoads = new Map<string, Promise<CompanionSnapshot>>()
  const pendingLoads = new Map<string, Promise<CompanionState>>()
  const pendingReflections = new Map<string, Promise<CompanionReflectionRunResult>>()
  const scopeRevisions = new Map<string, number>()

  function cacheState(state: CompanionState) {
    states.value = {
      ...states.value,
      [scopeKey(state.scope)]: state,
    }
    return state
  }

  function getCachedState(scope: MemoryScope) {
    return states.value[scopeKey(scope)]
  }

  function cacheProfile(profile: CompanionIdentityProfile) {
    profiles.value = {
      ...profiles.value,
      [scopeKey(profile.scope)]: profile,
    }
    return profile
  }

  function getCachedProfile(scope: MemoryScope) {
    return profiles.value[scopeKey(scope)]
  }

  async function loadState(scope: MemoryScope) {
    const key = scopeKey(scope)
    const cached = states.value[key]
    if (cached)
      return cached

    const existingLoad = pendingLoads.get(key)
    if (existingLoad)
      return await existingLoad

    const revision = scopeRevisions.get(key) ?? 0
    const load = localCompanionService.load(scope).then(state => (
      (scopeRevisions.get(key) ?? 0) === revision ? cacheState(state) : state
    ))
    pendingLoads.set(key, load)

    try {
      return await load
    }
    finally {
      if (pendingLoads.get(key) === load)
        pendingLoads.delete(key)
    }
  }

  async function loadProfile(scope: MemoryScope) {
    const key = scopeKey(scope)
    const cached = profiles.value[key]
    if (cached)
      return cached

    return (await loadCompanion(scope)).profile
  }

  /** Loads one coherent state/profile pair and caches both records together. */
  async function loadCompanion(scope: MemoryScope) {
    const key = scopeKey(scope)
    const cachedState = states.value[key]
    const cachedProfile = profiles.value[key]
    if (cachedState && cachedProfile)
      return { state: cachedState, profile: cachedProfile }

    const existingLoad = pendingCompanionLoads.get(key)
    if (existingLoad)
      return await existingLoad

    const revision = scopeRevisions.get(key) ?? 0
    const load = localCompanionService.loadCompanion(scope).then((snapshot) => {
      if ((scopeRevisions.get(key) ?? 0) !== revision)
        return snapshot

      return {
        state: cacheState(snapshot.state),
        profile: cacheProfile(snapshot.profile),
      }
    })
    pendingCompanionLoads.set(key, load)

    try {
      return await load
    }
    finally {
      if (pendingCompanionLoads.get(key) === load)
        pendingCompanionLoads.delete(key)
    }
  }

  async function updateProfile(scope: MemoryScope, update: CompanionIdentityProfileUpdate) {
    return cacheProfile(await localCompanionService.updateProfile(scope, update))
  }

  async function recordCompletedInteraction(scope: MemoryScope, memoryRecordId: string) {
    const state = cacheState(await localCompanionService.recordCompletedInteraction(scope, memoryRecordId))
    if (isCompanionReflectionDue(state)) {
      void reflect(scope).catch((error) => {
        console.warn('[companion] Failed to complete scheduled reflection', error)
      })
    }
    return state
  }

  async function recordImportantMemory(scope: MemoryScope, memoryId: string) {
    const state = cacheState(await localCompanionService.recordImportantMemory(scope, memoryId))
    return state
  }

  async function recordFeedback(
    scope: MemoryScope,
    sourceId: string,
    sentiment: 'positive' | 'negative',
  ) {
    const state = cacheState(await localCompanionService.recordFeedback(scope, sourceId, sentiment))
    return state
  }

  function feedbackFor(scope: MemoryScope, sourceId: string) {
    const eventId = `feedback:${sourceId}`
    const event = getCachedState(scope)?.recentGrowthEvents.find(candidate => candidate.id === eventId)
    return event?.type === 'user-feedback' ? event.sentiment : undefined
  }

  function identityFor(scope: MemoryScope): CompanionIdentity {
    const card = airiCardStore.cards.get(scope.characterId)
    return {
      id: scope.characterId,
      name: card?.name ?? scope.characterId,
    }
  }

  /** Loads the exact companion scope before projecting durable prompt context. */
  async function loadPromptSupplement(scope: MemoryScope) {
    const { state, profile } = await loadCompanion(scope)
    return formatCompanionContextText(identityFor(scope), state, profile)
  }

  async function modelReflection(scope: MemoryScope, state: CompanionState) {
    if (!memoryStore.enabled)
      throw new Error('Durable memory is disabled, so model reflection was skipped.')

    const providerId = consciousnessStore.activeProvider
    const modelId = consciousnessStore.activeModel
    if (!providerId || !modelId)
      throw new Error('No active chat provider and model are configured for reflection.')

    const provider = await providersStore.getProviderInstance<ChatProvider>(providerId)
    const card = airiCardStore.cards.get(scope.characterId)
    const [memories, profile] = await Promise.all([
      memoryStore.listMemories(scope),
      loadProfile(scope),
    ])
    if (memories.length === 0)
      throw new Error('No durable memories are available for model reflection.')
    const reflection = await generateCompanionReflection({
      identity: identityFor(scope),
      profile,
      state,
      memories,
      authoredPersonality: card?.personality,
    }, async (messages) => {
      const response = await generateText({
        ...provider.chat(modelId),
        messages,
        headers: { 'Accept-Encoding': 'identity' },
      })
      return response.text ?? ''
    })

    return cacheState(await localCompanionService.reflect(scope, {
      throughInteractionCount: state.interactionCount,
      learned: reflection.learned,
      personalityChanges: reflection.personalityChanges,
    }))
  }

  async function reflect(
    scope: MemoryScope,
    options: { force?: boolean } = {},
  ): Promise<CompanionReflectionRunResult> {
    const key = scopeKey(scope)
    const existing = pendingReflections.get(key)
    if (existing)
      return await existing

    const task = (async () => {
      const state = await loadState(scope)
      const retainedReflection = state.reflections.at(-1)
      if (retainedReflection) {
        // Reflection persistence succeeds before Personal World capture. Replaying the
        // deterministic reflection ID repairs a prior capture failure idempotently.
        await personalWorldStore.captureReflection(scope, retainedReflection)
      }
      const due = isCompanionReflectionDue(state)
      if (!options.force && !due)
        return { state, mode: 'not-due' as const }

      let result: CompanionReflectionRunResult
      try {
        result = {
          state: await modelReflection(scope, state),
          mode: 'model' as const,
        }
      }
      catch (error) {
        const fallbackState = cacheState(await localCompanionService.reflect(scope, {
          throughInteractionCount: state.interactionCount,
        }))
        result = {
          state: fallbackState,
          mode: 'local' as const,
          fallbackReason: errorMessageFrom(error) ?? 'Model reflection failed.',
        }
      }

      const latestReflection = result.state.reflections.at(-1)
      const reflectionIsNew = latestReflection
        && !state.reflections.some(reflection => reflection.id === latestReflection.id)
      if (latestReflection && reflectionIsNew)
        await personalWorldStore.captureReflection(scope, latestReflection)

      return result
    })()

    pendingReflections.set(key, task)
    try {
      return await task
    }
    finally {
      if (pendingReflections.get(key) === task)
        pendingReflections.delete(key)
    }
  }

  async function clearScope(scope: MemoryScope) {
    await localCompanionService.clear(scope)
    invalidateScope(scope)
  }

  /** Drops one in-memory scope without changing its persisted companion data. */
  function invalidateScope(scope: MemoryScope) {
    const key = scopeKey(scope)
    scopeRevisions.set(key, (scopeRevisions.get(key) ?? 0) + 1)
    pendingCompanionLoads.delete(key)
    pendingLoads.delete(key)
    const { [key]: _removed, ...remaining } = states.value
    states.value = remaining
    const { [key]: _removedProfile, ...remainingProfiles } = profiles.value
    profiles.value = remainingProfiles
  }

  async function clearOwner(ownerId: string) {
    await localCompanionService.clearOwner(ownerId)
    states.value = Object.fromEntries(
      Object.entries(states.value).filter(([, state]) => state.scope.ownerId !== ownerId),
    )
    profiles.value = Object.fromEntries(
      Object.entries(profiles.value).filter(([, profile]) => profile.scope.ownerId !== ownerId),
    )
  }

  function resetState() {
    states.value = {}
    profiles.value = {}
    pendingCompanionLoads.clear()
    pendingLoads.clear()
    pendingReflections.clear()
    scopeRevisions.clear()
  }

  return {
    states,
    profiles,
    getCachedState,
    getCachedProfile,
    loadCompanion,
    loadState,
    loadProfile,
    updateProfile,
    recordCompletedInteraction,
    recordImportantMemory,
    recordFeedback,
    feedbackFor,
    reflect,
    loadPromptSupplement,
    invalidateScope,
    clearScope,
    clearOwner,
    resetState,
  }
})
