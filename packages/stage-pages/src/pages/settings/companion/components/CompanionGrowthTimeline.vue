<script setup lang="ts">
import type { CompanionGrowthEvent } from '@proj-airi/companion-core'

import { companionGrowthTimeline } from '@proj-airi/stage-ui/utils'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

const props = defineProps<{
  events: CompanionGrowthEvent[]
}>()

const { t, locale } = useI18n()
const visibleEvents = computed(() => companionGrowthTimeline(props.events))
const dateFormatter = computed(() => new Intl.DateTimeFormat(locale.value, {
  dateStyle: 'medium',
  timeStyle: 'short',
}))

function formatDate(timestamp: number) {
  return dateFormatter.value.format(timestamp)
}

function eventKey(event: (typeof visibleEvents.value)[number], index: number) {
  return `${event.occurredAt ?? 'unknown'}:${event.kind}:${index}`
}

function eventTitle(kind: (typeof visibleEvents.value)[number]['kind']) {
  if (kind === 'positiveFeedback')
    return t('settings.pages.companion.timeline.events.feedback.positive')
  if (kind === 'negativeFeedback')
    return t('settings.pages.companion.timeline.events.feedback.negative')
  return t(`settings.pages.companion.timeline.events.${kind}`)
}

function signed(value: number) {
  return value > 0 ? `+${value}` : String(value)
}
</script>

<template>
  <section :class="['flex flex-col gap-4']">
    <div :class="['flex flex-col gap-1']">
      <h2 :class="['text-lg font-medium text-neutral-800 dark:text-neutral-100']">
        {{ t('settings.pages.companion.timeline.title') }}
      </h2>
      <p :class="['text-sm text-neutral-600 dark:text-neutral-400']">
        {{ t('settings.pages.companion.timeline.description') }}
      </p>
    </div>

    <div
      v-if="visibleEvents.length === 0"
      :class="[
        'flex flex-col items-center gap-2 rounded-xl border-2 border-dashed px-4 py-10 text-center',
        'border-neutral-200/70 bg-neutral-50/60',
        'dark:border-neutral-800 dark:bg-neutral-900/30',
      ]"
    >
      <span aria-hidden="true" :class="['i-solar:history-bold-duotone text-4xl text-neutral-300 dark:text-neutral-700']" />
      <h3 :class="['font-medium text-neutral-700 dark:text-neutral-200']">
        {{ t('settings.pages.companion.timeline.empty.title') }}
      </h3>
      <p :class="['max-w-xl text-sm text-neutral-500 dark:text-neutral-400']">
        {{ t('settings.pages.companion.timeline.empty.description') }}
      </p>
    </div>

    <ol v-else :class="['grid gap-3']">
      <li
        v-for="(event, index) in visibleEvents"
        :key="eventKey(event, index)"
        :class="[
          'flex items-start gap-3 rounded-xl border-2 p-4 shadow-sm',
          'border-neutral-200/50 bg-white/70',
          'dark:border-neutral-800/60 dark:bg-neutral-900/60',
        ]"
      >
        <span
          aria-hidden="true"
          :class="[
            event.icon,
            'mt-0.5 shrink-0 text-2xl text-primary-500 dark:text-primary-300',
          ]"
        />
        <article :class="['min-w-0 flex-1']">
          <div :class="['flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between']">
            <h3 :class="['font-medium text-neutral-800 dark:text-neutral-100']">
              {{ eventTitle(event.kind) }}
            </h3>
            <time
              v-if="event.occurredAt !== undefined"
              :datetime="new Date(event.occurredAt).toISOString()"
              :class="['text-xs text-neutral-500 dark:text-neutral-400']"
            >
              {{ formatDate(event.occurredAt) }}
            </time>
            <span v-else :class="['text-xs text-neutral-500 dark:text-neutral-400']">
              {{ t('settings.pages.companion.timeline.unknownDate') }}
            </span>
          </div>
          <div :class="['mt-2 flex flex-wrap gap-2']">
            <span :class="['rounded-full bg-primary-50 px-2.5 py-1 text-xs font-medium text-primary-700 dark:bg-primary-950/40 dark:text-primary-300']">
              {{ t('settings.pages.companion.timeline.growthDelta', { value: signed(event.growthPointsDelta) }) }}
            </span>
            <span :class="['rounded-full bg-violet-50 px-2.5 py-1 text-xs font-medium text-violet-700 dark:bg-violet-950/40 dark:text-violet-300']">
              {{ t('settings.pages.companion.timeline.relationshipDelta', { value: signed(event.relationshipDelta) }) }}
            </span>
          </div>
        </article>
      </li>
    </ol>
  </section>
</template>
