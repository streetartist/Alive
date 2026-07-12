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

/** Device-local operations required by chat and data-management surfaces. */
export interface LocalCompanionService {
  load: (scope: MemoryScope) => Promise<CompanionState>
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
  const pendingUpdates = new Map<string, Promise<CompanionState>>()
  const pendingProfileUpdates = new Map<string, Promise<CompanionIdentityProfile>>()

  async function load(scope: MemoryScope) {
    return await repository.get(scope) ?? createCompanionState(scope, now())
  }

  async function loadProfile(scope: MemoryScope) {
    const existing = await profileRepository.get(scope)
    if (existing)
      return existing

    // The relationship birthday comes from the state creation boundary. Persisting
    // both records here prevents a later restart from silently assigning a new one.
    let state = await repository.get(scope)
    if (!state) {
      state = createCompanionState(scope, now())
      await repository.save(state)
    }

    const profile = createCompanionIdentityProfile(scope, state.createdAt, now())
    await profileRepository.save(profile)
    return profile
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
        const profile = await loadProfile(scope)
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
    const pendingUpdate = (previous ?? Promise.resolve())
      .catch(() => undefined)
      .then(async () => {
        const state = await load(scope)
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
    },

    async clearOwner(ownerId) {
      await Promise.all([
        repository.clearOwner(ownerId),
        profileRepository.clearOwner(ownerId),
      ])
    },
  }
}
