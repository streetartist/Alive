import type { CompanionLifeDecision, CompanionLifeMessageCue, CompanionMoodSnapshot } from '@proj-airi/companion-core'
import type { MaybeRefOrGetter } from 'vue'

import { errorMessageFrom } from '@moeru/std'
import { resolveCompanionLifeBehavior, resolveCompanionLifeMessageCue, resolveCompanionMood } from '@proj-airi/companion-core'
import { useDocumentVisibility, useIdle, useIntervalFn } from '@vueuse/core'
import { storeToRefs } from 'pinia'
import { toValue, watch } from 'vue'

import { useAuthStore } from '../stores/auth'
import { useAiriCardStore } from '../stores/modules/airi-card'
import { useCompanionStore } from '../stores/modules/companion'
import { useCompanionLifeStore } from '../stores/modules/companion-life'

/** Runtime inputs for the restrained Desktop Life scheduler. */
export interface UseCompanionLifeOptions {
  /** Chat generation, speech playback, or paused rendering currently owns the stage. */
  busy: MaybeRefOrGetter<boolean>
  onBehavior: (
    decision: CompanionLifeDecision,
    messageCue: CompanionLifeMessageCue | undefined,
    mood: CompanionMoodSnapshot,
  ) => void | Promise<void>
}

/**
 * Schedules local companion behaviors from user activity and persisted relationship state.
 * The scheduler records a decision before presentation so a failed animation cannot cause a retry loop.
 */
export function useCompanionLife(options: UseCompanionLifeOptions) {
  const authStore = useAuthStore()
  const airiCardStore = useAiriCardStore()
  const companionStore = useCompanionStore()
  const lifeStore = useCompanionLifeStore()
  const { userId } = storeToRefs(authStore)
  const { activeCardId } = storeToRefs(airiCardStore)
  const { enabled, morningGreetingEnabled, idleMinutes } = storeToRefs(lifeStore)
  const { lastActive } = useIdle(60_000)
  const visibility = useDocumentVisibility()
  let evaluating = false

  async function evaluate() {
    if (evaluating || !enabled.value)
      return

    evaluating = true
    try {
      const characterId = activeCardId.value
      const scope = {
        ownerId: userId.value,
        characterId,
      }
      const [state, profile] = await Promise.all([
        companionStore.loadState(scope),
        companionStore.loadProfile(scope),
      ])
      const idleAfterMs = Math.max(1, idleMinutes.value) * 60_000
      const decision = resolveCompanionLifeBehavior({
        now: Date.now(),
        lastActiveAt: lastActive.value,
        enabled: enabled.value,
        morningGreetingEnabled: morningGreetingEnabled.value,
        busy: toValue(options.busy),
        visible: visibility.value === 'visible',
        personality: state.personality,
        previous: lifeStore.behaviorStateFor(characterId),
        policy: {
          idleAfterMs,
          restAfterMs: Math.max(120 * 60_000, idleAfterMs * 2),
        },
      })
      if (!decision)
        return

      const messageCue = resolveCompanionLifeMessageCue(decision.kind, {
        interests: profile.interests,
        learned: state.reflections.at(-1)?.learned ?? [],
      }, decision.occurredAt)
      const mood = resolveCompanionMood(state.mood, decision.occurredAt)

      lifeStore.recordBehavior(characterId, decision.nextState)
      await options.onBehavior(decision, messageCue, mood)
    }
    catch (error) {
      console.warn('[companion-life] Failed to evaluate desktop behavior', errorMessageFrom(error) ?? 'Unknown error')
    }
    finally {
      evaluating = false
    }
  }

  useIntervalFn(() => void evaluate(), 60_000, { immediateCallback: true })
  watch([userId, activeCardId, visibility], () => void evaluate())

  return { evaluate }
}
