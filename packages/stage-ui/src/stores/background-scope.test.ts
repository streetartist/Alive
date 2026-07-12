import { describe, expect, it } from 'vitest'

import {
  canManageBackgroundInScope,
  isBackgroundVisibleToScope,
  migrateBackgroundEntry,
} from './background-scope'

const ownerA = { ownerId: 'owner-a', characterId: 'character' }
const ownerB = { ownerId: 'owner-b', characterId: 'character' }

function legacyEntry(overrides: Record<string, unknown> = {}) {
  return {
    id: 'legacy-id',
    type: 'journal',
    characterId: 'character',
    title: 'Legacy creation',
    blob: new Blob(['image']),
    createdAt: 1,
    ...overrides,
  }
}

describe('background owner isolation', () => {
  it('migrates legacy user assets to the current owner without changing the storage ID', () => {
    const result = migrateBackgroundEntry(legacyEntry(), 'bg-stable-id', ownerA)

    expect(result?.changed).toBe(true)
    expect(result?.entry).toMatchObject({
      schemaVersion: 2,
      id: 'bg-stable-id',
      ownerId: 'owner-a',
      characterId: 'character',
    })
  })

  it('assigns legacy shared scenes to the current character', () => {
    expect(migrateBackgroundEntry(legacyEntry({ type: 'scene', characterId: null }), 'bg-room', ownerA)?.entry).toMatchObject({
      ownerId: 'owner-a',
      characterId: 'character',
    })
  })

  it('keeps builtins global and immutable', () => {
    const builtin = migrateBackgroundEntry(legacyEntry({ type: 'builtin', characterId: null }), 'builtin:room', ownerA)?.entry

    expect(builtin).toMatchObject({ ownerId: null, characterId: null })
    expect(builtin && isBackgroundVisibleToScope(builtin, ownerB)).toBe(true)
    expect(builtin && canManageBackgroundInScope(builtin, ownerA)).toBe(false)
  })

  it('preserves existing v2 ownership when another owner initializes the store', () => {
    const persisted = {
      ...legacyEntry(),
      schemaVersion: 2,
      ownerId: 'owner-a',
    }
    const result = migrateBackgroundEntry(persisted, 'bg-stable-id', ownerB)

    expect(result?.changed).toBe(true)
    expect(result?.entry.ownerId).toBe('owner-a')
  })

  it('isolates user assets by both owner and character', () => {
    const entry = migrateBackgroundEntry(legacyEntry(), 'bg-creation', ownerA)?.entry
    expect(entry).toBeDefined()
    if (!entry)
      return

    expect(isBackgroundVisibleToScope(entry, ownerA)).toBe(true)
    expect(isBackgroundVisibleToScope(entry, ownerB)).toBe(false)
    expect(isBackgroundVisibleToScope(entry, { ownerId: 'owner-a', characterId: 'other-character' })).toBe(false)
    expect(canManageBackgroundInScope(entry, ownerA)).toBe(true)
  })

  it('rejects malformed persisted assets', () => {
    expect(migrateBackgroundEntry({ ...legacyEntry(), blob: 'not-a-blob' }, 'bg-invalid', ownerA)).toBeUndefined()
  })
})
