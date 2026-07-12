<script setup lang="ts">
import type { MemoryRecord } from '@proj-airi/memory'

import { companionGrowthStageFromMemory } from '@proj-airi/stage-ui/services/companionGrowthMilestone'
import { personalWorldProjectExperienceFromMemory } from '@proj-airi/stage-ui/services/personalWorldProjectExperience'
import { Button } from '@proj-airi/ui'
import { useI18n } from 'vue-i18n'

defineProps<{
  memories: MemoryRecord[]
  favoriteMemoryIds: Set<string>
  savingMemoryId?: string
}>()

const emit = defineEmits<{
  save: [memory: MemoryRecord]
}>()

const { t } = useI18n()

function memoryContent(memory: MemoryRecord) {
  const stage = companionGrowthStageFromMemory(memory)
  if (stage) {
    return t('settings.pages.memory.records.milestones.growthStage', {
      stage: t(`settings.pages.companion.stages.${stage}`),
    })
  }

  const project = personalWorldProjectExperienceFromMemory(memory)
  if (project) {
    return t('settings.pages.memory.records.experiences.projectCompleted', {
      title: project.title,
      description: project.description,
    })
  }

  return memory.content
}
</script>

<template>
  <section :class="['flex flex-col gap-4']">
    <div :class="['flex items-start gap-3']">
      <span aria-hidden="true" :class="['i-solar:bookmark-square-bold-duotone mt-0.5 text-2xl text-primary-500']" />
      <div>
        <h2 :class="['text-lg font-medium text-neutral-800 dark:text-neutral-100']">
          {{ t('settings.pages.world.memories.title') }}
        </h2>
        <p :class="['text-sm text-neutral-600 dark:text-neutral-400']">
          {{ t('settings.pages.world.memories.description') }}
        </p>
      </div>
    </div>

    <div
      v-if="memories.length === 0"
      :class="[
        'rounded-xl border-2 border-dashed px-4 py-8 text-center text-sm',
        'border-neutral-200/70 bg-neutral-50/60 text-neutral-500',
        'dark:border-neutral-800 dark:bg-neutral-900/30 dark:text-neutral-400',
      ]"
    >
      {{ t('settings.pages.world.memories.empty') }}
    </div>

    <ul v-else role="list" :class="['grid gap-3']">
      <li
        v-for="memory in memories"
        :key="memory.id"
        :class="[
          'flex flex-col gap-3 rounded-xl border-2 p-4 sm:flex-row sm:items-start sm:justify-between',
          'border-neutral-200/50 bg-white/70',
          'dark:border-neutral-800/60 dark:bg-neutral-900/60',
        ]"
      >
        <p :class="['min-w-0 whitespace-pre-wrap break-words text-sm leading-6 text-neutral-700 dark:text-neutral-200']">
          {{ memoryContent(memory) }}
        </p>
        <Button
          variant="secondary"
          size="sm"
          :loading="savingMemoryId === memory.id"
          :disabled="favoriteMemoryIds.has(memory.id) || (savingMemoryId !== undefined && savingMemoryId !== memory.id)"
          @click="emit('save', memory)"
        >
          {{ favoriteMemoryIds.has(memory.id) ? t('settings.pages.world.memories.saved') : t('settings.pages.world.memories.save') }}
        </Button>
      </li>
    </ul>
  </section>
</template>
