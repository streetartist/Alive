import type { CompanionIdentityProfile, CompanionState } from '@proj-airi/companion-core'
import type { MemoryScope } from '@proj-airi/memory'

import { describe, expect, it, vi } from 'vitest'

import { createLocalCompanionService } from './local-companion'

const scope = { ownerId: 'owner', characterId: 'character' } satisfies MemoryScope

function createRepository() {
  let state: CompanionState | null = null

  return {
    get: vi.fn(async () => state),
    save: vi.fn(async (next: CompanionState) => {
      state = next
    }),
    clear: vi.fn(async () => {
      state = null
    }),
    clearOwner: vi.fn(async () => {
      state = null
    }),
  }
}

function createProfileRepository() {
  let profile: CompanionIdentityProfile | null = null

  return {
    get: vi.fn(async () => profile),
    save: vi.fn(async (next: CompanionIdentityProfile) => {
      profile = next
    }),
    clear: vi.fn(async () => {
      profile = null
    }),
    clearOwner: vi.fn(async () => {
      profile = null
    }),
  }
}

describe('local companion service', () => {
  it('creates state lazily without persisting an unused relationship', async () => {
    const repository = createRepository()
    const service = createLocalCompanionService({ repository, now: () => 10 })

    const state = await service.load(scope)

    expect(state.createdAt).toBe(10)
    expect(state.interactionCount).toBe(0)
    expect(repository.save).not.toHaveBeenCalled()
  })

  it('serializes concurrent interaction updates for one scope', async () => {
    const repository = createRepository()
    let now = 10
    const service = createLocalCompanionService({ repository, now: () => now++ })

    const [first, second] = await Promise.all([
      service.recordCompletedInteraction(scope, 'memory-1'),
      service.recordCompletedInteraction(scope, 'memory-2'),
    ])

    expect(first.interactionCount).toBe(1)
    expect(second.interactionCount).toBe(2)
    expect(second.mood.valence).toBeGreaterThan(first.mood.valence)
    expect(second.mood.arousal).toBeGreaterThan(first.mood.arousal)
    expect(repository.save).toHaveBeenCalledTimes(2)
  })

  it('persists initial state and profile with one stable relationship birthday', async () => {
    const repository = createRepository()
    const profileRepository = createProfileRepository()
    const service = createLocalCompanionService({
      repository,
      profileRepository,
      now: () => 10,
    })

    const profile = await service.loadProfile(scope)

    expect(profile.birthday).toBe('1970-01-01T00:00:00.010Z')
    expect(repository.save).toHaveBeenCalledTimes(1)
    expect(profileRepository.save).toHaveBeenCalledTimes(1)
    expect((await service.load(scope)).createdAt).toBe(10)
  })

  it('shares one cold initialization across concurrent state-and-profile loads', async () => {
    const repository = createRepository()
    const profileRepository = createProfileRepository()
    let now = 10
    const service = createLocalCompanionService({
      repository,
      profileRepository,
      now: () => now++,
    })

    const [first, second] = await Promise.all([
      service.loadCompanion(scope),
      service.loadCompanion(scope),
    ])

    expect(first.state.createdAt).toBe(10)
    expect(first.profile.birthday).toBe('1970-01-01T00:00:00.010Z')
    expect(second).toEqual(first)
    expect(repository.save).toHaveBeenCalledTimes(1)
    expect(profileRepository.save).toHaveBeenCalledTimes(1)
  })

  it('reuses a concurrent lazy state load when the profile initializes the relationship', async () => {
    const repository = createRepository()
    const profileRepository = createProfileRepository()
    let now = 10
    const service = createLocalCompanionService({
      repository,
      profileRepository,
      now: () => now++,
    })

    const [state, profile] = await Promise.all([
      service.load(scope),
      service.loadProfile(scope),
    ])

    expect(state.createdAt).toBe(10)
    expect(profile.birthday).toBe('1970-01-01T00:00:00.010Z')
    expect((await service.load(scope)).createdAt).toBe(state.createdAt)
    expect(repository.save).toHaveBeenCalledTimes(1)
    expect(profileRepository.save).toHaveBeenCalledTimes(1)
  })

  it('reuses an earlier unpersisted state when a later profile load starts the relationship', async () => {
    const repository = createRepository()
    const profileRepository = createProfileRepository()
    let now = 10
    const service = createLocalCompanionService({
      repository,
      profileRepository,
      now: () => now++,
    })

    const state = await service.load(scope)
    const profile = await service.loadProfile(scope)

    expect(state.createdAt).toBe(10)
    expect(profile.birthday).toBe('1970-01-01T00:00:00.010Z')
    expect((await service.load(scope)).createdAt).toBe(state.createdAt)
  })

  it('orders cold companion initialization with the first durable interaction', async () => {
    const repository = createRepository()
    const profileRepository = createProfileRepository()
    let now = 10
    const service = createLocalCompanionService({
      repository,
      profileRepository,
      now: () => now++,
    })

    const interaction = service.recordCompletedInteraction(scope, 'memory-1')
    const companion = service.loadCompanion(scope)
    const [state, snapshot] = await Promise.all([interaction, companion])

    expect(state.interactionCount).toBe(1)
    expect(snapshot.state.interactionCount).toBe(1)
    expect(snapshot.profile.birthday).toBe(new Date(snapshot.state.createdAt).toISOString())
  })

  it('updates normalized profile fields without changing its birthday', async () => {
    const repository = createRepository()
    const profileRepository = createProfileRepository()
    let now = 10
    const service = createLocalCompanionService({
      repository,
      profileRepository,
      now: () => now++,
    })

    const initial = await service.loadProfile(scope)
    const updated = await service.updateProfile(scope, {
      interests: [' drawing ', 'drawing'],
      values: ['kindness'],
    })

    expect(updated.birthday).toBe(initial.birthday)
    expect(updated.interests).toEqual(['drawing'])
    expect(updated.values).toEqual(['kindness'])
  })

  it('clears profile data together with companion state', async () => {
    const repository = createRepository()
    const profileRepository = createProfileRepository()
    const service = createLocalCompanionService({ repository, profileRepository })

    await service.clear(scope)
    await service.clearOwner(scope.ownerId)

    expect(repository.clear).toHaveBeenCalledWith(scope)
    expect(profileRepository.clear).toHaveBeenCalledWith(scope)
    expect(repository.clearOwner).toHaveBeenCalledWith(scope.ownerId)
    expect(profileRepository.clearOwner).toHaveBeenCalledWith(scope.ownerId)
  })

  it('applies a delayed reflection without consuming newer interactions', async () => {
    const repository = createRepository()
    let now = 10
    const service = createLocalCompanionService({ repository, now: () => now++ })

    for (let index = 0; index < 12; index += 1)
      await service.recordCompletedInteraction(scope, `memory-${index}`)

    const reflected = await service.reflect(scope, {
      throughInteractionCount: 10,
      learned: ['User may prefer calm mornings'],
    })

    expect(reflected.interactionCount).toBe(12)
    expect(reflected.lastReflectedInteractionCount).toBe(10)
    expect(reflected.reflections[0].learned).toEqual(['User may prefer calm mornings'])
  })

  it('deduplicates important memories and message feedback under concurrent retries', async () => {
    const repository = createRepository()
    let now = 10
    const service = createLocalCompanionService({ repository, now: () => now++ })

    const [firstFavorite, duplicateFavorite] = await Promise.all([
      service.recordImportantMemory(scope, 'memory-1'),
      service.recordImportantMemory(scope, 'memory-1'),
    ])
    const positive = await service.recordFeedback(scope, 'session-1:message-1', 'positive')
    const conflictingRetry = await service.recordFeedback(scope, 'session-1:message-1', 'negative')

    expect(firstFavorite.importantMemoryCount).toBe(1)
    expect(duplicateFavorite.importantMemoryCount).toBe(1)
    expect(positive.positiveFeedbackCount).toBe(1)
    expect(conflictingRetry.positiveFeedbackCount).toBe(1)
    expect(conflictingRetry.negativeFeedbackCount).toBe(0)
  })

  it('emits one stage transition for interaction, important-memory, and feedback growth paths', async () => {
    const interactionTransition = vi.fn(async () => {})
    const interactionService = createLocalCompanionService({
      repository: createRepository(),
      now: () => 10,
      onGrowthStageTransition: interactionTransition,
    })
    for (let index = 0; index < 5; index += 1)
      await interactionService.recordCompletedInteraction(scope, `interaction-${index}`)
    await interactionService.recordCompletedInteraction(scope, 'same-stage-interaction')

    expect(interactionTransition).toHaveBeenCalledTimes(1)
    expect(interactionTransition).toHaveBeenCalledWith({
      scope,
      previousStage: 'seed',
      nextStage: 'child',
      occurredAt: 10,
    })

    const memoryTransition = vi.fn(async () => {})
    const memoryService = createLocalCompanionService({
      repository: createRepository(),
      now: () => 20,
      onGrowthStageTransition: memoryTransition,
    })
    await memoryService.recordCompletedInteraction(scope, 'before-favorite')
    await memoryService.recordImportantMemory(scope, 'favorite')
    await memoryService.recordImportantMemory(scope, 'favorite')

    expect(memoryTransition).toHaveBeenCalledTimes(1)
    expect(memoryTransition).toHaveBeenCalledWith({
      scope,
      previousStage: 'seed',
      nextStage: 'child',
      occurredAt: 20,
    })

    const feedbackTransition = vi.fn(async () => {})
    const feedbackService = createLocalCompanionService({
      repository: createRepository(),
      now: () => 30,
      onGrowthStageTransition: feedbackTransition,
    })
    for (let index = 0; index < 3; index += 1)
      await feedbackService.recordCompletedInteraction(scope, `before-feedback-${index}`)
    await feedbackService.recordFeedback(scope, 'positive', 'positive')
    await feedbackService.recordFeedback(scope, 'negative', 'negative')

    expect(feedbackTransition).toHaveBeenCalledTimes(1)
    expect(feedbackTransition).toHaveBeenCalledWith({
      scope,
      previousStage: 'seed',
      nextStage: 'child',
      occurredAt: 30,
    })
  })

  it('does not commit a stage transition until its milestone writer succeeds', async () => {
    const repository = createRepository()
    const transition = vi.fn()
      .mockRejectedValueOnce(new Error('milestone persistence failed'))
      .mockResolvedValue(undefined)
    const service = createLocalCompanionService({
      repository,
      now: () => 10,
      onGrowthStageTransition: transition,
    })
    for (let index = 0; index < 4; index += 1)
      await service.recordCompletedInteraction(scope, `interaction-${index}`)

    await expect(service.recordCompletedInteraction(scope, 'interaction-4')).rejects.toThrow('milestone persistence failed')
    expect((await service.load(scope)).growthStage).toBe('seed')
    expect((await service.load(scope)).interactionCount).toBe(4)

    const retried = await service.recordCompletedInteraction(scope, 'interaction-4')
    expect(retried.growthStage).toBe('child')
    expect(retried.interactionCount).toBe(5)
    expect(transition).toHaveBeenCalledTimes(2)
  })
})
