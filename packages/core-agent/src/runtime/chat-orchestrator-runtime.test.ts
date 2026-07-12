import type { MemoryRecallMatch, MemoryRecord, MemoryScope } from '@proj-airi/memory'
import type { ChatProvider } from '@xsai-ext/providers/utils'
import type { Message } from '@xsai/shared-chat'

import type { ChatHistoryItem, ContextMessage, StreamingAssistantMessage } from '../types/chat'
import type { StreamEvent } from '../types/llm'
import type { ChatOrchestratorMemoryOptions, ChatOrchestratorMemoryPort } from './chat-orchestrator-runtime'

import { ContextUpdateStrategy } from '@proj-airi/server-shared/types'
import { describe, expect, it, vi } from 'vitest'

import { createChatOrchestratorRuntime } from './chat-orchestrator-runtime'

const provider = {
  chat: () => ({ baseURL: 'https://example.com/' }),
} as unknown as ChatProvider

const memoryScope: MemoryScope = {
  ownerId: 'owner-1',
  characterId: 'character-1',
}

function createMemoryMatch(overrides: Partial<MemoryRecord> = {}): MemoryRecallMatch {
  return {
    score: 0.9,
    record: {
      schemaVersion: 2,
      id: 'memory-1',
      scope: memoryScope,
      kind: 'experience',
      importance: 0.5,
      emotionalWeight: 0,
      content: 'The user likes jasmine tea.',
      source: {
        type: 'chat-turn',
        sessionId: 'session-previous',
        turnId: 'turn-previous',
        messageIds: ['previous-user', 'previous-assistant'],
      },
      createdAt: Date.UTC(2026, 3, 20, 12, 30),
      updatedAt: Date.UTC(2026, 3, 20, 12, 30),
      accessCount: 0,
      ...overrides,
    },
  }
}

interface HarnessOptions {
  activeSessionId?: string
  memory?: ChatOrchestratorMemoryPort
  memoryOptions?: ChatOrchestratorMemoryOptions
  memoryScope?: (sessionId: string) => MemoryScope | undefined
}

