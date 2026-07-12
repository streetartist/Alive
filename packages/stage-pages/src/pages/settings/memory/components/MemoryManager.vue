<script setup lang="ts">
import type { MemoryRecord, MemoryScope } from '@proj-airi/memory'

import { errorMessageFrom } from '@moeru/std'
import { useAuthStore } from '@proj-airi/stage-ui/stores/auth'
import { useAiriCardStore } from '@proj-airi/stage-ui/stores/modules/airi-card'
import { useMemoryStore } from '@proj-airi/stage-ui/stores/modules/memory'
import { storeToRefs } from 'pinia'
import { computed, shallowRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import MemoryControls from './MemoryControls.vue'
import MemoryRecordList from './MemoryRecordList.vue'

const { t } = useI18n()
const authStore = useAuthStore()
const airiCardStore = useAiriCardStore()
const memoryStore = useMemoryStore()

const { userId } = storeToRefs(authStore)
const { activeCardId } = storeToRefs(airiCardStore)
const { enabled, recallLimit, promptCharacterBudget } = storeToRefs(memoryStore)
const { listMemories, forgetMemory, clearMemories } = memoryStore

const records = shallowRef<MemoryRecord[]>([])
const loading = shallowRef(false)
const clearing = shallowRef(false)
const forgettingRecordId = shallowRef<string>()
const errorMessage = shallowRef('')
const operationStatus = shallowRef('')

const scope = computed<MemoryScope>(() => ({
  ownerId: userId.value,
  characterId: activeCardId.value,
}))

let latestListRequest = 0

function isSameScope(left: MemoryScope, right: MemoryScope) {
  return left.ownerId === right.ownerId && left.characterId === right.characterId
}

async function loadRecords() {
  const requestId = ++latestListRequest
  const requestedScope = { ...scope.value }
  loading.value = true
  errorMessage.value = ''

  try {
    const nextRecords = await listMemories(requestedScope)

    // A user or character switch can finish an older list request after the
    // current scope has changed. Only the latest request for the active scope
    // may replace the records visible in this management surface.
    if (requestId !== latestListRequest || !isSameScope(requestedScope, scope.value))
      return

    records.value = nextRecords
  }
  catch (error) {
    if (requestId !== latestListRequest)
      return

    errorMessage.value = errorMessageFrom(error) ?? t('settings.pages.memory.errors.load')
  }
  finally {
    if (requestId === latestListRequest)
      loading.value = false
  }
}

async function handleRefresh() {
  operationStatus.value = ''
  await loadRecords()
}

async function handleForget(record: MemoryRecord) {
  const requestedScope = { ...scope.value }
  forgettingRecordId.value = record.id
  errorMessage.value = ''
  operationStatus.value = ''

  try {
    await forgetMemory(requestedScope, record.id)
    await loadRecords()
    operationStatus.value = t('settings.pages.memory.feedback.forgotten')
  }
  catch (error) {
    errorMessage.value = errorMessageFrom(error) ?? t('settings.pages.memory.errors.forget')
  }
  finally {
    forgettingRecordId.value = undefined
  }
}

async function handleAnnotated(record: MemoryRecord) {
  records.value = records.value.map(candidate => candidate.id === record.id ? record : candidate)
  operationStatus.value = t('settings.pages.memory.feedback.annotated')
}

async function handleClear() {
  const requestedScope = { ...scope.value }
  clearing.value = true
  errorMessage.value = ''
  operationStatus.value = ''

  try {
    await clearMemories(requestedScope)
    await loadRecords()
    operationStatus.value = t('settings.pages.memory.feedback.cleared')
  }
  catch (error) {
    errorMessage.value = errorMessageFrom(error) ?? t('settings.pages.memory.errors.clear')
  }
  finally {
    clearing.value = false
  }
}

watch([userId, activeCardId], () => {
  operationStatus.value = ''
  void loadRecords()
}, { immediate: true })
</script>

<template>
  <div :class="['flex flex-col gap-6 pb-12']">
    <MemoryControls
      v-model:enabled="enabled"
      v-model:recall-limit="recallLimit"
      v-model:prompt-character-budget="promptCharacterBudget"
      :character-id="scope.characterId"
      :record-count="records.length"
      :loading="loading"
      :clearing="clearing"
      @refresh="handleRefresh"
      @clear="handleClear"
    />

    <p
      v-if="operationStatus"
      role="status"
      aria-live="polite"
      :class="[
        'flex items-center gap-2 rounded-lg px-3 py-2',
        'bg-emerald-50 text-sm text-emerald-700',
        'dark:bg-emerald-950/40 dark:text-emerald-300',
      ]"
    >
      <span aria-hidden="true" :class="['i-solar:check-circle-bold-duotone text-lg']" />
      {{ operationStatus }}
    </p>

    <MemoryRecordList
      :records="records"
      :loading="loading"
      :error-message="errorMessage"
      :forgetting-record-id="forgettingRecordId"
      :actions-disabled="clearing"
      @retry="handleRefresh"
      @forget="handleForget"
      @annotated="handleAnnotated"
    />
  </div>
</template>
