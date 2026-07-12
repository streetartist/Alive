<script setup lang="ts">
import { useCompanionLifeStore } from '@proj-airi/stage-ui/stores/modules/companion-life'
import { FieldCheckbox, FieldRange } from '@proj-airi/ui'
import { storeToRefs } from 'pinia'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
const lifeStore = useCompanionLifeStore()
const { enabled, morningGreetingEnabled, idleMinutes } = storeToRefs(lifeStore)
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
        {{ t('settings.pages.companion.life.title') }}
      </h2>
      <p :class="['text-sm text-neutral-600 dark:text-neutral-400']">
        {{ t('settings.pages.companion.life.description') }}
      </p>
      <p :class="['text-xs text-neutral-500 dark:text-neutral-500']">
        {{ t('settings.pages.companion.life.personalization') }}
      </p>
    </div>

    <div :class="['grid gap-5 lg:grid-cols-2']">
      <FieldCheckbox
        v-model="enabled"
        :label="t('settings.pages.companion.life.enabled.label')"
        :description="t('settings.pages.companion.life.enabled.description')"
      />
      <FieldCheckbox
        v-model="morningGreetingEnabled"
        :disabled="!enabled"
        :label="t('settings.pages.companion.life.morning.label')"
        :description="t('settings.pages.companion.life.morning.description')"
      />
      <FieldRange
        v-model="idleMinutes"
        as="div"
        :disabled="!enabled"
        :min="1"
        :max="120"
        :step="1"
        :label="t('settings.pages.companion.life.idle.label')"
        :description="t('settings.pages.companion.life.idle.description')"
        :format-value="value => t('settings.pages.companion.life.idle.value', { count: value })"
      />
    </div>
  </section>
</template>
