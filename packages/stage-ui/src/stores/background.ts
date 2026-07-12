import type { BackgroundEntry, BackgroundScope } from './background-scope'

import localforage from 'localforage'

import { useBroadcastChannel } from '@vueuse/core'
import { nanoid } from 'nanoid'
import { defineStore } from 'pinia'
import { computed, onScopeDispose, reactive, ref, watch } from 'vue'

import cozyTeaCornerInPastelHuesUrl from '../assets/backgrounds/cozy-tea-corner-in-pastel-hues.avif'
import cuteStreamingRoomWithPastelDecorUrl from '../assets/backgrounds/cute-streaming-room-with-pastel-decor.avif'

import { useAuthStore } from './auth'
import {
  canManageBackgroundInScope,
  isBackgroundVisibleToScope,
  migrateBackgroundEntry,
} from './background-scope'
import { useAiriCardStore } from './modules/airi-card'

export type { BackgroundEntry } from './background-scope'

const BUILTIN_BACKGROUNDS = [
  {
    id: 'builtin:cozy-tea-corner',
    url: cozyTeaCornerInPastelHuesUrl,
    title: 'Cozy tea corner in pastel hues',
  },
  {
    id: 'builtin:cute-streaming-room',
    url: cuteStreamingRoomWithPastelDecorUrl,
    title: 'Cute streaming room with pastel decor',
  },
]

