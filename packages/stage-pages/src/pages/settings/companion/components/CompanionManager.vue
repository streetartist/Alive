<script setup lang="ts">
import type { CompanionIdentityProfile, CompanionState } from '@proj-airi/companion-core'
import type { MemoryRecord, MemoryScope } from '@proj-airi/memory'
import type { CompanionReflectionRunResult } from '@proj-airi/stage-ui/stores/modules/companion'

import { errorMessageFrom } from '@moeru/std'
import { getCompanionDevelopmentProgress } from '@proj-airi/companion-core'
import { useAuthStore } from '@proj-airi/stage-ui/stores/auth'
import { useAiriCardStore } from '@proj-airi/stage-ui/stores/modules/airi-card'
import { useCompanionStore } from '@proj-airi/stage-ui/stores/modules/companion'
import { useMemoryStore } from '@proj-airi/stage-ui/stores/modules/memory'
import { Button, Callout } from '@proj-airi/ui'
import { storeToRefs } from 'pinia'
import { computed, shallowRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'

import CompanionIdentitySettings from './CompanionIdentitySettings.vue'
import CompanionLifeSettings from './CompanionLifeSettings.vue'
import CompanionOverview from './CompanionOverview.vue'
import CompanionPersonality from './CompanionPersonality.vue'
import CompanionReflections from './CompanionReflections.vue'

const { t } = useI18n()
const router = useRouter()
const authStore = useAuthStore()
const airiCardStore = useAiriCardStore()
const companionStore = useCompanionStore()
const memoryStore = useMemoryStore()

const { userId } = storeToRefs(authStore)
const { activeCardId } = storeToRefs(airiCardStore)
const state = shallowRef<CompanionState>()
const identityProfile = shallowRef<CompanionIdentityProfile>()
const memories = shallowRef<MemoryRecord[]>([])
const loading = shallowRef(false)
const reflecting = shallowRef(false)
const savingIdentity = shallowRef(false)
const errorMessage = shallowRef('')
const feedbackMessage = shallowRef('')

const scope = computed<MemoryScope>(() => ({
  ownerId: userId.value,
  characterId: activeCardId.value,
}))
const characterName = computed(() => airiCardStore.cards.get(activeCardId.value)?.name ?? activeCardId.value)
const progress = computed(() => state.value
  ? getCompanionDevelopmentProgress(state.value.growthPoints)
  : undefined)

let latestLoadRequest = 0

function reflectionFeedback(result: CompanionReflectionRunResult) {
  if (result.mode === 'model')
    return t('settings.pages.companion.feedback.reflectedWithModel')
  if (result.mode === 'local')
    return t('settings.pages.companion.feedback.reflectedLocally')
  return t('settings.pages.companion.feedback.notDue')
}

async function loadCompanion() {
  const requestId = ++latestLoadRequest
  const requestedScope = { ...scope.value }
  loading.value = true
  errorMessage.value = ''

  try {
    const [nextState, nextProfile, nextMemories] = await Promise.all([
      companionStore.loadState(requestedScope),
      companionStore.loadProfile(requestedScope),
      memoryStore.listMemories(requestedScope),
    ])
    if (requestId !== latestLoadRequest)
      return

    state.value = nextState
    identityProfile.value = nextProfile
    memories.value = nextMemories
  }
  catch (error) {
    if (requestId === latestLoadRequest)
      errorMessage.value = errorMessageFrom(error) ?? t('settings.pages.companion.errors.load')
  }
  finally {
    if (requestId === latestLoadRequest)
      loading.value = false
  }
}

async function saveIdentity(input: { interests: string[], values: string[] }) {
  savingIdentity.value = true
  errorMessage.value = ''
  feedbackMessage.value = ''

  try {
    identityProfile.value = await companionStore.updateProfile({ ...scope.value }, input)
    feedbackMessage.value = t('settings.pages.companion.feedback.identitySaved')
  }
  catch (error) {
    errorMessage.value = errorMessageFrom(error) ?? t('settings.pages.companion.errors.identity')
  }
  finally {
    savingIdentity.value = false
  }
}

async function reflect() {
  reflecting.value = true
  errorMessage.value = ''
  feedbackMessage.value = ''

  try {
    const result = await companionStore.reflect({ ...scope.value }, { force: true })
    state.value = result.state
    feedbackMessage.value = reflectionFeedback(result)
  }
  catch (error) {
    errorMessage.value = errorMessageFrom(error) ?? t('settings.pages.companion.errors.reflect')
  }
  finally {
    reflecting.value = false
  }
}

watch([userId, activeCardId], () => {
  feedbackMessage.value = ''
  void loadCompanion()
}, { immediate: true })
</script>

<template>
  <div :class="['flex flex-col gap-5 pb-12']" :aria-busy="loading">
    <div :class="['flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between']">
      <p :class="['text-sm text-neutral-600 dark:text-neutral-400']">
        {{ t('settings.pages.companion.intro', { name: characterName }) }}
      </p>
      <div :class="['flex flex-wrap gap-2']">
        <Button variant="secondary" :loading="loading" :disabled="reflecting" @click="loadCompanion">
          {{ t('settings.pages.companion.actions.refresh') }}
        </Button>
        <Button variant="secondary" @click="router.push('/settings/memory')">
          {{ t('settings.pages.companion.actions.openMemory') }}
        </Button>
        <Button variant="secondary" @click="router.push('/settings/world')">
          {{ t('settings.pages.companion.actions.openWorld') }}
        </Button>
        <Button variant="primary" :loading="reflecting" :disabled="loading || !state" @click="reflect">
          {{ t('settings.pages.companion.actions.reflect') }}
        </Button>
      </div>
    </div>

    <p
      v-if="feedbackMessage"
      role="status"
      aria-live="polite"
      :class="[
        'flex items-center gap-2 rounded-lg px-3 py-2',
        'bg-emerald-50 text-sm text-emerald-700',
        'dark:bg-emerald-950/40 dark:text-emerald-300',
      ]"
    >
      <span aria-hidden="true" :class="['i-solar:check-circle-bold-duotone text-lg']" />
      {{ feedbackMessage }}
    </p>

    <Callout v-if="errorMessage" theme="orange">
      <template #label>
        {{ t('settings.pages.companion.errors.title') }}
      </template>
      {{ errorMessage }}
    </Callout>

    <div
      v-if="loading && !state"
      role="status"
      :class="[
        'flex items-center justify-center gap-3 rounded-xl border-2 px-4 py-12',
        'border-neutral-200/50 bg-white/70 text-neutral-600',
        'dark:border-neutral-800/60 dark:bg-neutral-900/60 dark:text-neutral-300',
      ]"
    >
      <span aria-hidden="true" :class="['i-svg-spinners:180-ring text-xl']" />
      {{ t('settings.pages.companion.loading') }}
    </div>

    <template v-else-if="state && identityProfile && progress">
      <CompanionOverview
        :character-name="characterName"
        :state="state"
        :progress="progress"
        :memory-count="memories.length"
      />
      <CompanionIdentitySettings :profile="identityProfile" :saving="savingIdentity" @save="saveIdentity" />
      <CompanionPersonality :personality="state.personality" />
      <CompanionLifeSettings />
      <CompanionReflections :reflections="state.reflections" />
    </template>
  </div>
</template>
