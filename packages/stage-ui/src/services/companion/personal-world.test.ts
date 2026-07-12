import type { CompanionReflection } from '@proj-airi/companion-core'
import type { MemoryRecord, MemoryScope } from '@proj-airi/memory'

import memoryDriver from 'unstorage/drivers/memory'

import { createStorage } from 'unstorage'
import { beforeEach, describe, expect, it } from 'vitest'

import { createPersonalWorldRepository } from '../../database/repos/personal-world.repo'
import { createPersonalWorldService } from './personal-world'

const scope = { ownerId: 'owner', characterId: 'character' } satisfies MemoryScope

const reflection: CompanionReflection = {
  id: 'reflection-1',
  createdAt: 10,
  interactionCount: 10,
  learned: ['The user enjoys rain', 'Quiet mornings feel restorative'],
  personalityChanges: {},
  summary: 'We reflected on ten shared interactions.',
}

const memory: MemoryRecord = {
  schemaVersion: 2,
  id: 'memory-1',
  scope,
  kind: 'experience',
  importance: 0.5,
  emotionalWeight: 0,
  content: 'We watched a summer storm together.',
  source: { type: 'chat-turn', sessionId: 'session', turnId: 'turn', messageIds: ['user', 'assistant'] },
  createdAt: 20,
  updatedAt: 20,
  accessCount: 0,
}

describe('personal world service', () => {
  let repository: ReturnType<typeof createPersonalWorldRepository>
  let service: ReturnType<typeof createPersonalWorldService>

  beforeEach(() => {
    repository = createPersonalWorldRepository(createStorage({ driver: memoryDriver() }))
    service = createPersonalWorldService({ repository, now: () => 30, createId: () => 'manual-1' })
  })

  it('adds a manually authored journal entry', async () => {
    await service.addJournal(scope, { title: 'Today', content: 'We made a small plan.' })

    expect(await service.list(scope)).toMatchObject([{
      id: 'manual:manual-1',
      kind: 'journal',
      title: 'Today',
      source: { type: 'manual' },
      createdAt: 30,
    }])
  })

  it('creates, evolves, and removes a scoped creative project', async () => {
    const project = await service.createProject(scope, {
      title: 'Rain sketches',
      description: 'Create a small visual series from rainy evenings.',
      creationIds: ['creation-1'],
    })
    const active = await service.updateProject(scope, project.id, {
      status: 'active',
      creationIds: ['creation-1', 'creation-2'],
    })

    expect(active).toMatchObject({
      id: 'project:manual-1',
      status: 'active',
      creationIds: ['creation-1', 'creation-2'],
      updatedAt: 30,
    })
    expect(await service.listProjects(scope)).toHaveLength(1)

    await service.removeProject(scope, project.id)
    expect(await service.listProjects(scope)).toEqual([])
  })

  it('does not update a project through another companion scope', async () => {
    const project = await service.createProject(scope, {
      title: 'Rain sketches',
      description: 'Create a small visual series from rainy evenings.',
    })

    await expect(service.updateProject(
      { ownerId: scope.ownerId, characterId: 'other' },
      project.id,
      { status: 'completed' },
    )).rejects.toThrow('not found in this scope')
  })

  it('captures reflection journal and learned entries idempotently', async () => {
    await service.captureReflection(scope, reflection)
    await service.captureReflection(scope, reflection)

    const entries = await service.list(scope)
    expect(entries).toHaveLength(3)
    expect(entries.filter(entry => entry.kind === 'journal')).toHaveLength(1)
    expect(entries.filter(entry => entry.kind === 'learned')).toHaveLength(2)
  })

  it('saves a memory as one idempotent favorite moment', async () => {
    await service.saveFavorite(scope, memory)
    await service.saveFavorite(scope, memory)

    expect(await service.list(scope)).toMatchObject([{
      id: 'memory:memory-1:favorite',
      kind: 'favorite',
      content: memory.content,
      source: { type: 'memory', memoryId: memory.id },
    }])
  })

  it('rejects a favorite from another scope', async () => {
    await expect(service.saveFavorite(
      { ownerId: 'owner', characterId: 'other' },
      memory,
    )).rejects.toThrow('must belong')
  })
})
