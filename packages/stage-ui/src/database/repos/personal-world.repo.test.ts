import type { PersonalWorldEntry, PersonalWorldProject } from '@proj-airi/companion-core'
import type { MemoryScope } from '@proj-airi/memory'
import type { Driver, Storage, StorageValue } from 'unstorage'

import memoryDriver from 'unstorage/drivers/memory'

import { createPersonalWorldEntry, createPersonalWorldProject } from '@proj-airi/companion-core'
import { createStorage } from 'unstorage'
import { beforeEach, describe, expect, it } from 'vitest'

import { createPersonalWorldRepository } from './personal-world.repo'

const ownerACharacterA = { ownerId: 'owner-a', characterId: 'character-a' } satisfies MemoryScope
const ownerACharacterB = { ownerId: 'owner-a', characterId: 'character-b' } satisfies MemoryScope
const ownerBCharacterA = { ownerId: 'owner-b', characterId: 'character-a' } satisfies MemoryScope

function makeEntry(scope: MemoryScope, id: string, now: number): PersonalWorldEntry {
  return createPersonalWorldEntry({
    id,
    scope,
    kind: 'journal',
    title: id,
    content: `content:${id}`,
    source: { type: 'manual' },
    now,
  })
}

function makeProject(scope: MemoryScope, id: string, now: number): PersonalWorldProject {
  return createPersonalWorldProject({
    id,
    scope,
    title: id,
    description: `description:${id}`,
    now,
  })
}

function createPrefixedMountedStorage() {
  const records = new Map<string, StorageValue>()
  const prefixedKey = (key: string) => `airi-local:${key}`
  const driver = {
    name: 'test-prefixed-mounted-driver',
    hasItem(key: string) {
      return records.has(prefixedKey(key))
    },
    getItem(key: string) {
      return records.get(prefixedKey(key)) ?? null
    },
    getItemRaw(key: string) {
      return records.get(prefixedKey(key)) ?? null
    },
    setItem(key: string, value: StorageValue) {
      records.set(prefixedKey(key), value)
    },
    setItemRaw(key: string, value: StorageValue) {
      records.set(prefixedKey(key), value)
    },
    removeItem(key: string) {
      records.delete(prefixedKey(key))
    },
    getKeys() {
      return [...records.keys()]
    },
  } satisfies Driver
  const mountedStorage = createStorage({ driver: memoryDriver() })
  mountedStorage.mount('local', driver)
  return mountedStorage
}

describe('personal world repository', () => {
  let repository: ReturnType<typeof createPersonalWorldRepository>
  let worldStorage: Storage<StorageValue>

  beforeEach(() => {
    worldStorage = createStorage({ driver: memoryDriver() })
    repository = createPersonalWorldRepository(worldStorage)
  })

  it('isolates and sorts entries by owner and character', async () => {
    await repository.save(makeEntry(ownerACharacterA, 'older', 1))
    await repository.save(makeEntry(ownerACharacterA, 'newer', 2))
    await repository.save(makeEntry(ownerACharacterB, 'other-character', 3))
    await repository.save(makeEntry(ownerBCharacterA, 'other-owner', 4))

    expect((await repository.list(ownerACharacterA)).map(entry => entry.id)).toEqual(['newer', 'older'])
  })

  it('upserts deterministic entry ids without creating duplicates', async () => {
    await repository.save(makeEntry(ownerACharacterA, 'reflection:1', 1))
    await repository.save({
      ...makeEntry(ownerACharacterA, 'reflection:1', 1),
      title: 'Updated',
      updatedAt: 2,
    })

    expect(await repository.list(ownerACharacterA)).toHaveLength(1)
    expect((await repository.get(ownerACharacterA, 'reflection:1'))?.title).toBe('Updated')
  })

  it('persists projects separately and sorts them by latest update', async () => {
    await repository.save(makeEntry(ownerACharacterA, 'journal', 5))
    await repository.saveProject(makeProject(ownerACharacterA, 'older-project', 1))
    await repository.saveProject(makeProject(ownerACharacterA, 'newer-project', 2))
    await repository.saveProject(makeProject(ownerACharacterB, 'other-character', 3))

    expect((await repository.listProjects(ownerACharacterA)).map(project => project.id)).toEqual([
      'newer-project',
      'older-project',
    ])
    expect(await repository.list(ownerACharacterA)).toHaveLength(1)
  })

  it('lists mounted IndexedDB-style keys whose driver prepends its own base', async () => {
    const mountedRepository = createPersonalWorldRepository(createPrefixedMountedStorage())
    await mountedRepository.saveProject(makeProject(ownerACharacterA, 'mounted-project', 1))

    expect((await mountedRepository.listProjects(ownerACharacterA)).map(project => project.id)).toEqual(['mounted-project'])
  })

  it('updates and removes one scoped project', async () => {
    const project = makeProject(ownerACharacterA, 'project', 1)
    await repository.saveProject(project)
    await repository.saveProject({ ...project, title: 'Updated', updatedAt: 2 })

    expect((await repository.getProject(ownerACharacterA, project.id))?.title).toBe('Updated')

    await repository.removeProject(ownerACharacterA, project.id)
    expect(await repository.getProject(ownerACharacterA, project.id)).toBeNull()
  })

  it('ignores malformed persisted projects', async () => {
    await worldStorage.setItemRaw('local:personal-world/v1/owner-a/character-a/projects/invalid', {
      ...makeProject(ownerACharacterA, 'invalid', 1),
      creationIds: ['', 'duplicate', 'duplicate'],
    })

    expect(await repository.listProjects(ownerACharacterA)).toEqual([])
  })

  it('clears one scope without crossing character boundaries', async () => {
    await repository.save(makeEntry(ownerACharacterA, 'a', 1))
    await repository.save(makeEntry(ownerACharacterB, 'b', 2))
    await repository.saveProject(makeProject(ownerACharacterA, 'project-a', 3))
    await repository.saveProject(makeProject(ownerACharacterB, 'project-b', 4))

    await repository.clearScope(ownerACharacterA)

    expect(await repository.list(ownerACharacterA)).toEqual([])
    expect(await repository.list(ownerACharacterB)).toHaveLength(1)
    expect(await repository.listProjects(ownerACharacterA)).toEqual([])
    expect(await repository.listProjects(ownerACharacterB)).toHaveLength(1)
  })

  it('clears every world owned by one user only', async () => {
    await repository.save(makeEntry(ownerACharacterA, 'a', 1))
    await repository.save(makeEntry(ownerACharacterB, 'b', 2))
    await repository.save(makeEntry(ownerBCharacterA, 'c', 3))
    await repository.saveProject(makeProject(ownerACharacterA, 'project-a', 4))
    await repository.saveProject(makeProject(ownerBCharacterA, 'project-b', 5))

    await repository.clearOwner('owner-a')

    expect(await repository.list(ownerACharacterA)).toEqual([])
    expect(await repository.list(ownerACharacterB)).toEqual([])
    expect(await repository.list(ownerBCharacterA)).toHaveLength(1)
    expect(await repository.listProjects(ownerACharacterA)).toEqual([])
    expect(await repository.listProjects(ownerBCharacterA)).toHaveLength(1)
  })
})
