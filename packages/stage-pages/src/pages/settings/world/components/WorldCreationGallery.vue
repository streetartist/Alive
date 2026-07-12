<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

interface CreationEntry {
  id: string
  title: string
  url: string | null
  prompt?: string
  createdAt: number
}

defineProps<{
  entries: CreationEntry[]
}>()

const { t, locale } = useI18n()
const dateFormatter = computed(() => new Intl.DateTimeFormat(locale.value, { dateStyle: 'medium' }))
</script>

<template>
  <section :class="['flex flex-col gap-4']">
    <div :class="['flex items-start gap-3']">
      <span aria-hidden="true" :class="['i-solar:gallery-wide-bold-duotone mt-0.5 text-2xl text-primary-500']" />
      <div>
        <h2 :class="['text-lg font-medium text-neutral-800 dark:text-neutral-100']">
          {{ t('settings.pages.world.creations.title') }}
        </h2>
        <p :class="['text-sm text-neutral-600 dark:text-neutral-400']">
          {{ t('settings.pages.world.creations.description') }}
        </p>
      </div>
    </div>

    <div
      v-if="entries.length === 0"
      :class="[
        'rounded-xl border-2 border-dashed px-4 py-8 text-center text-sm',
        'border-neutral-200/70 bg-neutral-50/60 text-neutral-500',
        'dark:border-neutral-800 dark:bg-neutral-900/30 dark:text-neutral-400',
      ]"
    >
      {{ t('settings.pages.world.creations.empty') }}
    </div>

    <ul v-else role="list" :class="['grid gap-3 sm:grid-cols-2 lg:grid-cols-3']">
      <li
        v-for="entry in entries"
        :key="entry.id"
        :class="[
          'overflow-hidden rounded-xl border-2 shadow-sm',
          'border-neutral-200/50 bg-white/70',
          'dark:border-neutral-800/60 dark:bg-neutral-900/60',
        ]"
      >
        <img
          v-if="entry.url"
          :src="entry.url"
          :alt="entry.title"
          :class="['aspect-video w-full object-cover']"
        >
        <div v-else :class="['aspect-video w-full bg-neutral-100 dark:bg-neutral-800']" />
        <div :class="['flex flex-col gap-2 p-3']">
          <div :class="['flex items-start justify-between gap-2']">
            <h3 :class="['font-medium text-neutral-800 dark:text-neutral-100']">
              {{ entry.title }}
            </h3>
            <time :datetime="new Date(entry.createdAt).toISOString()" :class="['shrink-0 text-xs text-neutral-500']">
              {{ dateFormatter.format(entry.createdAt) }}
            </time>
          </div>
          <p v-if="entry.prompt" :class="['line-clamp-3 text-xs text-neutral-500 dark:text-neutral-400']">
            {{ t('settings.pages.world.creations.prompt') }}: {{ entry.prompt }}
          </p>
        </div>
      </li>
    </ul>
  </section>
</template>
