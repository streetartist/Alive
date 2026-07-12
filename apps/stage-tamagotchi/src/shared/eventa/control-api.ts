import type {
  CompanionGrowthStage,
  CompanionIdentity,
  CompanionMoodSnapshot,
  CompanionPersonality,
  CompanionReflection,
  CompanionState,
} from '@proj-airi/companion-core'
import type { MemoryRecord, MemoryScope } from '@proj-airi/memory'
import type { ChatHistoryItem } from '@proj-airi/stage-ui/types/chat'
import type { ChatSessionMeta } from '@proj-airi/stage-ui/types/chat-session'

import { defineInvokeEventa } from '@moeru/eventa'

export type ControlApiProviderKind = 'chat' | 'speech' | 'transcription' | 'vision'
export type ControlApiToolsetId = 'widgets' | 'artistry'

export interface ControlApiAttachmentPayload {
  type: 'image'
  data: string
  mimeType: string
}

export interface ControlApiChatSendRequest {
  text: string
  attachments?: ControlApiAttachmentPayload[]
  sessionId?: string
  toolset?: ControlApiToolsetId
}

export interface ControlApiChatSpotlightRequest {
  text: string
}

export interface ControlApiChatSpotlightResult {
  sessionId: string
  visibleText: string
}

export interface ControlApiChatRetryRequest {
  sessionId?: string
  index: number
}

export interface ControlApiChatCleanupRequest {
  sessionId?: string
}

export interface ControlApiChatInterruptRequest {
  sessionId?: string
}

export interface ControlApiChatInterruptResult {
  queuedSendsCancelled: boolean
  foregroundStreamReset: boolean
  activeProviderRequestAbortSupported: boolean
}

export interface ControlApiChatDeleteMessageRequest {
  sessionId?: string
  messageId?: string
  index?: number
}

export interface ControlApiChatCreateSessionRequest {
  characterId?: string
  title?: string
  setActive?: boolean
}

export interface ControlApiChatCreateSessionResult {
  sessionId: string
}

export interface ControlApiChatSelectSessionRequest {
  sessionId: string
}

export interface ControlApiChatMessagesRequest {
  sessionId?: string
}

export interface ControlApiChatSessionSummary {
  meta: ChatSessionMeta
  messageCount: number
  loaded: boolean
}

export interface ControlApiChatSessionsSnapshot {
  activeSessionId: string
  sessions: ControlApiChatSessionSummary[]
}

export interface ControlApiChatMessagesSnapshot {
  sessionId: string
  messages: ChatHistoryItem[]
}

export interface ControlApiProviderSummary {
  id: string
  category: ControlApiProviderKind | 'embed'
  tasks: string[]
  name: string
  localizedName?: string
  description: string
  localizedDescription?: string
  configured: boolean
  icon?: string
  iconColor?: string
  iconImage?: string
}

export interface ControlApiProviderActiveSelection {
  providerId: string
  modelId: string
  configured: boolean
}

export interface ControlApiProviderSetActiveRequest {
  kind: ControlApiProviderKind
  providerId: string
  modelId?: string
  loadModels?: boolean
}

export interface ControlApiProviderModelsRequest {
  providerId: string
}

export interface ControlApiProviderModelsResponse {
  providerId: string
  models: Array<Record<string, unknown>>
}

export interface ControlApiProviderStatus {
  active: Record<ControlApiProviderKind, ControlApiProviderActiveSelection>
  available: Record<ControlApiProviderKind, ControlApiProviderSummary[]>
  configured: Record<ControlApiProviderKind, ControlApiProviderSummary[]>
}

export interface ControlApiSpeechSynthesizeRequest {
  text: string
  providerId?: string
  modelId?: string
  voiceId?: string
  forceSSML?: boolean
}

export interface ControlApiSpeechSynthesizeResponse {
  contentType: string
  byteLength: number
  audioBase64: string
}

export type ControlApiExpressionBlendMode = 'Add' | 'Multiply' | 'Overwrite'
export type ControlApiExpressionLlmMode = 'all' | 'none' | 'custom'

export interface ControlApiExpressionParameterSnapshot {
  parameterId: string
  blend: ControlApiExpressionBlendMode
  value: number
}

export interface ControlApiExpressionGroupSnapshot {
  name: string
  active: boolean
  exposedToLlm: boolean
  parameters: ControlApiExpressionParameterSnapshot[]
}

