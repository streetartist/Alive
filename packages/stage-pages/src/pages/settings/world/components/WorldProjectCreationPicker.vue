<script setup lang="ts">
import type { WorldProjectCreation } from './worldProject'

import { PERSONAL_WORLD_PROJECT_CREATION_LIMIT } from '@proj-airi/companion-core'
import { Button } from '@proj-airi/ui'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

const props = defineProps<{
  creations: WorldProjectCreation[]
  selectedIds: string[]
  disabled?: boolean
}>()

const emit = defineEmits<{
  'update:selectedIds': [ids: string[]]
}>()

const { t } = useI18n()
const creationById = computed(() => new Map(props.creations.map(creation => [creation.id, creation])))
const missingIds = computed(() => props.selectedIds.filter(id => !creationById.value.has(id)))
const atLimit = computed(() => props.selectedIds.length >= PERSONAL_WORLD_PROJECT_CREATION_LIMIT)

function toggle(id: string) {
  if (props.selectedIds.includes(id)) {
    emit('update:selectedIds', props.selectedIds.filter(selectedId => selectedId !== id))
    return
  }
  if (!atLimit.value)
    emit('update:selectedIds', [...props.selectedIds, id])
}
</script>

<template>
  <div :class="['flex flex-col gap-3']">
    <div :class="['flex items-center justify-between gap-3']">
      <p :class="['text-sm font-medium text-neutral-700 dark:text-neutral-200']">
        {{ t('settings.pages.world.projects.form.creations') }}
      </p>
      <span :class="['text-xs text-neutral-500 dark:text-neutral-400']">
        {{ t('settings.pages.world.projects.form.creationCount', { count: selectedIds.length, limit: PERSONAL_WORLD_PROJECT_CREATION_LIMIT }) }}
      </span>
    </div>

    <p v-if="creations.length === 0 && missingIds.length === 0" :class="['text-sm text-neutral-500 dark:text-neutral-400']">
      {{ t('settings.pages.world.projects.form.noCreations') }}
    </p>

    <ul v-if="creations.length" role="list" :class="['grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4']">
      <li v-for="creation in creations" :key="creation.id">
        <button
          type="button"
          :aria-pressed="selectedIds.includes(creation.id)"
          :disabled="disabled || (atLimit && !selectedIds.includes(creation.id))"
          :class="[
            'group relative aspect-video w-full overflow-hidden rounded-lg border-2 text-left transition-all',
            selectedIds.includes(creation.id)
              ? 'border-primary-500 shadow-sm'
              : 'border-neutral-200/60 bg-neutral-100 hover:border-primary-200 dark:border-neutral-800 dark:bg-neutral-900 dark:hover:border-primary-800',
            'disabled:cursor-not-allowed disabled:opacity-50',
          ]"
          @click="toggle(creation.id)"
        >
          <img v-if="creation.url" :src="creation.url" :alt="creation.title" :class="['absolute inset-0 h-full w-full object-cover']">
          <span v-else aria-hidden="true" :class="['absolute inset-0 flex items-center justify-center i-solar:gallery-bold-duotone text-2xl text-neutral-300']" />
          <span :class="['absolute inset-x-0 bottom-0 truncate bg-black/65 px-2 py-1 text-xs text-white']">
            {{ creation.title }}
          </span>
          <span
            v-if="selectedIds.includes(creation.id)"
            aria-hidden="true"
            :class="['absolute right-1.5 top-1.5 i-solar:check-circle-bold text-lg text-white drop-shadow']"
          />
        </button>
      </li>
    </ul>

    <div v-if="missingIds.length" :class="['flex flex-col gap-2']">
      <p :class="['text-xs text-amber-700 dark:text-amber-300']">
        {{ t('settings.pages.world.projects.form.missingCreations') }}
      </p>
      <div :class="['flex flex-wrap gap-2']">
        <Button
          v-for="id in missingIds"
          :key="id"
          type="button"
          variant="caution"
          size="sm"
          :disabled="disabled"
          @click="toggle(id)"
        >
          {{ t('settings.pages.world.projects.form.removeMissing', { id }) }}
        </Button>
      </div>
    </div>
  </div>
</template>
