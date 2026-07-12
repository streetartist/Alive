import type {
  CompanionReflection,
  PersonalWorldEntry,
  PersonalWorldProject,
  PersonalWorldProjectUpdate,
} from '@proj-airi/companion-core'
import type { MemoryRecord, MemoryScope } from '@proj-airi/memory'

import { defineStore } from 'pinia'
import { shallowRef } from 'vue'

import { createPersonalWorldService } from '../../services/companion/personal-world'
import { useMemoryStore } from './memory'

function scopeKey(scope: MemoryScope) {
  return JSON.stringify([scope.ownerId, scope.characterId])
}

/** Reactive facade over scoped Personal World entries. */
export const usePersonalWorldStore = defineStore('personal-world', () => {
  const memoryStore = useMemoryStore()
  const personalWorldService = createPersonalWorldService({
    rememberExperience: input => memoryStore.rememberExperience(input),
  })
  const entries = shallowRef<Record<string, PersonalWorldEntry[]>>({})
  const projects = shallowRef<Record<string, PersonalWorldProject[]>>({})
  const pendingLoads = new Map<string, Promise<PersonalWorldEntry[]>>()
  const pendingProjectLoads = new Map<string, Promise<PersonalWorldProject[]>>()

  function getEntries(scope: MemoryScope) {
    return entries.value[scopeKey(scope)] ?? []
  }

  function getProjects(scope: MemoryScope) {
    return projects.value[scopeKey(scope)] ?? []
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

    const load = refreshEntries(scope)
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

    const load = refreshProjects(scope)
    pendingProjectLoads.set(key, load)
    try {
      return await load
    }
    finally {
      if (pendingProjectLoads.get(key) === load)
        pendingProjectLoads.delete(key)
    }
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
    const key = scopeKey(scope)
    const { [key]: _removed, ...remaining } = entries.value
    entries.value = remaining
    const { [key]: _removedProjects, ...remainingProjects } = projects.value
    projects.value = remainingProjects
  }

  async function clearOwner(ownerId: string) {
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
  }

  function resetState() {
    entries.value = {}
    projects.value = {}
    pendingLoads.clear()
    pendingProjectLoads.clear()
  }

  return {
    entries,
    projects,
    getEntries,
    getProjects,
    loadEntries,
    loadProjects,
    addJournal,
    createProject,
    updateProject,
    removeProject,
    captureReflection,
    saveFavorite,
    clearScope,
    clearOwner,
    resetState,
  }
})
