<script setup lang="ts">
import type { ChatAssistantMessage, ChatHistoryItem, ChatSlicesText } from '@proj-airi/stage-ui/types/chat'

import type { StageChatBubbleAnchorBounds, StageChatBubbleStoredOffset } from './stageChatBubblePlacement'

import { useChatSessionStore } from '@proj-airi/stage-ui/stores/chat/session-store'
import { useChatStreamStore } from '@proj-airi/stage-ui/stores/chat/stream-store'
import { useCompanionStore } from '@proj-airi/stage-ui/stores/modules/companion'
import { useCompanionLifeStore } from '@proj-airi/stage-ui/stores/modules/companion-life'
import { useElementSize, useEventListener, useLocalStorage, useWindowSize } from '@vueuse/core'
import { storeToRefs } from 'pinia'
import { computed, shallowRef, useTemplateRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import { useControlsIslandStore } from '../../stores/controls-island'
import { resolveStageChatBubbleFeedbackTarget } from './stageChatBubbleFeedback'
import { resolveStageChatBubbleDragOffset, resolveStageChatBubblePlacement } from './stageChatBubblePlacement'

const props = defineProps<{
  anchorBounds?: StageChatBubbleAnchorBounds | null
}>()

const emit = defineEmits<{
  draggingChange: [dragging: boolean]
}>()

/** Keeps the stage overlay glanceable; the full response remains available in the chat window. */
const MAX_BUBBLE_TEXT_LENGTH = 280

interface BubbleDragState {
  anchorScale: number
  pointerId: number
  startClientX: number
  startClientY: number
  startOffset: StageChatBubbleStoredOffset
}

const chatSessionStore = useChatSessionStore()
const chatStreamStore = useChatStreamStore()
const companionStore = useCompanionStore()
const companionLifeStore = useCompanionLifeStore()
const controlsIslandStore = useControlsIslandStore()
const bubbleElementRef = useTemplateRef<HTMLDivElement>('bubble')
const { width: windowWidth, height: windowHeight } = useWindowSize()
const { width: bubbleWidth, height: bubbleHeight } = useElementSize(bubbleElementRef)

const { t } = useI18n()
const { activeSessionId, messages, sessionMetas } = storeToRefs(chatSessionStore)
const { streamingMessage } = storeToRefs(chatStreamStore)
const { message: companionLifeMessage } = storeToRefs(companionLifeStore)
const { chatBubbleEnabled } = storeToRefs(controlsIslandStore)
const chatBubbleOffset = useLocalStorage<StageChatBubbleStoredOffset>('stage-chat-bubble/manual-offset', { x: 0, y: 0 })
const dragState = shallowRef<BubbleDragState | null>(null)
const feedbackPendingMessageId = shallowRef<string>()
const dragging = computed(() => dragState.value !== null)

const streamingText = computed(() => {
  if (!streamingMessage.value.slices?.length)
    return ''

  return normalizeBubbleText(resolveAssistantText(streamingMessage.value))
})
const latestAssistantMessage = computed(() => {
  for (let index = messages.value.length - 1; index >= 0; index -= 1) {
    const message = messages.value[index]
    if (isAssistantMessage(message))
      return message
  }

  return undefined
})
const latestAssistantText = computed(() => latestAssistantMessage.value
  ? normalizeBubbleText(resolveAssistantText(latestAssistantMessage.value))
  : '')
const fullText = computed(() => streamingText.value || companionLifeMessage.value || latestAssistantText.value)
const displayText = computed(() => truncateBubbleText(fullText.value))
const visible = computed(() => chatBubbleEnabled.value && displayText.value.length > 0)
const feedbackTarget = computed(() => resolveStageChatBubbleFeedbackTarget({
  messages: messages.value,
  activeSessionId: activeSessionId.value,
  sessionMeta: sessionMetas.value[activeSessionId.value],
  streamingText: streamingText.value,
  companionLifeMessage: companionLifeMessage.value,
  resolveAssistantText: message => normalizeBubbleText(resolveAssistantText(message)),
}))
const feedbackSentiment = computed(() => {
  const target = feedbackTarget.value
  return target
    ? companionStore.feedbackFor(target.scope, `${target.sessionId}:${target.messageId}`)
    : undefined
})
const bubblePlacement = computed(() => {
  const placement = resolveStageChatBubblePlacement({
    anchorBounds: props.anchorBounds,
    bubbleHeight: bubbleHeight.value,
    bubbleWidth: bubbleWidth.value,
    manualOffset: chatBubbleOffset.value,
    viewportHeight: windowHeight.value,
    viewportWidth: windowWidth.value,
  })

  return {
    ...placement,
    style: {
      'left': `${placement.left}px`,
      'top': `${placement.top}px`,
      '--stage-chat-bubble-max-width': `${placement.maxWidth}px`,
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

/**
 * Strips AIRI control markers so they never appear in the stage overlay bubble.
 * Markers are handled for emotion/delay by the TTS special-token path.
 *
 * Before: `<|ACT {"emotion":"happy"}|>你好<|DELAY 1|>`
 * After:  `你好`
 */
function stripControlMarkers(text: string): string {
  return text.replace(/<\|[\s\S]*?\|>/g, '')
}

function normalizeBubbleText(text: string): string {
  return stripControlMarkers(text).replace(/\s+/g, ' ').trim()
}

function truncateBubbleText(text: string): string {
  if (text.length <= MAX_BUBBLE_TEXT_LENGTH)
    return text

  return `${text.slice(0, MAX_BUBBLE_TEXT_LENGTH).trimEnd()}...`
}

async function submitFeedback(sentiment: 'positive' | 'negative') {
  const target = feedbackTarget.value
  if (!target || feedbackSentiment.value || feedbackPendingMessageId.value)
    return

  feedbackPendingMessageId.value = target.messageId
  try {
    await companionStore.recordFeedback(
      { ...target.scope },
      `${target.sessionId}:${target.messageId}`,
      sentiment,
    )
  }
  catch (error) {
    console.warn('[companion] Failed to save response feedback', error)
  }
  finally {
    if (feedbackPendingMessageId.value === target.messageId)
      feedbackPendingMessageId.value = undefined
  }
}

function handlePointerDown(event: PointerEvent) {
  if (event.button !== 0)
    return

  event.preventDefault()
  bubbleElementRef.value?.setPointerCapture(event.pointerId)
  dragState.value = {
    anchorScale: bubblePlacement.value.anchorScale,
    pointerId: event.pointerId,
    startClientX: event.clientX,
    startClientY: event.clientY,
    startOffset: {
      x: Number.isFinite(chatBubbleOffset.value.x) ? chatBubbleOffset.value.x : 0,
      y: Number.isFinite(chatBubbleOffset.value.y) ? chatBubbleOffset.value.y : 0,
    },
  }
  emit('draggingChange', true)
}

function handlePointerMove(event: PointerEvent) {
  const state = dragState.value
  if (!state)
    return

  event.preventDefault()
  chatBubbleOffset.value = resolveStageChatBubbleDragOffset({
    anchorScale: state.anchorScale,
    currentClientX: event.clientX,
    currentClientY: event.clientY,
    startClientX: state.startClientX,
    startClientY: state.startClientY,
    startOffset: state.startOffset,
  })
}

function stopDragging() {
  const state = dragState.value
  if (!state)
    return

  try {
    bubbleElementRef.value?.releasePointerCapture(state.pointerId)
  }
  catch {
    // Pointer capture can already be released by the browser when the pointer leaves the window.
  }
  dragState.value = null
  emit('draggingChange', false)
}

watch(visible, (nextVisible) => {
  if (!nextVisible)
    stopDragging()
})

useEventListener(window, 'pointermove', handlePointerMove, { passive: false })
useEventListener(window, 'pointerup', stopDragging, { passive: true })
useEventListener(window, 'pointercancel', stopDragging, { passive: true })

defineExpose({
  rootElement: () => bubbleElementRef.value,
})
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
      ref="bubble"
      :aria-label="t('settings.pages.companion.feedbackActions.group')"
      :class="[
        'stage-chat-bubble',
        'pointer-events-auto absolute z-40 select-none',
        dragging ? 'cursor-grabbing' : 'cursor-grab',
      ]"
      role="group"
      :data-side="bubblePlacement.side"
      :style="bubblePlacement.style"
      @pointerdown="handlePointerDown"
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
          aria-live="polite"
          :class="[
            'm-0',
            'break-words text-sm leading-relaxed',
            'text-neutral-900 dark:text-neutral-100',
            'font-normal',
          ]"
        >
          {{ displayText }}
        </p>
        <div
          v-if="feedbackTarget"
          :class="['mt-2 flex items-center justify-end gap-1 border-t border-neutral-200/60 pt-1.5 dark:border-neutral-800/60']"
        >
          <button
            type="button"
            :aria-label="t('settings.pages.companion.feedbackActions.positive')"
            :aria-pressed="feedbackSentiment === 'positive'"
            :disabled="feedbackSentiment !== undefined || feedbackPendingMessageId !== undefined"
            :class="[
              'flex size-7 items-center justify-center rounded-full transition-colors',
              feedbackSentiment === 'positive'
                ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300'
                : 'text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700 dark:hover:bg-neutral-800 dark:hover:text-neutral-200',
              'disabled:cursor-default disabled:opacity-70',
            ]"
            @pointerdown.stop
            @click.stop="submitFeedback('positive')"
          >
            <span aria-hidden="true" :class="['i-lucide:thumbs-up text-sm']" />
          </button>
          <button
            type="button"
            :aria-label="t('settings.pages.companion.feedbackActions.negative')"
            :aria-pressed="feedbackSentiment === 'negative'"
            :disabled="feedbackSentiment !== undefined || feedbackPendingMessageId !== undefined"
            :class="[
              'flex size-7 items-center justify-center rounded-full transition-colors',
              feedbackSentiment === 'negative'
                ? 'bg-orange-100 text-orange-700 dark:bg-orange-950/60 dark:text-orange-300'
                : 'text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700 dark:hover:bg-neutral-800 dark:hover:text-neutral-200',
              'disabled:cursor-default disabled:opacity-70',
            ]"
            @pointerdown.stop
            @click.stop="submitFeedback('negative')"
          >
            <span aria-hidden="true" :class="['i-lucide:thumbs-down text-sm']" />
          </button>
        </div>
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