function createHarness(options: HarnessOptions = {}) {
  const sessionMessages: Record<string, ChatHistoryItem[]> = {
    'session-1': [
      {
        role: 'system',
        content: 'system prompt',
        createdAt: new Date(2026, 3, 25, 18, 0).getTime(),
        id: 'system',
      },
    ],
  }
  const contextSnapshot: Record<string, ContextMessage[]> = {}
  const foregroundPatches: StreamingAssistantMessage[] = []
  const foregroundResets: StreamingAssistantMessage[] = []
  const lifecycleRecords: unknown[] = []
  const promptProjections: unknown[] = []
  const userAppended: unknown[] = []
  const assistantAppended: unknown[] = []
  const userTurns: unknown[] = []
  const assistantTurns: unknown[] = []
  const durableTurns: unknown[] = []
  const stateChanges: unknown[] = []
  const telemetry = {
    chatActivationStarted: [] as unknown[],
    chatActivationSucceeded: [] as unknown[],
    chatActivationFailed: [] as unknown[],
    messageSendStarted: [] as unknown[],
    llmRequestStarted: [] as unknown[],
    llmFirstToken: [] as unknown[],
    assistantResponseRendered: [] as unknown[],
    messageRound: [] as unknown[],
  }
  const stream = vi.fn(async (_model: string, _chatProvider: ChatProvider, _messages: Message[], options?: {
    onStreamEvent?: (event: StreamEvent) => Promise<void> | void
  }) => {
    await options?.onStreamEvent?.({ type: 'text-delta', text: 'assistant reply' })
    await options?.onStreamEvent?.({ type: 'finish', finishReason: 'stop' })
  })
  const ids = ['stream-context', 'assistant-id', 'user-id', 'fallback-id']
  let systemPromptSupplement: string | undefined
  let nowValue = new Date(2026, 3, 25, 18, 47).getTime()
  let monotonicNowValues = [1000]
  const generations: Record<string, number> = {
    'session-1': 1,
    'session-2': 1,
  }
  const assistantTurnReady = vi.fn((event) => {
    assistantTurns.push(event)
  })
  const durableTurnRemembered = vi.fn((event) => {
    durableTurns.push(event)
  })

  const runtime = createChatOrchestratorRuntime({
    session: {
      ensureSession: (sessionId) => {
        sessionMessages[sessionId] ??= []
      },
      getSessionMessages: sessionId => structuredClone(sessionMessages[sessionId] ?? []),
      appendSessionMessage: (sessionId, message) => {
        sessionMessages[sessionId] ??= []
        sessionMessages[sessionId].push(message)
      },
      getSessionGeneration: sessionId => generations[sessionId] ?? 1,
    },
    context: {
      ingest: vi.fn(),
      snapshot: () => structuredClone(contextSnapshot),
    },
    foregroundStream: {
      patch: message => foregroundPatches.push(message),
      reset: () => foregroundResets.push({ role: 'assistant', content: '', slices: [], tool_results: [] }),
    },
    llm: {
      stream,
    },
    getActiveSessionId: () => options.activeSessionId ?? 'session-1',
    getActiveProvider: () => 'mock-provider',
    getSystemPromptSupplement: () => systemPromptSupplement,
    memory: options.memory,
    getMemoryScope: options.memoryScope,
    getMemoryOptions: () => options.memoryOptions,
    now: () => nowValue,
    monotonicNow: () => monotonicNowValues.shift() ?? 1000,
    createId: () => ids.shift() ?? 'generated-id',
    onLifecycle: record => lifecycleRecords.push(record),
    onPromptProjection: payload => promptProjections.push(payload),
    onUserMessageAppended: event => userAppended.push(event),
    onAssistantMessageAppended: event => assistantAppended.push(event),
    onUserTurnReady: event => userTurns.push(event),
    onAssistantTurnReady: assistantTurnReady,
    onDurableTurnRemembered: durableTurnRemembered,
    onStateChange: state => stateChanges.push(state),
    onChatActivationStarted: event => telemetry.chatActivationStarted.push(event),
    onChatActivationSucceeded: event => telemetry.chatActivationSucceeded.push(event),
    onChatActivationFailed: event => telemetry.chatActivationFailed.push(event),
    onMessageSendStarted: event => telemetry.messageSendStarted.push(event),
    onLlmRequestStarted: event => telemetry.llmRequestStarted.push(event),
    onLlmFirstToken: event => telemetry.llmFirstToken.push(event),
    onAssistantResponseRendered: event => telemetry.assistantResponseRendered.push(event),
    onMessageRound: event => telemetry.messageRound.push(event),
  })

  return {
    assistantAppended,
    assistantTurnReady,
    assistantTurns,
    contextSnapshot,
    foregroundPatches,
    foregroundResets,
    durableTurnRemembered,
    durableTurns,
    generation: {
      set: (next: number, sessionId = 'session-1') => {
        generations[sessionId] = next
      },
    },
    lifecycleRecords,
    now: {
      set: (next: number) => {
        nowValue = next
      },
    },
    monotonicNow: {
      set: (next: number[]) => {
        monotonicNowValues = [...next]
      },
    },
    promptProjections,
    runtime,
    sessionMessages,
    stateChanges,
    stream,
    systemPromptSupplement: {
      set: (next: string | undefined) => {
        systemPromptSupplement = next
      },
    },
    telemetry,
    userAppended,
    userTurns,
  }
}

/**
 * @example
 * const runtime = createChatOrchestratorRuntime(deps)
 * await runtime.ingest('hello', { model, chatProvider })
 */
