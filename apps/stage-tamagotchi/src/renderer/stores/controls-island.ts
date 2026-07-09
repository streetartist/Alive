import { useLocalStorage } from '@vueuse/core'
import { defineStore } from 'pinia'

export const useControlsIslandStore = defineStore('controls-island', () => {
  // Persist fade-on-hover preference per user
  const fadeOnHoverEnabled = useLocalStorage<boolean>('controls-island/fade-on-hover-enabled', false)
  const chatBubbleEnabled = useLocalStorage<boolean>('controls-island/chat-bubble-enabled', true)
  const dontShowItAgainNoticeFadeOnHover = useLocalStorage<boolean>('preferences/dont-show-it-again/notice/fade-on-hover', false)

  function enableFadeOnHover() {
    fadeOnHoverEnabled.value = true
  }

  function disableFadeOnHover() {
    fadeOnHoverEnabled.value = false
  }

  function enableChatBubble() {
    chatBubbleEnabled.value = true
  }

  function disableChatBubble() {
    chatBubbleEnabled.value = false
  }

  function toggleChatBubble() {
    chatBubbleEnabled.value = !chatBubbleEnabled.value
  }

  return {
    fadeOnHoverEnabled,
    chatBubbleEnabled,
    dontShowItAgainNoticeFadeOnHover,
    enableFadeOnHover,
    disableFadeOnHover,
    enableChatBubble,
    disableChatBubble,
    toggleChatBubble,
  }
})
