import type { PersonalWorldEntry, PersonalWorldProject } from '@proj-airi/companion-core'
import type { MemoryScope } from '@proj-airi/memory'
import type { Storage, StorageValue } from 'unstorage'

import { PERSONAL_WORLD_PROJECT_CREATION_LIMIT } from '@proj-airi/companion-core'

import { storage } from '../storage'
import { getStorageKeysUnderPrefix } from '../storage-keys'

const PERSONAL_WORLD_PREFIX = 'local:personal-world/v1'

function encodeKeyPart(value: string) {
  return encodeURIComponent(value)
}

function ownerPrefix(ownerId: string) {
  return `${PERSONAL_WORLD_PREFIX}/${encodeKeyPart(ownerId)}/`
}

function scopePrefix(scope: MemoryScope) {
  return `${ownerPrefix(scope.ownerId)}${encodeKeyPart(scope.characterId)}/`
}

function entryPrefix(scope: MemoryScope) {
  return `${scopePrefix(scope)}entries/`
}

function projectPrefix(scope: MemoryScope) {
  return `${scopePrefix(scope)}projects/`
}

function entryKey(entry: Pick<PersonalWorldEntry, 'id' | 'scope'>) {
  return `${entryPrefix(entry.scope)}${encodeKeyPart(entry.id)}`
}

function projectKey(project: Pick<PersonalWorldProject, 'id' | 'scope'>) {
  return `${projectPrefix(project.scope)}${encodeKeyPart(project.id)}`
}

function belongsToScope(record: { scope: MemoryScope }, scope: MemoryScope) {
  return record.scope.ownerId === scope.ownerId
    && record.scope.characterId === scope.characterId
}

function isPersonalWorldProject(value: unknown): value is PersonalWorldProject {
  if (!value || typeof value !== 'object')
    return false

  const candidate = value as Partial<PersonalWorldProject>
  const creationIds = candidate.creationIds
  const hasValidCreationIds = Array.isArray(creationIds)
    && creationIds.length <= PERSONAL_WORLD_PROJECT_CREATION_LIMIT
    && creationIds.every(id => typeof id === 'string' && id.trim() === id && id.length > 0)
    && new Set(creationIds).size === creationIds.length
  const hasValidTimes = Number.isFinite(candidate.createdAt)
    && Number.isFinite(candidate.updatedAt)
    && (candidate.completedAt === undefined || Number.isFinite(candidate.completedAt))
  const hasConsistentCompletion = candidate.status === 'completed'
    ? typeof candidate.completedAt === 'number'
    : candidate.completedAt === undefined
  return candidate.schemaVersion === 1
    && typeof candidate.id === 'string'
    && typeof candidate.scope?.ownerId === 'string'
    && typeof candidate.scope?.characterId === 'string'
    && typeof candidate.title === 'string'
    && typeof candidate.description === 'string'
    && ['idea', 'active', 'completed'].includes(candidate.status ?? '')
    && hasValidCreationIds
    && hasValidTimes
    && hasConsistentCompletion
}

function isPersonalWorldEntry(value: unknown): value is PersonalWorldEntry {
  if (!value || typeof value !== 'object')
    return false

  const candidate = value as Partial<PersonalWorldEntry>
  return candidate.schemaVersion === 1
    && typeof candidate.id === 'string'
    && typeof candidate.scope?.ownerId === 'string'
    && typeof candidate.scope?.characterId === 'string'
    && ['journal', 'learned', 'favorite'].includes(candidate.kind ?? '')
    && typeof candidate.title === 'string'
    && typeof candidate.content === 'string'
    && typeof candidate.source?.type === 'string'
    && typeof candidate.createdAt === 'number'
    && typeof candidate.updatedAt === 'number'
}

/** Persistence boundary for scoped Personal World entries. */
export interface PersonalWorldRepository {
  get: (scope: MemoryScope, id: string) => Promise<PersonalWorldEntry | null>
  save: (entry: PersonalWorldEntry) => Promise<void>
  list: (scope: MemoryScope) => Promise<PersonalWorldEntry[]>
  remove: (scope: MemoryScope, id: string) => Promise<void>
  getProject: (scope: MemoryScope, id: string) => Promise<PersonalWorldProject | null>
  saveProject: (project: PersonalWorldProject) => Promise<void>
  listProjects: (scope: MemoryScope) => Promise<PersonalWorldProject[]>
  removeProject: (scope: MemoryScope, id: string) => Promise<void>
  clearScope: (scope: MemoryScope) => Promise<void>
  clearOwner: (ownerId: string) => Promise<void>
}

/** Creates a Personal World repository over an unstorage-compatible boundary. */
export function createPersonalWorldRepository(
  worldStorage: Storage<StorageValue>,
): PersonalWorldRepository {
  async function readEntry(key: string) {
    const value = await worldStorage.getItemRaw<unknown>(key)
    return isPersonalWorldEntry(value) ? value : null
  }

  async function readProject(key: string) {
    const value = await worldStorage.getItemRaw<unknown>(key)
    return isPersonalWorldProject(value) ? value : null
  }

  async function removeKeys(prefix: string) {
    const keys = await getStorageKeysUnderPrefix(worldStorage, prefix)
    await Promise.all(keys.map(key => worldStorage.removeItem(key)))
  }

  return {
    async get(scope, id) {
      const entry = await readEntry(entryKey({ scope, id }))
      return entry && belongsToScope(entry, scope) ? entry : null
    },

    async save(entry) {
      await worldStorage.setItemRaw(entryKey(entry), entry)
    },

    async list(scope) {
      const keys = await getStorageKeysUnderPrefix(worldStorage, entryPrefix(scope))
      const entries = await Promise.all(keys.map(readEntry))
      return entries
        .filter((entry): entry is PersonalWorldEntry => entry !== null && belongsToScope(entry, scope))
        .sort((left, right) => right.createdAt - left.createdAt || left.id.localeCompare(right.id))
    },

    async remove(scope, id) {
      await worldStorage.removeItem(entryKey({ scope, id }))
    },

    async getProject(scope, id) {
      const project = await readProject(projectKey({ scope, id }))
      return project && belongsToScope(project, scope) ? project : null
    },

    async saveProject(project) {
      await worldStorage.setItemRaw(projectKey(project), project)
    },

    async listProjects(scope) {
      const keys = await getStorageKeysUnderPrefix(worldStorage, projectPrefix(scope))
      const projects = await Promise.all(keys.map(readProject))
      return projects
        .filter((project): project is PersonalWorldProject => project !== null && belongsToScope(project, scope))
        .sort((left, right) => right.updatedAt - left.updatedAt || left.id.localeCompare(right.id))
    },

    async removeProject(scope, id) {
      await worldStorage.removeItem(projectKey({ scope, id }))
    },

    async clearScope(scope) {
      await removeKeys(scopePrefix(scope))
    },

    async clearOwner(ownerId) {
      await removeKeys(ownerPrefix(ownerId))
    },
  }
}

export const personalWorldRepo = createPersonalWorldRepository(storage)
