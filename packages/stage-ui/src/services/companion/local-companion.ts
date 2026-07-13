import type {
  CompanionDevelopmentPolicy,
  CompanionIdentityProfile,
  CompanionIdentityProfileUpdate,
  CompanionState,
} from '@proj-airi/companion-core'
import type { MemoryScope } from '@proj-airi/memory'

import type { CompanionProfileRepository } from '../../database/repos/companion-profile.repo'
import type { CompanionStateRepository } from '../../database/repos/companion-state.repo'

import {
  applyCompanionGrowthEvent,
  createCompanionIdentityProfile,
  createCompanionState,
  defaultCompanionDevelopmentPolicy,
  recordCompanionInteraction,
  reflectCompanionState,
  updateCompanionIdentityProfile,
} from '@proj-airi/companion-core'

import { companionProfileRepo } from '../../database/repos/companion-profile.repo'
import { companionStateRepo } from '../../database/repos/companion-state.repo'

/** Configuration for the device-local persistent companion service. */
export interface LocalCompanionServiceOptions {
  /** Repository that owns durable state. */
  repository?: CompanionStateRepository
  /** Repository that owns the companion's evolving identity profile. */
  profileRepository?: CompanionProfileRepository
  /** Clock used for relationship transitions. @default Date.now */
  now?: () => number
  /** Development thresholds used for new interactions. */
  policy?: CompanionDevelopmentPolicy
  /** Persists application-owned evidence before a new growth stage is committed. */
  onGrowthStageTransition?: (transition: {
    scope: MemoryScope
    previousStage: CompanionState['growthStage']
    nextStage: CompanionState['growthStage']
    occurredAt: number
  }) => Promise<void>
}

/** Coherent durable state and identity records for one companion scope. */
export interface CompanionSnapshot {
  state: CompanionState
  profile: CompanionIdentityProfile
}

/** Device-local operations required by chat and data-management surfaces. */
export interface LocalCompanionService {
  load: (scope: MemoryScope) => Promise<CompanionState>
  /** Loads or initializes state and profile with one stable relationship birthday. */
  loadCompanion: (scope: MemoryScope) => Promise<CompanionSnapshot>
  loadProfile: (scope: MemoryScope) => Promise<CompanionIdentityProfile>
  updateProfile: (
    scope: MemoryScope,
    update: CompanionIdentityProfileUpdate,
  ) => Promise<CompanionIdentityProfile>
  recordCompletedInteraction: (scope: MemoryScope, memoryRecordId: string) => Promise<CompanionState>
  recordImportantMemory: (scope: MemoryScope, memoryId: string) => Promise<CompanionState>
  recordFeedback: (
    scope: MemoryScope,
    sourceId: string,
    sentiment: 'positive' | 'negative',
  ) => Promise<CompanionState>
  reflect: (scope: MemoryScope, input?: {
    throughInteractionCount?: number
    learned?: string[]
    personalityChanges?: Partial<CompanionState['personality']>
  }) => Promise<CompanionState>
  clear: (scope: MemoryScope) => Promise<void>
  clearOwner: (ownerId: string) => Promise<void>
}

function scopeKey(scope: MemoryScope) {
  return JSON.stringify([scope.ownerId, scope.characterId])
}

/**
 * Creates the local companion service.
 *
 * Updates for the same scope are serialized so two completed sends cannot read
 * the same snapshot and lose one relationship transition during persistence.
 */
