<script setup lang="ts">
import type { MemoryRecord } from '@proj-airi/memory'

import { Button, Callout, DoubleCheckButton } from '@proj-airi/ui'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

const props = defineProps<{
  records: MemoryRecord[]
  loading: boolean
  errorMessage: string
  forgettingRecordId?: string
  actionsDisabled?: boolean
}>()

const emit = defineEmits<{
  retry: []
  forget: [record: MemoryRecord]
}>()

const { t, locale } = useI18n()

const dateFormatter = computed(() => new Intl.DateTimeFormat(locale.value, {
  dateStyle: 'medium',
  timeStyle: 'short',
}))

function formatDate(timestamp: number) {
  return dateFormatter.value.format(timestamp)
}

function formatOptionalDate(timestamp?: number) {
  return timestamp
    ? formatDate(timestamp)
    : t('settings.pages.memory.records.neverAccessed')
}

function toIsoDate(timestamp: number) {
  return new Date(timestamp).toISOString()
}

function kindLabel(record: MemoryRecord) {
  return t(`settings.pages.memory.records.kind.${record.kind}`)
}

function sourceLabel(record: MemoryRecord) {
  return t(`settings.pages.memory.records.source.${record.source.type}`)
}

function forgetDisabled(record: MemoryRecord) {
  return props.actionsDisabled
    || (props.forgettingRecordId !== undefined && props.forgettingRecordId !== record.id)
}
</script>