export interface ControlApiExpressionSnapshot {
  modelId: string
  groups: ControlApiExpressionGroupSnapshot[]
  llmMode: ControlApiExpressionLlmMode
  llmExposed: Record<string, boolean>
}

export interface ControlApiExpressionSetRequest {
  name: string
  value: boolean | number
  duration?: number
}

export interface ControlApiExpressionToggleRequest {
  name: string
  duration?: number
}

export interface ControlApiExpressionLlmModeRequest {
  mode: ControlApiExpressionLlmMode
}

export interface ControlApiExpressionLlmExposedRequest {
  name: string
  enabled: boolean
}

export interface ControlApiExpressionOperationResponse {
  ok: boolean
  result: unknown
  expressions: ControlApiExpressionSnapshot
}

export type ControlApiLive2DViewControl = 'x' | 'y' | 'scale'

export interface ControlApiLive2DViewSnapshot {
  position: {
    x: number
    y: number
  }
  scale: number
}

export interface ControlApiLive2DViewSetRequest {
  x?: number
  y?: number
  scale?: number
}

export interface ControlApiLive2DViewResetRequest {
  controls?: ControlApiLive2DViewControl[]
}

export interface ControlApiLive2DMotionSnapshot {
  current: {
    group: string
    index?: number
  }
  available: Array<{
    motionName: string
    motionIndex: number
    fileName: string
  }>
}

export interface ControlApiLive2DMotionPlayRequest {
  group: string
  index?: number
}

export interface ControlApiRuntimeStatus {
  ready: boolean
  route: string
  chat: {
    activeSessionId: string
    sending: boolean
    pendingQueuedSendCount: number
  }
  providers: ControlApiProviderStatus
}

export interface ControlApiAliveIdentitySnapshot extends CompanionIdentity {
  /** ISO timestamp for the beginning of this persistent user-character identity. */
  birthday: string
  /** Stable interests explicitly maintained for this companion identity. */
  interests: string[]
  /** Stable values explicitly maintained for this companion identity. */
  values: string[]
}

export interface ControlApiAliveProfileSnapshot {
  identity: ControlApiAliveIdentitySnapshot
  personality: CompanionPersonality
  growthStage: CompanionGrowthStage
}

export interface ControlApiAliveStateSnapshot {
  profile: ControlApiAliveProfileSnapshot
  state: CompanionState
  /** Lazily decayed mood projection resolved when this snapshot was requested. */
  mood: CompanionMoodSnapshot
  lastMemory?: MemoryRecord
}

export interface ControlApiAliveMemorySnapshot {
  scope: MemoryScope
  records: MemoryRecord[]
}

export interface ControlApiAliveReflectionResult {
  state: CompanionState
  reflection?: CompanionReflection
  mode: 'model' | 'local' | 'not-due'
  fallbackReason?: string
}

