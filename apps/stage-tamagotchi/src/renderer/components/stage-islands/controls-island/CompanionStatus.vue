<script setup lang="ts">
import type { MemoryScope } from '@proj-airi/memory'

import { errorMessageFrom } from '@moeru/std'
import { resolveCompanionMood } from '@proj-airi/companion-core'
import { useAuthStore } from '@proj-airi/stage-ui/stores/auth'
import { useAiriCardStore } from '@proj-airi/stage-ui/stores/modules/airi-card'
import { useCompanionStore } from '@proj-airi/stage-ui/stores/modules/companion'
import { useNow } from '@vueuse/core'
import { storeToRefs } from 'pinia'
import { computed, shallowRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import ControlButtonTooltip from './control-button-tooltip.vue'
import ControlButton from './control-button.vue'

const emit = defineEmits<{
  open: []
}>()

const { t } = useI18n()
const authStore = useAuthStore()
const airiCardStore = useAiriCardStore()
const companionStore = useCompanionStore()
const { userId } = storeToRefs(authStore)
const { activeCardId } = storeToRefs(airiCardStore)
const loading = shallowRef(false)
const unavailable = shallowRef(false)
const now = useNow({ interval: 60_000 })

const scope = computed<MemoryScope>(() => ({
  ownerId: userId.value,
  characterId: activeCardId.value,
}))
const state = computed(() => companionStore.getCachedState(scope.value))
const mood = computed(() => state.value
  ? resolveCompanionMood(state.value.mood, now.value.getTime())
  : undefined)
const stageLabel = computed(() => state.value
  ? t(`settings.pages.companion.stages.${state.value.growthStage}`)
  : '')
const moodLabel = computed(() => mood.value
  ? t(`settings.pages.companion.moods.${mood.value.label}`)
  : '')
const accessibleLabel = computed(() => {
  if (unavailable.value)
    return t('tamagotchi.stage.companion-status.unavailable')
  if (!state.value)
    return t('tamagotchi.stage.companion-status.loading')

  return t('tamagotchi.stage.companion-status.open', {
    stage: stageLabel.value,
    score: state.value.relationshipScore,
    mood: moodLabel.value,
  })
})

let latestLoadRequest = 0

async function loadState() {
  const requestId = ++latestLoadRequest
  const requestedScope = { ...scope.value }
  loading.value = true
  unavailable.value = false

  try {
    await companionStore.loadState(requestedScope)
  }
  catch (error) {
    if (requestId !== latestLoadRequest)
      return

    unavailable.value = true
    console.warn('[companion-status] Failed to load companion state', errorMessageFrom(error) ?? 'Unknown error')
  }
  finally {
    if (requestId === latestLoadRequest)
      loading.value = false
  }
}

watch([userId, activeCardId], () => void loadState(), { immediate: true })
</script>

<template>
  <ControlButtonTooltip side="left">
    <ControlButton
      :aria-label="accessibleLabel"
      button-style="max-w-44 gap-2 px-3 py-2"
      @click="emit('open')"
    >
      <span
        v-if="loading && !state"
        aria-hidden="true"
        :class="['i-svg-spinners:180-ring size-4 text-primary-500']"
      />
      <span
        v-else-if="unavailable"
        aria-hidden="true"
        :class="['i-solar:danger-triangle-bold-duotone size-4 text-amber-500']"
      />
      <span
        v-else
        aria-hidden="true"
        :class="['i-solar:stars-bold-duotone size-4 text-primary-500 dark:text-primary-300']"
      />

      <span v-if="state" :class="['min-w-0 flex items-center gap-1.5 text-xs']">
        <span :class="['truncate font-medium text-neutral-800 dark:text-neutral-100']">
          {{ stageLabel }}
        </span>
        <span aria-hidden="true" :class="['text-neutral-400 dark:text-neutral-500']">·</span>
        <span :class="['shrink-0 tabular-nums text-neutral-600 dark:text-neutral-300']">
          {{ state.relationshipScore }}/100
        </span>
      </span>
    </ControlButton>

    <template #tooltip>
      <template v-if="state && mood">
        {{ t('tamagotchi.stage.companion-status.tooltip', {
          stage: stageLabel,
          score: state.relationshipScore,
          mood: moodLabel,
          energy: Math.round(mood.arousal * 100),
        }) }}
      </template>
      <template v-else>
        {{ accessibleLabel }}
      </template>
    </template>
  </ControlButtonTooltip>
</template>
