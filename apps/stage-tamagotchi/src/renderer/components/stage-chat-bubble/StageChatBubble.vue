<script setup lang="ts">
import type { ChatAssistantMessage, ChatHistoryItem, ChatSlicesText } from '@proj-airi/stage-ui/types/chat'

import { useChatSessionStore } from '@proj-airi/stage-ui/stores/chat/session-store'
import { useChatStreamStore } from '@proj-airi/stage-ui/stores/chat/stream-store'
import { useWindowSize } from '@vueuse/core'
import { storeToRefs } from 'pinia'
import { computed } from 'vue'

import { useControlsIslandStore } from '../../stores/controls-island'

interface StageChatBubbleAnchorBounds {
  left: number
  top: number
  right: number
  bottom: number
  width: number
  height: number
  centerX: number
  centerY: number
}

const props = defineProps<{
  anchorBounds?: StageChatBubbleAnchorBounds | null
}>()

/** Keeps the stage overlay glanceable; the full response remains available in the chat window. */
const MAX_BUBBLE_TEXT_LENGTH = 280
const BUBBLE_MARGIN = 12
const BUBBLE_GAP = 8
const BUBBLE_MAX_WIDTH = 352

const chatSessionStore = useChatSessionStore()
const chatStreamStore = useChatStreamStore()
const controlsIslandStore = useControlsIslandStore()
const { width: windowWidth, height: windowHeight } = useWindowSize()

const { messages } = storeToRefs(chatSessionStore)
const { streamingMessage } = storeToRefs(chatStreamStore)
const { chatBubbleEnabled } = storeToRefs(controlsIslandStore)

const streamingText = computed(() => {
  if (!streamingMessage.value.slices?.length)
    return ''

  return normalizeBubbleText(resolveAssistantText(streamingMessage.value))
})
const latestAssistantText = computed(() => {
  for (let index = messages.value.length - 1; index >= 0; index -= 1) {
    const message = messages.value[index]
    if (isAssistantMessage(message))
      return normalizeBubbleText(resolveAssistantText(message))
  }

  return ''
})
const fullText = computed(() => streamingText.value || latestAssistantText.value)
const displayText = computed(() => truncateBubbleText(fullText.value))
const visible = computed(() => chatBubbleEnabled.value && displayText.value.length > 0)
const bubblePlacement = computed(() => {
  const viewportWidth = Math.max(1, windowWidth.value)
  const viewportHeight = Math.max(1, windowHeight.value)
  const maxWidth = Math.max(120, Math.min(BUBBLE_MAX_WIDTH, viewportWidth - BUBBLE_MARGIN * 2))
  const anchor = props.anchorBounds

  if (!anchor) {
    return {
      side: 'right',
      style: {
        'left': `${BUBBLE_MARGIN}px`,
        'top': `${Math.min(60, Math.max(BUBBLE_MARGIN, viewportHeight - 120))}px`,
        '--stage-chat-bubble-max-width': `${maxWidth}px`,
      },
    }
  }

  const side = anchor.centerX > viewportWidth / 2 ? 'left' : 'right'
  const preferredLeft = side === 'left'
    ? anchor.left - maxWidth - BUBBLE_GAP
    : anchor.right + BUBBLE_GAP
  const left = clampBubbleCoordinate(preferredLeft, BUBBLE_MARGIN, Math.max(BUBBLE_MARGIN, viewportWidth - maxWidth - BUBBLE_MARGIN))
  const preferredTop = anchor.top + Math.max(8, anchor.height * 0.12)
  const top = clampBubbleCoordinate(preferredTop, BUBBLE_MARGIN, Math.max(BUBBLE_MARGIN, viewportHeight - 96))

  return {
    side,
    style: {
      'left': `${left}px`,
      'top': `${top}px`,
      '--stage-chat-bubble-max-width': `${maxWidth}px`,
    },
  }
})

function isAssistantMessage(message: ChatHistoryItem | undefined): message is ChatAssistantMessage & ChatHistoryItem {
  return message?.role === 'assistant'
}

function resolveAssistantText(message: ChatAssistantMessage): string {
  const speechText = message.categorization?.speech?.trim()
  if (speechText)
    return speechText

  const slicesText = textFromSlices(message.slices)
  if (slicesText)
    return slicesText

  return textFromContent(message.content)
}

function textFromSlices(slices: ChatAssistantMessage['slices'] | undefined): string {
  if (!slices?.length)
    return ''

  return slices
    .filter((slice): slice is ChatSlicesText => slice.type === 'text')
    .map(slice => slice.text)
    .join('')
}

function textFromContent(content: unknown): string {
  if (typeof content === 'string')
    return content

  if (!Array.isArray(content))
    return ''

  return content
    .map(part => isTextContentPart(part) ? part.text : '')
    .join('')
}

function isTextContentPart(part: unknown): part is { type: 'text', text: string } {
  if (typeof part !== 'object' || part === null)
    return false

  const record = part as Record<string, unknown>
  return record.type === 'text' && typeof record.text === 'string'
}

function normalizeBubbleText(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

function truncateBubbleText(text: string): string {
  if (text.length <= MAX_BUBBLE_TEXT_LENGTH)
    return text

  return `${text.slice(0, MAX_BUBBLE_TEXT_LENGTH).trimEnd()}...`
}

function clampBubbleCoordinate(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}
</script>

<template>
  <Transition
    enter-active-class="transition-all duration-250 ease-out"
    enter-from-class="opacity-0 translate-y-1 scale-98"
    enter-to-class="opacity-100 translate-y-0 scale-100"
    leave-active-class="transition-all duration-200 ease-in"
    leave-from-class="opacity-100 translate-y-0 scale-100"
    leave-to-class="opacity-0 translate-y-1 scale-98"
  >
    <div
      v-if="visible"
      aria-live="polite"
      class="stage-chat-bubble pointer-events-none absolute z-40"
      role="status"
      :data-side="bubblePlacement.side"
      :style="bubblePlacement.style"
    >
      <div
        :class="[
          'stage-chat-bubble-panel',
          'relative',
          'max-h-[35vh] overflow-hidden',
          'rounded-2xl rounded-bl-sm',
          'border border-solid border-white/70 dark:border-neutral-800/70',
          'bg-white/88 dark:bg-neutral-950/88',
          'px-3.5 py-2.5',
          'shadow-lg shadow-black/12 dark:shadow-black/35',
          'backdrop-blur-xl',
        ]"
      >
        <p
          :class="[
            'm-0',
            'break-words text-sm leading-relaxed',
            'text-neutral-900 dark:text-neutral-100',
            'font-normal',
          ]"
        >
          {{ displayText }}
        </p>
        <div class="stage-chat-bubble-tail" />
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.stage-chat-bubble-panel {
  max-width: min(22rem, var(--stage-chat-bubble-max-width, calc(100vw - 1.5rem)));
}

.stage-chat-bubble-tail {
  position: absolute;
  bottom: -0.375rem;
  left: 1.35rem;
  width: 0.75rem;
  height: 0.75rem;
  transform: rotate(45deg);
  border-bottom: 1px solid rgb(255 255 255 / 70%);
  border-right: 1px solid rgb(255 255 255 / 70%);
  background: rgb(255 255 255 / 88%);
}

.stage-chat-bubble[data-side="left"] .stage-chat-bubble-tail {
  right: 1.35rem;
  left: auto;
}

:global(.dark) .stage-chat-bubble-tail {
  border-color: rgb(38 38 38 / 70%);
  background: rgb(10 10 10 / 88%);
}
</style>
