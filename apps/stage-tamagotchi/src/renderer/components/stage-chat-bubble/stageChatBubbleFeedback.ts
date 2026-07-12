import type { MemoryScope } from '@proj-airi/memory'
import type { ChatAssistantMessage, ChatHistoryItem } from '@proj-airi/stage-ui/types/chat'
import type { ChatSessionMeta } from '@proj-airi/stage-ui/types/chat-session'

/** Persisted assistant response that the currently visible bubble may evaluate. */
export interface StageChatBubbleFeedbackTarget {
  scope: MemoryScope
  sessionId: string
  messageId: string
  text: string
}

export interface ResolveStageChatBubbleFeedbackTargetInput {
  messages: ChatHistoryItem[]
  activeSessionId: string
  sessionMeta?: ChatSessionMeta
  streamingText: string
  companionLifeMessage: string
  resolveAssistantText: (message: ChatAssistantMessage) => string
}

/**
 * Resolves feedback only for the persisted assistant response that is actually visible.
 * Streaming and Desktop Life text temporarily own the bubble and therefore suppress feedback.
 */
export function resolveStageChatBubbleFeedbackTarget(
  input: ResolveStageChatBubbleFeedbackTargetInput,
): StageChatBubbleFeedbackTarget | undefined {
  if (input.streamingText || input.companionLifeMessage || !input.activeSessionId || !input.sessionMeta)
    return undefined

  for (let index = input.messages.length - 1; index >= 0; index -= 1) {
    const message = input.messages[index]
    if (message?.role !== 'assistant')
      continue

    const text = input.resolveAssistantText(message).trim()
    if (!message.id || !text)
      return undefined

    return {
      scope: {
        ownerId: input.sessionMeta.userId,
        characterId: input.sessionMeta.characterId,
      },
      sessionId: input.activeSessionId,
      messageId: message.id,
      text,
    }
  }

  return undefined
}
