import type { MemoryRecord, MemoryScope, MemorySource } from '@proj-airi/memory'
import type { Storage, StorageValue } from 'unstorage'

import { storage } from '../storage'
import { getStorageKeysUnderPrefix } from '../storage-keys'

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

type MemoryRecordV1 = Omit<MemoryRecord, 'emotionalWeight' | 'importance' | 'kind' | 'schemaVersion'> & {
  schemaVersion: 1
  kind: 'episodic' | 'semantic' | 'seed'
}

function hasMemorySource(value: unknown): value is MemorySource {
  if (!value || typeof value !== 'object')
    return false

  const source = value as Partial<MemorySource>
  if (source.type === 'chat-turn') {
    return typeof source.sessionId === 'string'
      && typeof source.turnId === 'string'
      && Array.isArray(source.messageIds)
      && source.messageIds.length === 2
      && source.messageIds.every(messageId => typeof messageId === 'string')
  }
  if (source.type === 'character-book')
    return typeof source.cardId === 'string' && typeof source.entryId === 'string'
  if (source.type === 'system-event')
    return typeof source.eventName === 'string' && typeof source.eventId === 'string'
  return false
}

function hasMemoryRecordFields(value: unknown): value is MemoryRecord | MemoryRecordV1 {
  if (!value || typeof value !== 'object')
    return false

  const candidate = value as Partial<MemoryRecord | MemoryRecordV1>
  return typeof candidate.id === 'string'
    && candidate.id.length > 0
    && typeof candidate.content === 'string'
    && typeof candidate.scope?.ownerId === 'string'
    && typeof candidate.scope?.characterId === 'string'
    && hasMemorySource(candidate.source)
    && Number.isFinite(candidate.createdAt)
    && Number.isFinite(candidate.updatedAt)
    && (candidate.lastAccessedAt === undefined || Number.isFinite(candidate.lastAccessedAt))
    && typeof candidate.accessCount === 'number'
    && Number.isFinite(candidate.accessCount)
    && Number.isInteger(candidate.accessCount)
    && candidate.accessCount >= 0
    && (
      candidate.metadata === undefined
      || (
        typeof candidate.metadata === 'object'
        && candidate.metadata !== null
        && !Array.isArray(candidate.metadata)
      )
    )
}

/** Parses current or migratable persisted memory into the current record contract. */
export function parseMemoryRecord(value: unknown): MemoryRecord | null {
  if (!hasMemoryRecordFields(value))
    return null

  if (value.schemaVersion === 1) {
    if (!['episodic', 'semantic', 'seed'].includes(value.kind))
      return null
    return {
      ...value,
      schemaVersion: 2,
      kind: value.kind === 'episodic' ? 'experience' : 'fact',
      importance: 0.5,
      emotionalWeight: 0,
    }
  }

  if (value.schemaVersion !== 2)
    return null

  return ['fact', 'experience', 'emotion', 'milestone'].includes(value.kind)
    && Number.isFinite(value.importance)
    && value.importance >= 0
    && value.importance <= 1
    && Number.isFinite(value.emotionalWeight)
    && value.emotionalWeight >= -1
    && value.emotionalWeight <= 1
    ? value
    : null
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
    const record = parseMemoryRecord(value)
    if (record && hasMemoryRecordFields(value) && value.schemaVersion === 1)
      await memoryStorage.setItemRaw(key, record)
    return record
  }

  async function removeKeys(prefix: string) {
    const keys = await getStorageKeysUnderPrefix(memoryStorage, prefix)
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
      const keys = await getStorageKeysUnderPrefix(memoryStorage, scopePrefix(scope))
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
