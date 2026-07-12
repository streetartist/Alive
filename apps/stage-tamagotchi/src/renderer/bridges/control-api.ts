import type { createContext } from '@moeru/eventa/adapters/electron/renderer'
import type { ProviderMetadata, VoiceInfo } from '@proj-airi/stage-ui/stores/providers'
import type { SpeechProviderWithExtraOptions } from '@xsai-ext/providers/utils'

import type {
  ControlApiAliveMemorySnapshot,
  ControlApiAliveProfileSnapshot,
  ControlApiAliveReflectionResult,
  ControlApiAliveStateSnapshot,
  ControlApiChatCreateSessionRequest,
  ControlApiChatInterruptResult,
  ControlApiChatMessagesRequest,
  ControlApiChatMessagesSnapshot,
  ControlApiChatSessionsSnapshot,
  ControlApiExpressionLlmExposedRequest,
  ControlApiExpressionLlmModeRequest,
  ControlApiExpressionOperationResponse,
  ControlApiExpressionSetRequest,
  ControlApiExpressionSnapshot,
  ControlApiExpressionToggleRequest,
  ControlApiLive2DMotionPlayRequest,
  ControlApiLive2DMotionSnapshot,
  ControlApiLive2DViewControl,
  ControlApiLive2DViewResetRequest,
  ControlApiLive2DViewSetRequest,
  ControlApiLive2DViewSnapshot,
  ControlApiProviderModelsResponse,
  ControlApiProviderSetActiveRequest,
  ControlApiProviderStatus,
  ControlApiProviderSummary,
  ControlApiRuntimeStatus,
  ControlApiSpeechSynthesizeRequest,
  ControlApiSpeechSynthesizeResponse,
} from '../../shared/eventa'

import { defineInvokeHandler } from '@moeru/eventa'
import { resolveCompanionMood } from '@proj-airi/companion-core'
import { useExpressionStore, useL2dViewControl, useLive2dParams } from '@proj-airi/stage-ui-live2d/stores'
import { useAuthStore } from '@proj-airi/stage-ui/stores/auth'
import { useChatOrchestratorStore } from '@proj-airi/stage-ui/stores/chat'
import { useChatSessionStore } from '@proj-airi/stage-ui/stores/chat/session-store'
import { useChatStreamStore } from '@proj-airi/stage-ui/stores/chat/stream-store'
import { useAiriCardStore } from '@proj-airi/stage-ui/stores/modules/airi-card'
import { useCompanionStore } from '@proj-airi/stage-ui/stores/modules/companion'
import { useConsciousnessStore } from '@proj-airi/stage-ui/stores/modules/consciousness'
import { useHearingStore } from '@proj-airi/stage-ui/stores/modules/hearing'
import { useMemoryStore } from '@proj-airi/stage-ui/stores/modules/memory'
import { useSpeechStore } from '@proj-airi/stage-ui/stores/modules/speech'
import { useVisionStore } from '@proj-airi/stage-ui/stores/modules/vision/store'
import { useProvidersStore } from '@proj-airi/stage-ui/stores/providers'

import {
  electronControlApiAliveGetProfile,
  electronControlApiAliveGetState,
  electronControlApiAliveListMemory,
  electronControlApiAliveReflect,
  electronControlApiChatCleanup,
  electronControlApiChatCreateSession,
  electronControlApiChatDeleteMessage,
  electronControlApiChatGetMessages,
  electronControlApiChatInterrupt,
  electronControlApiChatListSessions,
  electronControlApiChatRetry,
  electronControlApiChatSelectSession,
  electronControlApiChatSend,
  electronControlApiChatSpotlight,
  electronControlApiExpressionList,
  electronControlApiExpressionResetAll,
  electronControlApiExpressionSaveDefaults,
  electronControlApiExpressionSet,
  electronControlApiExpressionSetLlmExposed,
  electronControlApiExpressionSetLlmMode,
  electronControlApiExpressionToggle,
  electronControlApiGetProviderModels,
  electronControlApiGetProviderStatus,
  electronControlApiGetStatus,
  electronControlApiLive2DMotionList,
  electronControlApiLive2DMotionPlay,
  electronControlApiLive2DViewGet,
  electronControlApiLive2DViewReset,
  electronControlApiLive2DViewSet,
  electronControlApiSetActiveProvider,
  electronControlApiSpeechSynthesize,
} from '../../shared/eventa'
import { useChatSyncStore } from '../stores/chat-sync'

