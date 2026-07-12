import type { CompanionIdentityProfile } from '@proj-airi/companion-core'
import type { MemoryScope } from '@proj-airi/memory'
import type { Storage, StorageValue } from 'unstorage'

import { storage } from '../storage'

const COMPANION_PROFILE_PREFIX = 'local:companion-profile/v1'

function encodeKeyPart(value: string) {
  return encodeURIComponent(value)
}

function ownerPrefix(ownerId: string) {
  return `${COMPANION_PROFILE_PREFIX}/${encodeKeyPart(ownerId)}/`
}

function profileKey(scope: MemoryScope) {
  return `${ownerPrefix(scope.ownerId)}${encodeKeyPart(scope.characterId)}/profile`
}

function belongsToScope(profile: CompanionIdentityProfile, scope: MemoryScope) {
  return profile.scope.ownerId === scope.ownerId
    && profile.scope.characterId === scope.characterId
}

/** Returns whether a persisted value is a current companion identity profile. */
export function isCompanionIdentityProfile(value: unknown): value is CompanionIdentityProfile {
  if (!value || typeof value !== 'object')
    return false

  const candidate = value as Partial<CompanionIdentityProfile>
  return candidate.schemaVersion === 1
    && typeof candidate.scope?.ownerId === 'string'
    && typeof candidate.scope?.characterId === 'string'
    && typeof candidate.birthday === 'string'
    && Number.isFinite(new Date(candidate.birthday).getTime())
    && Array.isArray(candidate.interests)
    && candidate.interests.length <= 20
    && candidate.interests.every(item => typeof item === 'string' && item.length <= 100)
    && Array.isArray(candidate.values)
    && candidate.values.length <= 20
    && candidate.values.every(item => typeof item === 'string' && item.length <= 100)
    && Number.isFinite(candidate.updatedAt)
}

/** Persistence boundary for one identity profile per owner and character. */
export interface CompanionProfileRepository {
  get: (scope: MemoryScope) => Promise<CompanionIdentityProfile | null>
  save: (profile: CompanionIdentityProfile) => Promise<void>
  clear: (scope: MemoryScope) => Promise<void>
  clearOwner: (ownerId: string) => Promise<void>
}

/** Creates a scoped companion profile repository over an unstorage instance. */
export function createCompanionProfileRepository(
  companionStorage: Storage<StorageValue>,
): CompanionProfileRepository {
  return {
    async get(scope) {
      const value = await companionStorage.getItemRaw<unknown>(profileKey(scope))
      if (!isCompanionIdentityProfile(value) || !belongsToScope(value, scope))
        return null
      return value
    },

    async save(profile) {
      await companionStorage.setItemRaw(profileKey(profile.scope), profile)
    },

    async clear(scope) {
      await companionStorage.removeItem(profileKey(scope))
    },

    async clearOwner(ownerId) {
      const keys = await companionStorage.getKeys(ownerPrefix(ownerId))
      await Promise.all(keys.map(key => companionStorage.removeItem(key)))
    },
  }
}

export const companionProfileRepo = createCompanionProfileRepository(storage)
