import type {
  CompanionIdentityProfile,
  CompanionState,
  PersonalWorldEntry,
  PersonalWorldProject,
} from '@proj-airi/companion-core'
import type { MemoryRecord, MemoryScope } from '@proj-airi/memory'
import type { Storage, StorageValue } from 'unstorage'

import memoryDriver from 'unstorage/drivers/memory'

import {
  createCompanionIdentityProfile,
  createCompanionState,
  createPersonalWorldEntry,
  createPersonalWorldProject,
} from '@proj-airi/companion-core'
import { createStorage } from 'unstorage'
import { beforeEach, describe, expect, it } from 'vitest'

import { createCompanionProfileRepository } from '../database/repos/companion-profile.repo'
import { createCompanionStateRepository } from '../database/repos/companion-state.repo'
import { createMemoryRepository } from '../database/repos/memories.repo'
import { createPersonalWorldRepository } from '../database/repos/personal-world.repo'
import {
  companionDataArchiveFilename,
  createCompanionDataPortabilityService,
  parseCompanionDataArchive,
  serializeCompanionDataArchive,
} from './companionDataPortability'

const scope = { ownerId: 'owner-a', characterId: 'character-a' } satisfies MemoryScope
const siblingScope = { ownerId: 'owner-a', characterId: 'character-b' } satisfies MemoryScope

function makeProfile(targetScope: MemoryScope, interest: string): CompanionIdentityProfile {
  return {
    ...createCompanionIdentityProfile(targetScope, 1, 2),
    interests: [interest],
  }
}

function makeState(targetScope: MemoryScope, interactions: number): CompanionState {
  return {
    ...createCompanionState(targetScope, 1),
    updatedAt: interactions + 1,
    interactionCount: interactions,
    growthPoints: interactions,
    relationshipScore: interactions,
  }
}

function makeMemory(targetScope: MemoryScope, id: string, createdAt: number): MemoryRecord {
  return {
    schemaVersion: 2,
    id,
    scope: { ...targetScope },
    kind: 'experience',
    importance: 0.5,
    emotionalWeight: 0,
    content: `memory:${id}`,
    source: {
      type: 'system-event',
      eventName: 'test',
      eventId: id,
    },
    createdAt,
    updatedAt: createdAt,
    accessCount: 0,
  }
}

function makeEntry(targetScope: MemoryScope, id: string, createdAt: number): PersonalWorldEntry {
  return createPersonalWorldEntry({
    id,
    scope: targetScope,
    kind: 'journal',
    title: id,
    content: `entry:${id}`,
    source: { type: 'manual' },
    now: createdAt,
  })
}

function makeProject(targetScope: MemoryScope, id: string, createdAt: number): PersonalWorldProject {
  return createPersonalWorldProject({
    id,
    scope: targetScope,
    title: id,
    description: `project:${id}`,
    now: createdAt,
  })
}

function createRepositories(storage: Storage<StorageValue>) {
  return {
    profile: createCompanionProfileRepository(storage),
    state: createCompanionStateRepository(storage),
    memories: createMemoryRepository(storage),
    personalWorld: createPersonalWorldRepository(storage),
  }
}

function archiveContent(archive: Awaited<ReturnType<ReturnType<typeof createCompanionDataPortabilityService>['exportScope']>>) {
  return {
    scope: archive.scope,
    data: archive.data,
  }
}