export function createLocalCompanionService(
  options: LocalCompanionServiceOptions = {},
): LocalCompanionService {
  const repository = options.repository ?? companionStateRepo
  const profileRepository = options.profileRepository ?? companionProfileRepo
  const now = options.now ?? Date.now
  const policy = options.policy ?? defaultCompanionDevelopmentPolicy
  const onGrowthStageTransition = options.onGrowthStageTransition
  const pendingCompanionLoads = new Map<string, Promise<CompanionSnapshot>>()
  const pendingStateLoads = new Map<string, Promise<CompanionState>>()
  const pendingUpdates = new Map<string, Promise<CompanionState>>()
  const pendingProfileUpdates = new Map<string, Promise<CompanionIdentityProfile>>()
  const unpersistedStates = new Map<string, CompanionState>()

  async function loadState(scope: MemoryScope) {
    const key = scopeKey(scope)
    const persisted = await repository.get(scope)
    if (persisted) {
      unpersistedStates.delete(key)
      return persisted
    }

    const existing = unpersistedStates.get(key)
    if (existing)
      return existing

    const state = createCompanionState(scope, now())
    unpersistedStates.set(key, state)
    return state
  }

  async function load(scope: MemoryScope) {
    const key = scopeKey(scope)
    const pendingCompanion = pendingCompanionLoads.get(key)
    if (pendingCompanion)
      return (await pendingCompanion).state

    const existingLoad = pendingStateLoads.get(key)
    if (existingLoad)
      return await existingLoad

    const stateLoad = loadState(scope)
    pendingStateLoads.set(key, stateLoad)
    try {
      return await stateLoad
    }
    finally {
      if (pendingStateLoads.get(key) === stateLoad)
        pendingStateLoads.delete(key)
    }
  }

  async function loadCompanion(scope: MemoryScope) {
    const key = scopeKey(scope)
    const existingLoad = pendingCompanionLoads.get(key)
    if (existingLoad)
      return await existingLoad

    const precedingUpdate = pendingUpdates.get(key)
    const load = (async (): Promise<CompanionSnapshot> => {
      // A durable transition that started first owns the current state snapshot.
      // Waiting here prevents cold initialization from overwriting its result.
      await precedingUpdate?.catch(() => undefined)

      const pendingState = pendingStateLoads.get(key)
      const profileLoad = profileRepository.get(scope)
      const loadedState = pendingState
        ? await pendingState
        : undefined
      // A pending standalone load may have produced an intentionally unpersisted
      // state. Recheck storage before deciding whether this combined load owns it.
      const persistedState = await repository.get(scope)
      const candidateState = persistedState
        ?? loadedState
        ?? unpersistedStates.get(key)
      const persistedProfile = await profileLoad

      // A profile may survive an interrupted or manually repaired state store.
      // Its birthday remains the relationship authority when recreating state.
      const relationshipStartedAt = persistedState?.createdAt
        ?? (persistedProfile ? new Date(persistedProfile.birthday).getTime() : undefined)
        ?? candidateState?.createdAt
        ?? now()
      const state = persistedState
        ?? (persistedProfile ? createCompanionState(scope, relationshipStartedAt) : candidateState)
        ?? createCompanionState(scope, relationshipStartedAt)
      const profile = persistedProfile
        ?? createCompanionIdentityProfile(scope, state.createdAt, now())

      if (!persistedState)
        await repository.save(state)
      if (!persistedProfile)
        await profileRepository.save(profile)

      unpersistedStates.delete(key)

      return { state, profile }
    })()
    pendingCompanionLoads.set(key, load)

    try {
      return await load
    }
    finally {
      if (pendingCompanionLoads.get(key) === load)
        pendingCompanionLoads.delete(key)
    }
  }

  async function loadProfile(scope: MemoryScope) {
    return (await loadCompanion(scope)).profile
  }

  async function updateProfile(
    scope: MemoryScope,
    update: CompanionIdentityProfileUpdate,
  ) {
    const key = scopeKey(scope)
    const previous = pendingProfileUpdates.get(key)
    const pendingUpdate = (previous ?? Promise.resolve())
      .catch(() => undefined)
      .then(async () => {
        const { profile } = await loadCompanion(scope)
        const next = updateCompanionIdentityProfile(profile, update, now())
        await profileRepository.save(next)
        return next
      })

    pendingProfileUpdates.set(key, pendingUpdate)

    try {
      return await pendingUpdate
    }
    finally {
      if (pendingProfileUpdates.get(key) === pendingUpdate)
        pendingProfileUpdates.delete(key)
    }
  }

  async function updateState(
    scope: MemoryScope,
    transition: (state: CompanionState, transitionNow: number) => CompanionState,
  ) {
    const key = scopeKey(scope)
    const previous = pendingUpdates.get(key)
    const precedingCompanionLoad = pendingCompanionLoads.get(key)
    const pendingUpdate = (previous ?? Promise.resolve())
      .catch(() => undefined)
      .then(async () => {
        if (precedingCompanionLoad)
          await precedingCompanionLoad

        const state = await loadState(scope)
        const next = transition(state, now())
        if (next.growthStage !== state.growthStage) {
          await onGrowthStageTransition?.({
            scope: { ...scope },
            previousStage: state.growthStage,
            nextStage: next.growthStage,
            occurredAt: next.updatedAt,
          })
        }
        await repository.save(next)
        unpersistedStates.delete(key)
        return next
      })

    pendingUpdates.set(key, pendingUpdate)

    try {
      return await pendingUpdate
    }
    finally {
      if (pendingUpdates.get(key) === pendingUpdate)
        pendingUpdates.delete(key)
    }
  }

  async function recordCompletedInteraction(scope: MemoryScope, memoryRecordId: string) {
    return await updateState(scope, (state, transitionNow) => recordCompanionInteraction(state, {
      eventId: `interaction:${memoryRecordId}`,
      now: transitionNow,
      policy,
    }))
  }

  return {
    load,
    loadCompanion,
    loadProfile,
    updateProfile,
    recordCompletedInteraction,

    async recordImportantMemory(scope, memoryId) {
      return await updateState(scope, (state, transitionNow) => applyCompanionGrowthEvent(state, {
        id: `important-memory:${memoryId}`,
        type: 'important-memory-marked',
        occurredAt: transitionNow,
      }, { policy }))
    },

    async recordFeedback(scope, sourceId, sentiment) {
      return await updateState(scope, (state, transitionNow) => applyCompanionGrowthEvent(state, {
        id: `feedback:${sourceId}`,
        type: 'user-feedback',
        occurredAt: transitionNow,
        sentiment,
      }, { policy }))
    },

    async reflect(scope, input = {}) {
      return await updateState(scope, (state, transitionNow) => reflectCompanionState(state, {
        now: transitionNow,
        policy,
        ...input,
      }))
    },

    async clear(scope) {
      await Promise.all([
        repository.clear(scope),
        profileRepository.clear(scope),
      ])
      unpersistedStates.delete(scopeKey(scope))
    },

    async clearOwner(ownerId) {
      await Promise.all([
        repository.clearOwner(ownerId),
        profileRepository.clearOwner(ownerId),
      ])
      for (const [key, state] of unpersistedStates) {
        if (state.scope.ownerId === ownerId)
          unpersistedStates.delete(key)
      }
    },
  }
}
