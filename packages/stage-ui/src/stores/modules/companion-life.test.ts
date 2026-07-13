import type { MemoryScope } from '@proj-airi/memory'

import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useCompanionLifeStore } from './companion-life'

// NOTICE:
// This store test needs deterministic persistence across fresh Pinia instances.
// The Node Vitest process exposes an unusable localStorage because its `--localstorage-file` has no valid path.
// Source/context: `packages/stage-ui/vitest.config.ts` runs ordinary store tests in the Node project.
// Removal condition: run this test in browser mode or configure a functional Node localStorage file.
vi.mock('@proj-airi/stage-shared/composables', () => {
  const values = new Map<string, unknown>()

  return {
    useLocalStorageManualReset: <T>(key: string, initialValue: T) => ({
      __v_isRef: true,
      get value() {
        return (values.has(key) ? values.get(key) : initialValue) as T
      },
      set value(next: T) {
        values.set(key, next)
      },
      reset() {
        values.set(key, initialValue)
      },
    }),
  }
})

const ownerA = {
  ownerId: 'owner-a',
  characterId: 'character-shared',
} satisfies MemoryScope

const ownerASecondCharacter = {
  ownerId: 'owner-a',
  characterId: 'character-second',
} satisfies MemoryScope

const ownerB = {
  ownerId: 'owner-b',
  characterId: 'character-shared',
} satisfies MemoryScope

function createStore() {
  setActivePinia(createPinia())
  return useCompanionLifeStore()
}

describe('companion life scheduling state', () => {
  beforeEach(() => {
    createStore().resetState()
  })

  it('isolates morning and cooldown history for the same character across owners', () => {
    const store = createStore()
    store.recordBehavior(ownerA, {
      lastBehaviorAt: 100,
      lastMorningGreetingDate: '2026-07-12',
    })

    expect(store.behaviorStateFor(ownerA)).toEqual({
      lastBehaviorAt: 100,
      lastMorningGreetingDate: '2026-07-12',
    })
    expect(store.behaviorStateFor(ownerB)).toEqual({})
  })

  it('clears one scope without changing sibling character or owner history', () => {
    const store = createStore()
    store.recordBehavior(ownerA, { lastBehaviorAt: 100 })
    store.recordBehavior(ownerASecondCharacter, { lastBehaviorAt: 200 })
    store.recordBehavior(ownerB, { lastBehaviorAt: 300 })

    store.clearScope(ownerA)

    const reloadedStore = createStore()
    expect(reloadedStore.behaviorStateFor(ownerA)).toEqual({})
    expect(reloadedStore.behaviorStateFor(ownerASecondCharacter)).toEqual({ lastBehaviorAt: 200 })
    expect(reloadedStore.behaviorStateFor(ownerB)).toEqual({ lastBehaviorAt: 300 })
  })

  it('clears every scope for one owner without changing another owner', () => {
    const store = createStore()
    store.recordBehavior(ownerA, { lastBehaviorAt: 100 })
    store.recordBehavior(ownerASecondCharacter, { lastBehaviorAt: 200 })
    store.recordBehavior(ownerB, { lastBehaviorAt: 300 })

    store.clearOwner(ownerA.ownerId)

    const reloadedStore = createStore()
    expect(reloadedStore.behaviorStateFor(ownerA)).toEqual({})
    expect(reloadedStore.behaviorStateFor(ownerASecondCharacter)).toEqual({})
    expect(reloadedStore.behaviorStateFor(ownerB)).toEqual({ lastBehaviorAt: 300 })
  })

  it('resets preferences, all scheduler history, and transient presentation state', () => {
    const store = createStore()
    store.enabled = false
    store.morningGreetingEnabled = false
    store.idleMinutes = 90
    store.recordBehavior(ownerA, { lastBehaviorAt: 100 })
    store.recordBehavior(ownerB, { lastBehaviorAt: 300 })
    store.presentBehavior('idle-curious', 'Reading')

    store.resetState()

    const reloadedStore = createStore()
    expect(reloadedStore.enabled).toBe(true)
    expect(reloadedStore.morningGreetingEnabled).toBe(true)
    expect(reloadedStore.idleMinutes).toBe(30)
    expect(reloadedStore.behaviorStateFor(ownerA)).toEqual({})
    expect(reloadedStore.behaviorStateFor(ownerB)).toEqual({})
    expect(store.message).toBe('')
    expect(store.activeBehavior).toBeUndefined()
  })
})