export const electronControlApiGetStatus = defineInvokeEventa<ControlApiRuntimeStatus>('eventa:invoke:electron:control-api:status:get')
export const electronControlApiAliveGetProfile = defineInvokeEventa<ControlApiAliveProfileSnapshot>('eventa:invoke:electron:control-api:alive:profile:get')
export const electronControlApiAliveGetState = defineInvokeEventa<ControlApiAliveStateSnapshot>('eventa:invoke:electron:control-api:alive:state:get')
export const electronControlApiAliveListMemory = defineInvokeEventa<ControlApiAliveMemorySnapshot>('eventa:invoke:electron:control-api:alive:memory:list')
export const electronControlApiAliveReflect = defineInvokeEventa<ControlApiAliveReflectionResult>('eventa:invoke:electron:control-api:alive:reflection:run')
export const electronControlApiChatSend = defineInvokeEventa<void, ControlApiChatSendRequest>('eventa:invoke:electron:control-api:chat:send')
export const electronControlApiChatSpotlight = defineInvokeEventa<ControlApiChatSpotlightResult, ControlApiChatSpotlightRequest>('eventa:invoke:electron:control-api:chat:spotlight')
export const electronControlApiChatRetry = defineInvokeEventa<void, ControlApiChatRetryRequest>('eventa:invoke:electron:control-api:chat:retry')
export const electronControlApiChatCleanup = defineInvokeEventa<void, ControlApiChatCleanupRequest>('eventa:invoke:electron:control-api:chat:cleanup')
export const electronControlApiChatInterrupt = defineInvokeEventa<ControlApiChatInterruptResult, ControlApiChatInterruptRequest>('eventa:invoke:electron:control-api:chat:interrupt')
export const electronControlApiChatDeleteMessage = defineInvokeEventa<void, ControlApiChatDeleteMessageRequest>('eventa:invoke:electron:control-api:chat:message:delete')
export const electronControlApiChatListSessions = defineInvokeEventa<ControlApiChatSessionsSnapshot>('eventa:invoke:electron:control-api:chat:sessions:list')
export const electronControlApiChatCreateSession = defineInvokeEventa<ControlApiChatCreateSessionResult, ControlApiChatCreateSessionRequest>('eventa:invoke:electron:control-api:chat:sessions:create')
export const electronControlApiChatSelectSession = defineInvokeEventa<void, ControlApiChatSelectSessionRequest>('eventa:invoke:electron:control-api:chat:sessions:select')
export const electronControlApiChatGetMessages = defineInvokeEventa<ControlApiChatMessagesSnapshot, ControlApiChatMessagesRequest>('eventa:invoke:electron:control-api:chat:messages:get')
export const electronControlApiGetProviderStatus = defineInvokeEventa<ControlApiProviderStatus>('eventa:invoke:electron:control-api:providers:status')
export const electronControlApiSetActiveProvider = defineInvokeEventa<ControlApiProviderStatus, ControlApiProviderSetActiveRequest>('eventa:invoke:electron:control-api:providers:set-active')
export const electronControlApiGetProviderModels = defineInvokeEventa<ControlApiProviderModelsResponse, ControlApiProviderModelsRequest>('eventa:invoke:electron:control-api:providers:models')
export const electronControlApiSpeechSynthesize = defineInvokeEventa<ControlApiSpeechSynthesizeResponse, ControlApiSpeechSynthesizeRequest>('eventa:invoke:electron:control-api:speech:synthesize')
export const electronControlApiExpressionList = defineInvokeEventa<ControlApiExpressionSnapshot>('eventa:invoke:electron:control-api:expressions:list')
export const electronControlApiExpressionSet = defineInvokeEventa<ControlApiExpressionOperationResponse, ControlApiExpressionSetRequest>('eventa:invoke:electron:control-api:expressions:set')
export const electronControlApiExpressionToggle = defineInvokeEventa<ControlApiExpressionOperationResponse, ControlApiExpressionToggleRequest>('eventa:invoke:electron:control-api:expressions:toggle')
export const electronControlApiExpressionResetAll = defineInvokeEventa<ControlApiExpressionOperationResponse>('eventa:invoke:electron:control-api:expressions:reset-all')
export const electronControlApiExpressionSaveDefaults = defineInvokeEventa<ControlApiExpressionOperationResponse>('eventa:invoke:electron:control-api:expressions:save-defaults')
export const electronControlApiExpressionSetLlmMode = defineInvokeEventa<ControlApiExpressionOperationResponse, ControlApiExpressionLlmModeRequest>('eventa:invoke:electron:control-api:expressions:llm-mode:set')
export const electronControlApiExpressionSetLlmExposed = defineInvokeEventa<ControlApiExpressionOperationResponse, ControlApiExpressionLlmExposedRequest>('eventa:invoke:electron:control-api:expressions:llm-exposed:set')
export const electronControlApiLive2DViewGet = defineInvokeEventa<ControlApiLive2DViewSnapshot>('eventa:invoke:electron:control-api:live2d:view:get')
export const electronControlApiLive2DViewSet = defineInvokeEventa<ControlApiLive2DViewSnapshot, ControlApiLive2DViewSetRequest>('eventa:invoke:electron:control-api:live2d:view:set')
export const electronControlApiLive2DViewReset = defineInvokeEventa<ControlApiLive2DViewSnapshot, ControlApiLive2DViewResetRequest>('eventa:invoke:electron:control-api:live2d:view:reset')
export const electronControlApiLive2DMotionList = defineInvokeEventa<ControlApiLive2DMotionSnapshot>('eventa:invoke:electron:control-api:live2d:motions:list')
export const electronControlApiLive2DMotionPlay = defineInvokeEventa<ControlApiLive2DMotionSnapshot, ControlApiLive2DMotionPlayRequest>('eventa:invoke:electron:control-api:live2d:motions:play')
