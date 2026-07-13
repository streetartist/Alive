import type { MemoryScope } from '@proj-airi/memory'

import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useCompanionStore } from './companion'
import { usePersonalWorldStore } from './personal-world'

vi.mock('../providers', () => ({
  useProvidersStore: () => ({ getProviderInstance: vi.fn() }),
}))

vi.mock('./airi-card', () => ({
  useAiriCardStore: () => ({ cards: new Map() }),
}))

vi.mock('./consciousness', () => ({
  useConsciousnessStore: () => ({
    activeModel: undefined,
    activeProvider: undefined,
  }),
}))

vi.mock('./memory', () => ({
  useMemoryStore: () => ({
    enabled: false,
    listMemories: vi.fn(async () => []),
    rememberExperience: vi.fn(),
    rememberMilestone: vi.fn(),
  }),
}))

const scope = {
  ownerId: 'companion-reflection-reconciliation-owner',
  characterId: 'companion-reflection-reconciliation-character',
} satisfies MemoryScope

describe('companion reflection reconciliation', () => {
  beforeEach(async () => {
    setActivePinia(createPinia())
    await useCompanionStore().clearScope(scope)
    await usePersonalWorldStore().clearScope(scope)
  })

  afterEach(async () => {
    await useCompanionStore().clearScope(scope)
    await usePersonalWorldStore().clearScope(scope)
  })

  it('retries Personal World capture after a durable reflection was already saved', async () => {
    const companionStore = useCompanionStore()
    const personalWorldStore = usePersonalWorldStore()
    const captureReflection = vi.spyOn(personalWorldStore, 'captureReflection')

    captureReflection.mockRejectedValueOnce(new Error('Personal World write failed'))

    await expect(companionStore.reflect(scope, { force: true })).rejects.toThrow('Personal World write failed')

    const reflectedState = await companionStore.loadState(scope)
    const retainedReflection = reflectedState.reflections.at(-1)
    expect(retainedReflection).toBeDefined()

    captureReflection.mockResolvedValueOnce([])

    const retry = await companionStore.reflect(scope)

    expect(retry.mode).toBe('not-due')
    expect(captureReflection).toHaveBeenCalledTimes(2)
    expect(captureReflection).toHaveBeenLastCalledWith(scope, retainedReflection)
  })
})
