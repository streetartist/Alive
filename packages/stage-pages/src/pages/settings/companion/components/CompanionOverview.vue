<script setup lang="ts">
import type { CompanionDevelopmentProgress, CompanionState } from '@proj-airi/companion-core'

import { resolveCompanionMood } from '@proj-airi/companion-core'
import { useNow } from '@vueuse/core'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

const props = defineProps<{
  characterName: string
  state: CompanionState
  progress: CompanionDevelopmentProgress
  memoryCount: number
}>()

const { t, locale } = useI18n()
const now = useNow({ interval: 60_000 })
const progressStyle = computed(() => ({ width: `${Math.round(props.progress.progress * 100)}%` }))
const mood = computed(() => resolveCompanionMood(props.state.mood, now.value.getTime()))
const moodUpdatedAt = computed(() => new Intl.DateTimeFormat(locale.value, {
  dateStyle: 'medium',
  timeStyle: 'short',
}).format(props.state.mood.updatedAt))
const nextStageMessage = computed(() => props.progress.nextStage
  ? t('settings.pages.companion.overview.nextStage', {
      count: props.progress.remainingGrowthPoints,
      stage: t(`settings.pages.companion.stages.${props.progress.nextStage}`),
    })
  : t('settings.pages.companion.overview.finalStage'))
</script>

<template>
  <section
    :class="[
      'overflow-hidden rounded-2xl border-2 shadow-sm',
      'border-primary-200/50 bg-gradient-to-br from-primary-50/90 via-white/80 to-violet-50/80',
      'dark:border-primary-900/60 dark:from-primary-950/40 dark:via-neutral-900/80 dark:to-violet-950/30',
    ]"
  >
    <div :class="['flex flex-col gap-6 p-5 sm:p-6']">
      <div :class="['flex items-start gap-4']">
        <div :class="['flex size-14 shrink-0 items-center justify-center rounded-2xl bg-primary-500/10 text-primary-600 dark:text-primary-300']">
          <span aria-hidden="true" :class="['i-solar:stars-bold-duotone text-3xl']" />
        </div>
        <div :class="['min-w-0 flex-1']">
          <p :class="['text-sm font-medium text-primary-700 dark:text-primary-300']">
            {{ t('settings.pages.companion.overview.relationshipWith', { name: characterName }) }}
          </p>
          <div :class="['mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1']">
            <h2 :class="['text-2xl font-semibold text-neutral-900 dark:text-white']">
              {{ t(`settings.pages.companion.stages.${state.growthStage}`) }}
            </h2>
            <span :class="['text-sm text-neutral-500 dark:text-neutral-400']">
              {{ t('settings.pages.companion.overview.relationshipScore', { score: state.relationshipScore }) }}
            </span>
            <span
              :title="t('settings.pages.companion.overview.moodUpdatedAt', { date: moodUpdatedAt })"
              :class="[
                'rounded-full bg-white/70 px-2.5 py-1 text-xs font-medium text-neutral-700',
                'dark:bg-neutral-950/45 dark:text-neutral-200',
              ]"
            >
              {{ t('settings.pages.companion.overview.currentMood', {
                mood: t(`settings.pages.companion.moods.${mood.label}`),
                energy: Math.round(mood.arousal * 100),
              }) }}
            </span>
          </div>
        </div>
      </div>

      <div :class="['flex flex-col gap-2']">
        <div :class="['h-2 overflow-hidden rounded-full bg-neutral-200/80 dark:bg-neutral-800']">
          <div
            :style="progressStyle"
            :class="['h-full rounded-full bg-gradient-to-r from-primary-500 to-violet-500 transition-[width] duration-500']"
          />
        </div>
        <p :class="['text-xs text-neutral-500 dark:text-neutral-400']">
          {{ nextStageMessage }}
        </p>
      </div>

      <dl :class="['grid grid-cols-2 gap-3 lg:grid-cols-4']">
        <div :class="['rounded-xl bg-white/65 p-3 dark:bg-neutral-950/35']">
          <dt :class="['text-xs text-neutral-500 dark:text-neutral-400']">
            {{ t('settings.pages.companion.overview.interactions') }}
          </dt>
          <dd :class="['mt-1 text-xl font-semibold text-neutral-900 dark:text-white']">
            {{ state.interactionCount }}
          </dd>
        </div>
        <div :class="['rounded-xl bg-white/65 p-3 dark:bg-neutral-950/35']">
          <dt :class="['text-xs text-neutral-500 dark:text-neutral-400']">
            {{ t('settings.pages.companion.overview.growthPoints') }}
          </dt>
          <dd :class="['mt-1 text-xl font-semibold text-neutral-900 dark:text-white']">
            {{ state.growthPoints }}
          </dd>
        </div>
        <div :class="['rounded-xl bg-white/65 p-3 dark:bg-neutral-950/35']">
          <dt :class="['text-xs text-neutral-500 dark:text-neutral-400']">
            {{ t('settings.pages.companion.overview.importantMemories') }}
          </dt>
          <dd :class="['mt-1 text-xl font-semibold text-neutral-900 dark:text-white']">
            {{ state.importantMemoryCount }}
          </dd>
        </div>
        <div :class="['rounded-xl bg-white/65 p-3 dark:bg-neutral-950/35']">
          <dt :class="['text-xs text-neutral-500 dark:text-neutral-400']">
            {{ t('settings.pages.companion.overview.feedback') }}
          </dt>
          <dd :class="['mt-1 text-xl font-semibold text-neutral-900 dark:text-white']">
            +{{ state.positiveFeedbackCount }} / -{{ state.negativeFeedbackCount }}
          </dd>
        </div>
        <div :class="['rounded-xl bg-white/65 p-3 dark:bg-neutral-950/35']">
          <dt :class="['text-xs text-neutral-500 dark:text-neutral-400']">
            {{ t('settings.pages.companion.overview.memories') }}
          </dt>
          <dd :class="['mt-1 text-xl font-semibold text-neutral-900 dark:text-white']">
            {{ memoryCount }}
          </dd>
        </div>
        <div :class="['rounded-xl bg-white/65 p-3 dark:bg-neutral-950/35']">
          <dt :class="['text-xs text-neutral-500 dark:text-neutral-400']">
            {{ t('settings.pages.companion.overview.reflections') }}
          </dt>
          <dd :class="['mt-1 text-xl font-semibold text-neutral-900 dark:text-white']">
            {{ state.reflections.length }}
          </dd>
        </div>
        <div :class="['rounded-xl bg-white/65 p-3 dark:bg-neutral-950/35']">
          <dt :class="['text-xs text-neutral-500 dark:text-neutral-400']">
            {{ t('settings.pages.companion.overview.relationship') }}
          </dt>
          <dd :class="['mt-1 text-xl font-semibold text-neutral-900 dark:text-white']">
            {{ state.relationshipScore }}/100
          </dd>
        </div>
      </dl>
    </div>
  </section>
</template>
