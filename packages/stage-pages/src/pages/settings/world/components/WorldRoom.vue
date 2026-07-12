<script setup lang="ts">
import { Button } from '@proj-airi/ui'
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'

interface WorldRoomAsset {
  id: string
  type: 'builtin' | 'scene' | 'journal' | 'selfie'
  title: string
  url: string | null
}

const props = defineProps<{
  assets: WorldRoomAsset[]
  currentId?: string
  loading: boolean
  updatingId?: string
}>()

const emit = defineEmits<{
  select: [id: string]
  clear: []
  upload: [file: File]
}>()

const { t } = useI18n()
const fileInput = ref<HTMLInputElement>()
const currentRoom = computed(() => props.assets.find(asset => asset.id === props.currentId))

function chooseFile() {
  fileInput.value?.click()
}

function handleFileChange(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (file)
    emit('upload', file)
}
</script>

<template>
  <section :class="['flex flex-col gap-4']">
    <div :class="['flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between']">
      <div :class="['flex items-start gap-3']">
        <span aria-hidden="true" :class="['i-solar:armchair-2-bold-duotone mt-0.5 text-2xl text-primary-500']" />
        <div>
          <h2 :class="['text-lg font-medium text-neutral-800 dark:text-neutral-100']">
            {{ t('settings.pages.world.room.title') }}
          </h2>
          <p :class="['text-sm text-neutral-600 dark:text-neutral-400']">
            {{ t('settings.pages.world.room.description') }}
          </p>
        </div>
      </div>
      <div :class="['flex flex-wrap gap-2']">
        <input ref="fileInput" type="file" accept="image/*" hidden @change="handleFileChange">
        <Button variant="secondary" size="sm" :disabled="loading" @click="chooseFile">
          {{ t('settings.pages.world.room.upload') }}
        </Button>
        <Button v-if="currentRoom" variant="secondary" size="sm" :disabled="loading" @click="emit('clear')">
          {{ t('settings.pages.world.room.clear') }}
        </Button>
      </div>
    </div>

    <div
      :class="[
        'relative min-h-48 overflow-hidden rounded-2xl border-2',
        'border-neutral-200/60 bg-neutral-100 dark:border-neutral-800 dark:bg-neutral-900',
      ]"
    >
      <img
        v-if="currentRoom?.url"
        :src="currentRoom.url"
        :alt="currentRoom.title"
        :class="['absolute inset-0 h-full w-full object-cover']"
      >
      <div v-if="currentRoom" :class="['absolute inset-x-0 bottom-0 bg-black/60 px-4 py-3 text-white backdrop-blur-sm']">
        <p :class="['font-medium']">
          {{ currentRoom.title }}
        </p>
        <p :class="['text-xs text-white/70']">
          {{ t(`settings.pages.world.room.types.${currentRoom.type}`) }}
        </p>
      </div>
      <div v-else :class="['flex min-h-48 flex-col items-center justify-center gap-2 px-4 text-center']">
        <span aria-hidden="true" :class="['i-solar:home-smile-angle-bold-duotone text-4xl text-neutral-300 dark:text-neutral-700']" />
        <p :class="['font-medium text-neutral-700 dark:text-neutral-200']">
          {{ t('settings.pages.world.room.empty.title') }}
        </p>
        <p :class="['text-sm text-neutral-500 dark:text-neutral-400']">
          {{ t('settings.pages.world.room.empty.description') }}
        </p>
      </div>
    </div>

    <div
      v-if="assets.length === 0"
      :class="[
        'rounded-xl border-2 border-dashed px-4 py-8 text-center text-sm',
        'border-neutral-200/70 bg-neutral-50/60 text-neutral-500',
        'dark:border-neutral-800 dark:bg-neutral-900/30 dark:text-neutral-400',
      ]"
    >
      {{ t('settings.pages.world.room.assetsEmpty') }}
    </div>

    <ul v-else role="list" :class="['grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4']">
      <li v-for="asset in assets" :key="asset.id">
        <button
          type="button"
          :disabled="loading"
          :aria-pressed="asset.id === currentId"
          :class="[
            'group relative aspect-square w-full overflow-hidden rounded-xl border-2 text-left transition-all',
            asset.id === currentId
              ? 'border-primary-500 shadow-md'
              : 'border-transparent bg-neutral-100 hover:border-primary-200 dark:bg-neutral-900 dark:hover:border-primary-800',
            'disabled:cursor-not-allowed disabled:opacity-60',
          ]"
          @click="emit('select', asset.id)"
        >
          <img v-if="asset.url" :src="asset.url" :alt="asset.title" :class="['absolute inset-0 h-full w-full object-cover']">
          <span v-else aria-hidden="true" :class="['absolute inset-0 flex items-center justify-center i-solar:gallery-bold-duotone text-3xl text-neutral-300']" />
          <span :class="['absolute inset-x-0 bottom-0 truncate bg-black/60 px-2 py-1.5 text-xs font-medium text-white']">
            {{ asset.title }}
          </span>
          <span
            v-if="updatingId === asset.id"
            aria-hidden="true"
            :class="['absolute inset-0 flex items-center justify-center bg-black/35 i-svg-spinners:180-ring text-2xl text-white']"
          />
        </button>
      </li>
    </ul>
  </section>
</template>
