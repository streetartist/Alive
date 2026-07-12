import type { ChatHistoryItem } from '@proj-airi/stage-ui/types/chat'
import type { ChatSessionMeta } from '@proj-airi/stage-ui/types/chat-session'

import { describe, expect, it } from 'vitest'

import { resolveStageChatBubbleFeedbackTarget } from './stageChatBubbleFeedback'

const sessionMeta = {
  sessionId: 'session',
  userId: 'owner',
  characterId: 'character',
  createdAt: 1,
  updatedAt: 1,
} satisfies ChatSessionMeta

function resolve(messages: ChatHistoryItem[], overrides: Partial<Parameters<typeof resolveStageChatBubbleFeedbackTarget>[0]> = {}) {
  return resolveStageChatBubbleFeedbackTarget({
    messages,
    activeSessionId: 'session',
    sessionMeta,
    streamingText: '',
    companionLifeMessage: '',
    resolveAssistantText: message => typeof message.content === 'string' ? message.content : '',
    ...overrides,
  })
}

describe('stage chat bubble feedback target', () => {
  it('binds the latest persisted assistant to its session-owned scope', () => {
    const target = resolve([
      { role: 'assistant', id: 'older', content: 'Older', slices: [], tool_results: [] },
      { role: 'user', id: 'user', content: 'Question' },
      { role: 'assistant', id: 'latest', content: 'Latest', slices: [], tool_results: [] },
    ])

    expect(target).toEqual({
      scope: { ownerId: 'owner', characterId: 'character' },
      sessionId: 'session',
      messageId: 'latest',
      text: 'Latest',
    })
  })

  it('suppresses feedback while streaming or Desktop Life owns the bubble', () => {
    const messages = [{ role: 'assistant', id: 'assistant', content: 'Done', slices: [], tool_results: [] }] satisfies ChatHistoryItem[]

    expect(resolve(messages, { streamingText: 'Working' })).toBeUndefined()
    expect(resolve(messages, { companionLifeMessage: 'Good morning' })).toBeUndefined()
  })

  it('rejects missing message ids, empty text, and missing session metadata', () => {
    expect(resolve([{ role: 'assistant', content: 'No id', slices: [], tool_results: [] }])).toBeUndefined()
    expect(resolve([{ role: 'assistant', id: 'empty', content: '', slices: [], tool_results: [] }])).toBeUndefined()
    expect(resolve([{ role: 'assistant', id: 'ok', content: 'Done', slices: [], tool_results: [] }], { sessionMeta: undefined })).toBeUndefined()
  })
})
