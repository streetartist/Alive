<script setup lang="ts">
import type { CompanionPersonality } from '@proj-airi/companion-core'

import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

const props = defineProps<{
  personality: CompanionPersonality
}>()

const { t } = useI18n()
const traits = computed(() => (['curiosity', 'creativity', 'kindness', 'humor'] as const).map(key => ({
  key,
  label: t(`settings.pages.companion.personality.traits.${key}`),
  percent: Math.round(props.personality[key] * 100),
})))
</script>

<template>
  <section
    :class="[
      'rounded-xl border-2 p-5 shadow-sm',
      'border-neutral-200/50 bg-white/70',
      'dark:border-neutral-800/60 dark:bg-neutral-900/60',
    ]"
  >
    <div :class="['mb-5 flex flex-col gap-1']">
      <h2 :class="['text-lg font-medium text-neutral-800 dark:text-neutral-100']">
        {{ t('settings.pages.companion.personality.title') }}
      </h2>
      <p :class="['text-sm text-neutral-600 dark:text-neutral-400']">
        {{ t('settings.pages.companion.personality.description') }}
      </p>
    </div>

    <dl :class="['grid gap-4 md:grid-cols-2']">
      <div v-for="trait in traits" :key="trait.key" :class="['flex flex-col gap-2']">
        <div :class="['flex items-center justify-between gap-3 text-sm']">
          <dt :class="['font-medium text-neutral-700 dark:text-neutral-200']">
            {{ trait.label }}
          </dt>
          <dd :class="['tabular-nums text-neutral-500 dark:text-neutral-400']">
            {{ trait.percent }}%
          </dd>
        </div>
        <div :class="['h-2 overflow-hidden rounded-full bg-neutral-100 dark:bg-neutral-800']">
          <div
            :style="{ width: `${trait.percent}%` }"
            :class="['h-full rounded-full bg-primary-500 transition-[width] duration-500']"
          />
        </div>
      </div>
    </dl>
  </section>
</template>