describe('createChatOrchestratorRuntime', () => {
  /**
   * @example
   * Hook order and prompt composition stay compatible with the stage-ui facade.
   */
  it('keeps hook order and appends context prompt to the latest user message', async () => {
    const harness = createHarness()
    harness.contextSnapshot['system:weather'] = [
      {
        id: 'weather',
        contextId: 'system:weather',
        strategy: ContextUpdateStrategy.ReplaceSelf,
        text: 'sunny',
        createdAt: 1,
      },
    ]
    const hookOrder: string[] = []
    let composedMessages: Message[] = []

    harness.runtime.hooks.onBeforeMessageComposed(async () => {
      hookOrder.push('before-compose')
    })
    harness.runtime.hooks.onAfterMessageComposed(async () => {
      hookOrder.push('after-compose')
    })
    harness.runtime.hooks.onBeforeSend(async () => {
      hookOrder.push('before-send')
    })
    harness.runtime.hooks.onTokenLiteral(async () => {
      hookOrder.push('token-literal')
    })
    harness.runtime.hooks.onStreamEnd(async () => {
      hookOrder.push('stream-end')
    })
    harness.runtime.hooks.onAssistantResponseEnd(async () => {
      hookOrder.push('assistant-end')
    })
    harness.runtime.hooks.onAfterSend(async () => {
      hookOrder.push('after-send')
    })
    harness.runtime.hooks.onAssistantMessage(async () => {
      hookOrder.push('assistant-message')
    })
    harness.runtime.hooks.onChatTurnComplete(async () => {
      hookOrder.push('turn-complete')
    })
    harness.stream.mockImplementationOnce(async (_model, _chatProvider, messages, options) => {
      composedMessages = messages
      await options?.onStreamEvent?.({ type: 'text-delta', text: 'hello' })
      await options?.onStreamEvent?.({ type: 'finish', finishReason: 'stop' })
    })

    await harness.runtime.ingest('hello from user', {
      model: 'gpt-test',
      chatProvider: provider,
    })

    expect(hookOrder).toEqual([
      'before-compose',
      'after-compose',
      'before-send',
      'token-literal',
      'stream-end',
      'assistant-end',
      'after-send',
      'assistant-message',
      'turn-complete',
    ])
    expect(composedMessages).toHaveLength(2)
    expect(composedMessages[0]).toMatchObject({ role: 'system', content: 'system prompt' })
    expect(composedMessages[1]).toMatchObject({ role: 'user' })
    expect(composedMessages[1]?.content).toEqual([
      {
        type: 'text',
        text: '[2026-04-25 18:47] hello from user',
      },
      {
        type: 'text',
        text: '\n[Context]\n- system:weather: sunny',
      },
    ])
    expect(harness.lifecycleRecords).toEqual(expect.arrayContaining([
      expect.objectContaining({ phase: 'before-compose' }),
      expect.objectContaining({ phase: 'prompt-context-built' }),
      expect.objectContaining({ phase: 'after-compose' }),
    ]))
    expect(harness.promptProjections).toHaveLength(1)
  })

  it('recalls bounded memory into the provider prompt without persisting it', async () => {
    const recall = vi.fn<ChatOrchestratorMemoryPort['recall']>().mockResolvedValue([
      createMemoryMatch(),
      createMemoryMatch({ id: 'memory-overflow', content: 'TOP SECRET OVERFLOW' }),
    ])
    const rememberTurn = vi.fn<ChatOrchestratorMemoryPort['rememberTurn']>().mockResolvedValue(undefined)
    const harness = createHarness({
      memory: {
        id: 'test-memory',
        recall,
        rememberTurn,
      },
      memoryOptions: {
        recallLimit: 1,
        promptCharacterLimit: 320,
      },
      memoryScope: () => memoryScope,
    })
    harness.contextSnapshot['system:weather'] = [
      {
        id: 'weather',
        contextId: 'system:weather',
        strategy: ContextUpdateStrategy.ReplaceSelf,
        text: 'sunny',
        createdAt: 1,
      },
    ]
    let composedMessages: Message[] = []
    harness.stream.mockImplementationOnce(async (_model, _chatProvider, messages, options) => {
      composedMessages = messages
      await options?.onStreamEvent?.({ type: 'text-delta', text: 'assistant reply' })
      await options?.onStreamEvent?.({ type: 'finish', finishReason: 'stop' })
    })

    await harness.runtime.ingest('Would I enjoy this tea?', {
      model: 'gpt-test',
      chatProvider: provider,
    })

    expect(recall).toHaveBeenCalledTimes(1)
    expect(recall).toHaveBeenCalledWith({
      scope: memoryScope,
      sessionId: 'session-1',
      query: 'Would I enjoy this tea?',
      limit: 1,
      excludeSourceMessageIds: ['system', 'user-id'],
    })
    expect(composedMessages).toHaveLength(2)
    expect(composedMessages[0]).toEqual({
      role: 'system',
      content: 'system prompt',
    })

    const userContent = composedMessages[1]?.content
    expect(Array.isArray(userContent)).toBe(true)
    if (!Array.isArray(userContent))
      throw new Error('Expected provider user content parts')

    expect(userContent).toHaveLength(3)
    expect(userContent[0]).toEqual({
      type: 'text',
      text: '[2026-04-25 18:47] Would I enjoy this tea?',
    })
    expect(userContent[1]).toMatchObject({
      type: 'text',
      text: expect.stringContaining('[Memory context]'),
    })
    expect(userContent[1]).toMatchObject({
      text: expect.stringContaining('id="memory-1"'),
    })
    expect(userContent[1]).not.toMatchObject({
      text: expect.stringContaining('TOP SECRET OVERFLOW'),
    })
    expect(userContent[2]).toEqual({
      type: 'text',
      text: '\n[Context]\n- system:weather: sunny',
    })

    const persistedHistory = JSON.stringify(harness.sessionMessages['session-1'])
    expect(persistedHistory).not.toContain('[Memory context]')
    expect(persistedHistory).not.toContain('memory-1')
    expect(rememberTurn).toHaveBeenCalledTimes(1)
  })

  it('fails open when recall rejects and still remembers the completed turn', async () => {
    const recall = vi.fn<ChatOrchestratorMemoryPort['recall']>().mockRejectedValue(new Error('backend recall secret'))
    const rememberTurn = vi.fn<ChatOrchestratorMemoryPort['rememberTurn']>().mockResolvedValue(undefined)
    const harness = createHarness({
      memory: {
        id: 'test-memory',
        recall,
        rememberTurn,
      },
      memoryScope: () => memoryScope,
    })

    await harness.runtime.ingest('hello despite recall failure', {
      model: 'gpt-test',
      chatProvider: provider,
    })

    expect(harness.stream).toHaveBeenCalledTimes(1)
    expect(harness.sessionMessages['session-1']?.at(-1)).toMatchObject({
      role: 'assistant',
      content: 'assistant reply',
    })
    expect(harness.telemetry.chatActivationFailed).toEqual([])
    expect(rememberTurn).toHaveBeenCalledTimes(1)
    expect(JSON.stringify(harness.stream.mock.calls[0]?.[2])).not.toContain('backend recall secret')
    expect(JSON.stringify(harness.sessionMessages['session-1'])).not.toContain('backend recall secret')
    expect(harness.lifecycleRecords).toContainEqual(expect.objectContaining({
      phase: 'memory-recall',
      details: expect.objectContaining({
        backendId: 'test-memory',
        status: 'failed',
      }),
    }))
  })

  it('fails open when completed-turn persistence rejects', async () => {
    const recall = vi.fn<ChatOrchestratorMemoryPort['recall']>().mockResolvedValue([])
    const rememberTurn = vi.fn<ChatOrchestratorMemoryPort['rememberTurn']>().mockRejectedValue(new Error('backend write failed'))
    const harness = createHarness({
      memory: {
        id: 'test-memory',
        recall,
        rememberTurn,
      },
      memoryScope: () => memoryScope,
    })

    await harness.runtime.ingest('persist this if possible', {
      model: 'gpt-test',
      chatProvider: provider,
    })

    expect(rememberTurn).toHaveBeenCalledTimes(1)
    expect(harness.durableTurnRemembered).not.toHaveBeenCalled()
    expect(harness.sessionMessages['session-1']?.at(-1)).toMatchObject({
      role: 'assistant',
      content: 'assistant reply',
    })
    expect(harness.telemetry.chatActivationSucceeded).toHaveLength(1)
    expect(harness.telemetry.chatActivationFailed).toEqual([])
    expect(harness.foregroundResets).toHaveLength(1)
    expect(harness.lifecycleRecords).toContainEqual(expect.objectContaining({
      phase: 'memory-remember',
      details: expect.objectContaining({
        backendId: 'test-memory',
        status: 'failed',
      }),
    }))
  })

  it('emits one durable-turn event after memory accepts the completed turn', async () => {
    const rememberedRecord = createMemoryMatch().record
    const order: string[] = []
    const recall = vi.fn<ChatOrchestratorMemoryPort['recall']>().mockResolvedValue([])
    const rememberTurn = vi.fn<ChatOrchestratorMemoryPort['rememberTurn']>().mockImplementation(async () => {
      order.push('remember')
      return rememberedRecord
    })
    const harness = createHarness({
      memory: {
        id: 'test-memory',
        recall,
        rememberTurn,
      },
      memoryScope: () => memoryScope,
    })
    harness.durableTurnRemembered.mockImplementationOnce((event) => {
      order.push('durable-turn')
      harness.durableTurns.push(event)
    })
    harness.assistantTurnReady.mockImplementationOnce((event) => {
      order.push('assistant-turn')
      harness.assistantTurns.push(event)
    })

    await harness.runtime.ingest('remember this turn', {
      model: 'gpt-test',
      chatProvider: provider,
    })

    expect(harness.durableTurnRemembered).toHaveBeenCalledTimes(1)
    expect(harness.durableTurns).toEqual([{
      sessionId: 'session-1',
      scope: memoryScope,
      user: {
        id: 'user-id',
        text: 'remember this turn',
        createdAt: new Date(2026, 3, 25, 18, 47).getTime(),
      },
      assistant: {
        id: 'assistant-id',
        text: 'assistant reply',
        createdAt: new Date(2026, 3, 25, 18, 47).getTime(),
      },
      memoryRecord: rememberedRecord,
      messageText: 'assistant reply',
    }])
    expect(order).toEqual(['remember', 'durable-turn', 'assistant-turn'])
  })

  it('does not emit a durable-turn event when memory declines the completed turn', async () => {
    const recall = vi.fn<ChatOrchestratorMemoryPort['recall']>().mockResolvedValue([])
    const rememberTurn = vi.fn<ChatOrchestratorMemoryPort['rememberTurn']>().mockResolvedValue(undefined)
    const harness = createHarness({
      memory: {
        id: 'test-memory',
        recall,
        rememberTurn,
      },
      memoryScope: () => memoryScope,
    })

    await harness.runtime.ingest('memory may decline this', {
      model: 'gpt-test',
      chatProvider: provider,
    })

    expect(rememberTurn).toHaveBeenCalledTimes(1)
    expect(harness.durableTurnRemembered).not.toHaveBeenCalled()
  })

  it('scopes memory to the target session and remembers persisted IDs with fresh history', async () => {
    const targetScope: MemoryScope = {
      ownerId: 'owner-2',
      characterId: 'character-2',
    }
    const recall = vi.fn<ChatOrchestratorMemoryPort['recall']>().mockResolvedValue([])
    const rememberTurn = vi.fn<ChatOrchestratorMemoryPort['rememberTurn']>().mockResolvedValue(undefined)
    const resolveScope = vi.fn((sessionId: string) => sessionId === 'session-2' ? targetScope : memoryScope)
    const harness = createHarness({
      memory: {
        id: 'test-memory',
        recall,
        rememberTurn,
      },
      memoryScope: resolveScope,
    })
    harness.sessionMessages['session-2'] = [
      {
        role: 'system',
        content: 'target system prompt',
        createdAt: new Date(2026, 3, 25, 18, 0).getTime(),
        id: 'system-2',
      },
    ]

    await harness.runtime.ingest('background session message', {
      model: 'gpt-test',
      chatProvider: provider,
    }, 'session-2')

    expect(resolveScope).toHaveBeenCalledTimes(1)
    expect(resolveScope).toHaveBeenCalledWith('session-2')
    expect(recall).toHaveBeenCalledWith(expect.objectContaining({
      scope: targetScope,
      sessionId: 'session-2',
      excludeSourceMessageIds: ['system-2', 'user-id'],
    }))
    expect(rememberTurn).toHaveBeenCalledTimes(1)
    expect(rememberTurn).toHaveBeenCalledWith({
      idempotencyKey: JSON.stringify(['chat-turn', 'session-2', 'user-id', 'assistant-id']),
      scope: targetScope,
      sessionId: 'session-2',
      user: {
        id: 'user-id',
        text: 'background session message',
        createdAt: new Date(2026, 3, 25, 18, 47).getTime(),
      },
      assistant: {
        id: 'assistant-id',
        text: 'assistant reply',
        createdAt: new Date(2026, 3, 25, 18, 47).getTime(),
      },
    })
    expect(harness.sessionMessages['session-1']).toHaveLength(1)
    expect(harness.sessionMessages['session-2']?.map(message => message.role)).toEqual([
      'system',
      'user',
      'assistant',
    ])
    expect(harness.assistantTurns).toEqual([
      {
        sessionId: 'session-2',
        messageText: 'assistant reply',
        sessionMessages: expect.arrayContaining([
          expect.objectContaining({ role: 'user', id: 'user-id' }),
          expect.objectContaining({ role: 'assistant', id: 'assistant-id' }),
        ]),
      },
    ])
    expect(harness.foregroundPatches).toEqual([])
    expect(harness.foregroundResets).toEqual([])
  })

  it('does not remember a turn when no assistant message was persisted', async () => {
    const recall = vi.fn<ChatOrchestratorMemoryPort['recall']>().mockResolvedValue([])
    const rememberTurn = vi.fn<ChatOrchestratorMemoryPort['rememberTurn']>().mockResolvedValue(undefined)
    const harness = createHarness({
      memory: {
        id: 'test-memory',
        recall,
        rememberTurn,
      },
      memoryScope: () => memoryScope,
    })
    harness.stream.mockRejectedValueOnce(new Error('provider failed before assistant persistence'))

    await expect(harness.runtime.ingest('incomplete turn', {
      model: 'gpt-test',
      chatProvider: provider,
    })).rejects.toThrow('provider failed before assistant persistence')

    expect(recall).toHaveBeenCalledTimes(1)
    expect(rememberTurn).not.toHaveBeenCalled()
    expect(harness.durableTurnRemembered).not.toHaveBeenCalled()
    expect(harness.sessionMessages['session-1']?.map(message => message.role)).toEqual([
      'system',
      'user',
    ])
  })

  it('does not emit a durable-turn event for an empty assistant output', async () => {
    const recall = vi.fn<ChatOrchestratorMemoryPort['recall']>().mockResolvedValue([])
    const rememberTurn = vi.fn<ChatOrchestratorMemoryPort['rememberTurn']>().mockResolvedValue(createMemoryMatch().record)
    const harness = createHarness({
      memory: {
        id: 'test-memory',
        recall,
        rememberTurn,
      },
      memoryScope: () => memoryScope,
    })
    harness.stream.mockImplementationOnce(async (_model, _chatProvider, _messages, options) => {
      await options?.onStreamEvent?.({ type: 'finish', finishReason: 'stop' })
    })

    await harness.runtime.ingest('empty assistant output', {
      model: 'gpt-test',
      chatProvider: provider,
    })

    expect(rememberTurn).not.toHaveBeenCalled()
    expect(harness.durableTurnRemembered).not.toHaveBeenCalled()
  })

  /**
   * @example
   * deps.getSystemPromptSupplement() returns tool guidance.
   * The runtime appends it to the existing provider system message.
   */
  it('appends system prompt supplement to the provider system message', async () => {
    const harness = createHarness()
    let composedMessages: Message[] = []
    harness.systemPromptSupplement.set('Plugin toolset guidance.')
    harness.stream.mockImplementationOnce(async (_model, _chatProvider, messages, options) => {
      composedMessages = messages
      await options?.onStreamEvent?.({ type: 'text-delta', text: 'hello' })
      await options?.onStreamEvent?.({ type: 'finish', finishReason: 'stop' })
    })

    await harness.runtime.ingest('hello from user', {
      model: 'gpt-test',
      chatProvider: provider,
    })

    expect(composedMessages[0]).toMatchObject({
      role: 'system',
      content: 'system prompt\n\nPlugin toolset guidance.',
    })
  })

  /**
   * @example
   * A session has only user history.
   * The runtime creates a provider system message for supplemental guidance.
   */
  it('creates a system message when only a system prompt supplement is available', async () => {
    const harness = createHarness()
    let composedMessages: Message[] = []
    harness.sessionMessages['session-1'] = []
    harness.systemPromptSupplement.set('Plugin toolset guidance.')
    harness.stream.mockImplementationOnce(async (_model, _chatProvider, messages, options) => {
      composedMessages = messages
      await options?.onStreamEvent?.({ type: 'text-delta', text: 'hello' })
      await options?.onStreamEvent?.({ type: 'finish', finishReason: 'stop' })
    })

    await harness.runtime.ingest('hello from user', {
      model: 'gpt-test',
      chatProvider: provider,
    })

    expect(composedMessages[0]).toMatchObject({
      role: 'system',
      content: 'Plugin toolset guidance.',
    })
    expect(composedMessages[1]).toMatchObject({ role: 'user' })
  })

  /**
   * @example
   * Runtime telemetry callbacks expose client-visible latency milestones.
   */
  it('emits telemetry milestones for a successful voice-backed message round', async () => {
    const harness = createHarness()
    harness.monotonicNow.set([100, 150, 250, 400, 460])

    await harness.runtime.ingest('hello from voice', {
      model: 'gpt-test',
      chatProvider: provider,
      input: {
        type: 'input:text',
        data: {
          text: 'hello from voice',
        },
      },
    })

    expect(harness.telemetry.messageSendStarted).toEqual([{
      source: 'voice',
      model: 'gpt-test',
    }])
    expect(harness.telemetry.llmRequestStarted).toEqual([{
      model: 'gpt-test',
      provider: 'mock-provider',
      hasVoice: true,
    }])
    expect(harness.telemetry.llmFirstToken).toEqual([{
      model: 'gpt-test',
      ttfbMs: 100,
    }])
    expect(harness.telemetry.assistantResponseRendered).toEqual([{
      model: 'gpt-test',
      latencyMs: 250,
    }])
    expect(harness.telemetry.messageRound).toEqual([{
      durationMs: 360,
      hasVoice: true,
      model: 'gpt-test',
    }])
    expect(harness.telemetry.chatActivationStarted).toEqual([{
      model: 'gpt-test',
      provider: 'mock-provider',
      sessionId: 'session-1',
      source: 'voice',
    }])
    expect(harness.telemetry.chatActivationSucceeded).toEqual([{
      durationMs: 360,
      model: 'gpt-test',
      provider: 'mock-provider',
      source: 'voice',
    }])
    expect(harness.telemetry.chatActivationFailed).toEqual([])
  })

  /**
   * @example
   * await expect(runtime.ingest('hello', { model, chatProvider })).rejects.toThrow('provider rejected')
   */
  it('emits chat activation failure telemetry without raw provider messages', async () => {
    const harness = createHarness()
    harness.stream.mockRejectedValueOnce(new Error('provider rejected with sensitive details'))

    await expect(harness.runtime.ingest('hello', {
      model: 'gpt-test',
      chatProvider: provider,
    })).rejects.toThrow('provider rejected')

    expect(harness.telemetry.chatActivationStarted).toEqual([{
      model: 'gpt-test',
      provider: 'mock-provider',
      sessionId: 'session-1',
      source: 'text',
    }])
    expect(harness.telemetry.chatActivationSucceeded).toEqual([])
    expect(harness.telemetry.chatActivationFailed).toEqual([{
      errorCode: 'llm_response_failed',
      failureStage: 'llm_response',
      model: 'gpt-test',
      provider: 'mock-provider',
      source: 'text',
    }])
  })

  /**
   * @example
   * Cancelling a queued send rejects only pending work that has not started.
   */
  it('rejects cancelled queued sends before they start', async () => {
    const harness = createHarness()
    let releaseFirstSend: (() => void) | undefined
    harness.stream.mockImplementationOnce(async () => {
      await new Promise<void>((resolve) => {
        releaseFirstSend = resolve
      })
    })

    const firstSend = harness.runtime.ingest('hold queue', {
      model: 'gpt-test',
      chatProvider: provider,
    })
    const secondSend = harness.runtime.ingest('cancel me', {
      model: 'gpt-test',
      chatProvider: provider,
    })

    await vi.waitFor(() => {
      expect(harness.stream).toHaveBeenCalledTimes(1)
    })
    await vi.waitFor(() => {
      expect(harness.runtime.getPendingQueuedSendCount()).toBe(1)
    })
    harness.runtime.cancelPendingSends('session-1')
    releaseFirstSend?.()

    await expect(secondSend).rejects.toThrow('Chat session was reset before send could start')
    await firstSend
  })

  /**
   * @example
   * A queued send rejects if its captured session generation becomes stale.
   */
  it('rejects stale generation sends before they start', async () => {
    const harness = createHarness()
    let releaseFirstSend: (() => void) | undefined
    harness.stream.mockImplementationOnce(async () => {
      await new Promise<void>((resolve) => {
        releaseFirstSend = resolve
      })
    })

    const firstSend = harness.runtime.ingest('hold queue', {
      model: 'gpt-test',
      chatProvider: provider,
    })
    const secondSend = harness.runtime.ingest('stale request', {
      model: 'gpt-test',
      chatProvider: provider,
    })

    await vi.waitFor(() => {
      expect(harness.stream).toHaveBeenCalledTimes(1)
    })
    await vi.waitFor(() => {
      expect(harness.runtime.getPendingQueuedSendCount()).toBe(1)
    })
    harness.generation.set(2)
    releaseFirstSend?.()

    await firstSend
    await expect(secondSend).rejects.toThrow('Chat session was reset before send could start')
    expect(harness.stream).toHaveBeenCalledTimes(1)
  })

  /**
   * @example
   * runtime.setSending(true)
   * expect(runtime.getSending()).toBe(true)
   */
  it('keeps sending externally writable for UI facades', () => {
    const harness = createHarness()

    harness.runtime.setSending(true)
    expect(harness.runtime.getSending()).toBe(true)
    expect(harness.stateChanges.at(-1)).toEqual({
      sending: true,
      pendingQueuedSendCount: 0,
    })

    harness.runtime.setSending(false)
    expect(harness.runtime.getSending()).toBe(false)
    expect(harness.stateChanges.at(-1)).toEqual({
      sending: false,
      pendingQueuedSendCount: 0,
    })
  })

  /**
   * @example
   * const snapshot = runtime.getPendingQueuedSendSnapshot()
   * expect(snapshot[0].inputType).toBe('input:text')
   */
  it('returns pending queued send snapshots with public fields', async () => {
    const harness = createHarness()
    let releaseFirstSend: (() => void) | undefined
    harness.stream.mockImplementationOnce(async () => {
      await new Promise<void>((resolve) => {
        releaseFirstSend = resolve
      })
    })

    const queuedMessage = 'queued-message-'.repeat(12)
    const firstSend = harness.runtime.ingest('hold queue', {
      model: 'gpt-test',
      chatProvider: provider,
    })
    const secondSend = harness.runtime.ingest(queuedMessage, {
      model: 'gpt-test',
      chatProvider: provider,
      attachments: [
        {
          type: 'image',
          data: 'aW1hZ2U=',
          mimeType: 'image/png',
        },
      ],
      input: {
        type: 'input:text',
        data: {
          text: 'queued input',
        },
      },
    })

    await vi.waitFor(() => {
      expect(harness.stream).toHaveBeenCalledTimes(1)
    })
    await vi.waitFor(() => {
      expect(harness.runtime.getPendingQueuedSendCount()).toBe(1)
    })

    expect(harness.runtime.getPendingQueuedSendSnapshot()).toEqual([
      {
        sessionId: 'session-1',
        generation: 1,
        cancelled: false,
        messagePreview: queuedMessage.slice(0, 120),
        hasAttachments: true,
        inputType: 'input:text',
      },
    ])

    harness.runtime.cancelPendingSends('session-1')
    releaseFirstSend?.()

    await expect(secondSend).rejects.toThrow('Chat session was reset before send could start')
    await firstSend
  })

  /**
   * @example
   * Attachments, reasoning deltas, and tool events update the assistant builder.
   */
  it('handles attachments, reasoning deltas, tool events, and assistant finalization', async () => {
    const harness = createHarness()
    let composedMessages: Message[] = []
    harness.stream.mockImplementationOnce(async (_model, _chatProvider, messages, options) => {
      composedMessages = messages
      await options?.onStreamEvent?.({ type: 'reasoning-delta', text: 'thinking' })
      await options?.onStreamEvent?.({
        type: 'tool-call',
        toolCallId: 'tool-1',
        toolName: 'weather',
        args: {},
      } as StreamEvent)
      await options?.onStreamEvent?.({
        type: 'tool-result',
        toolCallId: 'tool-1',
        result: 'sunny',
      } as StreamEvent)
      await options?.onStreamEvent?.({ type: 'text-delta', text: 'visible reply' })
      await options?.onStreamEvent?.({ type: 'finish', finishReason: 'stop' })
    })

    await harness.runtime.ingest('see image', {
      model: 'gpt-test',
      chatProvider: provider,
      attachments: [
        {
          type: 'image',
          data: 'aW1hZ2U=',
          mimeType: 'image/png',
        },
      ],
    })

    expect(composedMessages[1]?.content).toEqual([
      {
        type: 'text',
        text: '[2026-04-25 18:47] see image',
      },
      {
        type: 'image_url',
        image_url: {
          url: 'data:image/png;base64,aW1hZ2U=',
        },
      },
    ])
    const assistant = harness.sessionMessages['session-1']?.at(-1)
    expect(assistant).toMatchObject({
      role: 'assistant',
      content: 'visible reply',
      categorization: {
        reasoning: 'thinking',
      },
    })
    expect((assistant as StreamingAssistantMessage).slices).toEqual([
      expect.objectContaining({
        type: 'tool-call',
        toolCall: expect.objectContaining({
          toolCallId: 'tool-1',
        }),
      }),
      {
        type: 'text',
        text: 'visible reply',
      },
    ])
    expect((assistant as StreamingAssistantMessage).tool_results).toEqual([
      {
        type: 'tool-call-result',
        id: 'tool-1',
        result: 'sunny',
      },
    ])
    expect(harness.assistantAppended).toHaveLength(1)
    expect(harness.foregroundResets).toHaveLength(1)
  })
})
