<script setup lang="ts">
import type {
  CompanionIdentityProfile,
  CompanionIdentityPromotionKind,
  PersonalWorldEntry,
  PersonalWorldProject,
} from '@proj-airi/companion-core'
import type { MemoryRecord, MemoryScope } from '@proj-airi/memory'

import { errorMessageFrom } from '@moeru/std'
import {
  createCompanionIdentityPromotionUpdate,
  isCompanionIdentityObservationConfirmed,
} from '@proj-airi/companion-core'
import { useAuthStore } from '@proj-airi/stage-ui/stores/auth'
import { useBackgroundStore } from '@proj-airi/stage-ui/stores/background'
import { useAiriCardStore } from '@proj-airi/stage-ui/stores/modules/airi-card'
import { useCompanionStore } from '@proj-airi/stage-ui/stores/modules/companion'
import { useMemoryStore } from '@proj-airi/stage-ui/stores/modules/memory'
import { usePersonalWorldStore } from '@proj-airi/stage-ui/stores/modules/personal-world'
import { Button, Callout } from '@proj-airi/ui'
import { storeToRefs } from 'pinia'
import { computed, shallowRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'

import WorldCreationGallery from './WorldCreationGallery.vue'
import PersonalWorldEntryList from './WorldEntryList.vue'
import WorldJournalComposer from './WorldJournalComposer.vue'
import WorldMemoryCandidates from './WorldMemoryCandidates.vue'
import WorldProjectManager from './WorldProjectManager.vue'
import WorldRoom from './WorldRoom.vue'

const { t } = useI18n()
const router = useRouter()
const authStore = useAuthStore()
const airiCardStore = useAiriCardStore()
const backgroundStore = useBackgroundStore()
const companionStore = useCompanionStore()
const memoryStore = useMemoryStore()
const personalWorldStore = usePersonalWorldStore()

const { userId } = storeToRefs(authStore)
const { activeCardId } = storeToRefs(airiCardStore)
const { availableBackgrounds: roomAssets, journalEntries: creations } = storeToRefs(backgroundStore)
const memories = shallowRef<MemoryRecord[]>([])
const identityProfile = shallowRef<CompanionIdentityProfile>()
const loading = shallowRef(false)
const savingJournal = shallowRef(false)
const savingMemoryId = shallowRef<string>()
const updatingRoomId = shallowRef<string>()
const promotingIdentity = shallowRef<{ entryId: string, kind: CompanionIdentityPromotionKind }>()
const errorMessage = shallowRef('')
const feedbackMessage = shallowRef('')
const composer = shallowRef<{ reset: () => void }>()

const scope = computed<MemoryScope>(() => ({
  ownerId: userId.value,
  characterId: activeCardId.value,
}))
const characterName = computed(() => airiCardStore.cards.get(activeCardId.value)?.name ?? activeCardId.value)
const currentRoomId = computed(() => airiCardStore.activeCard?.extensions?.airi?.modules?.activeBackgroundId)
const entries = computed(() => personalWorldStore.getEntries(scope.value))
const journal = computed(() => byKind(entries.value, 'journal'))
const learned = computed(() => byKind(entries.value, 'learned'))
const favorites = computed(() => byKind(entries.value, 'favorite'))
const favoriteMemoryIds = computed(() => new Set(
  favorites.value.flatMap(entry => entry.source.type === 'memory' ? [entry.source.memoryId] : []),
))

let latestLoadRequest = 0

function byKind(allEntries: PersonalWorldEntry[], kind: PersonalWorldEntry['kind']) {
  return allEntries.filter(entry => entry.kind === kind)
}

async function loadWorld() {
  const requestId = ++latestLoadRequest
  const requestedScope = { ...scope.value }
  loading.value = true
  errorMessage.value = ''

  try {
    const [, nextMemories, nextProfile] = await Promise.all([
      personalWorldStore.loadEntries(requestedScope),
      memoryStore.listMemories(requestedScope),
      companionStore.loadProfile(requestedScope),
      backgroundStore.initializeStore(),
    ])
    if (requestId !== latestLoadRequest)
      return

    memories.value = nextMemories
    identityProfile.value = nextProfile
  }
  catch (error) {
    if (requestId === latestLoadRequest)
      errorMessage.value = errorMessageFrom(error) ?? t('settings.pages.world.errors.load')
  }
  finally {
    if (requestId === latestLoadRequest)
      loading.value = false
  }
}

async function saveJournal(input: { title: string, content: string }) {
  savingJournal.value = true
  errorMessage.value = ''
  feedbackMessage.value = ''
  try {
    await personalWorldStore.addJournal({ ...scope.value }, input)
    composer.value?.reset()
    feedbackMessage.value = t('settings.pages.world.feedback.journalSaved')
  }
  catch (error) {
    errorMessage.value = errorMessageFrom(error) ?? t('settings.pages.world.errors.saveJournal')
  }
  finally {
    savingJournal.value = false
  }
}

async function saveFavorite(memory: MemoryRecord) {
  savingMemoryId.value = memory.id
  errorMessage.value = ''
  feedbackMessage.value = ''
  try {
    await memoryStore.annotateMemory({ ...scope.value }, memory.id, {
      kind: 'milestone',
      importance: 1,
    })
    await companionStore.recordImportantMemory({ ...scope.value }, memory.id)
    await personalWorldStore.saveFavorite({ ...scope.value }, memory)
    feedbackMessage.value = t('settings.pages.world.feedback.favoriteSaved')
  }
  catch (error) {
    errorMessage.value = errorMessageFrom(error) ?? t('settings.pages.world.errors.saveFavorite')
  }
  finally {
    savingMemoryId.value = undefined
  }
}

async function refreshMemoriesAfterProjectUpdate(project: PersonalWorldProject) {
  if (project.status !== 'completed')
    return

  try {
    memories.value = await memoryStore.listMemories({ ...scope.value })
  }
  catch (error) {
    errorMessage.value = errorMessageFrom(error) ?? t('settings.pages.world.errors.load')
  }
}

async function confirmIdentity(entry: PersonalWorldEntry, kind: CompanionIdentityPromotionKind) {
  const currentProfile = identityProfile.value
  if (!currentProfile)
    return

  const update = createCompanionIdentityPromotionUpdate(currentProfile, kind, entry.content)
  if (!update)
    return

  promotingIdentity.value = { entryId: entry.id, kind }
  errorMessage.value = ''
  feedbackMessage.value = ''
  try {
    const nextProfile = await companionStore.updateProfile({ ...scope.value }, update)
    identityProfile.value = nextProfile

    if (!isCompanionIdentityObservationConfirmed(nextProfile, kind, entry.content)) {
      errorMessage.value = t('settings.pages.world.errors.identityLimit')
      return
    }

    feedbackMessage.value = t(`settings.pages.world.feedback.${kind}Confirmed`)
  }
  catch (error) {
    errorMessage.value = errorMessageFrom(error) ?? t('settings.pages.world.errors.confirmIdentity')
  }
  finally {
    promotingIdentity.value = undefined
  }
}

function selectRoom(id?: string) {
  airiCardStore.updateActiveCardBackground(id)
}

async function uploadRoom(file: File) {
  updatingRoomId.value = 'upload'
  errorMessage.value = ''
  try {
    const id = await backgroundStore.addBackground('scene', file, file.name)
    airiCardStore.updateActiveCardBackground(id)
  }
  catch (error) {
    errorMessage.value = errorMessageFrom(error) ?? t('settings.pages.world.errors.uploadRoom')
  }
  finally {
    updatingRoomId.value = undefined
  }
}

watch([userId, activeCardId], () => {
  feedbackMessage.value = ''
  identityProfile.value = undefined
  promotingIdentity.value = undefined
  void loadWorld()
}, { immediate: true })
</script>

<template>
  <div :class="['flex flex-col gap-7 pb-12']" :aria-busy="loading">
    <div :class="['flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between']">
      <p :class="['text-sm text-neutral-600 dark:text-neutral-400']">
        {{ t('settings.pages.world.intro', { name: characterName }) }}
      </p>
      <div :class="['flex flex-wrap gap-2']">
        <Button variant="secondary" @click="router.push('/settings/companion')">
          {{ t('settings.pages.world.actions.openCompanion') }}
        </Button>
        <Button variant="secondary" :loading="loading" @click="loadWorld">
          {{ t('settings.pages.world.actions.refresh') }}
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
        {{ t('settings.pages.world.errors.title') }}
      </template>
      {{ errorMessage }}
    </Callout>

    <div
      v-if="loading && entries.length === 0"
      role="status"
      :class="[
        'flex items-center justify-center gap-3 rounded-xl border-2 px-4 py-12',
        'border-neutral-200/50 bg-white/70 text-neutral-600',
        'dark:border-neutral-800/60 dark:bg-neutral-900/60 dark:text-neutral-300',
      ]"
    >
      <span aria-hidden="true" :class="['i-svg-spinners:180-ring text-xl']" />
      {{ t('settings.pages.world.loading') }}
    </div>

    <template v-else>
      <WorldRoom
        :assets="roomAssets"
        :current-id="currentRoomId"
        :loading="backgroundStore.loading || updatingRoomId !== undefined"
        :updating-id="updatingRoomId"
        @select="selectRoom"
        @clear="selectRoom()"
        @upload="uploadRoom"
      />
      <WorldJournalComposer ref="composer" :saving="savingJournal" @save="saveJournal" />
      <PersonalWorldEntryList
        :entries="journal"
        title-key="settings.pages.world.journal.title"
        description-key="settings.pages.world.journal.description"
        empty-key="settings.pages.world.journal.empty"
        icon="i-solar:notebook-bookmark-bold-duotone"
      />
      <PersonalWorldEntryList
        :entries="learned"
        :identity-profile="identityProfile"
        :promoting="promotingIdentity"
        title-key="settings.pages.world.learned.title"
        description-key="settings.pages.world.learned.description"
        empty-key="settings.pages.world.learned.empty"
        icon="i-solar:lightbulb-bolt-bold-duotone"
        @confirm-identity="confirmIdentity"
      />
      <WorldProjectManager :scope="scope" :creations="creations" @updated="refreshMemoriesAfterProjectUpdate" />
      <WorldCreationGallery :entries="creations" />
      <PersonalWorldEntryList
        :entries="favorites"
        title-key="settings.pages.world.favorites.title"
        description-key="settings.pages.world.favorites.description"
        empty-key="settings.pages.world.favorites.empty"
        icon="i-solar:heart-angle-bold-duotone"
      />
      <WorldMemoryCandidates
        :memories="memories"
        :favorite-memory-ids="favoriteMemoryIds"
        :saving-memory-id="savingMemoryId"
        @save="saveFavorite"
      />
    </template>
  </div>
</template>
