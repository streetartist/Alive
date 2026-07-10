<script setup lang="ts">
import { Button, DoubleCheckButton, FieldCheckbox, FieldRange } from '@proj-airi/ui'
import { useI18n } from 'vue-i18n'

defineProps<{
  characterId: string
  recordCount: number
  loading: boolean
  clearing: boolean
}>()

const emit = defineEmits<{
  refresh: []
  clear: []
}>()

const enabled = defineModel<boolean>('enabled', { required: true })
const recallLimit = defineModel<number>('recallLimit', { required: true })
const promptCharacterBudget = defineModel<number>('promptCharacterBudget', { required: true })

const { t } = useI18n()
</script>

<template>
  <section
    :class="[
      'rounded-xl border-2 p-4 shadow-sm',
      'border-neutral-200/50 bg-white/70',
      'dark:border-neutral-800/60 dark:bg-neutral-900/60',
    ]"
  >
    <div :class="['flex flex-col gap-5']">
      <div :class="['flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between']">
        <div :class="['flex min-w-0 flex-col gap-1']">
          <h2 :class="['text-lg font-medium text-neutral-800 dark:text-neutral-100']">
            {{ t('settings.pages.memory.controls.title') }}
          </h2>
          <p :class="['text-sm text-neutral-600 dark:text-neutral-400']">
            {{ t('settings.pages.memory.controls.description') }}
          </p>
        </div>

        <div
          role="status"
          aria-live="polite"
          :class="[
            'inline-flex w-fit shrink-0 items-center gap-2 rounded-full px-3 py-1',
            'text-xs font-medium',
            enabled
              ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300'
              : 'bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300',
          ]"
        >
          <span
            aria-hidden="true"
            :class="[
              'size-2 rounded-full',
              enabled ? 'bg-emerald-500' : 'bg-neutral-400 dark:bg-neutral-500',
            ]"
          />
          {{ enabled ? t('settings.pages.memory.status.enabled') : t('settings.pages.memory.status.disabled') }}
        </div>
      </div>

      <p :class="['text-sm text-neutral-500 dark:text-neutral-400']">
        {{ enabled ? t('settings.pages.memory.status.enabledDescription') : t('settings.pages.memory.status.disabledDescription') }}
      </p>

      <div
        :class="[
          'rounded-lg border p-3',
          'border-primary-200/60 bg-primary-50/50',
          'dark:border-primary-800/50 dark:bg-primary-950/20',
        ]"
      >
        <div :class="['flex items-start gap-3']">
          <span aria-hidden="true" :class="['i-solar:user-id-bold-duotone mt-0.5 text-xl text-primary-500']" />
          <div :class="['min-w-0']">
            <div :class="['font-medium text-neutral-800 dark:text-neutral-100']">
              {{ t('settings.pages.memory.scope.title') }}
            </div>
            <p :class="['text-sm text-neutral-600 dark:text-neutral-400']">
              {{ t('settings.pages.memory.scope.description') }}
            </p>
            <p :class="['mt-1 break-all text-xs text-neutral-500 dark:text-neutral-500']">
              {{ t('settings.pages.memory.scope.activeCharacter', { characterId }) }}
            </p>
          </div>
        </div>
      </div>

      <div :class="['grid gap-5 lg:grid-cols-2']">
        <FieldCheckbox
          v-model="enabled"
          :label="t('settings.pages.memory.controls.enabled.label')"
          :description="t('settings.pages.memory.controls.enabled.description')"
        />

        <FieldRange
          v-model="recallLimit"
          as="div"
          :min="1"
          :max="20"
          :step="1"
          :label="t('settings.pages.memory.controls.recallLimit.label')"
          :description="t('settings.pages.memory.controls.recallLimit.description')"
          :format-value="value => t('settings.pages.memory.controls.recallLimit.value', { count: value })"
        />

        <FieldRange
          v-model="promptCharacterBudget"
          as="div"
          :min="256"
          :max="8192"
          :step="256"
          :label="t('settings.pages.memory.controls.promptCharacterBudget.label')"
          :description="t('settings.pages.memory.controls.promptCharacterBudget.description')"
          :format-value="value => t('settings.pages.memory.controls.promptCharacterBudget.value', { count: value })"
        />
      </div>

      <div
        :class="[
          'flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between',
          'border-neutral-200/70 dark:border-neutral-800',
        ]"
      >
        <p :class="['text-sm text-neutral-500 dark:text-neutral-400']">
          {{ t('settings.pages.memory.records.count', { count: recordCount }) }}
        </p>
        <div :class="['flex flex-wrap items-center gap-2']">
          <Button
            variant="secondary"
            :loading="loading"
            :disabled="clearing"
            @click="emit('refresh')"
          >
            {{ t('settings.pages.memory.controls.refresh') }}
          </Button>
          <DoubleCheckButton
            variant="danger"
            :disabled="recordCount === 0 || loading"
            :loading="clearing"
            @confirm="emit('clear')"
          >
            {{ t('settings.pages.memory.controls.clear') }}
            <template #confirm>
              {{ t('settings.pages.memory.controls.clearConfirm') }}
            </template>
            <template #cancel>
              {{ t('settings.pages.memory.controls.clearCancel') }}
            </template>
          </DoubleCheckButton>
        </div>
      </div>
    </div>
  </section>
</template>
