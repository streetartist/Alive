<script setup lang="ts">
import { Button, FieldInput, FieldTextArea } from '@proj-airi/ui'
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'

defineProps<{
  saving: boolean
}>()

const emit = defineEmits<{
  save: [input: { title: string, content: string }]
}>()

const { t } = useI18n()
const title = ref('')
const content = ref('')

function submit() {
  const normalizedTitle = title.value.trim()
  const normalizedContent = content.value.trim()
  if (!normalizedTitle || !normalizedContent)
    return

  emit('save', { title: normalizedTitle, content: normalizedContent })
}

function reset() {
  title.value = ''
  content.value = ''
}

defineExpose({ reset })
</script>

<template>
  <section
    :class="[
      'flex flex-col gap-4 rounded-xl border-2 p-4',
      'border-primary-100/80 bg-primary-50/50',
      'dark:border-primary-900/50 dark:bg-primary-950/20',
    ]"
  >
    <div :class="['flex items-start gap-3']">
      <span aria-hidden="true" :class="['i-solar:pen-new-square-bold-duotone mt-0.5 text-2xl text-primary-500']" />
      <div>
        <h2 :class="['font-medium text-neutral-800 dark:text-neutral-100']">
          {{ t('settings.pages.world.composer.title') }}
        </h2>
        <p :class="['text-sm text-neutral-600 dark:text-neutral-400']">
          {{ t('settings.pages.world.composer.description') }}
        </p>
      </div>
    </div>

    <FieldInput
      v-model="title"
      :label="t('settings.pages.world.composer.titleLabel')"
      :placeholder="t('settings.pages.world.composer.titlePlaceholder')"
      required
    />
    <FieldTextArea
      v-model="content"
      :label="t('settings.pages.world.composer.contentLabel')"
      :placeholder="t('settings.pages.world.composer.contentPlaceholder')"
      :rows="5"
      required
    />
    <div :class="['flex justify-end']">
      <Button
        variant="primary"
        :loading="saving"
        :disabled="saving || !title.trim() || !content.trim()"
        @click="submit"
      >
        {{ t('settings.pages.world.composer.save') }}
      </Button>
    </div>
  </section>
</template>
