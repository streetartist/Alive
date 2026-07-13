import type {
  CompanionReflection,
  PersonalWorldEntry,
  PersonalWorldProject,
  PersonalWorldProjectUpdate,
} from '@proj-airi/companion-core'
import type { MemoryRecord, MemoryScope } from '@proj-airi/memory'

import { PERSONAL_WORLD_NO_ACTIVE_ROOM_ID } from '@proj-airi/companion-core'
import { defineStore } from 'pinia'
import { shallowRef } from 'vue'

import { createPersonalWorldService } from '../../services/companion/personal-world'
import { useMemoryStore } from './memory'

function scopeKey(scope: MemoryScope) {
  return JSON.stringify([scope.ownerId, scope.characterId])
}

function ownerFromScopeKey(key: string) {
  try {
    const scope: unknown = JSON.parse(key)
    if (!Array.isArray(scope) || scope.length !== 2 || typeof scope[0] !== 'string' || typeof scope[1] !== 'string')
      return undefined
    return scope[0]
  }
  catch {
    return undefined
  }
}

/** Reactive facade over scoped Personal World entries. */
export const usePersonalWorldStore = defineStore('personal-world', () => {
  const memoryStore = useMemoryStore()
  const personalWorldService = createPersonalWorldService({
    rememberExperience: input => memoryStore.rememberExperience(input),
  })
  const entries = shallowRef<Record<string, PersonalWorldEntry[]>>({})
  const projects = shallowRef<Record<string, PersonalWorldProject[]>>({})
  const activeRoomIds = shallowRef<Record<string, string | null>>({})
  const pendingLoads = new Map<string, Promise<PersonalWorldEntry[]>>()
  const pendingProjectLoads = new Map<string, Promise<PersonalWorldProject[]>>()
  const pendingActiveRoomLoads = new Map<string, Promise<string | null>>()
  const pendingActiveRoomWrites = new Map<string, Promise<void>>()
  const scopeRevisions = new Map<string, number>()

  function getEntries(scope: MemoryScope) {
    return entries.value[scopeKey(scope)] ?? []
  }

  function getProjects(scope: MemoryScope) {
    return projects.value[scopeKey(scope)] ?? []
  }

  function getActiveRoomId(scope: MemoryScope) {
    return activeRoomIds.value[scopeKey(scope)] ?? undefined
  }

  function hasLoadedActiveRoom(scope: MemoryScope) {
    return Object.hasOwn(activeRoomIds.value, scopeKey(scope))
  }

  function cacheEntries(scope: MemoryScope, nextEntries: PersonalWorldEntry[]) {
    entries.value = {
      ...entries.value,
      [scopeKey(scope)]: nextEntries,
    }
    return nextEntries
  }

  function cacheProjects(scope: MemoryScope, nextProjects: PersonalWorldProject[]) {
    projects.value = {
      ...projects.value,
      [scopeKey(scope)]: nextProjects,
    }
    return nextProjects
  }

  async function refreshEntries(scope: MemoryScope) {
    return cacheEntries(scope, await personalWorldService.list(scope))
  }

  async function refreshProjects(scope: MemoryScope) {
    return cacheProjects(scope, await personalWorldService.listProjects(scope))
  }

  async function loadEntries(scope: MemoryScope) {
    const key = scopeKey(scope)
    const cached = entries.value[key]
    if (cached)
      return cached

    const existingLoad = pendingLoads.get(key)
    if (existingLoad)
      return await existingLoad

    const revision = scopeRevisions.get(key) ?? 0
    const load = personalWorldService.list(scope).then(nextEntries => (
      (scopeRevisions.get(key) ?? 0) === revision
        ? cacheEntries(scope, nextEntries)
        : nextEntries
    ))
    pendingLoads.set(key, load)
    try {
      return await load
    }
    finally {
      if (pendingLoads.get(key) === load)
        pendingLoads.delete(key)
    }
  }

  async function loadProjects(scope: MemoryScope) {
    const key = scopeKey(scope)
    const cached = projects.value[key]
    if (cached)
      return cached

    const existingLoad = pendingProjectLoads.get(key)
    if (existingLoad)
      return await existingLoad

    const revision = scopeRevisions.get(key) ?? 0
    const load = personalWorldService.listProjects(scope).then(nextProjects => (
      (scopeRevisions.get(key) ?? 0) === revision
        ? cacheProjects(scope, nextProjects)
        : nextProjects
    ))
    pendingProjectLoads.set(key, load)
    try {
      return await load
    }
    finally {
      if (pendingProjectLoads.get(key) === load)
        pendingProjectLoads.delete(key)
    }
  }

  async function loadActiveRoomId(scope: MemoryScope) {
    const key = scopeKey(scope)
    if (Object.hasOwn(activeRoomIds.value, key))
      return activeRoomIds.value[key]

    const existingLoad = pendingActiveRoomLoads.get(key)
    if (existingLoad)
      return await existingLoad

    const revision = scopeRevisions.get(key) ?? 0
    const load = personalWorldService.getActiveRoomId(scope).then((activeRoomId) => {
      if ((scopeRevisions.get(key) ?? 0) === revision) {
        activeRoomIds.value = {
          ...activeRoomIds.value,
          [key]: activeRoomId,
        }
      }
      return activeRoomId
    })
    pendingActiveRoomLoads.set(key, load)
    try {
      return await load
    }
    finally {
      if (pendingActiveRoomLoads.get(key) === load)
        pendingActiveRoomLoads.delete(key)
    }
  }

  async function setActiveRoomId(scope: MemoryScope, backgroundId?: string) {
    const key = scopeKey(scope)
    // A selection made while the initial read is pending owns the newer
    // revision, so the stale read may finish but cannot repopulate the cache.
    const revision = (scopeRevisions.get(key) ?? 0) + 1
    scopeRevisions.set(key, revision)
    pendingActiveRoomLoads.delete(key)
    // The sentinel is a persisted choice, distinct from no override: it keeps
    // the character-authored default from reappearing after the user clears a room.
    const normalizedId = backgroundId?.trim() || PERSONAL_WORLD_NO_ACTIVE_ROOM_ID
    const previousWrite = pendingActiveRoomWrites.get(key)
    const write = previousWrite
      ?.catch(() => undefined)
      .then(() => personalWorldService.saveActiveRoomId(scope, normalizedId))
      ?? personalWorldService.saveActiveRoomId(scope, normalizedId)
    pendingActiveRoomWrites.set(key, write)
    try {
      await write
      if ((scopeRevisions.get(key) ?? 0) === revision) {
        activeRoomIds.value = {
          ...activeRoomIds.value,
          [key]: normalizedId,
        }
      }
    }
    finally {
      if (pendingActiveRoomWrites.get(key) === write)
        pendingActiveRoomWrites.delete(key)
    }
  }

  /** Waits until the latest requested room selection for one scope has settled. */
  async function waitForActiveRoomWrites(scope: MemoryScope) {
    await pendingActiveRoomWrites.get(scopeKey(scope))?.catch(() => undefined)
  }

  async function waitForOwnerActiveRoomWrites(ownerId: string) {
    const ownedWrites = [...pendingActiveRoomWrites.entries()]
      .filter(([key]) => ownerFromScopeKey(key) === ownerId)
      .map(([, write]) => write.catch(() => undefined))
    await Promise.all(ownedWrites)
  }

  async function addJournal(scope: MemoryScope, input: { title: string, content: string }) {
    const entry = await personalWorldService.addJournal(scope, input)
    await refreshEntries(scope)
    return entry
  }

  async function createProject(scope: MemoryScope, input: {
    title: string
    description: string
    creationIds?: string[]
  }) {
    const project = await personalWorldService.createProject(scope, input)
    await refreshProjects(scope)
    return project
  }

  async function updateProject(scope: MemoryScope, id: string, update: PersonalWorldProjectUpdate) {
    const project = await personalWorldService.updateProject(scope, id, update)
    await refreshProjects(scope)
    return project
  }

  async function removeProject(scope: MemoryScope, id: string) {
    await personalWorldService.removeProject(scope, id)
    await refreshProjects(scope)
  }

  async function captureReflection(scope: MemoryScope, reflection: CompanionReflection) {
    const captured = await personalWorldService.captureReflection(scope, reflection)
    await refreshEntries(scope)
    return captured
  }

  async function saveFavorite(scope: MemoryScope, memory: MemoryRecord) {
    const favorite = await personalWorldService.saveFavorite(scope, memory)
    await refreshEntries(scope)
    return favorite
  }

  async function clearScope(scope: MemoryScope) {
    await personalWorldService.clearScope(scope)
    invalidateScope(scope)
  }

  /** Drops one in-memory scope without changing its persisted Personal World. */
  function invalidateScope(scope: MemoryScope) {
    const key = scopeKey(scope)
    scopeRevisions.set(key, (scopeRevisions.get(key) ?? 0) + 1)
    pendingLoads.delete(key)
    pendingProjectLoads.delete(key)
    pendingActiveRoomLoads.delete(key)
    const { [key]: _removed, ...remaining } = entries.value
    entries.value = remaining
    const { [key]: _removedProjects, ...remainingProjects } = projects.value
    projects.value = remainingProjects
    const { [key]: _removedActiveRoom, ...remainingActiveRooms } = activeRoomIds.value
    activeRoomIds.value = remainingActiveRooms
  }

  async function clearOwner(ownerId: string) {
    await waitForOwnerActiveRoomWrites(ownerId)
    await personalWorldService.clearOwner(ownerId)
    entries.value = Object.fromEntries(
      Object.entries(entries.value).filter(([, scopedEntries]) => (
        scopedEntries[0]?.scope.ownerId !== ownerId
      )),
    )
    projects.value = Object.fromEntries(
      Object.entries(projects.value).filter(([, scopedProjects]) => (
        scopedProjects[0]?.scope.ownerId !== ownerId
      )),
    )
    activeRoomIds.value = Object.fromEntries(
      Object.entries(activeRoomIds.value).filter(([key]) => ownerFromScopeKey(key) !== ownerId),
    )
  }

  function resetState() {
    entries.value = {}
    projects.value = {}
    activeRoomIds.value = {}
    pendingLoads.clear()
    pendingProjectLoads.clear()
    pendingActiveRoomLoads.clear()
    pendingActiveRoomWrites.clear()
    scopeRevisions.clear()
  }

  return {
    entries,
    projects,
    activeRoomIds,
    getEntries,
    getProjects,
    getActiveRoomId,
    hasLoadedActiveRoom,
    loadEntries,
    loadProjects,
    loadActiveRoomId,
    setActiveRoomId,
    waitForActiveRoomWrites,
    addJournal,
    createProject,
    updateProject,
    removeProject,
    captureReflection,
    saveFavorite,
    invalidateScope,
    clearScope,
    clearOwner,
    resetState,
  }
})
