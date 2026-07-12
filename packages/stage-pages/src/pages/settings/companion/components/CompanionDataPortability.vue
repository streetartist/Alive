<script setup lang="ts">
import type { MemoryScope } from '@proj-airi/memory'

import { errorMessageFrom } from '@moeru/std'
import { useDownload } from '@proj-airi/stage-ui/composables/download'
import {
  companionDataArchiveFilename,
  serializeCompanionDataArchive,
} from '@proj-airi/stage-ui/services/companionDataPortability'
import { useCompanionDataStore } from '@proj-airi/stage-ui/stores/modules/companionData'
import { Button, Callout, DoubleCheckButton, InputFile } from '@proj-airi/ui'
import { computed, shallowRef } from 'vue'
import { useI18n } from 'vue-i18n'

const props = defineProps<{
  scope: MemoryScope
  characterName: string
}>()

const emit = defineEmits<{
  changed: []
}>()

const { t } = useI18n()
const companionDataStore = useCompanionDataStore()
const selectedFiles = shallowRef<File[]>()
const exporting = shallowRef(false)
const importing = shallowRef(false)
const clearing = shallowRef(false)
const errorMessage = shallowRef('')
const feedbackMessage = shallowRef('')

const selectedFile = computed(() => selectedFiles.value?.[0])
const busy = computed(() => exporting.value || importing.value || clearing.value)

function resetMessages() {
  errorMessage.value = ''
  feedbackMessage.value = ''
}

async function exportData() {
  resetMessages()
  exporting.value = true
  try {
    const archive = await companionDataStore.exportScope({ ...props.scope })
    const blob = new Blob(
      [serializeCompanionDataArchive(archive)],
      { type: 'application/json;charset=utf-8' },
    )
    useDownload(blob, companionDataArchiveFilename(props.characterName, archive.exportedAt)).download()
    feedbackMessage.value = t('settings.pages.companion.portability.status.exported')
  }
  catch (error) {
    errorMessage.value = errorMessageFrom(error) ?? t('settings.pages.companion.portability.errors.export')
  }
  finally {
    exporting.value = false
  }
}

async function importData() {
  const file = selectedFile.value
  if (!file)
    return

  resetMessages()
  importing.value = true
  try {
    const summary = await companionDataStore.importScope({ ...props.scope }, await file.text())
    selectedFiles.value = undefined
    feedbackMessage.value = t('settings.pages.companion.portability.status.imported', {
      memories: summary.memories,
      entries: summary.personalWorldEntries,
      projects: summary.personalWorldProjects,
    })
    emit('changed')
  }
  catch (error) {
    errorMessage.value = errorMessageFrom(error) ?? t('settings.pages.companion.portability.errors.import')
  }
  finally {
    importing.value = false
  }
}

async function clearData() {
  resetMessages()
  clearing.value = true
  try {
    await companionDataStore.clearScope({ ...props.scope })
    selectedFiles.value = undefined
    feedbackMessage.value = t('settings.pages.companion.portability.status.cleared', {
      name: props.characterName,
    })
    emit('changed')
  }
  catch (error) {
    errorMessage.value = errorMessageFrom(error) ?? t('settings.pages.companion.portability.errors.clear')
  }
  finally {
    clearing.value = false
  }
}
</script>

<template>
  <section
    :class="[
      'flex flex-col gap-4 rounded-xl border-2 p-4 shadow-sm',
      'border-neutral-200/50 bg-white/70',
      'dark:border-neutral-800/60 dark:bg-neutral-900/60',
    ]"
  >
    <div :class="['flex flex-col gap-1']">
      <h2 :class="['text-lg font-medium']">
        {{ t('settings.pages.companion.portability.title') }}
      </h2>
      <p :class="['text-sm text-neutral-600 dark:text-neutral-400']">
        {{ t('settings.pages.companion.portability.description', { name: characterName }) }}
      </p>
      <p :class="['text-xs text-neutral-500 dark:text-neutral-500']">
        {{ t('settings.pages.companion.portability.exclusions') }}
      </p>
    </div>

    <div :class="['grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end']">
      <div :class="['flex flex-col gap-2']">
        <label :class="['text-sm font-medium']">
          {{ t('settings.pages.companion.portability.restore.label') }}
        </label>
        <InputFile
          v-model="selectedFiles"
          accept="application/json,.json"
          :placeholder="t('settings.pages.companion.portability.restore.placeholder')"
        />
        <p :class="['text-xs text-neutral-500 dark:text-neutral-500']">
          {{ t('settings.pages.companion.portability.restore.description') }}
        </p>
      </div>

      <div :class="['flex flex-wrap gap-2 lg:justify-end']">
        <Button variant="secondary" :loading="exporting" :disabled="busy && !exporting" @click="exportData">
          {{ t('settings.pages.companion.portability.actions.export') }}
        </Button>
        <DoubleCheckButton
          variant="caution"
          :loading="importing"
          :disabled="busy || !selectedFile"
          @confirm="importData"
        >
          {{ t('settings.pages.companion.portability.actions.restore') }}
          <template #confirm>
            {{ t('settings.pages.companion.portability.confirm.restore') }}
          </template>
          <template #cancel>
            {{ t('settings.pages.card.cancel') }}
          </template>
        </DoubleCheckButton>
      </div>
    </div>

    <div
      :class="[
        'grid grid-cols-1 items-start gap-3 rounded-lg px-3 py-3',
        'bg-red-50 text-red-800 lg:grid-cols-[minmax(0,1fr)_auto]',
        'dark:bg-red-950/30 dark:text-red-200',
      ]"
    >
      <div :class="['flex flex-col gap-1']">
        <h3 :class="['text-sm font-medium']">
          {{ t('settings.pages.companion.portability.clear.title') }}
        </h3>
        <p :class="['text-xs text-red-700/80 dark:text-red-200/80']">
          {{ t('settings.pages.companion.portability.clear.description', { name: characterName }) }}
        </p>
      </div>
      <DoubleCheckButton
        variant="danger"
        :loading="clearing"
        :disabled="busy"
        @confirm="clearData"
      >
        {{ t('settings.pages.companion.portability.actions.clear') }}
        <template #confirm>
          {{ t('settings.pages.companion.portability.confirm.clear') }}
        </template>
        <template #cancel>
          {{ t('settings.pages.card.cancel') }}
        </template>
      </DoubleCheckButton>
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
        {{ t('settings.pages.companion.portability.errors.title') }}
      </template>
      {{ errorMessage }}
    </Callout>
  </section>
</template>
