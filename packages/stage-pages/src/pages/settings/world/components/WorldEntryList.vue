<script setup lang="ts">
import type {
  CompanionIdentityProfile,
  CompanionIdentityPromotionKind,
  PersonalWorldEntry,
} from '@proj-airi/companion-core'

import { isCompanionIdentityObservationConfirmed } from '@proj-airi/companion-core'
import { Button } from '@proj-airi/ui'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

const props = defineProps<{
  entries: PersonalWorldEntry[]
  titleKey: string
  descriptionKey: string
  emptyKey: string
  icon: string
  identityProfile?: CompanionIdentityProfile
  promoting?: { entryId: string, kind: CompanionIdentityPromotionKind }
}>()

const emit = defineEmits<{
  confirmIdentity: [entry: PersonalWorldEntry, kind: CompanionIdentityPromotionKind]
}>()

const { t, locale } = useI18n()
const dateFormatter = computed(() => new Intl.DateTimeFormat(locale.value, {
  dateStyle: 'medium',
  timeStyle: 'short',
}))

function sourceLabel(entry: PersonalWorldEntry) {
  return t(`settings.pages.world.source.${entry.source.type}`)
}

function displayTitle(entry: PersonalWorldEntry) {
  if (entry.source.type === 'manual')
    return entry.title
  if (entry.kind === 'learned')
    return t('settings.pages.world.learned.title')
  if (entry.kind === 'favorite')
    return t('settings.pages.world.favorites.title')
  return t('settings.pages.companion.reflections.title')
}

function isConfirmed(entry: PersonalWorldEntry, kind: CompanionIdentityPromotionKind) {
  return props.identityProfile
    ? isCompanionIdentityObservationConfirmed(props.identityProfile, kind, entry.content)
    : false
}

function isPromoting(entry: PersonalWorldEntry, kind: CompanionIdentityPromotionKind) {
  return props.promoting?.entryId === entry.id && props.promoting.kind === kind
}
</script>

<template>
  <section :class="['flex flex-col gap-4']">
    <div :class="['flex items-start gap-3']">
      <span aria-hidden="true" :class="[icon, 'mt-0.5 text-2xl text-primary-500']" />
      <div>
        <h2 :class="['text-lg font-medium text-neutral-800 dark:text-neutral-100']">
          {{ t(titleKey) }}
        </h2>
        <p :class="['text-sm text-neutral-600 dark:text-neutral-400']">
          {{ t(descriptionKey) }}
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
      {{ t(emptyKey) }}
    </div>

    <ul v-else role="list" :class="['grid gap-3 md:grid-cols-2']">
      <li
        v-for="entry in entries"
        :key="entry.id"
        :class="[
          'flex flex-col gap-3 rounded-xl border-2 p-4 shadow-sm',
          'border-neutral-200/50 bg-white/70',
          'dark:border-neutral-800/60 dark:bg-neutral-900/60',
        ]"
      >
        <div :class="['flex items-start justify-between gap-3']">
          <h3 :class="['font-medium text-neutral-800 dark:text-neutral-100']">
            {{ displayTitle(entry) }}
          </h3>
          <span
            :class="[
              'shrink-0 rounded-full bg-primary-50 px-2 py-1 text-xs text-primary-700',
              'dark:bg-primary-950/40 dark:text-primary-300',
            ]"
          >
            {{ sourceLabel(entry) }}
          </span>
        </div>
        <p :class="['whitespace-pre-wrap break-words text-sm leading-6 text-neutral-700 dark:text-neutral-200']">
          {{ entry.content }}
        </p>
        <div
          v-if="entry.kind === 'learned' && identityProfile"
          :class="[
            'flex flex-col gap-2 border-t pt-3',
            'border-neutral-200/70 dark:border-neutral-800',
          ]"
        >
          <p :class="['text-xs leading-5 text-neutral-500 dark:text-neutral-400']">
            {{ t('settings.pages.world.learned.promotion.description') }}
          </p>
          <div :class="['flex flex-wrap gap-2']">
            <Button
              type="button"
              size="sm"
              variant="secondary"
              :loading="isPromoting(entry, 'interest')"
              :disabled="isConfirmed(entry, 'interest') || (promoting !== undefined && !isPromoting(entry, 'interest'))"
              @click="emit('confirmIdentity', entry, 'interest')"
            >
              {{ t(isConfirmed(entry, 'interest') ? 'settings.pages.world.learned.promotion.interestConfirmed' : 'settings.pages.world.learned.promotion.interest') }}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              :loading="isPromoting(entry, 'value')"
              :disabled="isConfirmed(entry, 'value') || (promoting !== undefined && !isPromoting(entry, 'value'))"
              @click="emit('confirmIdentity', entry, 'value')"
            >
              {{ t(isConfirmed(entry, 'value') ? 'settings.pages.world.learned.promotion.valueConfirmed' : 'settings.pages.world.learned.promotion.value') }}
            </Button>
          </div>
        </div>
        <time :datetime="new Date(entry.createdAt).toISOString()" :class="['mt-auto text-xs text-neutral-500 dark:text-neutral-400']">
          {{ dateFormatter.format(entry.createdAt) }}
        </time>
      </li>
    </ul>
  </section>
</template>
