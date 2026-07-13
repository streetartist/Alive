import type { PersonalWorldService } from '../../services/companion/personal-world'

import { createPinia, setActivePinia } from 'pinia'
import { describe, expect, it, vi } from 'vitest'

import { createPersonalWorldService } from '../../services/companion/personal-world'
import { usePersonalWorldStore } from './personal-world'

vi.mock('../../services/companion/personal-world', () => ({
  createPersonalWorldService: vi.fn(),
}))

vi.mock('./memory', () => ({
  useMemoryStore: () => ({
    rememberExperience: vi.fn(),
  }),
}))

function service(overrides: Partial<PersonalWorldService> = {}) {
  return {
    list: vi.fn(async () => []),
    listProjects: vi.fn(async () => []),
    getActiveRoomId: vi.fn(async () => null),
    saveActiveRoomId: vi.fn(async () => {}),
    addJournal: vi.fn(),
    createProject: vi.fn(),
    updateProject: vi.fn(),
    removeProject: vi.fn(),
    captureReflection: vi.fn(),
    saveFavorite: vi.fn(),
    clearScope: vi.fn(),
    clearOwner: vi.fn(),
    ...overrides,
  } satisfies PersonalWorldService
}

describe('personal world active room cache', () => {
  it('keeps a new selection when an older pending load finishes later', async () => {
    let resolveInitialLoad: (id: string | null) => void = () => {}
    const initialLoad = new Promise<string | null>((resolve) => {
      resolveInitialLoad = resolve
    })
    const personalWorldService = service({
      getActiveRoomId: vi.fn(async () => await initialLoad),
    })
    vi.mocked(createPersonalWorldService).mockReturnValue(personalWorldService)
    setActivePinia(createPinia())
    const store = usePersonalWorldStore()
    const scope = { ownerId: 'owner-a', characterId: 'character-a' }

    const pendingLoad = store.loadActiveRoomId(scope)
    await store.setActiveRoomId(scope, 'bg-new-room')
    resolveInitialLoad('bg-old-room')
    await pendingLoad

    expect(personalWorldService.saveActiveRoomId).toHaveBeenCalledWith(scope, 'bg-new-room')
    expect(store.getActiveRoomId(scope)).toBe('bg-new-room')
  })

  it('serializes scoped writes so the last requested room is persisted last', async () => {
    let resolveFirstWrite: () => void = () => {}
    const firstWrite = new Promise<void>((resolve) => {
      resolveFirstWrite = resolve
    })
    const saveActiveRoomId = vi.fn()
      .mockImplementationOnce(async () => await firstWrite)
      .mockResolvedValueOnce(undefined)
    const personalWorldService = service({ saveActiveRoomId })
    vi.mocked(createPersonalWorldService).mockReturnValue(personalWorldService)
    setActivePinia(createPinia())
    const store = usePersonalWorldStore()
    const scope = { ownerId: 'owner-a', characterId: 'character-a' }

    const olderSelection = store.setActiveRoomId(scope, 'bg-old-room')
    const newerSelection = store.setActiveRoomId(scope, 'bg-new-room')

    expect(saveActiveRoomId).toHaveBeenCalledTimes(1)
    expect(saveActiveRoomId).toHaveBeenNthCalledWith(1, scope, 'bg-old-room')

    resolveFirstWrite()
    await olderSelection
    await newerSelection

    expect(saveActiveRoomId).toHaveBeenCalledTimes(2)
    expect(saveActiveRoomId).toHaveBeenNthCalledWith(2, scope, 'bg-new-room')
    expect(store.getActiveRoomId(scope)).toBe('bg-new-room')
  })
})
