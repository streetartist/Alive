import type { MemoryRecord, MemoryScope } from '@proj-airi/memory'
import type { Storage, StorageValue } from 'unstorage'

import { storage } from '../storage'

const MEMORY_RECORDS_PREFIX = 'local:memory/v1'

function encodeKeyPart(value: string) {
  return encodeURIComponent(value)
}

function ownerPrefix(ownerId: string) {
  return `${MEMORY_RECORDS_PREFIX}/${encodeKeyPart(ownerId)}/`
}

function scopePrefix(scope: MemoryScope) {
  return `${ownerPrefix(scope.ownerId)}${encodeKeyPart(scope.characterId)}/records/`
}

function recordKey(scope: MemoryScope, id: string) {
  return `${scopePrefix(scope)}${encodeKeyPart(id)}`
}

function belongsToScope(record: MemoryRecord, scope: MemoryScope) {
  return record.scope.ownerId === scope.ownerId
    && record.scope.characterId === scope.characterId
}

function isMemoryRecord(value: unknown): value is MemoryRecord {
  if (!value || typeof value !== 'object')
    return false

  const candidate = value as Partial<MemoryRecord>
  return candidate.schemaVersion === 1
    && typeof candidate.id === 'string'
    && typeof candidate.content === 'string'
    && typeof candidate.scope?.ownerId === 'string'
    && typeof candidate.scope?.characterId === 'string'
}

/**
 * Persistence operations used by the local memory backend.
 *
 * Every record is stored under a key containing both owner and character.
 * The repository also verifies the scope inside the value so a malformed or
 * manually copied IndexedDB entry cannot cross a memory boundary.
 */
export interface MemoryRepository {
  get: (scope: MemoryScope, id: string) => Promise<MemoryRecord | null>
  save: (record: MemoryRecord) => Promise<void>
  list: (scope: MemoryScope) => Promise<MemoryRecord[]>
  remove: (scope: MemoryScope, id: string) => Promise<void>
  clear: (scope: MemoryScope) => Promise<void>
  clearOwner: (ownerId: string) => Promise<void>
}

/**
 * Creates a scoped repository over an unstorage instance.
 *
 * Supplying storage keeps IndexedDB at the real application boundary while
 * allowing other runtimes and tests to use a compatible driver.
 */
export function createMemoryRepository(memoryStorage: Storage<StorageValue>): MemoryRepository {
  async function readRecord(key: string) {
    const value = await memoryStorage.getItemRaw<unknown>(key)
    return isMemoryRecord(value) ? value : null
  }

  async function removeKeys(prefix: string) {
    const keys = await memoryStorage.getKeys(prefix)
    await Promise.all(keys.map(key => memoryStorage.removeItem(key)))
  }

  return {
    async get(scope, id) {
      const record = await readRecord(recordKey(scope, id))
      return record && belongsToScope(record, scope) ? record : null
    },

    async save(record) {
      await memoryStorage.setItemRaw(recordKey(record.scope, record.id), record)
    },

    async list(scope) {
      const keys = await memoryStorage.getKeys(scopePrefix(scope))
      const records = await Promise.all(keys.map(readRecord))

      return records
        .filter((record): record is MemoryRecord => record !== null && belongsToScope(record, scope))
        .sort((left, right) => right.createdAt - left.createdAt || left.id.localeCompare(right.id))
    },

    async remove(scope, id) {
      await memoryStorage.removeItem(recordKey(scope, id))
    },

    async clear(scope) {
      await removeKeys(scopePrefix(scope))
    },

    async clearOwner(ownerId) {
      await removeKeys(ownerPrefix(ownerId))
    },
  }
}

export const memoriesRepo = createMemoryRepository(storage)