// NOTICE:
// id is `background-entries` (not `background`) to avoid colliding with
// stage-layouts' `defineStore('background', ...)` — Pinia uses the string id
// as a global singleton key, so two stores with the same id resolve to
// whichever was registered first at runtime (TS cannot detect this since the
// shape is inferred per-module).
// Source: packages/stage-layouts/src/stores/background.ts.
// Removal condition: when this store is merged with stage-layouts' store, or
// the string id collision is enforced at the type level.
export const useBackgroundStore = defineStore('background-entries', () => {
  const STORAGE_PREFIX = 'bg-'
  const authStore = useAuthStore()
  const airiCardStore = useAiriCardStore()

  const entries = ref<Map<string, BackgroundEntry>>(new Map())
  const loading = ref(true)
  let initialization: Promise<void> | undefined

  function scopeFor(characterId = airiCardStore.activeCardId): BackgroundScope {
    return {
      ownerId: authStore.userId,
      characterId,
    }
  }

  // Track object URLs to prevent leaks
  const blobRefs = new Map<string, any>()
  const backgroundUrls = reactive<Record<string, string | null>>({})

  function ensureObjectUrl(id: string, blob: Blob) {
    if (backgroundUrls[id])
      return backgroundUrls[id]

    try {
      const url = URL.createObjectURL(blob)
      backgroundUrls[id] = url
      return url
    }
    catch (e) {
      console.error(`[BackgroundStore] Failed to create ObjectURL for ${id}`, e)
      return null
    }
  }

  onScopeDispose(() => {
    Object.values(backgroundUrls).forEach((url) => {
      if (url)
        URL.revokeObjectURL(url)
    })
    for (const key in backgroundUrls) {
      delete backgroundUrls[key]
    }
  })

  // Helper to fetch an asset as a blob
  async function fetchAssetAsBlob(url: string): Promise<Blob> {
    const res = await fetch(url)
    return await res.blob()
  }

  async function performInitialization() {
    loading.value = true
    try {
      const migrationScope = scopeFor()
      const loadedEntries = new Map<string, BackgroundEntry>()
      const entriesToWriteBack: BackgroundEntry[] = []

      // NOTICE:
      // Legacy entries predate account ownership, so their original owner cannot
      // be reconstructed. The first v2 initialization assigns them to the current
      // owner and assigns legacy shared scenes to the active character.
      // Source/context: BackgroundEntry v1 stored only characterId.
      // Removal condition: after all supported installations have persisted v2.
      await localforage.iterate<unknown, void>((value, key) => {
        if (!key.startsWith(STORAGE_PREFIX) && !key.startsWith('builtin:'))
          return

        const migrated = migrateBackgroundEntry(value, key, migrationScope)
        if (!migrated)
          return

        ensureObjectUrl(key, migrated.entry.blob)
        loadedEntries.set(key, migrated.entry)
        if (migrated.changed)
          entriesToWriteBack.push(migrated.entry)
      })

      // Legacy image-journal keys keep their existing key migration for runtime
      // compatibility, but the newly persisted value is owner-scoped v2.
      const legacyPrefix = 'image-journal-'
      const legacyKeysToDelete: string[] = []
      await localforage.iterate<unknown, void>((value, key) => {
        if (!key.startsWith(legacyPrefix))
          return

        legacyKeysToDelete.push(key)
        const newId = key.replace(legacyPrefix, STORAGE_PREFIX)
        if (loadedEntries.has(newId))
          return

        const legacy = value && typeof value === 'object'
          ? value as Record<string, unknown>
          : {}
        const migrated = migrateBackgroundEntry({
          ...legacy,
          type: 'journal',
          title: typeof legacy.title === 'string' ? legacy.title : 'Migrated Journal Image',
          createdAt: Number.isFinite(legacy.createdAt) ? legacy.createdAt : Date.now(),
        }, newId, migrationScope)
        if (!migrated)
          return

        ensureObjectUrl(newId, migrated.entry.blob)
        loadedEntries.set(newId, migrated.entry)
        entriesToWriteBack.push(migrated.entry)
      })

      await Promise.all(entriesToWriteBack.map(entry => localforage.setItem(entry.id, entry)))
      await Promise.all(legacyKeysToDelete.map(key => localforage.removeItem(key)))

      for (const builtin of BUILTIN_BACKGROUNDS) {
        if (loadedEntries.has(builtin.id))
          continue

        try {
          const blob = await fetchAssetAsBlob(builtin.url)
          const entry: BackgroundEntry = {
            schemaVersion: 2,
            id: builtin.id,
            type: 'builtin',
            ownerId: null,
            characterId: null,
            title: builtin.title,
            blob,
            createdAt: Date.now(),
          }
          ensureObjectUrl(entry.id, blob)
          await localforage.setItem(entry.id, entry)
          loadedEntries.set(entry.id, entry)
        }
        catch (error) {
          console.error('[BackgroundStore] Failed to seed builtin:', builtin.id, error)
        }
      }

      entries.value = loadedEntries

      // Reconciliation: Purge stale URLs from the reactive map and revoke them to prevent leaks.
      Object.keys(backgroundUrls).forEach((id) => {
        if (loadedEntries.has(id))
          return

        const url = backgroundUrls[id]
        if (url)
          URL.revokeObjectURL(url)
        delete backgroundUrls[id]
      })
    }
    catch (error) {
      console.error('[BackgroundStore] Initialization failed:', error)
    }
    finally {
      loading.value = false
    }
  }

  async function initializeStore() {
    if (initialization)
      return await initialization

    initialization = performInitialization()
    try {
      await initialization
    }
    finally {
      initialization = undefined
    }
  }

  // Cross-window synchronization
  const { data: syncSignal, post: broadcastSync } = useBroadcastChannel({ name: 'airi:background-sync' })

  watch(syncSignal, () => {
    initializeStore()
  })

  async function sync() {
    broadcastSync(Date.now())
  }

  // Auto-init once
  initializeStore()

  // Find the active background URL for the current character
  const activeBackgroundUrl = computed(() => {
    if (!airiCardStore.activeCard)
      return null
    const bgId = airiCardStore.activeCard.extensions?.airi?.modules?.activeBackgroundId
    if (!bgId || bgId === 'none') {
      return null
    }

    // Normalize prefix just in case they stored 'image-journal-xyz'
    let lookupId = bgId
    if (bgId.startsWith('image-journal-')) {
      lookupId = bgId.replace('image-journal-', STORAGE_PREFIX)
    }

    const entry = entries.value.get(lookupId)
    if (!entry || !isBackgroundVisibleToScope(entry, scopeFor())) {
      console.warn(`[BackgroundStore] activeBackgroundUrl: Background "${lookupId}" is unavailable in the current owner and character scope.`)
      return null
    }

    return backgroundUrls[lookupId] ?? null
  })

  const getCharacterBackgrounds = computed(() => (characterId?: string) => {
    const scope = scopeFor(characterId)
    const list = Array.from(entries.value.values()).filter((e) => {
      return isBackgroundVisibleToScope(e, scope)
    })
    return list.map(e => ({
      ...e,
      url: backgroundUrls[e.id] ?? null,
    })).sort((a, b) => b.createdAt - a.createdAt)
  })

  // List of available backgrounds for the current character
  const availableBackgrounds = computed(() => {
    return getCharacterBackgrounds.value(airiCardStore.activeCardId)
  })

  const getCharacterJournalEntries = computed(() => (characterId?: string) => {
    const scope = scopeFor(characterId)
    return Array.from(entries.value.values()).filter((e) => {
      return (e.type === 'journal' || e.type === 'selfie') && isBackgroundVisibleToScope(e, scope)
    }).map(e => ({
      ...e,
      url: backgroundUrls[e.id] ?? null,
    })).sort((a, b) => b.createdAt - a.createdAt)
  })

  // The 'journal' store functionality needs to access just the journal entries for the active char
  const journalEntries = computed(() => {
    return getCharacterJournalEntries.value(airiCardStore.activeCardId)
  })

  async function addBackground(
    type: 'scene' | 'journal' | 'selfie',
    blob: Blob,
    title: string,
    prompt?: string,
    characterId?: string,
    remixId?: string,
  ) {
    const id = `${STORAGE_PREFIX}${nanoid()}`
    const resolvedCharacterId = characterId ?? airiCardStore.activeCardId
    if (!resolvedCharacterId)
      throw new Error('User-created backgrounds require an active character.')

    const entry: BackgroundEntry = {
      schemaVersion: 2,
      id,
      type,
      ownerId: authStore.userId,
      characterId: resolvedCharacterId,
      title: title.trim() || 'Untitled Background',
      blob,
      prompt,
      remixId,
      createdAt: Date.now(),
    }

    try {
      await localforage.setItem(id, entry)
      ensureObjectUrl(id, blob)

      const nextEntries = new Map(entries.value)
      nextEntries.set(id, entry)
      entries.value = nextEntries

      await sync()
      return id
    }
    catch (error) {
      console.error('[BackgroundStore] Failed to save entry:', error)
      throw error
    }
  }

  async function removeBackground(id: string, characterId = airiCardStore.activeCardId) {
    const entry = entries.value.get(id)
    if (!entry || !canManageBackgroundInScope(entry, scopeFor(characterId)))
      throw new Error('Background is unavailable in the current owner and character scope.')

    try {
      await localforage.removeItem(id)

      const nextEntries = new Map(entries.value)
      nextEntries.delete(id)
      entries.value = nextEntries

      const blobRef = blobRefs.get(id)
      if (blobRef)
        blobRef.value = undefined
      blobRefs.delete(id)
      const url = backgroundUrls[id]
      if (url) {
        URL.revokeObjectURL(url)
      }
      delete backgroundUrls[id]
      if (airiCardStore.activeCardId === characterId
        && airiCardStore.activeCard?.extensions?.airi?.modules?.activeBackgroundId === id) {
        airiCardStore.updateActiveCardBackground(undefined)
      }
      broadcastSync(Date.now())
    }
    catch (error) {
      console.error('[BackgroundStore] Failed to remove entry:', error)
      throw error
    }
  }

  async function clearOwner(ownerId: string) {
    const ownedEntries = Array.from(entries.value.values()).filter(entry => entry.ownerId === ownerId)
    await Promise.all(ownedEntries.map(entry => localforage.removeItem(entry.id)))

    const nextEntries = new Map(entries.value)
    for (const entry of ownedEntries) {
      nextEntries.delete(entry.id)
      const url = backgroundUrls[entry.id]
      if (url)
        URL.revokeObjectURL(url)
      delete backgroundUrls[entry.id]
    }
    entries.value = nextEntries
    await sync()
  }

  const journalRecentEntries = computed(() => {
    return journalEntries.value.slice(0, 5)
  })

  return {
    loading,
    availableBackgrounds,
    getCharacterBackgrounds,
    journalEntries,
    getCharacterJournalEntries,
    activeBackgroundUrl,
    journalRecentEntries,
    addBackground,
    removeBackground,
    clearOwner,
    getBackgroundUrl: (id: string, characterId = airiCardStore.activeCardId) => {
      const entry = entries.value.get(id)
      return entry && isBackgroundVisibleToScope(entry, scopeFor(characterId))
        ? backgroundUrls[id] ?? null
        : null
    },
    initializeStore,
  }
})
