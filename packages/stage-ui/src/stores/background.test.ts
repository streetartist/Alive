import type { BackgroundEntry } from './background-scope'

import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useBackgroundStore } from './background'

const mocks = vi.hoisted(() => ({
  persisted: new Map<string, unknown>(),
  auth: { userId: 'owner-a' },
  activeRooms: new Map<string, string>(),
  loadedRoomScopes: new Set<string>(),
  loadActiveRoomId: vi.fn(),
  setActiveRoomId: vi.fn(),
  card: {
    activeCardId: 'character',
    activeCard: {
      extensions: {
        airi: {
          modules: {
            activeBackgroundId: undefined as string | undefined,
          },
        },
      },
    },
    updateActiveCardBackground: vi.fn(),
  },
  setItem: vi.fn(),
  removeItem: vi.fn(),
}))

vi.mock('localforage', () => ({
  default: {
    async iterate(callback: (value: unknown, key: string) => void) {
      for (const [key, value] of mocks.persisted)
        callback(value, key)
    },
    async setItem(key: string, value: unknown) {
      mocks.setItem(key, value)
      mocks.persisted.set(key, value)
      return value
    },
    async removeItem(key: string) {
      mocks.removeItem(key)
      mocks.persisted.delete(key)
    },
  },
}))

vi.mock('./auth', () => ({
  useAuthStore: () => mocks.auth,
}))

vi.mock('./modules/airi-card', () => ({
  useAiriCardStore: () => mocks.card,
}))

vi.mock('./modules/personal-world', () => ({
  usePersonalWorldStore: () => ({
    getActiveRoomId: (scope: { ownerId: string, characterId: string }) => (
      mocks.activeRooms.get(JSON.stringify([scope.ownerId, scope.characterId]))
    ),
    hasLoadedActiveRoom: (scope: { ownerId: string, characterId: string }) => (
      mocks.loadedRoomScopes.has(JSON.stringify([scope.ownerId, scope.characterId]))
    ),
    loadActiveRoomId: async (scope: { ownerId: string, characterId: string }) => {
      const loadedId = await mocks.loadActiveRoomId(scope)
      const key = JSON.stringify([scope.ownerId, scope.characterId])
      mocks.loadedRoomScopes.add(key)
      if (typeof loadedId === 'string')
        mocks.activeRooms.set(key, loadedId)
      return mocks.activeRooms.get(key) ?? null
    },
    setActiveRoomId: async (scope: { ownerId: string, characterId: string }, id?: string) => {
      mocks.setActiveRoomId(scope, id)
      const key = JSON.stringify([scope.ownerId, scope.characterId])
      mocks.loadedRoomScopes.add(key)
      mocks.activeRooms.set(key, id ?? 'none')
    },
  }),
}))

function entry(input: Partial<BackgroundEntry> & Pick<BackgroundEntry, 'id' | 'type'>): BackgroundEntry {
  const builtin = input.type === 'builtin'
  return {
    schemaVersion: 2,
    ownerId: builtin ? null : 'owner-a',
    characterId: builtin ? null : 'character',
    title: input.id,
    blob: new Blob([input.id]),
    createdAt: 1,
    ...input,
  }
}

