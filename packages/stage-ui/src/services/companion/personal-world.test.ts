import type { CompanionReflection } from '@proj-airi/companion-core'
import type { MemoryRecord, MemoryScope } from '@proj-airi/memory'

import memoryDriver from 'unstorage/drivers/memory'

import { createStorage } from 'unstorage'
import { beforeEach, describe, expect, it, vi } from 'vitest'

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

  it('serializes an active room write before clearing the same scope', async () => {
    let resolveWrite: () => void = () => {}
    const writeGate = new Promise<void>((resolve) => {
      resolveWrite = resolve
    })
    const operationOrder: string[] = []
    const delayedRepository = {
      ...repository,
      async saveActiveRoomId(targetScope: MemoryScope, backgroundId: string) {
        await writeGate
        operationOrder.push('save')
        await repository.saveActiveRoomId(targetScope, backgroundId)
      },
      async clearScope(targetScope: MemoryScope) {
        operationOrder.push('clear')
        await repository.clearScope(targetScope)
      },
    }
    service = createPersonalWorldService({ repository: delayedRepository })

    const pendingSave = service.saveActiveRoomId(scope, 'bg-room')
    const pendingClear = service.clearScope(scope)
    expect(operationOrder).toEqual([])

    resolveWrite()
    await pendingSave
    await pendingClear

    expect(operationOrder).toEqual(['save', 'clear'])
    expect(await repository.getActiveRoomId(scope)).toBeNull()
  })

  it('waits for active room writes before clearing their owner', async () => {
    let resolveWrite: () => void = () => {}
    const writeGate = new Promise<void>((resolve) => {
      resolveWrite = resolve
    })
    const operationOrder: string[] = []
    const delayedRepository = {
      ...repository,
      async saveActiveRoomId(targetScope: MemoryScope, backgroundId: string) {
        await writeGate
        operationOrder.push('save')
        await repository.saveActiveRoomId(targetScope, backgroundId)
      },
      async clearOwner(ownerId: string) {
        operationOrder.push('clear-owner')
        await repository.clearOwner(ownerId)
      },
    }
    service = createPersonalWorldService({ repository: delayedRepository })

    const pendingSave = service.saveActiveRoomId(scope, 'bg-room')
    const pendingClear = service.clearOwner(scope.ownerId)
    expect(operationOrder).toEqual([])

    resolveWrite()
    await pendingSave
    await pendingClear

    expect(operationOrder).toEqual(['save', 'clear-owner'])
    expect(await repository.getActiveRoomId(scope)).toBeNull()
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

  it('remembers the first project completion as one neutral application experience', async () => {
    const rememberExperience = vi.fn(async () => undefined)
    service = createPersonalWorldService({
      repository,
      now: () => 30,
      createId: () => 'manual-1',
      rememberExperience,
    })
    const project = await service.createProject(scope, {
      title: 'Rain sketches',
      description: 'Create a small visual series from rainy evenings.',
    })

    await service.updateProject(scope, project.id, { status: 'completed' })
    await service.updateProject(scope, project.id, { title: 'Finished rain sketches' })

    expect(rememberExperience).toHaveBeenCalledTimes(1)
    expect(rememberExperience).toHaveBeenCalledWith({
      idempotencyKey: 'personal-world-project-completed:project:manual-1',
      scope,
      content: [
        'Creative project completed: "Rain sketches"',
        'Project description: "Create a small visual series from rainy evenings."',
      ].join('\n'),
      occurredAt: 30,
      source: {
        eventName: 'personal-world-project-completed',
        eventId: 'project:manual-1',
      },
      metadata: {
        personalWorldProjectId: 'project:manual-1',
        personalWorldProjectTitle: 'Rain sketches',
        personalWorldProjectDescription: 'Create a small visual series from rainy evenings.',
      },
    })
    expect(await repository.getProject(scope, project.id)).toMatchObject({
      status: 'completed',
      completedAt: 30,
    })
  })

  it('does not commit project completion when durable experience storage fails', async () => {
    const rememberExperience = vi.fn()
      .mockRejectedValueOnce(new Error('Memory write failed.'))
      .mockResolvedValue(undefined)
    service = createPersonalWorldService({
      repository,
      now: () => 30,
      createId: () => 'manual-1',
      rememberExperience,
    })
    const project = await service.createProject(scope, {
      title: 'Rain sketches',
      description: 'Create a small visual series from rainy evenings.',
    })

    await expect(service.updateProject(scope, project.id, { status: 'completed' }))
      .rejects
      .toThrow('Memory write failed')
    const persistedAfterFailure = await repository.getProject(scope, project.id)
    expect(persistedAfterFailure?.status).toBe('idea')
    expect(persistedAfterFailure?.completedAt).toBeUndefined()

    await service.updateProject(scope, project.id, { status: 'completed' })
    expect(rememberExperience).toHaveBeenCalledTimes(2)
    expect(await repository.getProject(scope, project.id)).toMatchObject({
      status: 'completed',
      completedAt: 30,
    })
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