type RendererContext = ReturnType<typeof createContext>['context']

export interface ControlApiRendererBridgeOptions {
  context: RendererContext
  routePath: string
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function toProviderSummary(metadata: ProviderMetadata): ControlApiProviderSummary {
  return {
    id: metadata.id,
    category: metadata.category,
    tasks: [...metadata.tasks],
    name: metadata.name,
    localizedName: metadata.localizedName,
    description: metadata.description,
    localizedDescription: metadata.localizedDescription,
    configured: metadata.configured === true,
    icon: metadata.icon,
    iconColor: metadata.iconColor,
    iconImage: metadata.iconImage,
  }
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  const chunkSize = 0x8000
  let binary = ''

  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize))
  }

  return btoa(binary)
}

function detectAudioContentType(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  if (bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46)
    return 'audio/wav'
  if (bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33)
    return 'audio/mpeg'
  if (bytes[0] === 0xFF && (bytes[1] & 0xE0) === 0xE0)
    return 'audio/mpeg'
  return 'application/octet-stream'
}

function fallbackVoice(providerId: string, voiceId: string): VoiceInfo {
  return {
    id: voiceId,
    name: voiceId,
    provider: providerId,
    languages: [{ code: 'en', title: 'English' }],
  }
}

function useControlApiStores() {
  const authStore = useAuthStore()
  const providersStore = useProvidersStore()
  const consciousnessStore = useConsciousnessStore()
  const speechStore = useSpeechStore()
  const hearingStore = useHearingStore()
  const visionStore = useVisionStore()
  const chatSessionStore = useChatSessionStore()
  const chatSyncStore = useChatSyncStore()
  const chatOrchestratorStore = useChatOrchestratorStore()
  const chatStreamStore = useChatStreamStore()
  const airiCardStore = useAiriCardStore()
  const companionStore = useCompanionStore()
  const memoryStore = useMemoryStore()
  const expressionStore = useExpressionStore()
  const live2dViewControl = useL2dViewControl()
  const live2dParamsStore = useLive2dParams()

  async function ensureChatReady() {
    if (!chatSessionStore.isReady)
      await chatSessionStore.initialize()

    if (chatSyncStore.mode === 'inactive')
      chatSyncStore.initialize('authority')
  }

  async function aliveScope() {
    await ensureChatReady()
    const activeMeta = chatSessionStore.sessionMetas[chatSessionStore.activeSessionId]
    return {
      ownerId: activeMeta?.userId ?? authStore.userId,
      characterId: activeMeta?.characterId ?? airiCardStore.activeCardId,
    }
  }

  function aliveProfileSnapshot(
    scope: Awaited<ReturnType<typeof aliveScope>>,
    state: Awaited<ReturnType<typeof companionStore.loadState>>,
    profile: Awaited<ReturnType<typeof companionStore.loadProfile>>,
  ): ControlApiAliveProfileSnapshot {
    const card = airiCardStore.cards.get(scope.characterId)
    return {
      identity: {
        id: scope.characterId,
        name: card?.name ?? scope.characterId,
        birthday: profile.birthday,
        interests: [...profile.interests],
        values: [...profile.values],
      },
      personality: { ...state.personality },
      growthStage: state.growthStage,
    }
  }

  async function getAliveProfile(): Promise<ControlApiAliveProfileSnapshot> {
    const scope = await aliveScope()
    const [state, profile] = await Promise.all([
      companionStore.loadState(scope),
      companionStore.loadProfile(scope),
    ])
    return cloneJson(aliveProfileSnapshot(scope, state, profile))
  }

  async function listAliveMemory(): Promise<ControlApiAliveMemorySnapshot> {
    const scope = await aliveScope()
    return cloneJson({
      scope,
      records: await memoryStore.listMemories(scope),
    })
  }

  async function getAliveState(): Promise<ControlApiAliveStateSnapshot> {
    const scope = await aliveScope()
    const [state, profile, records] = await Promise.all([
      companionStore.loadState(scope),
      companionStore.loadProfile(scope),
      memoryStore.listMemories(scope),
    ])
    return cloneJson({
      profile: aliveProfileSnapshot(scope, state, profile),
      state,
      mood: resolveCompanionMood(state.mood),
      lastMemory: records[0],
    })
  }

  async function reflectAlive(): Promise<ControlApiAliveReflectionResult> {
    const scope = await aliveScope()
    const result = await companionStore.reflect(scope, { force: true })
    return cloneJson({
      ...result,
      reflection: result.state.reflections.at(-1),
    })
  }

  function providerStatus(): ControlApiProviderStatus {
    return {
      active: {
        chat: {
          providerId: consciousnessStore.activeProvider,
          modelId: consciousnessStore.activeModel,
          configured: consciousnessStore.configured,
        },
        speech: {
          providerId: speechStore.activeSpeechProvider,
          modelId: speechStore.activeSpeechModel,
          configured: speechStore.configured,
        },
        transcription: {
          providerId: hearingStore.activeTranscriptionProvider,
          modelId: hearingStore.activeTranscriptionModel,
          configured: hearingStore.configured,
        },
        vision: {
          providerId: visionStore.activeProvider,
          modelId: visionStore.activeModel,
          configured: visionStore.configured,
        },
      },
      available: {
        chat: providersStore.allChatProvidersMetadata.map(toProviderSummary),
        speech: providersStore.allAudioSpeechProvidersMetadata.map(toProviderSummary),
        transcription: providersStore.allAudioTranscriptionProvidersMetadata.map(toProviderSummary),
        vision: providersStore.allVisionProvidersMetadata.map(toProviderSummary),
      },
      configured: {
        chat: providersStore.configuredChatProvidersMetadata.map(toProviderSummary),
        speech: providersStore.configuredSpeechProvidersMetadata.map(toProviderSummary),
        transcription: providersStore.configuredTranscriptionProvidersMetadata.map(toProviderSummary),
        vision: providersStore.configuredVisionProvidersMetadata.map(toProviderSummary),
      },
    }
  }

  async function setActiveProvider(payload: ControlApiProviderSetActiveRequest): Promise<ControlApiProviderStatus> {
    const shouldLoadModels = payload.loadModels !== false

    if (payload.kind === 'chat') {
      consciousnessStore.activeProvider = payload.providerId
      if (shouldLoadModels)
        await consciousnessStore.loadModelsForProvider(payload.providerId)
      if (payload.modelId !== undefined)
        consciousnessStore.activeModel = payload.modelId
      return providerStatus()
    }

    if (payload.kind === 'speech') {
      speechStore.activeSpeechProvider = payload.providerId
      if (shouldLoadModels)
        await providersStore.fetchModelsForProvider(payload.providerId)
      if (payload.modelId !== undefined)
        speechStore.activeSpeechModel = payload.modelId
      speechStore.ensureActiveSpeechModel()
      return providerStatus()
    }

    if (payload.kind === 'transcription') {
      hearingStore.activeTranscriptionProvider = payload.providerId
      if (shouldLoadModels)
        await hearingStore.loadModelsForProvider(payload.providerId)
      if (payload.modelId !== undefined)
        hearingStore.activeTranscriptionModel = payload.modelId
      return providerStatus()
    }

    visionStore.activeProvider = payload.providerId
    if (shouldLoadModels)
      await visionStore.loadModelsForProvider(payload.providerId)
    if (payload.modelId !== undefined)
      visionStore.activeModel = payload.modelId
    return providerStatus()
  }

  async function listSessions(): Promise<ControlApiChatSessionsSnapshot> {
    await ensureChatReady()
    const snapshot = chatSessionStore.getSnapshot()
    const sessions = Object.values(snapshot.sessionMetas)
      .sort((left, right) => right.updatedAt - left.updatedAt)
      .map(meta => ({
        meta,
        messageCount: snapshot.sessionMessages[meta.sessionId]?.length ?? 0,
        loaded: snapshot.sessionMessages[meta.sessionId] !== undefined,
      }))

    return {
      activeSessionId: snapshot.activeSessionId,
      sessions,
    }
  }

  async function createSession(payload: ControlApiChatCreateSessionRequest) {
    await ensureChatReady()
    const characterId = payload.characterId || airiCardStore.activeCardId || 'default'
    const sessionId = await chatSessionStore.createSession(characterId, {
      setActive: payload.setActive !== false,
      title: payload.title,
    })
    return { sessionId }
  }

  async function getMessages(payload: ControlApiChatMessagesRequest): Promise<ControlApiChatMessagesSnapshot> {
    await ensureChatReady()
    const sessionId = payload.sessionId || chatSessionStore.activeSessionId
    if (!sessionId) {
      return {
        sessionId: '',
        messages: [],
      }
    }

    if (sessionId)
      await chatSessionStore.loadSession(sessionId)

    return {
      sessionId,
      messages: cloneJson(chatSessionStore.getSessionMessages(sessionId)),
    }
  }

  async function synthesizeSpeech(payload: ControlApiSpeechSynthesizeRequest): Promise<ControlApiSpeechSynthesizeResponse> {
    const providerId = payload.providerId || speechStore.activeSpeechProvider
    const modelId = payload.modelId || speechStore.activeSpeechModel
    const providerConfig = providersStore.getProviderConfig(providerId) ?? {}
    const voiceId = payload.voiceId || speechStore.activeSpeechVoiceId || String(providerConfig.voice ?? '')

    if (!providerId || providerId === 'speech-noop')
      throw new Error('No active speech provider configured')
    if (!modelId)
      throw new Error('No active speech model configured')
    if (!voiceId)
      throw new Error('No active speech voice configured')

    const provider = await providersStore.getProviderInstance<SpeechProviderWithExtraOptions<string, Record<string, unknown>>>(providerId)
    const voices = speechStore.getVoicesForProvider(providerId)
    const voice = voices.find(item => item.id === voiceId) ?? speechStore.activeSpeechVoice ?? fallbackVoice(providerId, voiceId)
    const input = speechStore.resolveSpeechInput({
      text: payload.text,
      voice,
      providerConfig,
      forceSSML: payload.forceSSML ?? speechStore.ssmlEnabled,
      supportsSSML: speechStore.supportsSSML,
    })
    const audio = await speechStore.speech(provider, modelId, input.input, voiceId, input.providerConfig)

    return {
      contentType: detectAudioContentType(audio),
      byteLength: audio.byteLength,
      audioBase64: arrayBufferToBase64(audio),
    }
  }

  function expressionSnapshot(): ControlApiExpressionSnapshot {
    return {
      modelId: expressionStore.modelId,
      groups: Array.from(expressionStore.expressionGroups.values()).map(group => ({
        name: group.name,
        active: expressionStore.activeExpressionGroups.has(group.name),
        exposedToLlm: expressionStore.isExposedToLlm(group.name),
        parameters: group.parameters.map(parameter => ({
          parameterId: parameter.parameterId,
          blend: parameter.blend,
          value: parameter.value,
        })),
      })),
      llmMode: expressionStore.llmMode,
      llmExposed: Object.fromEntries(expressionStore.llmExposed),
    }
  }

  function expressionOperation(result: unknown, ok = true): ControlApiExpressionOperationResponse {
    return {
      ok,
      result,
      expressions: expressionSnapshot(),
    }
  }

  function setExpression(payload: ControlApiExpressionSetRequest): ControlApiExpressionOperationResponse {
    const result = expressionStore.set(payload.name, payload.value, payload.duration)
    return expressionOperation(result, result.success)
  }

  function toggleExpression(payload: ControlApiExpressionToggleRequest): ControlApiExpressionOperationResponse {
    const result = expressionStore.toggle(payload.name, payload.duration)
    return expressionOperation(result, result.success)
  }

  function resetExpressions(): ControlApiExpressionOperationResponse {
    const result = expressionStore.resetAll()
    return expressionOperation(result, result.success)
  }

  function saveExpressionDefaults(): ControlApiExpressionOperationResponse {
    const result = expressionStore.saveDefaults()
    return expressionOperation(result, result.success)
  }

  function setExpressionLlmMode(payload: ControlApiExpressionLlmModeRequest): ControlApiExpressionOperationResponse {
    expressionStore.setLlmMode(payload.mode)
    return expressionOperation({ success: true })
  }

  function setExpressionLlmExposed(payload: ControlApiExpressionLlmExposedRequest): ControlApiExpressionOperationResponse {
    expressionStore.setLlmExposed(payload.name, payload.enabled)
    return expressionOperation({ success: true })
  }

  function live2dViewSnapshot(): ControlApiLive2DViewSnapshot {
    return {
      position: {
        x: live2dViewControl.position.value.x,
        y: live2dViewControl.position.value.y,
      },
      scale: live2dViewControl.scale.value,
    }
  }

  function setLive2DView(payload: ControlApiLive2DViewSetRequest): ControlApiLive2DViewSnapshot {
    if (payload.x !== undefined)
      live2dViewControl.set('x', payload.x)
    if (payload.y !== undefined)
      live2dViewControl.set('y', payload.y)
    if (payload.scale !== undefined)
      live2dViewControl.set('scale', payload.scale)

    return live2dViewSnapshot()
  }

  function resetLive2DView(payload: ControlApiLive2DViewResetRequest): ControlApiLive2DViewSnapshot {
    const controls: ControlApiLive2DViewControl[] = payload.controls?.length
      ? payload.controls
      : ['x', 'y', 'scale']

    for (const control of controls)
      live2dViewControl.set(control)

    return live2dViewSnapshot()
  }

  function live2dMotionSnapshot(): ControlApiLive2DMotionSnapshot {
    return {
      current: { ...live2dParamsStore.currentMotion },
      available: live2dParamsStore.availableMotions.map(motion => ({ ...motion })),
    }
  }

  function playLive2DMotion(payload: ControlApiLive2DMotionPlayRequest): ControlApiLive2DMotionSnapshot {
    live2dParamsStore.currentMotion = {
      group: payload.group,
      ...(payload.index === undefined ? {} : { index: payload.index }),
    }

    return live2dMotionSnapshot()
  }

  async function getStatus(routePath: string): Promise<ControlApiRuntimeStatus> {
    await ensureChatReady()
    return {
      ready: true,
      route: routePath,
      chat: {
        activeSessionId: chatSessionStore.activeSessionId,
        sending: chatOrchestratorStore.sending,
        pendingQueuedSendCount: chatOrchestratorStore.pendingQueuedSendCount,
      },
      providers: providerStatus(),
    }
  }

  async function interruptChat(sessionId?: string): Promise<ControlApiChatInterruptResult> {
    await ensureChatReady()
    chatOrchestratorStore.cancelPendingSends(sessionId)
    chatStreamStore.resetStream()
    return {
      queuedSendsCancelled: true,
      foregroundStreamReset: true,
      activeProviderRequestAbortSupported: false,
    }
  }

  return {
    getAliveProfile,
    getAliveState,
    listAliveMemory,
    reflectAlive,
    ensureChatReady,
    chatOrchestratorStore,
    chatSessionStore,
    chatSyncStore,
    getMessages,
    getStatus,
    interruptChat,
    listSessions,
    providerStatus,
    setActiveProvider,
    createSession,
    expressionSnapshot,
    resetExpressions,
    saveExpressionDefaults,
    setExpression,
    setExpressionLlmExposed,
    setExpressionLlmMode,
    live2dMotionSnapshot,
    live2dViewSnapshot,
    playLive2DMotion,
    resetLive2DView,
    setLive2DView,
    synthesizeSpeech,
    toggleExpression,
    providersStore,
  }
}

