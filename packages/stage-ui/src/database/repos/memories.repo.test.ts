import type { MemoryRecord, MemoryScope } from '@proj-airi/memory'

import memoryDriver from 'unstorage/drivers/memory'

import { createStorage } from 'unstorage'
import { beforeEach, describe, expect, it } from 'vitest'

import { createMemoryRepository } from './memories.repo'

const ownerACharacterA = { ownerId: 'owner-a', characterId: 'character-a' } satisfies MemoryScope
const ownerACharacterB = { ownerId: 'owner-a', characterId: 'character-b' } satisfies MemoryScope
const ownerBCharacterA = { ownerId: 'owner-b', characterId: 'character-a' } satisfies MemoryScope

function makeRecord(id: string, scope: MemoryScope, createdAt = 1): MemoryRecord {
  return {
    schemaVersion: 1,
    id,
    scope,
    kind: 'episodic',
    content: `Memory ${id}`,
    source: {
      type: 'chat-turn',
      sessionId: `session-${id}`,
      turnId: `turn-${id}`,
      messageIds: [`user-${id}`, `assistant-${id}`],
    },
    createdAt,
    updatedAt: createdAt,
    accessCount: 0,
  }
}

describe('memory repository', () => {
  let repository: ReturnType<typeof createMemoryRepository>

  beforeEach(() => {
    repository = createMemoryRepository(createStorage({ driver: memoryDriver() }))
  })

  it('isolates records by owner and character on every scoped operation', async () => {
    await repository.save(makeRecord('a-a', ownerACharacterA))
    await repository.save(makeRecord('a-b', ownerACharacterB))
    await repository.save(makeRecord('b-a', ownerBCharacterA))

    expect(await repository.list(ownerACharacterA)).toEqual([
      makeRecord('a-a', ownerACharacterA),
    ])
    expect(await repository.get(ownerACharacterA, 'a-b')).toBeNull()

    await repository.remove(ownerACharacterA, 'a-a')

    expect(await repository.list(ownerACharacterA)).toEqual([])
    expect(await repository.list(ownerACharacterB)).toEqual([
      makeRecord('a-b', ownerACharacterB),
    ])
    expect(await repository.list(ownerBCharacterA)).toEqual([
      makeRecord('b-a', ownerBCharacterA),
    ])
  })

  it('clears one character without deleting sibling character memories', async () => {
    await repository.save(makeRecord('a-a', ownerACharacterA))
    await repository.save(makeRecord('a-b', ownerACharacterB))

    await repository.clear(ownerACharacterA)

    expect(await repository.list(ownerACharacterA)).toEqual([])
    expect(await repository.list(ownerACharacterB)).toHaveLength(1)
  })

  it('clears every character owned by one user without crossing owner boundaries', async () => {
    await repository.save(makeRecord('a-a', ownerACharacterA))
    await repository.save(makeRecord('a-b', ownerACharacterB))
    await repository.save(makeRecord('b-a', ownerBCharacterA))

    await repository.clearOwner('owner-a')

    expect(await repository.list(ownerACharacterA)).toEqual([])
    expect(await repository.list(ownerACharacterB)).toEqual([])
    expect(await repository.list(ownerBCharacterA)).toHaveLength(1)
  })
})