describe('companion data portability', () => {
  let storage: Storage<StorageValue>
  let repositories: ReturnType<typeof createRepositories>

  beforeEach(() => {
    storage = createStorage({ driver: memoryDriver() })
    repositories = createRepositories(storage)
  })

  it('exports only one scope without creating missing companion defaults', async () => {
    await repositories.profile.save(makeProfile(scope, 'drawing'))
    await repositories.state.save(makeState(scope, 3))
    await repositories.memories.save(makeMemory(scope, 'memory-a', 3))
    await repositories.personalWorld.save(makeEntry(scope, 'entry-a', 4))
    await repositories.personalWorld.saveProject(makeProject(scope, 'project-a', 5))
    await repositories.personalWorld.saveActiveRoomId(scope, 'bg-room-a')
    await repositories.memories.save(makeMemory(siblingScope, 'sibling-memory', 6))
    const service = createCompanionDataPortabilityService({
      repositories,
      now: () => 100,
    })

    const archive = await service.exportScope(scope)
    const emptyArchive = await service.exportScope({ ownerId: 'owner-b', characterId: 'character-c' })

    expect(archive.kind).toBe('airi-companion-data')
    expect(archive.schemaVersion).toBe(2)
    expect(archive.exportedAt).toBe(100)
    expect(archive.scope).toEqual(scope)
    expect(archive.data.profile?.interests).toEqual(['drawing'])
    expect(archive.data.state?.interactionCount).toBe(3)
    expect(archive.data.memories.map(record => record.id)).toEqual(['memory-a'])
    expect(archive.data.personalWorld.activeRoomId).toBe('bg-room-a')
    expect(archive.data.personalWorld.entries.map(entry => entry.id)).toEqual(['entry-a'])
    expect(archive.data.personalWorld.projects.map(project => project.id)).toEqual(['project-a'])
    expect(emptyArchive.data.profile).toBeNull()
    expect(emptyArchive.data.state).toBeNull()
    expect(emptyArchive.data.memories).toEqual([])
    expect(emptyArchive.data.personalWorld.activeRoomId).toBeNull()
    expect(emptyArchive.data.personalWorld.entries).toEqual([])
    expect(emptyArchive.data.personalWorld.projects).toEqual([])
  })

  it('parses JSON while rejecting ownership mismatches and duplicate ids', () => {
    const archive = {
      kind: 'airi-companion-data',
      schemaVersion: 2,
      exportedAt: 10,
      scope,
      data: {
        profile: makeProfile(scope, 'drawing'),
        state: makeState(scope, 1),
        memories: [makeMemory(scope, 'memory-a', 1)],
        personalWorld: {
          activeRoomId: 'bg-room-a',
          entries: [makeEntry(scope, 'entry-a', 1)],
          projects: [makeProject(scope, 'project-a', 1)],
        },
      },
    }

    const parsed = parseCompanionDataArchive(JSON.stringify(archive), scope)
    expect(parsed.scope).toEqual(scope)
    expect(JSON.parse(serializeCompanionDataArchive(parsed))).toEqual(parsed)
    expect(companionDataArchiveFilename('ReLU: desktop / companion', Date.UTC(2026, 6, 12, 8, 30)))
      .toBe('airi-companion-ReLU-desktop-companion-2026-07-12T08-30-00-000Z.json')
    expect(() => parseCompanionDataArchive('{', scope)).toThrow('not valid JSON')
    expect(() => parseCompanionDataArchive(archive, siblingScope)).toThrow('another owner or character')
    expect(() => parseCompanionDataArchive({
      ...archive,
      data: {
        ...archive.data,
        memories: [makeMemory(scope, 'memory-a', 1), makeMemory(scope, 'memory-a', 2)],
      },
    }, scope)).toThrow('duplicate memory id')
    expect(() => parseCompanionDataArchive({
      ...archive,
      data: {
        ...archive.data,
        personalWorld: {
          ...archive.data.personalWorld,
          projects: [makeProject(siblingScope, 'project-a', 1)],
        },
      },
    }, scope)).toThrow('another owner or character')
    expect(() => parseCompanionDataArchive({
      ...archive,
      data: {
        ...archive.data,
        state: {
          ...archive.data.state,
          personality: {
            ...archive.data.state.personality,
            curiosity: 2,
          },
        },
      },
    }, scope)).toThrow('invalid relationship state')
    expect(() => parseCompanionDataArchive({
      ...archive,
      data: {
        ...archive.data,
        personalWorld: {
          ...archive.data.personalWorld,
          activeRoomId: '',
        },
      },
    }, scope)).toThrow('invalid Personal World active room reference')
  })

  it('replaces one scope idempotently while preserving sibling data', async () => {
    await repositories.profile.save(makeProfile(scope, 'old'))
    await repositories.state.save(makeState(scope, 1))
    await repositories.memories.save(makeMemory(scope, 'old-memory', 1))
    await repositories.personalWorld.save(makeEntry(scope, 'old-entry', 1))
    await repositories.personalWorld.saveProject(makeProject(scope, 'old-project', 1))
    await repositories.profile.save(makeProfile(siblingScope, 'sibling'))
    await repositories.memories.save(makeMemory(siblingScope, 'sibling-memory', 1))
    const service = createCompanionDataPortabilityService({ repositories, now: () => 50 })
    const archive = {
      kind: 'airi-companion-data',
      schemaVersion: 2,
      exportedAt: 20,
      scope,
      data: {
        profile: makeProfile(scope, 'new'),
        state: makeState(scope, 8),
        memories: [makeMemory(scope, 'new-memory', 2)],
        personalWorld: {
          activeRoomId: 'bg-new-room',
          entries: [makeEntry(scope, 'new-entry', 2)],
          projects: [makeProject(scope, 'new-project', 2)],
        },
      },
    } as const

    const firstSummary = await service.importScope(scope, archive)
    const firstSnapshot = archiveContent(await service.exportScope(scope))
    const secondSummary = await service.importScope(scope, archive)
    const secondSnapshot = archiveContent(await service.exportScope(scope))

    expect(firstSummary).toEqual({
      profile: 1,
      state: 1,
      memories: 1,
      personalWorldEntries: 1,
      personalWorldProjects: 1,
    })
    expect(secondSummary).toEqual(firstSummary)
    expect(secondSnapshot).toEqual(firstSnapshot)
    expect((await repositories.profile.get(scope))?.interests).toEqual(['new'])
    expect((await repositories.state.get(scope))?.interactionCount).toBe(8)
    expect((await repositories.memories.list(scope)).map(record => record.id)).toEqual(['new-memory'])
    expect((await repositories.personalWorld.list(scope)).map(entry => entry.id)).toEqual(['new-entry'])
    expect((await repositories.personalWorld.listProjects(scope)).map(project => project.id)).toEqual(['new-project'])
    expect(await repositories.personalWorld.getActiveRoomId(scope)).toBe('bg-new-room')
    expect((await repositories.profile.get(siblingScope))?.interests).toEqual(['sibling'])
    expect((await repositories.memories.list(siblingScope)).map(record => record.id)).toEqual(['sibling-memory'])
  })

  it('clears profile and state when an imported archive explicitly omits them', async () => {
    await repositories.profile.save(makeProfile(scope, 'old'))
    await repositories.state.save(makeState(scope, 2))
    const service = createCompanionDataPortabilityService({ repositories })
    const emptyArchive = {
      kind: 'airi-companion-data',
      schemaVersion: 2,
      exportedAt: 20,
      scope,
      data: {
        profile: null,
        state: null,
        memories: [],
        personalWorld: {
          activeRoomId: null,
          entries: [],
          projects: [],
        },
      },
    } as const

    await service.importScope(scope, emptyArchive)

    expect(await repositories.profile.get(scope)).toBeNull()
    expect(await repositories.state.get(scope)).toBeNull()
  })

  it('restores the previous snapshot after a partial import failure', async () => {
    await repositories.profile.save(makeProfile(scope, 'before'))
    await repositories.state.save(makeState(scope, 2))
    await repositories.memories.save(makeMemory(scope, 'before-memory', 1))
    await repositories.personalWorld.save(makeEntry(scope, 'before-entry', 1))
    await repositories.personalWorld.saveProject(makeProject(scope, 'before-project', 1))
    await repositories.personalWorld.saveActiveRoomId(scope, 'bg-before-room')
    let failTargetProjectOnce = true
    const failingRepositories = {
      ...repositories,
      personalWorld: {
        ...repositories.personalWorld,
        async saveProject(project: PersonalWorldProject) {
          if (project.id === 'target-project' && failTargetProjectOnce) {
            failTargetProjectOnce = false
            throw new Error('Project write failed')
          }
          await repositories.personalWorld.saveProject(project)
        },
      },
    }
    const service = createCompanionDataPortabilityService({
      repositories: failingRepositories,
      now: () => 30,
    })
    const before = archiveContent(await service.exportScope(scope))
    const target = {
      kind: 'airi-companion-data',
      schemaVersion: 2,
      exportedAt: 20,
      scope,
      data: {
        profile: makeProfile(scope, 'after'),
        state: makeState(scope, 9),
        memories: [makeMemory(scope, 'target-memory', 2)],
        personalWorld: {
          activeRoomId: 'bg-target-room',
          entries: [makeEntry(scope, 'target-entry', 2)],
          projects: [makeProject(scope, 'target-project', 2)],
        },
      },
    } as const

    await expect(service.importScope(scope, target))
      .rejects
      .toThrow('Project write failed')

    expect(archiveContent(await service.exportScope(scope))).toEqual(before)
  })

  it('clears only companion-owned records in the requested scope', async () => {
    await repositories.profile.save(makeProfile(scope, 'drawing'))
    await repositories.state.save(makeState(scope, 2))
    await repositories.memories.save(makeMemory(scope, 'memory-a', 1))
    await repositories.personalWorld.save(makeEntry(scope, 'entry-a', 1))
    await repositories.personalWorld.saveProject(makeProject(scope, 'project-a', 1))
    await repositories.personalWorld.saveActiveRoomId(scope, 'bg-room-a')
    await repositories.profile.save(makeProfile(siblingScope, 'music'))
    await repositories.memories.save(makeMemory(siblingScope, 'sibling-memory', 1))
    await storage.setItemRaw('local:airi-card/active', { id: 'character-a' })
    await storage.setItemRaw('local:background/v2/asset', { blob: 'untouched' })
    const service = createCompanionDataPortabilityService({ repositories })

    const summary = await service.clearScope(scope)

    expect(summary).toEqual({
      profile: 1,
      state: 1,
      memories: 1,
      personalWorldEntries: 1,
      personalWorldProjects: 1,
    })
    expect(await repositories.profile.get(scope)).toBeNull()
    expect(await repositories.state.get(scope)).toBeNull()
    expect(await repositories.memories.list(scope)).toEqual([])
    expect(await repositories.personalWorld.list(scope)).toEqual([])
    expect(await repositories.personalWorld.listProjects(scope)).toEqual([])
    expect(await repositories.personalWorld.getActiveRoomId(scope)).toBeNull()
    expect((await repositories.profile.get(siblingScope))?.interests).toEqual(['music'])
    expect((await repositories.memories.list(siblingScope)).map(record => record.id)).toEqual(['sibling-memory'])
    expect(await storage.getItemRaw('local:airi-card/active')).toEqual({ id: 'character-a' })
    expect(await storage.getItemRaw('local:background/v2/asset')).toEqual({ blob: 'untouched' })
  })
})
