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
      return await companionDataPortabilityService.importScope(scope, input)
    }
    finally {
      // A failed rollback may leave only part of a scope persisted. Never keep
      // pre-operation caches after any cross-repository mutation attempt.
      invalidateScope(scope)
    }
  }

  async function clearScope(scope: MemoryScope) {
    try {
      return await companionDataPortabilityService.clearScope(scope)
    }
    finally {
      invalidateScope(scope)
    }
  }

  return {
    exportScope,
    importScope,
    clearScope,
  }
})
