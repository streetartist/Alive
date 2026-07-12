import type { MemoryRecord, MemoryScope } from '@proj-airi/memory'
import type { Driver, Storage, StorageValue } from 'unstorage'

import memoryDriver from 'unstorage/drivers/memory'

import { createStorage } from 'unstorage'
import { beforeEach, describe, expect, it } from 'vitest'

import { createMemoryRepository } from './memories.repo'

const ownerACharacterA = { ownerId: 'owner-a', characterId: 'character-a' } satisfies MemoryScope
const ownerACharacterB = { ownerId: 'owner-a', characterId: 'character-b' } satisfies MemoryScope
const ownerBCharacterA = { ownerId: 'owner-b', characterId: 'character-a' } satisfies MemoryScope

function makeRecord(id: string, scope: MemoryScope, createdAt = 1): MemoryRecord {
  return {
    schemaVersion: 2,
    id,
    scope,
    kind: 'experience',
    importance: 0.5,
    emotionalWeight: 0,
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

function createPrefixedMountedStorage() {
  const records = new Map<string, StorageValue>()
  const prefixedKey = (key: string) => `airi-local:${key}`
  const driver = {
    name: 'test-prefixed-mounted-driver',
    hasItem: (key: string) => records.has(prefixedKey(key)),
    getItem: (key: string) => records.get(prefixedKey(key)) ?? null,
    getItemRaw: (key: string) => records.get(prefixedKey(key)) ?? null,
    setItem: (key: string, value: StorageValue) => void records.set(prefixedKey(key), value),
    setItemRaw: (key: string, value: StorageValue) => void records.set(prefixedKey(key), value),
    removeItem: (key: string) => void records.delete(prefixedKey(key)),
    getKeys: () => [...records.keys()],
  } satisfies Driver
  const mountedStorage = createStorage({ driver: memoryDriver() })
  mountedStorage.mount('local', driver)
  return mountedStorage
}

describe('memory repository', () => {
  let repository: ReturnType<typeof createMemoryRepository>
  let memoryStorage: Storage<StorageValue>

  beforeEach(() => {
    memoryStorage = createStorage({ driver: memoryDriver() })
    repository = createMemoryRepository(memoryStorage)
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

  it('migrates schema v1 records to neutral explicit annotations', async () => {
    const legacyRecord = {
      schemaVersion: 1,
      id: 'legacy',
      scope: ownerACharacterA,
      kind: 'episodic',
      content: 'Legacy memory',
      source: {
        type: 'chat-turn',
        sessionId: 'session-legacy',
        turnId: 'turn-legacy',
        messageIds: ['user-legacy', 'assistant-legacy'],
      },
      createdAt: 1,
      updatedAt: 1,
      accessCount: 0,
    }
    const key = 'local:memory/v1/owner-a/character-a/records/legacy'
    await memoryStorage.setItemRaw(key, legacyRecord)

    expect(await repository.get(ownerACharacterA, 'legacy')).toMatchObject({
      schemaVersion: 2,
      kind: 'experience',
      importance: 0.5,
      emotionalWeight: 0,
    })
    expect(await memoryStorage.getItemRaw<MemoryRecord>(key)).toMatchObject({ schemaVersion: 2 })
  })

  it('lists mounted IndexedDB-style keys whose driver prepends its own base', async () => {
    const mountedRepository = createMemoryRepository(createPrefixedMountedStorage())
    await mountedRepository.save(makeRecord('mounted', ownerACharacterA))

    expect((await mountedRepository.list(ownerACharacterA)).map(record => record.id)).toEqual(['mounted'])
  })

  it('accepts complete system-event provenance and rejects malformed sources', async () => {
    const systemRecord: MemoryRecord = {
      ...makeRecord('system', ownerACharacterA),
      kind: 'milestone',
      source: {
        type: 'system-event',
        eventName: 'companion-growth-stage',
        eventId: 'child',
      },
    }
    await repository.save(systemRecord)
    await memoryStorage.setItemRaw(
      'local:memory/v1/owner-a/character-a/records/malformed',
      {
        ...makeRecord('malformed', ownerACharacterA),
        source: { type: 'system-event', eventName: 'companion-growth-stage' },
      },
    )

    expect(await repository.get(ownerACharacterA, 'system')).toEqual(systemRecord)
    expect(await repository.get(ownerACharacterA, 'malformed')).toBeNull()
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
