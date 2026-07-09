<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import ControlButtonTooltip from './control-button-tooltip.vue'
import ControlButton from './control-button.vue'

import { useControlsIslandStore } from '../../../stores/controls-island'

interface Props {
  iconClass?: string
  buttonStyle?: string
}

const props = withDefaults(defineProps<Props>(), {
  iconClass: 'size-5',
})

const controlsIslandStore = useControlsIslandStore()
const { t } = useI18n()

const enabled = computed(() => controlsIslandStore.chatBubbleEnabled)
</script>

<template>
  <ControlButtonTooltip disable-hoverable-content>
    <ControlButton
      :button-style="props.buttonStyle"
      :class="{ 'border-primary-300/70 shadow-[0_10px_24px_rgba(0,0,0,0.22)]': enabled }"
      @click="controlsIslandStore.toggleChatBubble()"
    >
      <Transition name="fade" mode="out-in">
        <div v-if="enabled" i-solar:chat-round-line-bold-duotone :class="props.iconClass" text="primary-700 dark:primary-300" />
        <div v-else i-solar:chat-round-line-bold-duotone :class="props.iconClass" text="neutral-800 dark:neutral-300 opacity-50" />
      </Transition>
    </ControlButton>

    <template #tooltip>
      {{ enabled ? t('tamagotchi.stage.controls-island.chat-bubble.disable') : t('tamagotchi.stage.controls-island.chat-bubble.enable') }}
    </template>
  </ControlButtonTooltip>
</template>
