/** Scope that owns one user-created background asset. */
export interface BackgroundScope {
  ownerId: string
  characterId: string
}

/** Persisted background and creation asset after owner-isolation migration. */
export interface BackgroundEntry {
  schemaVersion: 2
  id: string
  type: 'builtin' | 'scene' | 'journal' | 'selfie'
  /** Null only for application-owned builtins. */
  ownerId: string | null
  /** Null only for application-owned builtins. */
  characterId: string | null
  title: string
  blob: Blob
  url?: string
  prompt?: string
  remixId?: string
  createdAt: number
}

/** Result of normalizing a persisted background value under its authoritative storage key. */
export interface BackgroundEntryMigrationResult {
  entry: BackgroundEntry
  /** The normalized value must be written back once without changing its key or ID. */
  changed: boolean
}

function isBackgroundType(value: unknown): value is BackgroundEntry['type'] {
  return value === 'builtin' || value === 'scene' || value === 'journal' || value === 'selfie'
}

/**
 * Migrates one persisted background while preserving its storage key and ID.
 *
 * Legacy user assets have no recoverable owner. They are assigned to the user
 * who first opens the v2 store, while legacy shared scenes are assigned to that
 * user's active character. Existing v2 ownership is never reassigned.
 */
export function migrateBackgroundEntry(
  value: unknown,
  storageId: string,
  currentScope: BackgroundScope,
): BackgroundEntryMigrationResult | undefined {
  if (!value || typeof value !== 'object')
    return undefined

  const candidate = value as Partial<BackgroundEntry>
  if (!isBackgroundType(candidate.type)
    || typeof candidate.title !== 'string'
    || !(candidate.blob instanceof Blob)
    || typeof candidate.createdAt !== 'number'
    || !Number.isFinite(candidate.createdAt)) {
    return undefined
  }

  const builtin = candidate.type === 'builtin'
  const hasValidV2Scope = candidate.schemaVersion === 2 && (
    builtin
      ? candidate.ownerId === null && candidate.characterId === null
      : typeof candidate.ownerId === 'string'
        && candidate.ownerId.length > 0
        && typeof candidate.characterId === 'string'
        && candidate.characterId.length > 0
  )

  const entry: BackgroundEntry = {
    schemaVersion: 2,
    id: storageId,
    type: candidate.type,
    ownerId: builtin
      ? null
      : hasValidV2Scope
        ? candidate.ownerId as string
        : currentScope.ownerId,
    characterId: builtin
      ? null
      : hasValidV2Scope
        ? candidate.characterId as string
        : typeof candidate.characterId === 'string' && candidate.characterId.length > 0
          ? candidate.characterId
          : currentScope.characterId,
    title: candidate.title,
    blob: candidate.blob,
    url: candidate.url,
    prompt: candidate.prompt,
    remixId: candidate.remixId,
    createdAt: candidate.createdAt,
  }

  return {
    entry,
    changed: !hasValidV2Scope || candidate.id !== storageId,
  }
}

/** Returns whether an asset may be presented inside one owner-and-character scope. */
export function isBackgroundVisibleToScope(entry: BackgroundEntry, scope: BackgroundScope) {
  if (entry.type === 'builtin')
    return entry.ownerId === null && entry.characterId === null

  return entry.ownerId === scope.ownerId && entry.characterId === scope.characterId
}

/** Returns whether one scope may mutate a user-created asset. Builtins are immutable. */
export function canManageBackgroundInScope(entry: BackgroundEntry, scope: BackgroundScope) {
  return entry.type !== 'builtin' && isBackgroundVisibleToScope(entry, scope)
}
