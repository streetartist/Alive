<script setup lang="ts">
import type { MemoryKind, MemoryRecord } from '@proj-airi/memory'

import { errorMessageFrom } from '@moeru/std'
import { useMemoryStore } from '@proj-airi/stage-ui/stores/modules/memory'
import { Button, Callout, Input, Select } from '@proj-airi/ui'
import { computed, ref, shallowRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'

const props = defineProps<{
  record: MemoryRecord
  disabled?: boolean
}>()

const emit = defineEmits<{
  saved: [record: MemoryRecord]
}>()

const { t } = useI18n()
const memoryStore = useMemoryStore()
const editing = shallowRef(false)
const saving = shallowRef(false)
const errorMessage = shallowRef('')
const kind = ref<MemoryKind>(props.record.kind)
const importancePercent = ref(Math.round(props.record.importance * 100))
const emotionalWeightPercent = ref(Math.round(props.record.emotionalWeight * 100))

const kindOptions = computed(() => (['fact', 'experience', 'emotion', 'milestone'] as const).map(value => ({
  value,
  label: t(`settings.pages.memory.records.kind.${value}`),
})))

function resetDraft() {
  kind.value = props.record.kind
  importancePercent.value = Math.round(props.record.importance * 100)
  emotionalWeightPercent.value = Math.round(props.record.emotionalWeight * 100)
  errorMessage.value = ''
}

function startEditing() {
  resetDraft()
  editing.value = true
}

function cancelEditing() {
  editing.value = false
  resetDraft()
}

async function save() {
  saving.value = true
  errorMessage.value = ''
  try {
    const record = await memoryStore.annotateMemory(props.record.scope, props.record.id, {
      kind: kind.value,
      importance: (importancePercent.value ?? 50) / 100,
      emotionalWeight: (emotionalWeightPercent.value ?? 0) / 100,
    })
    editing.value = false
    emit('saved', record)
  }
  catch (error) {
    errorMessage.value = errorMessageFrom(error) ?? t('settings.pages.memory.errors.annotate')
  }
  finally {
    saving.value = false
  }
}

watch(() => props.record, () => {
  if (!editing.value)
    resetDraft()
})
</script>

<template>
  <div :class="['flex flex-col gap-3']">
    <div v-if="!editing" :class="['flex flex-wrap items-center gap-2']">
      <span :class="['rounded-full bg-neutral-100 px-2.5 py-1 text-xs text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300']">
        {{ t('settings.pages.memory.records.importanceValue', { value: Math.round(record.importance * 100) }) }}
      </span>
      <span :class="['rounded-full bg-neutral-100 px-2.5 py-1 text-xs text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300']">
        {{ t('settings.pages.memory.records.emotionalWeightValue', { value: Math.round(record.emotionalWeight * 100) }) }}
      </span>
      <Button variant="secondary-muted" size="sm" :disabled="disabled" @click="startEditing">
        {{ t('settings.pages.memory.records.annotate') }}
      </Button>
    </div>

    <form
      v-else
      :class="[
        'grid gap-3 rounded-lg border-2 p-3 sm:grid-cols-3',
        'border-primary-100/70 bg-primary-50/30 dark:border-primary-900/50 dark:bg-primary-950/15',
      ]"
      @submit.prevent="save"
    >
      <label :class="['grid gap-1.5 text-xs text-neutral-700 dark:text-neutral-200']">
        <span>{{ t('settings.pages.memory.records.annotationKind') }}</span>
        <Select v-model="kind" :options="kindOptions" :disabled="saving" />
      </label>
      <label :class="['grid gap-1.5 text-xs text-neutral-700 dark:text-neutral-200']">
        <span>{{ t('settings.pages.memory.records.importance') }}</span>
        <Input v-model="importancePercent" type="number" min="0" max="100" step="1" :disabled="saving" />
      </label>
      <label :class="['grid gap-1.5 text-xs text-neutral-700 dark:text-neutral-200']">
        <span>{{ t('settings.pages.memory.records.emotionalWeight') }}</span>
        <Input v-model="emotionalWeightPercent" type="number" min="-100" max="100" step="1" :disabled="saving" />
      </label>

      <Callout v-if="errorMessage" theme="orange" :class="['sm:col-span-3']">
        {{ errorMessage }}
      </Callout>

      <p :class="['text-xs text-neutral-500 sm:col-span-3 dark:text-neutral-400']">
        {{ t('settings.pages.memory.records.annotationDescription') }}
      </p>
      <div :class="['flex flex-wrap justify-end gap-2 sm:col-span-3']">
        <Button type="button" variant="secondary" size="sm" :disabled="saving" @click="cancelEditing">
          {{ t('settings.pages.memory.records.annotationCancel') }}
        </Button>
        <Button type="submit" size="sm" :loading="saving">
          {{ t('settings.pages.memory.records.annotationSave') }}
        </Button>
      </div>
    </form>
  </div>
</template>