<template>
  <section :class="['flex flex-col gap-4']" :aria-busy="loading">
    <div :class="['flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between']">
      <div>
        <h2 :class="['text-lg font-medium text-neutral-800 dark:text-neutral-100']">
          {{ t('settings.pages.memory.records.title') }}
        </h2>
        <p :class="['text-sm text-neutral-600 dark:text-neutral-400']">
          {{ t('settings.pages.memory.records.description') }}
        </p>
      </div>
      <span :class="['text-sm text-neutral-500 dark:text-neutral-400']">
        {{ t('settings.pages.memory.records.count', { count: records.length }) }}
      </span>
    </div>

    <div
      v-if="loading"
      role="status"
      :class="[
        'flex items-center justify-center gap-3 rounded-xl border-2 px-4 py-10',
        'border-neutral-200/50 bg-white/70 text-neutral-600',
        'dark:border-neutral-800/60 dark:bg-neutral-900/60 dark:text-neutral-300',
      ]"
    >
      <span aria-hidden="true" :class="['i-svg-spinners:180-ring text-xl']" />
      {{ t('settings.pages.memory.records.loading') }}
    </div>

    <Callout v-else-if="errorMessage" theme="orange">
      <template #label>
        <div :class="['flex items-center gap-2 text-orange-700 dark:text-orange-300']">
          <span aria-hidden="true" :class="['i-solar:danger-triangle-bold-duotone text-lg']" />
          <span :class="['font-semibold']">{{ t('settings.pages.memory.records.error.title') }}</span>
        </div>
      </template>
      <div :class="['flex flex-col items-start gap-3']">
        <p :class="['text-sm text-neutral-700 dark:text-neutral-300']">
          {{ errorMessage || t('settings.pages.memory.records.error.description') }}
        </p>
        <Button variant="secondary" size="sm" @click="emit('retry')">
          {{ t('settings.pages.memory.records.error.retry') }}
        </Button>
      </div>
    </Callout>

    <div
      v-else-if="records.length === 0"
      :class="[
        'flex flex-col items-center gap-2 rounded-xl border-2 border-dashed px-4 py-10 text-center',
        'border-neutral-200/70 bg-neutral-50/60',
        'dark:border-neutral-800 dark:bg-neutral-900/30',
      ]"
    >
      <span aria-hidden="true" :class="['i-solar:book-bookmark-bold-duotone text-4xl text-neutral-300 dark:text-neutral-700']" />
      <h3 :class="['font-medium text-neutral-700 dark:text-neutral-200']">
        {{ t('settings.pages.memory.records.empty.title') }}
      </h3>
      <p :class="['max-w-xl text-sm text-neutral-500 dark:text-neutral-400']">
        {{ t('settings.pages.memory.records.empty.description') }}
      </p>
    </div>

    <ul v-else role="list" :class="['grid gap-3']">
      <li
        v-for="record in records"
        :key="record.id"
        :aria-label="t('settings.pages.memory.records.ariaLabel', { kind: kindLabel(record), date: formatDate(record.createdAt) })"
        :class="[
          'rounded-xl border-2 p-4 shadow-sm',
          'border-neutral-200/50 bg-white/70',
          'dark:border-neutral-800/60 dark:bg-neutral-900/60',
        ]"
      >
        <article :class="['flex flex-col gap-4']">
          <div :class="['flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between']">
            <div :class="['flex min-w-0 flex-wrap items-center gap-2']">
              <span
                :class="[
                  'rounded-full bg-primary-50 px-2.5 py-1 text-xs font-medium text-primary-700',
                  'dark:bg-primary-950/40 dark:text-primary-300',
                ]"
              >
                {{ kindLabel(record) }}
              </span>
              <span :class="['text-xs text-neutral-500 dark:text-neutral-400']">
                {{ sourceLabel(record) }}
              </span>
            </div>

            <DoubleCheckButton
              variant="danger"
              size="sm"
              :disabled="forgetDisabled(record)"
              :loading="forgettingRecordId === record.id"
              @confirm="emit('forget', record)"
            >
              {{ t('settings.pages.memory.records.forget') }}
              <template #confirm>
                {{ t('settings.pages.memory.records.forgetConfirm') }}
              </template>
              <template #cancel>
                {{ t('settings.pages.memory.records.forgetCancel') }}
              </template>
            </DoubleCheckButton>
          </div>

          <p :class="['whitespace-pre-wrap break-words text-sm leading-6 text-neutral-800 dark:text-neutral-100']">
            {{ record.content }}
          </p>

          <dl :class="['grid gap-2 text-xs text-neutral-500 sm:grid-cols-2 lg:grid-cols-4 dark:text-neutral-400']">
            <div :class="['flex flex-col gap-0.5']">
              <dt :class="['font-medium text-neutral-600 dark:text-neutral-300']">
                {{ t('settings.pages.memory.records.created') }}
              </dt>
              <dd><time :datetime="toIsoDate(record.createdAt)">{{ formatDate(record.createdAt) }}</time></dd>
            </div>
            <div :class="['flex flex-col gap-0.5']">
              <dt :class="['font-medium text-neutral-600 dark:text-neutral-300']">
                {{ t('settings.pages.memory.records.updated') }}
              </dt>
              <dd><time :datetime="toIsoDate(record.updatedAt)">{{ formatDate(record.updatedAt) }}</time></dd>
            </div>
            <div :class="['flex flex-col gap-0.5']">
              <dt :class="['font-medium text-neutral-600 dark:text-neutral-300']">
                {{ t('settings.pages.memory.records.lastAccessed') }}
              </dt>
              <dd>
                <time v-if="record.lastAccessedAt" :datetime="toIsoDate(record.lastAccessedAt)">
                  {{ formatOptionalDate(record.lastAccessedAt) }}
                </time>
                <span v-else>{{ formatOptionalDate() }}</span>
              </dd>
            </div>
            <div :class="['flex flex-col gap-0.5']">
              <dt :class="['font-medium text-neutral-600 dark:text-neutral-300']">
                {{ t('settings.pages.memory.records.recallCount') }}
              </dt>
              <dd>{{ t('settings.pages.memory.records.accessCount', { count: record.accessCount }) }}</dd>
            </div>
          </dl>
        </article>
      </li>
    </ul>
  </section>
</template>
