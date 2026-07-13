import type { MemoryScope } from '@proj-airi/memory'

import { defineStore } from 'pinia'

import { companionDataPortabilityService } from '../../services/companionDataPortability'
import { useCompanionStore } from './companion'
import { usePersonalWorldStore } from './personal-world'

/**
 * Coordinates cross-domain companion data operations and reactive cache invalidation.
 *
 * Character cards, chat sessions, background assets, and global preferences are
 * intentionally outside this store's ownership.
 */
export const useCompanionDataStore = defineStore('companion-data', () => {
  const companionStore = useCompanionStore()
  const personalWorldStore = usePersonalWorldStore()

  function invalidateScope(scope: MemoryScope) {
    companionStore.invalidateScope(scope)
    personalWorldStore.invalidateScope(scope)
  }

  async function exportScope(scope: MemoryScope) {
    return await companionDataPortabilityService.exportScope(scope)
  }

  async function importScope(scope: MemoryScope, input: unknown) {
    try {
      await personalWorldStore.waitForActiveRoomWrites(scope)
      const summary = await companionDataPortabilityService.importScope(scope, input)
      invalidateScope(scope)
      await personalWorldStore.loadActiveRoomId(scope)
      return summary
    }
    catch (error) {
      invalidateScope(scope)
      // Rollback may have restored a room reference. Reload without masking the
      // original import failure if the follow-up read also fails.
      void personalWorldStore.loadActiveRoomId(scope).catch(() => undefined)
      throw error
    }
  }

  async function clearScope(scope: MemoryScope) {
    try {
      await personalWorldStore.waitForActiveRoomWrites(scope)
      const summary = await companionDataPortabilityService.clearScope(scope)
      invalidateScope(scope)
      await personalWorldStore.loadActiveRoomId(scope)
      return summary
    }
    catch (error) {
      invalidateScope(scope)
      void personalWorldStore.loadActiveRoomId(scope).catch(() => undefined)
      throw error
    }
  }

  return {
    exportScope,
    importScope,
    clearScope,
  }
})
