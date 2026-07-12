<script setup lang="ts">
import type { CompanionPersonality, CompanionReflection } from '@proj-airi/companion-core'

import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

defineProps<{
  reflections: CompanionReflection[]
}>()

const { t, locale } = useI18n()
const dateFormatter = computed(() => new Intl.DateTimeFormat(locale.value, {
  dateStyle: 'medium',
  timeStyle: 'short',
}))

function formatDate(timestamp: number) {
  return dateFormatter.value.format(timestamp)
}

function personalityChanges(reflection: CompanionReflection) {
  const entries: Array<[keyof CompanionPersonality, number]> = []
  for (const trait of ['curiosity', 'creativity', 'kindness', 'humor'] as const) {
    const change = reflection.personalityChanges[trait]
    if (typeof change === 'number')
      entries.push([trait, change])
  }
  return entries
}
</script>

<template>
  <section :class="['flex flex-col gap-4']">
    <div :class="['flex flex-col gap-1']">
      <h2 :class="['text-lg font-medium text-neutral-800 dark:text-neutral-100']">
        {{ t('settings.pages.companion.reflections.title') }}
      </h2>
      <p :class="['text-sm text-neutral-600 dark:text-neutral-400']">
        {{ t('settings.pages.companion.reflections.description') }}
      </p>
    </div>

    <div
      v-if="reflections.length === 0"
      :class="[
        'flex flex-col items-center gap-2 rounded-xl border-2 border-dashed px-4 py-10 text-center',
        'border-neutral-200/70 bg-neutral-50/60',
        'dark:border-neutral-800 dark:bg-neutral-900/30',
      ]"
    >
      <span aria-hidden="true" :class="['i-solar:notebook-bookmark-bold-duotone text-4xl text-neutral-300 dark:text-neutral-700']" />
      <h3 :class="['font-medium text-neutral-700 dark:text-neutral-200']">
        {{ t('settings.pages.companion.reflections.empty.title') }}
      </h3>
      <p :class="['max-w-xl text-sm text-neutral-500 dark:text-neutral-400']">
        {{ t('settings.pages.companion.reflections.empty.description') }}
      </p>
    </div>

    <ol v-else :class="['grid gap-3']">
      <li
        v-for="reflection in [...reflections].reverse()"
        :key="reflection.id"
        :class="[
          'rounded-xl border-2 p-4 shadow-sm',
          'border-neutral-200/50 bg-white/70',
          'dark:border-neutral-800/60 dark:bg-neutral-900/60',
        ]"
      >
        <article :class="['flex flex-col gap-3']">
          <div :class="['flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between']">
            <h3 :class="['font-medium text-neutral-800 dark:text-neutral-100']">
              {{ t('settings.pages.companion.reflections.checkpoint', { count: reflection.interactionCount }) }}
            </h3>
            <time :datetime="new Date(reflection.createdAt).toISOString()" :class="['text-xs text-neutral-500 dark:text-neutral-400']">
              {{ formatDate(reflection.createdAt) }}
            </time>
          </div>

          <ul v-if="reflection.learned.length" :class="['grid gap-2']">
            <li v-for="observation in reflection.learned" :key="observation" :class="['flex items-start gap-2 text-sm text-neutral-700 dark:text-neutral-300']">
              <span aria-hidden="true" :class="['i-solar:lightbulb-bolt-bold-duotone mt-0.5 shrink-0 text-primary-500']" />
              <span>{{ observation }}</span>
            </li>
          </ul>
          <p v-else :class="['text-sm text-neutral-500 dark:text-neutral-400']">
            {{ t('settings.pages.companion.reflections.localCheckpoint') }}
          </p>

          <div v-if="personalityChanges(reflection).length" :class="['flex flex-wrap gap-2']">
            <span
              v-for="([trait, change]) in personalityChanges(reflection)"
              :key="trait"
              :class="[
                'rounded-full bg-primary-50 px-2.5 py-1 text-xs font-medium text-primary-700',
                'dark:bg-primary-950/40 dark:text-primary-300',
              ]"
            >
              {{ t(`settings.pages.companion.personality.traits.${trait}`) }} {{ change > 0 ? '+' : '' }}{{ Math.round(change * 100) }}%
            </span>
          </div>
        </article>
      </li>
    </ol>
  </section>
</template>
