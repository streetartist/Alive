<script setup lang="ts">
import type { CompanionIdentityProfile } from '@proj-airi/companion-core'

import { Button, FieldValues } from '@proj-airi/ui'
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

const props = defineProps<{
  profile: CompanionIdentityProfile
  saving: boolean
}>()

const emit = defineEmits<{
  save: [input: { interests: string[], values: string[] }]
}>()

const { t, locale } = useI18n()
const interests = ref<string[]>([])
const values = ref<string[]>([])
const birthday = computed(() => new Intl.DateTimeFormat(locale.value, {
  dateStyle: 'long',
  timeStyle: 'short',
}).format(new Date(props.profile.birthday)))

function resetDraft() {
  interests.value = [...props.profile.interests]
  values.value = [...props.profile.values]
}

function save() {
  emit('save', {
    interests: [...interests.value],
    values: [...values.value],
  })
}

watch(() => props.profile, resetDraft, { immediate: true })
</script>

<template>
  <section
    :class="[
      'flex flex-col gap-5 rounded-xl border-2 p-5 shadow-sm',
      'border-neutral-200/50 bg-white/70',
      'dark:border-neutral-800/60 dark:bg-neutral-900/60',
    ]"
  >
    <div :class="['flex items-start gap-3']">
      <span aria-hidden="true" :class="['i-solar:user-heart-bold-duotone mt-0.5 text-2xl text-primary-500']" />
      <div>
        <h2 :class="['text-lg font-medium text-neutral-800 dark:text-neutral-100']">
          {{ t('settings.pages.companion.identity.title') }}
        </h2>
        <p :class="['text-sm text-neutral-600 dark:text-neutral-400']">
          {{ t('settings.pages.companion.identity.description') }}
        </p>
      </div>
    </div>

    <div :class="['rounded-lg bg-neutral-50 px-3 py-2 dark:bg-neutral-950/50']">
      <p :class="['text-xs font-medium text-neutral-500 dark:text-neutral-400']">
        {{ t('settings.pages.companion.identity.birthday') }}
      </p>
      <p :class="['mt-1 text-sm text-neutral-800 dark:text-neutral-100']">
        {{ birthday }}
      </p>
      <p :class="['mt-1 text-xs text-neutral-500 dark:text-neutral-400']">
        {{ t('settings.pages.companion.identity.birthdayDescription') }}
      </p>
    </div>

    <FieldValues
      v-model="interests"
      :label="t('settings.pages.companion.identity.interests.label')"
      :description="t('settings.pages.companion.identity.interests.description')"
      :value-placeholder="t('settings.pages.companion.identity.interests.placeholder')"
      :required="false"
    />
    <FieldValues
      v-model="values"
      :label="t('settings.pages.companion.identity.values.label')"
      :description="t('settings.pages.companion.identity.values.description')"
      :value-placeholder="t('settings.pages.companion.identity.values.placeholder')"
      :required="false"
    />

    <div :class="['flex justify-end gap-2']">
      <Button variant="secondary" :disabled="saving" @click="resetDraft">
        {{ t('settings.pages.companion.identity.reset') }}
      </Button>
      <Button variant="primary" :loading="saving" @click="save">
        {{ t('settings.pages.companion.identity.save') }}
      </Button>
    </div>
  </section>
</template>
