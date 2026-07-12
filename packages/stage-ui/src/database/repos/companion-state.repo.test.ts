import type { CompanionState } from '@proj-airi/companion-core'
import type { MemoryScope } from '@proj-airi/memory'

import memoryDriver from 'unstorage/drivers/memory'

import { createCompanionState } from '@proj-airi/companion-core'
import { createStorage } from 'unstorage'
import { beforeEach, describe, expect, it } from 'vitest'

import { createCompanionStateRepository } from './companion-state.repo'

const ownerACharacterA = { ownerId: 'owner-a', characterId: 'character-a' } satisfies MemoryScope
const ownerACharacterB = { ownerId: 'owner-a', characterId: 'character-b' } satisfies MemoryScope
const ownerBCharacterA = { ownerId: 'owner-b', characterId: 'character-a' } satisfies MemoryScope

function makeState(scope: MemoryScope, interactionCount: number): CompanionState {
  return {
    ...createCompanionState(scope, 1),
    updatedAt: interactionCount + 1,
    interactionCount,
    relationshipScore: interactionCount,
  }
}

describe('companion state repository', () => {
  let companionStorage: ReturnType<typeof createStorage>
  let repository: ReturnType<typeof createCompanionStateRepository>

  beforeEach(() => {
    companionStorage = createStorage({ driver: memoryDriver() })
    repository = createCompanionStateRepository(companionStorage)
  })

  it('migrates schema v1 through v3 without losing relationship state', async () => {
    const current = makeState(ownerACharacterA, 7)
    const { mood: _mood, ...withoutMood } = current
    const legacy = {
      ...withoutMood,
      schemaVersion: 1,
    }
    const key = 'local:companion/v1/owner-a/character-a/state'
    await companionStorage.setItemRaw(key, legacy)

    const migrated = await repository.get(ownerACharacterA)

    expect(migrated).toMatchObject({
      schemaVersion: 3,
      interactionCount: 7,
      growthPoints: 7,
      relationshipScore: 7,
      mood: {
        valence: 0,
        arousal: 0.25,
        updatedAt: 8,
      },
    })
    expect(await companionStorage.getItemRaw<{ schemaVersion: number }>(key)).toMatchObject({ schemaVersion: 3 })
  })

  it('migrates schema v2 mood while initializing growth from completed interactions', async () => {
    const current = makeState(ownerACharacterA, 4)
    const {
      growthPoints: _growthPoints,
      importantMemoryCount: _importantMemoryCount,
      positiveFeedbackCount: _positiveFeedbackCount,
      negativeFeedbackCount: _negativeFeedbackCount,
      processedGrowthEventIds: _processedGrowthEventIds,
      recentGrowthEvents: _recentGrowthEvents,
      ...withoutGrowth
    } = current
    const key = 'local:companion/v1/owner-a/character-a/state'
    await companionStorage.setItemRaw(key, { ...withoutGrowth, schemaVersion: 2 })

    expect(await repository.get(ownerACharacterA)).toMatchObject({
      schemaVersion: 3,
      interactionCount: 4,
      growthPoints: 4,
      mood: current.mood,
    })
  })

  it('isolates companion state by owner and character', async () => {
    await repository.save(makeState(ownerACharacterA, 1))
    await repository.save(makeState(ownerACharacterB, 2))
    await repository.save(makeState(ownerBCharacterA, 3))

    expect((await repository.get(ownerACharacterA))?.interactionCount).toBe(1)
    expect((await repository.get(ownerACharacterB))?.interactionCount).toBe(2)
    expect((await repository.get(ownerBCharacterA))?.interactionCount).toBe(3)
  })

  it('clears one scope without crossing companion ownership boundaries', async () => {
    await repository.save(makeState(ownerACharacterA, 1))
    await repository.save(makeState(ownerACharacterB, 2))

    await repository.clear(ownerACharacterA)

    expect(await repository.get(ownerACharacterA)).toBeNull()
    expect(await repository.get(ownerACharacterB)).not.toBeNull()
  })

  it('clears every companion owned by one user only', async () => {
    await repository.save(makeState(ownerACharacterA, 1))
    await repository.save(makeState(ownerACharacterB, 2))
    await repository.save(makeState(ownerBCharacterA, 3))

    await repository.clearOwner('owner-a')

    expect(await repository.get(ownerACharacterA)).toBeNull()
    expect(await repository.get(ownerACharacterB)).toBeNull()
    expect(await repository.get(ownerBCharacterA)).not.toBeNull()
  })
})
