import type { MaybeRefOrGetter } from 'vue'

import { errorMessageFrom } from '@moeru/std'
import { isCompanionDailyReflectionDue } from '@proj-airi/companion-core'
import { useDocumentVisibility, useIntervalFn } from '@vueuse/core'
import { storeToRefs } from 'pinia'
import { toValue, watch } from 'vue'

import { useAuthStore } from '../stores/auth'
import { useAiriCardStore } from '../stores/modules/airi-card'
import { useCompanionStore } from '../stores/modules/companion'

/** Runtime inputs for the daily reflection catch-up scheduler. */
export interface UseCompanionDailyReflectionOptions {
  /** Chat generation, speech playback, or paused rendering currently owns the stage. */
  busy: MaybeRefOrGetter<boolean>
}

/**
 * Reflects on completed interactions from an earlier local day.
 *
 * The scheduler only runs on a visible, idle stage. Existing companion-store
 * serialization prevents overlap with interaction-count and manual reflection.
 */
export function useCompanionDailyReflection(options: UseCompanionDailyReflectionOptions) {
  const authStore = useAuthStore()
  const airiCardStore = useAiriCardStore()
  const companionStore = useCompanionStore()
  const { userId } = storeToRefs(authStore)
  const { activeCardId } = storeToRefs(airiCardStore)
  const visibility = useDocumentVisibility()
  let evaluating = false

  async function evaluate() {
    if (evaluating || toValue(options.busy) || visibility.value !== 'visible')
      return

    evaluating = true
    try {
      const scope = {
        ownerId: userId.value,
        characterId: activeCardId.value,
      }
      const state = await companionStore.loadState(scope)
      if (!isCompanionDailyReflectionDue(state))
        return

      await companionStore.reflect(scope, { force: true })
    }
    catch (error) {
      console.warn('[companion] Failed to complete daily reflection', errorMessageFrom(error) ?? 'Unknown error')
    }
    finally {
      evaluating = false
    }
  }

  useIntervalFn(() => void evaluate(), 15 * 60_000, { immediateCallback: true })
  watch([userId, activeCardId, visibility, () => toValue(options.busy)], () => void evaluate())

  return { evaluate }
}