describe('background store owner isolation', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    mocks.persisted.clear()
    mocks.activeRooms.clear()
    mocks.loadedRoomScopes.clear()
    mocks.loadActiveRoomId.mockReset()
    mocks.loadActiveRoomId.mockResolvedValue(null)
    mocks.setActiveRoomId.mockClear()
    mocks.setItem.mockClear()
    mocks.removeItem.mockClear()
    mocks.card.updateActiveCardBackground.mockClear()
    mocks.card.activeCard.extensions.airi.modules.activeBackgroundId = undefined

    const firstBuiltin = entry({ id: 'builtin:cozy-tea-corner', type: 'builtin' })
    const secondBuiltin = entry({ id: 'builtin:cute-streaming-room', type: 'builtin' })
    mocks.persisted.set(firstBuiltin.id, firstBuiltin)
    mocks.persisted.set(secondBuiltin.id, secondBuiltin)
  })

  it('writes legacy user assets back as scoped v2 without changing their ID', async () => {
    // ROOT CAUSE:
    //
    // Background v1 stored only characterId, so two signed-in owners using the
    // same character ID received the same journal and room assets.
    //
    // The v2 load path assigns unresolved legacy ownership once and writes the
    // normalized record back under the original localforage key.
    mocks.persisted.set('bg-legacy-room', {
      id: 'different-value-id',
      type: 'scene',
      characterId: null,
      title: 'Legacy room',
      blob: new Blob(['room']),
      createdAt: 2,
    })

    const store = useBackgroundStore()
    await store.initializeStore()

    expect(mocks.persisted.get('bg-legacy-room')).toMatchObject({
      schemaVersion: 2,
      id: 'bg-legacy-room',
      ownerId: 'owner-a',
      characterId: 'character',
    })
    expect(mocks.setItem).toHaveBeenCalledWith('bg-legacy-room', expect.objectContaining({ id: 'bg-legacy-room' }))
  })

  it('gates selectors, URL access, and deletion by owner and character', async () => {
    const visible = entry({ id: 'bg-visible', type: 'journal' })
    const otherOwner = entry({ id: 'bg-other-owner', type: 'journal', ownerId: 'owner-b' })
    const otherCharacter = entry({ id: 'bg-other-character', type: 'scene', characterId: 'other-character' })
    mocks.persisted.set(visible.id, visible)
    mocks.persisted.set(otherOwner.id, otherOwner)
    mocks.persisted.set(otherCharacter.id, otherCharacter)

    const store = useBackgroundStore()
    await store.initializeStore()

    expect(store.getCharacterBackgrounds('character').map(item => item.id)).toEqual([
      'builtin:cozy-tea-corner',
      'builtin:cute-streaming-room',
      'bg-visible',
    ])
    expect(store.getBackgroundUrl('bg-visible', 'character')).toMatch(/^blob:/)
    expect(store.getBackgroundUrl('bg-other-owner', 'character')).toBeNull()
    expect(store.getBackgroundUrl('bg-other-character', 'character')).toBeNull()
    await expect(store.removeBackground('bg-other-owner', { ownerId: 'owner-a', characterId: 'character' })).rejects.toThrow('unavailable')
    expect(mocks.persisted.has('bg-other-owner')).toBe(true)
  })

  it('prefers the scoped Personal World room and treats explicit none as suppressing the card fallback', async () => {
    const authored = entry({ id: 'bg-authored', type: 'scene' })
    const selected = entry({ id: 'bg-selected', type: 'scene' })
    mocks.persisted.set(authored.id, authored)
    mocks.persisted.set(selected.id, selected)
    mocks.card.activeCard.extensions.airi.modules.activeBackgroundId = authored.id
    mocks.activeRooms.set(JSON.stringify(['owner-a', 'character']), selected.id)

    const store = useBackgroundStore()
    await store.initializeStore()

    expect(store.activeBackgroundId).toBe(selected.id)
    expect(store.activeBackgroundUrl).toMatch(/^blob:/)

    await store.setActiveBackground()
    setActivePinia(createPinia())
    const clearedStore = useBackgroundStore()
    await clearedStore.initializeStore()
    expect(clearedStore.activeBackgroundId).toBe('none')
    expect(clearedStore.activeBackgroundUrl).toBeNull()
    expect(mocks.card.activeCard.extensions.airi.modules.activeBackgroundId).toBe(authored.id)
  })

  it('uses the character-authored room only when the scope has no Personal World override', async () => {
    const authored = entry({ id: 'bg-authored', type: 'scene' })
    mocks.persisted.set(authored.id, authored)
    mocks.card.activeCard.extensions.airi.modules.activeBackgroundId = authored.id

    const store = useBackgroundStore()
    await store.initializeStore()

    expect(store.activeBackgroundId).toBe(authored.id)
    expect(store.activeBackgroundUrl).toMatch(/^blob:/)
  })

  it('does not flash the character-authored fallback before the scoped room lookup completes', async () => {
    let resolveRoom: (value: string | null) => void = () => {}
    const roomLoad = new Promise<string | null>((resolve) => {
      resolveRoom = resolve
    })
    mocks.loadActiveRoomId.mockReturnValue(roomLoad)
    const authored = entry({ id: 'bg-authored', type: 'scene' })
    mocks.persisted.set(authored.id, authored)
    mocks.card.activeCard.extensions.airi.modules.activeBackgroundId = authored.id

    const store = useBackgroundStore()
    expect(store.activeBackgroundId).toBeUndefined()
    expect(store.activeBackgroundUrl).toBeNull()

    resolveRoom(null)
    await roomLoad
    await vi.waitFor(() => expect(mocks.loadedRoomScopes.size).toBe(1))
    setActivePinia(createPinia())
    const loadedStore = useBackgroundStore()
    expect(loadedStore.activeBackgroundId).toBe(authored.id)
  })

  it('clears an active owned background and removes only the selected owner data', async () => {
    const ownerScene = entry({ id: 'bg-owner-scene', type: 'scene' })
    const ownerJournal = entry({ id: 'bg-owner-journal', type: 'journal' })
    const otherOwner = entry({ id: 'bg-other-owner', type: 'journal', ownerId: 'owner-b' })
    mocks.persisted.set(ownerScene.id, ownerScene)
    mocks.persisted.set(ownerJournal.id, ownerJournal)
    mocks.persisted.set(otherOwner.id, otherOwner)
    mocks.card.activeCard.extensions.airi.modules.activeBackgroundId = ownerScene.id
    mocks.activeRooms.set(JSON.stringify(['owner-a', 'character']), ownerScene.id)

    const store = useBackgroundStore()
    await store.initializeStore()
    await store.removeBackground(ownerScene.id, { ownerId: 'owner-a', characterId: 'character' })

    expect(mocks.card.updateActiveCardBackground).not.toHaveBeenCalled()
    expect(mocks.card.activeCard.extensions.airi.modules.activeBackgroundId).toBe(ownerScene.id)
    expect(mocks.setActiveRoomId).toHaveBeenCalledWith({ ownerId: 'owner-a', characterId: 'character' }, undefined)

    await store.clearOwner('owner-a')
    expect(mocks.persisted.has(ownerJournal.id)).toBe(false)
    expect(mocks.persisted.has(otherOwner.id)).toBe(true)
    expect(mocks.persisted.has('builtin:cozy-tea-corner')).toBe(true)
  })
})
