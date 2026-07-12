import type {
  CompanionReflection,
  PersonalWorldEntry,
  PersonalWorldProject,
  PersonalWorldProjectUpdate,
} from '@proj-airi/companion-core'
import type { MemoryRecord, MemoryScope } from '@proj-airi/memory'

import type { PersonalWorldRepository } from '../../database/repos/personal-world.repo'

import {
  createPersonalWorldEntry,
  createPersonalWorldProject,
  updatePersonalWorldProject,
} from '@proj-airi/companion-core'

import { personalWorldRepo } from '../../database/repos/personal-world.repo'

/** Configuration for device-local Personal World operations. */
export interface PersonalWorldServiceOptions {
  repository?: PersonalWorldRepository
  /** Clock used for manual entries. @default Date.now */
  now?: () => number
  /** Identifier factory used for manually authored entries and projects. @default crypto.randomUUID */
  createId?: () => string
}

/** Device-local operations for one companion's Personal World. */
export interface PersonalWorldService {
  list: (scope: MemoryScope) => Promise<PersonalWorldEntry[]>
  listProjects: (scope: MemoryScope) => Promise<PersonalWorldProject[]>
  addJournal: (scope: MemoryScope, input: { title: string, content: string }) => Promise<PersonalWorldEntry>
  createProject: (scope: MemoryScope, input: {
    title: string
    description: string
    creationIds?: string[]
  }) => Promise<PersonalWorldProject>
  updateProject: (scope: MemoryScope, id: string, update: PersonalWorldProjectUpdate) => Promise<PersonalWorldProject>
  removeProject: (scope: MemoryScope, id: string) => Promise<void>
  captureReflection: (scope: MemoryScope, reflection: CompanionReflection) => Promise<PersonalWorldEntry[]>
  saveFavorite: (scope: MemoryScope, memory: MemoryRecord) => Promise<PersonalWorldEntry>
  clearScope: (scope: MemoryScope) => Promise<void>
  clearOwner: (ownerId: string) => Promise<void>
}

function scopeKey(scope: MemoryScope) {
  return JSON.stringify([scope.ownerId, scope.characterId])
}

function reflectionEntryId(reflectionId: string) {
  return `reflection:${reflectionId}:journal`
}

function learnedEntryId(reflectionId: string, learnedIndex: number) {
  return `reflection:${reflectionId}:learned:${learnedIndex}`
}

function favoriteEntryId(memoryId: string) {
  return `memory:${memoryId}:favorite`
}

/**
 * Creates a Personal World service with serialized writes per owner-and-character scope.
 * Reflection and memory sources use deterministic ids, making repeated capture idempotent.
 */
export function createPersonalWorldService(
  options: PersonalWorldServiceOptions = {},
): PersonalWorldService {
  const repository = options.repository ?? personalWorldRepo
  const now = options.now ?? Date.now
  const createId = options.createId ?? (() => globalThis.crypto.randomUUID())
  const pendingUpdates = new Map<string, Promise<void>>()

  async function updateScope<T>(scope: MemoryScope, update: () => Promise<T>) {
    const key = scopeKey(scope)
    const previous = pendingUpdates.get(key)
    let resolveCompletion: () => void = () => {}
    const completion = new Promise<void>((resolve) => {
      resolveCompletion = resolve
    })
    pendingUpdates.set(key, completion)

    try {
      await previous?.catch(() => undefined)
      return await update()
    }
    finally {
      resolveCompletion()
      if (pendingUpdates.get(key) === completion)
        pendingUpdates.delete(key)
    }
  }

  return {
    async list(scope) {
      return await repository.list(scope)
    },

    async listProjects(scope) {
      return await repository.listProjects(scope)
    },

    async addJournal(scope, input) {
      return await updateScope(scope, async () => {
        const entry = createPersonalWorldEntry({
          id: `manual:${createId()}`,
          scope,
          kind: 'journal',
          title: input.title,
          content: input.content,
          source: { type: 'manual' },
          now: now(),
        })
        await repository.save(entry)
        return entry
      })
    },

    async createProject(scope, input) {
      return await updateScope(scope, async () => {
        const project = createPersonalWorldProject({
          id: `project:${createId()}`,
          scope,
          title: input.title,
          description: input.description,
          creationIds: input.creationIds,
          now: now(),
        })
        await repository.saveProject(project)
        return project
      })
    },

    async updateProject(scope, id, update) {
      return await updateScope(scope, async () => {
        const existing = await repository.getProject(scope, id)
        if (!existing)
          throw new Error('Personal World project was not found in this scope.')

        const project = updatePersonalWorldProject(existing, update, now())
        await repository.saveProject(project)
        return project
      })
    },

    async removeProject(scope, id) {
      await updateScope(scope, async () => repository.removeProject(scope, id))
    },

    async captureReflection(scope, reflection) {
      return await updateScope(scope, async () => {
        const entries = [
          createPersonalWorldEntry({
            id: reflectionEntryId(reflection.id),
            scope,
            kind: 'journal',
            title: 'Reflection',
            content: reflection.summary,
            source: { type: 'reflection', reflectionId: reflection.id },
            now: reflection.createdAt,
          }),
          ...reflection.learned.map((content, learnedIndex) => createPersonalWorldEntry({
            id: learnedEntryId(reflection.id, learnedIndex),
            scope,
            kind: 'learned',
            title: 'Something I learned',
            content,
            source: { type: 'reflection', reflectionId: reflection.id, learnedIndex },
            now: reflection.createdAt,
          })),
        ]

        await Promise.all(entries.map(entry => repository.save(entry)))
        return entries
      })
    },

    async saveFavorite(scope, memory) {
      if (memory.scope.ownerId !== scope.ownerId || memory.scope.characterId !== scope.characterId)
        throw new Error('Favorite memory must belong to the Personal World scope.')

      return await updateScope(scope, async () => {
        const entry = createPersonalWorldEntry({
          id: favoriteEntryId(memory.id),
          scope,
          kind: 'favorite',
          title: 'Favorite moment',
          content: memory.content,
          source: { type: 'memory', memoryId: memory.id },
          now: memory.createdAt,
        })
        await repository.save(entry)
        return entry
      })
    },

    async clearScope(scope) {
      await updateScope(scope, async () => repository.clearScope(scope))
    },

    async clearOwner(ownerId) {
      await repository.clearOwner(ownerId)
    },
  }
}

export const personalWorldService = createPersonalWorldService()