/**
 * Registers the main-window renderer control bridge used by the loopback HTTP API.
 *
 * The bridge deliberately stays in the renderer because chat, provider selection,
 * speech, and persisted sessions are owned by Pinia stores rather than Electron main.
 */
export function initializeControlApiRendererBridge(options: ControlApiRendererBridgeOptions) {
  const stores = useControlApiStores()
  const cleanups = [
    defineInvokeHandler(options.context, electronControlApiGetStatus, () => stores.getStatus(options.routePath)),
    defineInvokeHandler(options.context, electronControlApiAliveGetProfile, () => stores.getAliveProfile()),
    defineInvokeHandler(options.context, electronControlApiAliveGetState, () => stores.getAliveState()),
    defineInvokeHandler(options.context, electronControlApiAliveListMemory, () => stores.listAliveMemory()),
    defineInvokeHandler(options.context, electronControlApiAliveReflect, () => stores.reflectAlive()),
    defineInvokeHandler(options.context, electronControlApiChatSend, async (payload) => {
      await stores.ensureChatReady()
      await stores.chatSyncStore.requestIngest(payload)
    }),
    defineInvokeHandler(options.context, electronControlApiChatSpotlight, async (payload) => {
      await stores.ensureChatReady()
      return stores.chatSyncStore.requestSpotlightIngest(payload)
    }),
    defineInvokeHandler(options.context, electronControlApiChatRetry, async (payload) => {
      await stores.ensureChatReady()
      await stores.chatSyncStore.requestRetry(payload)
    }),
    defineInvokeHandler(options.context, electronControlApiChatCleanup, async (payload) => {
      await stores.ensureChatReady()
      await stores.chatSyncStore.requestCleanup(payload.sessionId)
    }),
    defineInvokeHandler(options.context, electronControlApiChatInterrupt, payload => stores.interruptChat(payload.sessionId)),
    defineInvokeHandler(options.context, electronControlApiChatDeleteMessage, async (payload) => {
      await stores.ensureChatReady()
      await stores.chatSyncStore.requestDeleteMessage(payload)
    }),
    defineInvokeHandler(options.context, electronControlApiChatListSessions, () => stores.listSessions()),
    defineInvokeHandler(options.context, electronControlApiChatCreateSession, payload => stores.createSession(payload)),
    defineInvokeHandler(options.context, electronControlApiChatSelectSession, async (payload) => {
      await stores.ensureChatReady()
      stores.chatSessionStore.setActiveSession(payload.sessionId)
      await stores.chatSessionStore.loadSession(payload.sessionId)
    }),
    defineInvokeHandler(options.context, electronControlApiChatGetMessages, payload => stores.getMessages(payload)),
    defineInvokeHandler(options.context, electronControlApiGetProviderStatus, () => stores.providerStatus()),
    defineInvokeHandler(options.context, electronControlApiSetActiveProvider, payload => stores.setActiveProvider(payload)),
    defineInvokeHandler(options.context, electronControlApiGetProviderModels, async (payload) => {
      await stores.providersStore.fetchModelsForProvider(payload.providerId)
      return {
        providerId: payload.providerId,
        models: cloneJson(stores.providersStore.getModelsForProvider(payload.providerId)).map(model => ({ ...model })) satisfies ControlApiProviderModelsResponse['models'],
      }
    }),
    defineInvokeHandler(options.context, electronControlApiSpeechSynthesize, payload => stores.synthesizeSpeech(payload)),
    defineInvokeHandler(options.context, electronControlApiExpressionList, () => stores.expressionSnapshot()),
    defineInvokeHandler(options.context, electronControlApiExpressionSet, payload => stores.setExpression(payload)),
    defineInvokeHandler(options.context, electronControlApiExpressionToggle, payload => stores.toggleExpression(payload)),
    defineInvokeHandler(options.context, electronControlApiExpressionResetAll, () => stores.resetExpressions()),
    defineInvokeHandler(options.context, electronControlApiExpressionSaveDefaults, () => stores.saveExpressionDefaults()),
    defineInvokeHandler(options.context, electronControlApiExpressionSetLlmMode, payload => stores.setExpressionLlmMode(payload)),
    defineInvokeHandler(options.context, electronControlApiExpressionSetLlmExposed, payload => stores.setExpressionLlmExposed(payload)),
    defineInvokeHandler(options.context, electronControlApiLive2DViewGet, () => stores.live2dViewSnapshot()),
    defineInvokeHandler(options.context, electronControlApiLive2DViewSet, payload => stores.setLive2DView(payload)),
    defineInvokeHandler(options.context, electronControlApiLive2DViewReset, payload => stores.resetLive2DView(payload)),
    defineInvokeHandler(options.context, electronControlApiLive2DMotionList, () => stores.live2dMotionSnapshot()),
    defineInvokeHandler(options.context, electronControlApiLive2DMotionPlay, payload => stores.playLive2DMotion(payload)),
  ]

  return () => {
    for (const cleanup of cleanups)
      cleanup()
  }
}
