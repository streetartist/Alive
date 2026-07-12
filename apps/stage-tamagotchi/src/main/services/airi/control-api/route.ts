import type { StageViewPatch } from '@proj-airi/stage-shared/godot-stage'

import type {
  ElectronMcpCallToolPayload,
  ElectronMcpStdioServerConfig,
  ElectronMcpStdioTestPayload,
  WidgetsAddPayload,
  WidgetSnapshot,
  WidgetsUpdatePayload,
} from '../../../../shared/eventa'
import type {
  ControlApiAttachmentPayload,
  ControlApiChatCleanupRequest,
  ControlApiChatCreateSessionRequest,
  ControlApiChatDeleteMessageRequest,
  ControlApiChatInterruptRequest,
  ControlApiChatMessagesRequest,
  ControlApiChatRetryRequest,
  ControlApiChatSelectSessionRequest,
  ControlApiChatSendRequest,
  ControlApiChatSpotlightRequest,
  ControlApiExpressionLlmExposedRequest,
  ControlApiExpressionLlmModeRequest,
  ControlApiExpressionSetRequest,
  ControlApiExpressionToggleRequest,
  ControlApiLive2DMotionPlayRequest,
  ControlApiLive2DViewControl,
  ControlApiLive2DViewResetRequest,
  ControlApiLive2DViewSetRequest,
  ControlApiProviderModelsRequest,
  ControlApiProviderSetActiveRequest,
  ControlApiSpeechSynthesizeRequest,
  ControlApiToolsetId,
} from '../../../../shared/eventa/control-api'
import type { ControlApiEventBus } from './event-bus'

import { Buffer } from 'node:buffer'
import { timingSafeEqual } from 'node:crypto'

import { errorMessageFrom } from '@moeru/std'
import { parseStageViewPatchPayload } from '@proj-airi/stage-shared/godot-stage'
import { eventHandler, getRequestURL, H3 } from 'h3'

import { createControlApiSseStream } from './event-bus'

export interface ControlApiServerAddressSnapshot {
  host: string
  port: number
  baseUrl: string
}

export interface ControlApiRendererClient {
  getStatus: () => Promise<unknown>
  aliveGetProfile: () => Promise<unknown>
  aliveGetState: () => Promise<unknown>
  aliveListMemory: () => Promise<unknown>
  aliveReflect: () => Promise<unknown>
  chatSend: (payload: ControlApiChatSendRequest) => Promise<void>
  chatSpotlight: (payload: ControlApiChatSpotlightRequest) => Promise<unknown>
  chatRetry: (payload: ControlApiChatRetryRequest) => Promise<void>
  chatCleanup: (payload: ControlApiChatCleanupRequest) => Promise<void>
  chatInterrupt: (payload: ControlApiChatInterruptRequest) => Promise<unknown>
  chatDeleteMessage: (payload: ControlApiChatDeleteMessageRequest) => Promise<void>
  chatListSessions: () => Promise<unknown>
  chatCreateSession: (payload: ControlApiChatCreateSessionRequest) => Promise<unknown>
  chatSelectSession: (payload: ControlApiChatSelectSessionRequest) => Promise<void>
  chatGetMessages: (payload: ControlApiChatMessagesRequest) => Promise<unknown>
  getProviderStatus: () => Promise<unknown>
  setActiveProvider: (payload: ControlApiProviderSetActiveRequest) => Promise<unknown>
  getProviderModels: (payload: ControlApiProviderModelsRequest) => Promise<unknown>
  speechSynthesize: (payload: ControlApiSpeechSynthesizeRequest) => Promise<unknown>
  expressionList: () => Promise<unknown>
  expressionSet: (payload: ControlApiExpressionSetRequest) => Promise<unknown>
  expressionToggle: (payload: ControlApiExpressionToggleRequest) => Promise<unknown>
  expressionResetAll: () => Promise<unknown>
  expressionSaveDefaults: () => Promise<unknown>
  expressionSetLlmMode: (payload: ControlApiExpressionLlmModeRequest) => Promise<unknown>
  expressionSetLlmExposed: (payload: ControlApiExpressionLlmExposedRequest) => Promise<unknown>
  live2dViewGet: () => Promise<unknown>
  live2dViewSet: (payload: ControlApiLive2DViewSetRequest) => Promise<unknown>
  live2dViewReset: (payload: ControlApiLive2DViewResetRequest) => Promise<unknown>
  live2dMotionList: () => Promise<unknown>
  live2dMotionPlay: (payload: ControlApiLive2DMotionPlayRequest) => Promise<unknown>
}

export interface ControlApiWindowControllers {
  openMain: () => Promise<void> | void
  hideMain: () => Promise<void> | void
  focusMain: () => Promise<void> | void
  openChat: () => Promise<void>
  openSettings: (route?: string) => Promise<void>
  openWidgets: (params?: { id?: string }) => Promise<void>
  hideWidgets: (params?: { id?: string }) => Promise<void>
  openSpotlight: () => Promise<void>
}

export interface ControlApiMcpController {
  getRuntimeStatus: () => unknown
  listTools: () => Promise<unknown>
  callTool: (payload: ElectronMcpCallToolPayload) => Promise<unknown>
  readConfigText: () => Promise<unknown>
  writeConfigText: (text: string) => Promise<unknown>
  applyAndRestart: () => Promise<unknown>
  testServer: (payload: ElectronMcpStdioTestPayload) => Promise<unknown>
}

export interface ControlApiWidgetsController {
  listWidgets: () => WidgetSnapshot[]
  openWindow: (params?: { id?: string }) => Promise<void>
  hideWindow: (params?: { id?: string }) => Promise<void>
  pushWidget: (payload: WidgetsAddPayload) => Promise<string>
  updateWidget: (payload: WidgetsUpdatePayload) => Promise<void>
  removeWidget: (id: string) => Promise<void>
  clearWidgets: () => Promise<void>
  publishWidgetEvent: (id: string, event: Record<string, unknown>) => void
}

export interface ControlApiGodotController {
  getStatus: () => unknown
  start: () => Promise<unknown>
  stop: () => Promise<unknown>
  getViewSnapshot: () => unknown
  applyViewPatch: (payload: StageViewPatch) => Promise<unknown>
  requestViewSnapshot: () => Promise<unknown>
}

export interface ControlApiPluginController {
  list: () => Promise<unknown>
  loadEnabled: () => Promise<unknown>
  load: (extensionId: string) => Promise<unknown>
  unload: (extensionId: string) => Promise<unknown>
  setEnabled: (payload: { extensionId: string, enabled: boolean, path?: string }) => Promise<unknown>
  setAutoReload: (payload: { extensionId: string, enabled: boolean }) => Promise<unknown>
  inspect: () => Promise<unknown>
  listTools: () => Promise<unknown>
  invokeTool: (payload: { ownerExtensionId: string, name: string, input?: Record<string, unknown> }) => Promise<unknown>
}

export interface ControlApiRouteOptions {
  authToken: string
  events: ControlApiEventBus
  getAddress: () => ControlApiServerAddressSnapshot | undefined
  renderer: ControlApiRendererClient
  windows: ControlApiWindowControllers
  mcp: ControlApiMcpController
  widgets: ControlApiWidgetsController
  godot: ControlApiGodotController
  plugins?: ControlApiPluginController
}

type ControlApiRouteEvent = Parameters<typeof getRequestURL>[0]
type RequestHandler = (event: ControlApiRouteEvent) => Promise<Response | unknown> | Response | unknown

const serviceName = 'airi-local-control-api'
const allowedMethods = 'GET,POST,PATCH,PUT,DELETE,OPTIONS'
const allowedHeaders = 'Authorization,Content-Type,Accept'
const baseSecurityHeaders = {
  'Cache-Control': 'no-store',
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
}
const providerKinds = new Set(['chat', 'speech', 'transcription', 'vision'])
const controlApiToolsets = new Set<ControlApiToolsetId>(['widgets', 'artistry'])
const live2dViewControls = new Set<ControlApiLive2DViewControl>(['x', 'y', 'scale'])

class ControlApiHttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message)
    this.name = 'ControlApiHttpError'
  }
}

function timingSafeCompare(input: string, expected: string): boolean {
  const inputBuffer = Buffer.from(input)
  const expectedBuffer = Buffer.from(expected)
  const paddedInput = Buffer.alloc(expectedBuffer.length)

  inputBuffer.copy(paddedInput, 0, 0, Math.min(inputBuffer.length, expectedBuffer.length))

  return timingSafeEqual(paddedInput, expectedBuffer) && inputBuffer.length === expectedBuffer.length
}

function normalizeHostName(value: string): string {
  const trimmed = value.trim().toLowerCase()
  if (trimmed.startsWith('[')) {
    const end = trimmed.indexOf(']')
    return end >= 0 ? trimmed.slice(1, end) : trimmed
  }

  const portSeparator = trimmed.lastIndexOf(':')
  if (portSeparator > -1 && trimmed.indexOf(':') === portSeparator)
    return trimmed.slice(0, portSeparator)

  return trimmed
}

function isLocalHostName(value: string): boolean {
  const host = normalizeHostName(value)
  return host === '127.0.0.1' || host === 'localhost' || host === '::1'
}

function isLocalOrigin(value: string): boolean {
  try {
    const url = new URL(value)
    return isLocalHostName(url.host)
  }
  catch {
    return false
  }
}

function resolveCorsOrigin(event: Parameters<RequestHandler>[0]) {
  const origin = event.req.headers.get('origin')
  if (!origin)
    return undefined
  return isLocalOrigin(origin) ? origin : undefined
}

function createHeaders(event: Parameters<RequestHandler>[0], headers?: HeadersInit) {
  const responseHeaders = new Headers(headers)
  for (const [key, value] of Object.entries(baseSecurityHeaders))
    responseHeaders.set(key, value)

  const origin = resolveCorsOrigin(event)
  if (origin) {
    responseHeaders.set('Access-Control-Allow-Origin', origin)
    responseHeaders.set('Vary', 'Origin')
  }

  return responseHeaders
}

function jsonResponse(event: Parameters<RequestHandler>[0], body: unknown, init?: ResponseInit) {
  const headers = createHeaders(event, init?.headers)
  headers.set('Content-Type', 'application/json; charset=utf-8')

  return new Response(JSON.stringify(body), {
    ...init,
    headers,
  })
}

function errorResponse(event: Parameters<RequestHandler>[0], error: unknown) {
  if (error instanceof ControlApiHttpError) {
    return jsonResponse(event, {
      error: {
        code: error.code,
        message: error.message,
        details: error.details,
      },
    }, { status: error.status })
  }

  return jsonResponse(event, {
    error: {
      code: 'INTERNAL_ERROR',
      message: errorMessageFrom(error) ?? 'Internal Server Error',
    },
  }, { status: 500 })
}

function assertLocalRequest(event: Parameters<RequestHandler>[0]) {
  const host = event.req.headers.get('host')
  if (host && !isLocalHostName(host)) {
    throw new ControlApiHttpError(403, 'HOST_NOT_LOCAL', 'Only localhost Host headers are accepted.')
  }

  const origin = event.req.headers.get('origin')
  if (origin && !isLocalOrigin(origin)) {
    throw new ControlApiHttpError(403, 'ORIGIN_NOT_LOCAL', 'Only localhost Origins are accepted.')
  }
}

function assertAuthorized(event: Parameters<RequestHandler>[0], authToken: string) {
  const authorization = event.req.headers.get('authorization')
  const prefix = 'Bearer '
  if (!authorization?.startsWith(prefix)) {
    throw new ControlApiHttpError(401, 'AUTHORIZATION_REQUIRED', 'Authorization Bearer token is required.')
  }

  const token = authorization.slice(prefix.length)
  if (!authToken || !timingSafeCompare(token, authToken)) {
    throw new ControlApiHttpError(401, 'AUTHORIZATION_INVALID', 'Authorization Bearer token is invalid.')
  }
}

function route(options: ControlApiRouteOptions, handler: RequestHandler, routeOptions: { auth?: boolean } = {}) {
  return eventHandler(async (event) => {
    try {
      assertLocalRequest(event)
      if (routeOptions.auth !== false)
        assertAuthorized(event, options.authToken)

      const result = await handler(event)
      if (result instanceof Response)
        return result
      return jsonResponse(event, result ?? { ok: true })
    }
    catch (error) {
      return errorResponse(event, error)
    }
  })
}

function optionsRoute() {
  return eventHandler(async (event) => {
    try {
      assertLocalRequest(event)
      const headers = createHeaders(event)
      headers.set('Access-Control-Allow-Methods', allowedMethods)
      headers.set('Access-Control-Allow-Headers', allowedHeaders)
      headers.set('Access-Control-Max-Age', '600')
      return new Response(null, { status: 204, headers })
    }
    catch (error) {
      return errorResponse(event, error)
    }
  })
}

async function readJsonRecord(event: Parameters<RequestHandler>[0]): Promise<Record<string, unknown>> {
  const text = await event.req.text()
  if (!text.trim())
    return {}

  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  }
  catch {
    throw new ControlApiHttpError(400, 'JSON_INVALID', 'Request body must be valid JSON.')
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new ControlApiHttpError(400, 'JSON_OBJECT_REQUIRED', 'Request body must be a JSON object.')
  }

  return parsed as Record<string, unknown>
}

function requireString(record: Record<string, unknown>, key: string): string {
  const value = record[key]
  if (typeof value !== 'string' || !value.trim())
    throw new ControlApiHttpError(400, 'FIELD_REQUIRED', `Field "${key}" must be a non-empty string.`)
  return value
}

function optionalString(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key]
  if (value === undefined)
    return undefined
  if (typeof value !== 'string')
    throw new ControlApiHttpError(400, 'FIELD_INVALID', `Field "${key}" must be a string.`)
  return value
}

function optionalBoolean(record: Record<string, unknown>, key: string): boolean | undefined {
  const value = record[key]
  if (value === undefined)
    return undefined
  if (typeof value !== 'boolean')
    throw new ControlApiHttpError(400, 'FIELD_INVALID', `Field "${key}" must be a boolean.`)
  return value
}

function requireBoolean(record: Record<string, unknown>, key: string): boolean {
  const value = optionalBoolean(record, key)
  if (value === undefined)
    throw new ControlApiHttpError(400, 'FIELD_REQUIRED', `Field "${key}" must be a boolean.`)
  return value
}

function optionalNumber(record: Record<string, unknown>, key: string): number | undefined {
  const value = record[key]
  if (value === undefined)
    return undefined
  if (typeof value !== 'number' || !Number.isFinite(value))
    throw new ControlApiHttpError(400, 'FIELD_INVALID', `Field "${key}" must be a finite number.`)
  return value
}

function optionalRecord(record: Record<string, unknown>, key: string): Record<string, unknown> | undefined {
  const value = record[key]
  if (value === undefined)
    return undefined
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new ControlApiHttpError(400, 'FIELD_INVALID', `Field "${key}" must be an object.`)
  return value as Record<string, unknown>
}

function optionalStringArray(record: Record<string, unknown>, key: string): string[] | undefined {
  const value = record[key]
  if (value === undefined)
    return undefined
  if (!Array.isArray(value) || value.some(item => typeof item !== 'string'))
    throw new ControlApiHttpError(400, 'FIELD_INVALID', `Field "${key}" must be a string array.`)
  return [...value]
}

function optionalStringRecord(record: Record<string, unknown>, key: string): Record<string, string> | undefined {
  const value = optionalRecord(record, key)
  if (!value)
    return undefined

  const result: Record<string, string> = {}
  for (const [entryKey, entryValue] of Object.entries(value)) {
    if (typeof entryValue !== 'string')
      throw new ControlApiHttpError(400, 'FIELD_INVALID', `Field "${key}" must contain only string values.`)
    result[entryKey] = entryValue
  }

  return result
}

function assertOnlyFields(record: Record<string, unknown>, allowedFields: readonly string[]) {
  const allowed = new Set(allowedFields)
  const unsupported = Object.keys(record).find(key => !allowed.has(key))
  if (unsupported) {
    throw new ControlApiHttpError(400, 'FIELD_INVALID', `Unsupported field "${unsupported}".`)
  }
}

function optionalChatToolset(record: Record<string, unknown>, key: string): ControlApiToolsetId | undefined {
  const value = record[key]
  if (value === undefined)
    return undefined
  if (typeof value !== 'string' || !controlApiToolsets.has(value as ControlApiToolsetId)) {
    throw new ControlApiHttpError(400, 'FIELD_INVALID', 'Field "toolset" must be "widgets" or "artistry".')
  }
  return value as ControlApiToolsetId
}

function optionalChatAttachments(record: Record<string, unknown>, key: string): ControlApiAttachmentPayload[] | undefined {
  const value = record[key]
  if (value === undefined)
    return undefined
  if (!Array.isArray(value)) {
    throw new ControlApiHttpError(400, 'FIELD_INVALID', 'Field "attachments" must be an array.')
  }

  return value.map((item, index) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      throw new ControlApiHttpError(400, 'FIELD_INVALID', `Field "attachments[${index}]" must be an object.`)
    }

    const attachment = item as Record<string, unknown>
    const type = requireString(attachment, 'type')
    if (type !== 'image') {
      throw new ControlApiHttpError(400, 'FIELD_INVALID', `Field "attachments[${index}].type" must be "image".`)
    }

    const data = requireString(attachment, 'data')
    const mimeType = requireString(attachment, 'mimeType')
    if (!mimeType.startsWith('image/')) {
      throw new ControlApiHttpError(400, 'FIELD_INVALID', `Field "attachments[${index}].mimeType" must be an image MIME type.`)
    }

    return { type, data, mimeType }
  })
}

function readChatSendPayload(record: Record<string, unknown>): ControlApiChatSendRequest {
  assertOnlyFields(record, ['text', 'attachments', 'sessionId', 'toolset'])
  return {
    text: requireString(record, 'text'),
    attachments: optionalChatAttachments(record, 'attachments'),
    sessionId: optionalString(record, 'sessionId'),
    toolset: optionalChatToolset(record, 'toolset'),
  }
}

function requireProviderKind(value: string): ControlApiProviderSetActiveRequest['kind'] {
  if (!providerKinds.has(value))
    throw new ControlApiHttpError(400, 'PROVIDER_KIND_INVALID', 'Provider kind must be chat, speech, transcription, or vision.')
  return value as ControlApiProviderSetActiveRequest['kind']
}

function requireExpressionValue(record: Record<string, unknown>, key: string): ControlApiExpressionSetRequest['value'] {
  const value = record[key]
  if (typeof value === 'boolean')
    return value
  if (typeof value === 'number' && Number.isFinite(value))
    return value
  if (value === undefined)
    throw new ControlApiHttpError(400, 'FIELD_REQUIRED', `Field "${key}" must be a boolean or finite number.`)
  throw new ControlApiHttpError(400, 'FIELD_INVALID', `Field "${key}" must be a boolean or finite number.`)
}

function requireExpressionLlmMode(value: string): ControlApiExpressionLlmModeRequest['mode'] {
  if (value !== 'all' && value !== 'none' && value !== 'custom') {
    throw new ControlApiHttpError(400, 'FIELD_INVALID', 'Field "mode" must be "all", "none", or "custom".')
  }

  return value
}

function readLive2DViewSetPayload(record: Record<string, unknown>): ControlApiLive2DViewSetRequest {
  assertOnlyFields(record, ['x', 'y', 'scale'])

  const payload = {
    x: optionalNumber(record, 'x'),
    y: optionalNumber(record, 'y'),
    scale: optionalNumber(record, 'scale'),
  }

  if (payload.x === undefined && payload.y === undefined && payload.scale === undefined) {
    throw new ControlApiHttpError(400, 'FIELD_REQUIRED', 'At least one of "x", "y", or "scale" is required.')
  }

  return payload
}

function readLive2DViewResetPayload(record: Record<string, unknown>): ControlApiLive2DViewResetRequest {
  assertOnlyFields(record, ['controls'])

  const controls = optionalStringArray(record, 'controls')
  if (!controls)
    return {}

  const invalid = controls.find(control => !live2dViewControls.has(control as ControlApiLive2DViewControl))
  if (invalid) {
    throw new ControlApiHttpError(400, 'FIELD_INVALID', 'Field "controls" must contain only "x", "y", or "scale".')
  }

  return { controls: controls as ControlApiLive2DViewControl[] }
}

function readLive2DMotionPlayPayload(record: Record<string, unknown>): ControlApiLive2DMotionPlayRequest {
  assertOnlyFields(record, ['group', 'index'])
  const index = optionalNumber(record, 'index')
  if (index !== undefined && (!Number.isInteger(index) || index < 0)) {
    throw new ControlApiHttpError(400, 'FIELD_INVALID', 'Field "index" must be a non-negative integer.')
  }

  return {
    group: requireString(record, 'group'),
    index,
  }
}

function optionalWidgetSize(record: Record<string, unknown>, key: string): WidgetsAddPayload['size'] | undefined {
  const value = record[key]
  if (value === undefined)
    return undefined

  if (value === 's' || value === 'm' || value === 'l')
    return value

  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const sizeRecord = value as Record<string, unknown>
    return {
      cols: optionalNumber(sizeRecord, 'cols'),
      rows: optionalNumber(sizeRecord, 'rows'),
    }
  }

  throw new ControlApiHttpError(400, 'FIELD_INVALID', `Field "${key}" must be "s", "m", "l", or an object.`)
}

function readMcpServerConfig(record: Record<string, unknown>): ElectronMcpStdioServerConfig {
  return {
    command: requireString(record, 'command'),
    args: optionalStringArray(record, 'args'),
    env: optionalStringRecord(record, 'env'),
    cwd: optionalString(record, 'cwd'),
    enabled: optionalBoolean(record, 'enabled'),
  }
}

function readMcpTestPayload(record: Record<string, unknown>): ElectronMcpStdioTestPayload {
  const config = optionalRecord(record, 'config')
  if (!config)
    throw new ControlApiHttpError(400, 'FIELD_REQUIRED', 'Field "config" is required.')

  return {
    name: requireString(record, 'name'),
    config: readMcpServerConfig(config),
  }
}

function readWidgetsAddPayload(record: Record<string, unknown>): WidgetsAddPayload {
  return {
    id: optionalString(record, 'id'),
    componentName: requireString(record, 'componentName'),
    componentProps: optionalRecord(record, 'componentProps'),
    alwaysOnTop: optionalBoolean(record, 'alwaysOnTop'),
    size: optionalWidgetSize(record, 'size'),
    windowSize: optionalRecord(record, 'windowSize'),
    ttlMs: optionalNumber(record, 'ttlMs'),
  }
}

function readWidgetsUpdatePayload(record: Record<string, unknown>, id: string): WidgetsUpdatePayload {
  return {
    id,
    componentProps: optionalRecord(record, 'componentProps'),
    alwaysOnTop: optionalBoolean(record, 'alwaysOnTop'),
    size: optionalWidgetSize(record, 'size'),
    windowSize: optionalRecord(record, 'windowSize'),
    ttlMs: optionalNumber(record, 'ttlMs'),
  }
}

function readStageViewPatchPayload(record: Record<string, unknown>): StageViewPatch {
  try {
    return parseStageViewPatchPayload(record)
  }
  catch (error) {
    throw new ControlApiHttpError(
      400,
      'FIELD_INVALID',
      errorMessageFrom(error) ?? 'Godot stage view patch must contain at least one valid camera field.',
    )
  }
}

function pathSegments(event: Parameters<RequestHandler>[0], prefix: string): string[] {
  const pathname = getRequestURL(event).pathname
  const suffix = pathname.slice(prefix.length).replace(/^\/+/, '')
  if (!suffix)
    return []

  return suffix.split('/').filter(Boolean).map(segment => decodeURIComponent(segment))
}

function publishOperation(options: ControlApiRouteOptions, operation: string, payload?: unknown) {
  options.events.publish('operation', {
    operation,
    payload,
  })
}

function capabilities() {
  return {
    service: serviceName,
    version: 'v1',
    localOnly: true,
    auth: {
      scheme: 'Bearer',
      healthEndpointRequiresAuth: false,
    },
    surfaces: {
      alive: ['profile', 'state', 'memory', 'reflection'],
      chat: ['send', 'spotlight', 'interruptQueued', 'retry', 'cleanup', 'deleteMessage', 'sessions', 'messages'],
      providers: ['list', 'setActive', 'models'],
      speech: ['synthesize'],
      live2dExpressions: ['list', 'set', 'toggle', 'reset', 'saveDefaults', 'llmMode', 'llmExposed'],
      live2dView: ['get', 'set', 'reset'],
      live2dMotions: ['list', 'play'],
      mcp: ['status', 'tools', 'callTool', 'config', 'restart', 'testServer'],
      widgets: ['list', 'open', 'hide', 'add', 'update', 'remove', 'clear', 'event'],
      godotStage: ['status', 'start', 'stop', 'viewSnapshot', 'viewPatch', 'requestViewSnapshot'],
      plugins: ['list', 'loadEnabled', 'load', 'unload', 'setEnabled', 'setAutoReload', 'inspect', 'tools'],
      windows: ['openMain', 'hideMain', 'focusMain', 'openChat', 'openSettings', 'openWidgets', 'hideWidgets', 'openSpotlight'],
      events: ['sse'],
    },
    limitations: {
      chatInterrupt: 'Cancels queued sends and resets the foreground stream; active provider requests are not abortable yet.',
    },
  }
}

function requirePlugins(options: ControlApiRouteOptions): ControlApiPluginController {
  if (!options.plugins)
    throw new ControlApiHttpError(404, 'PLUGINS_UNAVAILABLE', 'Plugin control is unavailable.')
  return options.plugins
}

/**
 * Creates the H3 route surface for AIRI's local control API.
 *
 * Transport rules live here: local Host/Origin enforcement, bearer auth,
 * JSON response shape, CORS preflight, and route-to-operation mapping.
 */
export function createControlApiApp(options: ControlApiRouteOptions) {
  const app = new H3()

  app.options('/v1/**', optionsRoute())

  app.get('/v1/health', route(options, () => ({
    ok: true,
    service: serviceName,
    version: 'v1',
    localOnly: true,
    authRequired: true,
  }), { auth: false }))

  app.get('/v1/capabilities', route(options, () => capabilities()))

  app.get('/v1/status', route(options, async () => ({
    service: serviceName,
    address: options.getAddress(),
    renderer: await options.renderer.getStatus(),
    mcp: options.mcp.getRuntimeStatus(),
    godot: options.godot.getStatus(),
    widgets: options.widgets.listWidgets(),
  })))

  app.get('/v1/events', route(options, (event) => {
    const headers = createHeaders(event, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    })
    return new Response(createControlApiSseStream(options.events), { headers })
  }))

  app.get('/v1/alive/profile', route(options, () => options.renderer.aliveGetProfile()))

  app.get('/v1/alive/state', route(options, () => options.renderer.aliveGetState()))

  app.get('/v1/alive/memory', route(options, () => options.renderer.aliveListMemory()))

  app.post('/v1/alive/reflection', route(options, async () => {
    const result = await options.renderer.aliveReflect()
    publishOperation(options, 'alive.reflection')
    return result
  }))

  app.post('/v1/chat/send', route(options, async (event) => {
    const payload = readChatSendPayload(await readJsonRecord(event))
    await options.renderer.chatSend(payload)
    publishOperation(options, 'chat.send', { sessionId: payload.sessionId })
    return { ok: true }
  }))

  app.post('/v1/chat/spotlight', route(options, async (event) => {
    const body = await readJsonRecord(event)
    const result = await options.renderer.chatSpotlight({ text: requireString(body, 'text') })
    publishOperation(options, 'chat.spotlight')
    return result
  }))

  app.post('/v1/chat/interrupt', route(options, async (event) => {
    const body = await readJsonRecord(event)
    const payload = { sessionId: optionalString(body, 'sessionId') }
    const result = await options.renderer.chatInterrupt(payload)
    publishOperation(options, 'chat.interrupt', payload)
    return result
  }))

  app.post('/v1/chat/retry', route(options, async (event) => {
    const body = await readJsonRecord(event)
    const index = optionalNumber(body, 'index')
    if (index === undefined)
      throw new ControlApiHttpError(400, 'FIELD_REQUIRED', 'Field "index" is required.')
    await options.renderer.chatRetry({ sessionId: optionalString(body, 'sessionId'), index })
    publishOperation(options, 'chat.retry', { sessionId: optionalString(body, 'sessionId'), index })
    return { ok: true }
  }))

  app.post('/v1/chat/cleanup', route(options, async (event) => {
    const body = await readJsonRecord(event)
    const payload = { sessionId: optionalString(body, 'sessionId') }
    await options.renderer.chatCleanup(payload)
    publishOperation(options, 'chat.cleanup', payload)
    return { ok: true }
  }))

  app.delete('/v1/chat/messages', route(options, async (event) => {
    const body = await readJsonRecord(event)
    const messageId = optionalString(body, 'messageId')
    const index = optionalNumber(body, 'index')
    if (messageId === undefined && index === undefined) {
      throw new ControlApiHttpError(400, 'FIELD_REQUIRED', 'Field "messageId" or "index" is required.')
    }

    const payload = {
      sessionId: optionalString(body, 'sessionId'),
      messageId,
      index,
    }
    await options.renderer.chatDeleteMessage(payload)
    publishOperation(options, 'chat.message.delete', payload)
    return { ok: true }
  }))

  app.get('/v1/chat/sessions', route(options, () => options.renderer.chatListSessions()))

  app.post('/v1/chat/sessions', route(options, async (event) => {
    const body = await readJsonRecord(event)
    const payload = {
      characterId: optionalString(body, 'characterId'),
      title: optionalString(body, 'title'),
      setActive: optionalBoolean(body, 'setActive'),
    }
    const result = await options.renderer.chatCreateSession(payload)
    publishOperation(options, 'chat.session.create', payload)
    return result
  }))

  app.get('/v1/chat/sessions/**', route(options, async (event) => {
    const [sessionId, action] = pathSegments(event, '/v1/chat/sessions')
    if (!sessionId || action !== 'messages')
      throw new ControlApiHttpError(404, 'NOT_FOUND', 'Chat session route not found.')
    return await options.renderer.chatGetMessages({ sessionId })
  }))

  app.post('/v1/chat/sessions/**', route(options, async (event) => {
    const [sessionId, action] = pathSegments(event, '/v1/chat/sessions')
    if (!sessionId || action !== 'select')
      throw new ControlApiHttpError(404, 'NOT_FOUND', 'Chat session route not found.')
    await options.renderer.chatSelectSession({ sessionId })
    publishOperation(options, 'chat.session.select', { sessionId })
    return { ok: true }
  }))

  app.get('/v1/chat/messages', route(options, () => options.renderer.chatGetMessages({})))

  app.get('/v1/providers', route(options, () => options.renderer.getProviderStatus()))

  app.get('/v1/providers/**', route(options, async (event) => {
    const [first, second] = pathSegments(event, '/v1/providers')
    if (first === 'models' && second)
      return await options.renderer.getProviderModels({ providerId: second })
    if (first && second === 'active') {
      const kind = requireProviderKind(first)
      const status = await options.renderer.getProviderStatus() as { active?: Record<string, unknown> }
      return status.active?.[kind] ?? null
    }
    throw new ControlApiHttpError(404, 'NOT_FOUND', 'Provider route not found.')
  }))

  app.post('/v1/providers/**', route(options, async (event) => {
    const [kind, action] = pathSegments(event, '/v1/providers')
    if (!kind || action !== 'active')
      throw new ControlApiHttpError(404, 'NOT_FOUND', 'Provider route not found.')
    const body = await readJsonRecord(event)
    const payload = {
      kind: requireProviderKind(kind),
      providerId: requireString(body, 'providerId'),
      modelId: optionalString(body, 'modelId'),
      loadModels: optionalBoolean(body, 'loadModels'),
    }
    const result = await options.renderer.setActiveProvider(payload)
    publishOperation(options, 'provider.set-active', payload)
    return result
  }))

  app.post('/v1/speech/synthesize', route(options, async (event) => {
    const body = await readJsonRecord(event)
    const payload = {
      text: requireString(body, 'text'),
      providerId: optionalString(body, 'providerId'),
      modelId: optionalString(body, 'modelId'),
      voiceId: optionalString(body, 'voiceId'),
      forceSSML: optionalBoolean(body, 'forceSSML'),
    }
    publishOperation(options, 'speech.synthesize')
    return await options.renderer.speechSynthesize(payload)
  }))

  app.get('/v1/live2d/expressions', route(options, () => options.renderer.expressionList()))

  app.post('/v1/live2d/expressions/set', route(options, async (event) => {
    const body = await readJsonRecord(event)
    const payload = {
      name: requireString(body, 'name'),
      value: requireExpressionValue(body, 'value'),
      duration: optionalNumber(body, 'duration'),
    }
    const result = await options.renderer.expressionSet(payload)
    publishOperation(options, 'live2d.expression.set', payload)
    return result
  }))

  app.post('/v1/live2d/expressions/toggle', route(options, async (event) => {
    const body = await readJsonRecord(event)
    const payload = {
      name: requireString(body, 'name'),
      duration: optionalNumber(body, 'duration'),
    }
    const result = await options.renderer.expressionToggle(payload)
    publishOperation(options, 'live2d.expression.toggle', payload)
    return result
  }))

  app.post('/v1/live2d/expressions/reset', route(options, async () => {
    const result = await options.renderer.expressionResetAll()
    publishOperation(options, 'live2d.expression.reset')
    return result
  }))

  app.post('/v1/live2d/expressions/save-defaults', route(options, async () => {
    const result = await options.renderer.expressionSaveDefaults()
    publishOperation(options, 'live2d.expression.save-defaults')
    return result
  }))

  app.post('/v1/live2d/expressions/llm-mode', route(options, async (event) => {
    const body = await readJsonRecord(event)
    const payload = {
      mode: requireExpressionLlmMode(requireString(body, 'mode')),
    }
    const result = await options.renderer.expressionSetLlmMode(payload)
    publishOperation(options, 'live2d.expression.llm-mode.set', payload)
    return result
  }))

  app.post('/v1/live2d/expressions/llm-exposed', route(options, async (event) => {
    const body = await readJsonRecord(event)
    const payload = {
      name: requireString(body, 'name'),
      enabled: requireBoolean(body, 'enabled'),
    }
    const result = await options.renderer.expressionSetLlmExposed(payload)
    publishOperation(options, 'live2d.expression.llm-exposed.set', payload)
    return result
  }))

  app.get('/v1/live2d/view', route(options, () => options.renderer.live2dViewGet()))

  app.post('/v1/live2d/view/set', route(options, async (event) => {
    const payload = readLive2DViewSetPayload(await readJsonRecord(event))
    const result = await options.renderer.live2dViewSet(payload)
    publishOperation(options, 'live2d.view.set', payload)
    return result
  }))

  app.post('/v1/live2d/view/reset', route(options, async (event) => {
    const payload = readLive2DViewResetPayload(await readJsonRecord(event))
    const result = await options.renderer.live2dViewReset(payload)
    publishOperation(options, 'live2d.view.reset', payload)
    return result
  }))

  app.get('/v1/live2d/motions', route(options, () => options.renderer.live2dMotionList()))

  app.post('/v1/live2d/motions/play', route(options, async (event) => {
    const payload = readLive2DMotionPlayPayload(await readJsonRecord(event))
    const result = await options.renderer.live2dMotionPlay(payload)
    publishOperation(options, 'live2d.motion.play', payload)
    return result
  }))

  app.get('/v1/mcp/status', route(options, () => options.mcp.getRuntimeStatus()))
  app.get('/v1/mcp/tools', route(options, () => options.mcp.listTools()))
  app.post('/v1/mcp/tools/call', route(options, async (event) => {
    const body = await readJsonRecord(event)
    const payload = {
      name: requireString(body, 'name'),
      arguments: optionalRecord(body, 'arguments') ?? optionalRecord(body, 'args'),
    }
    const result = await options.mcp.callTool(payload)
    publishOperation(options, 'mcp.tool.call', { name: payload.name })
    return result
  }))
  app.get('/v1/mcp/config', route(options, () => options.mcp.readConfigText()))
  app.put('/v1/mcp/config', route(options, async (event) => {
    const body = await readJsonRecord(event)
    const result = await options.mcp.writeConfigText(requireString(body, 'text'))
    publishOperation(options, 'mcp.config.write')
    return result
  }))
  app.post('/v1/mcp/restart', route(options, async () => {
    const result = await options.mcp.applyAndRestart()
    publishOperation(options, 'mcp.restart')
    return result
  }))
  app.post('/v1/mcp/test', route(options, async (event) => {
    const body = await readJsonRecord(event)
    return await options.mcp.testServer(readMcpTestPayload(body))
  }))

  app.get('/v1/widgets', route(options, () => options.widgets.listWidgets()))
  app.post('/v1/widgets/open', route(options, async (event) => {
    const body = await readJsonRecord(event)
    const payload = { id: optionalString(body, 'id') }
    await options.widgets.openWindow(payload)
    publishOperation(options, 'widgets.open', payload)
    return { ok: true }
  }))
  app.post('/v1/widgets/hide', route(options, async (event) => {
    const body = await readJsonRecord(event)
    const payload = { id: optionalString(body, 'id') }
    await options.widgets.hideWindow(payload)
    publishOperation(options, 'widgets.hide', payload)
    return { ok: true }
  }))
  app.post('/v1/widgets', route(options, async (event) => {
    const payload = readWidgetsAddPayload(await readJsonRecord(event))
    const id = await options.widgets.pushWidget(payload)
    publishOperation(options, 'widgets.add', { id })
    return { id }
  }))
  app.patch('/v1/widgets/**', route(options, async (event) => {
    const [id] = pathSegments(event, '/v1/widgets')
    if (!id)
      throw new ControlApiHttpError(404, 'NOT_FOUND', 'Widget id is required.')
    const body = await readJsonRecord(event)
    await options.widgets.updateWidget(readWidgetsUpdatePayload(body, id))
    publishOperation(options, 'widgets.update', { id })
    return { ok: true }
  }))
  app.post('/v1/widgets/**', route(options, async (event) => {
    const [id, action] = pathSegments(event, '/v1/widgets')
    if (!id || action !== 'events')
      throw new ControlApiHttpError(404, 'NOT_FOUND', 'Widget route not found.')
    const body = await readJsonRecord(event)
    const payload = optionalRecord(body, 'event') ?? body
    options.widgets.publishWidgetEvent(id, payload)
    publishOperation(options, 'widgets.event', { id })
    return { ok: true }
  }))
  app.delete('/v1/widgets', route(options, async () => {
    await options.widgets.clearWidgets()
    publishOperation(options, 'widgets.clear')
    return { ok: true }
  }))
  app.delete('/v1/widgets/**', route(options, async (event) => {
    const [id] = pathSegments(event, '/v1/widgets')
    if (!id)
      throw new ControlApiHttpError(404, 'NOT_FOUND', 'Widget id is required.')
    await options.widgets.removeWidget(id)
    publishOperation(options, 'widgets.remove', { id })
    return { ok: true }
  }))

  app.post('/v1/windows/**', route(options, async (event) => {
    const [name, action = 'open'] = pathSegments(event, '/v1/windows')
    const body = await readJsonRecord(event)

    if (name === 'main' && action === 'open') {
      await options.windows.openMain()
    }
    else if (name === 'main' && action === 'hide') {
      await options.windows.hideMain()
    }
    else if (name === 'main' && action === 'focus') {
      await options.windows.focusMain()
    }
    else if (name === 'chat' && action === 'open') {
      await options.windows.openChat()
    }
    else if (name === 'settings' && action === 'open') {
      await options.windows.openSettings(optionalString(body, 'route'))
    }
    else if (name === 'widgets' && action === 'open') {
      await options.windows.openWidgets({ id: optionalString(body, 'id') })
    }
    else if (name === 'widgets' && action === 'hide') {
      await options.windows.hideWidgets({ id: optionalString(body, 'id') })
    }
    else if (name === 'spotlight' && action === 'open') {
      await options.windows.openSpotlight()
    }
    else {
      throw new ControlApiHttpError(404, 'NOT_FOUND', 'Window route not found.')
    }

    publishOperation(options, `windows.${name}.${action}`)
    return { ok: true }
  }))

  app.get('/v1/stage/godot/status', route(options, () => options.godot.getStatus()))
  app.post('/v1/stage/godot/start', route(options, async () => {
    const result = await options.godot.start()
    publishOperation(options, 'godot.start')
    return result
  }))
  app.post('/v1/stage/godot/stop', route(options, async () => {
    const result = await options.godot.stop()
    publishOperation(options, 'godot.stop')
    return result
  }))
  app.get('/v1/stage/godot/view', route(options, () => options.godot.getViewSnapshot()))
  app.patch('/v1/stage/godot/view', route(options, async (event) => {
    const payload = readStageViewPatchPayload(await readJsonRecord(event))
    const result = await options.godot.applyViewPatch(payload)
    publishOperation(options, 'godot.view.patch')
    return result
  }))
  app.post('/v1/stage/godot/view/request', route(options, async () => {
    const result = await options.godot.requestViewSnapshot()
    publishOperation(options, 'godot.view.request')
    return result
  }))

  app.get('/v1/plugins', route(options, () => requirePlugins(options).list()))
  app.get('/v1/plugins/inspect', route(options, () => requirePlugins(options).inspect()))
  app.get('/v1/plugins/tools', route(options, () => requirePlugins(options).listTools()))
  app.post('/v1/plugins/load-enabled', route(options, async () => {
    const result = await requirePlugins(options).loadEnabled()
    publishOperation(options, 'plugins.load-enabled')
    return result
  }))
  app.post('/v1/plugins/tools/invoke', route(options, async (event) => {
    const body = await readJsonRecord(event)
    const payload = {
      ownerExtensionId: requireString(body, 'ownerExtensionId'),
      name: requireString(body, 'name'),
      input: optionalRecord(body, 'input'),
    }
    const result = await requirePlugins(options).invokeTool(payload)
    publishOperation(options, 'plugins.tool.invoke', { ownerExtensionId: payload.ownerExtensionId, name: payload.name })
    return result
  }))
  app.post('/v1/plugins/**', route(options, async (event) => {
    const [extensionId, action] = pathSegments(event, '/v1/plugins')
    if (!extensionId || !action)
      throw new ControlApiHttpError(404, 'NOT_FOUND', 'Plugin route not found.')

    const plugins = requirePlugins(options)
    const body = await readJsonRecord(event)
    if (action === 'load') {
      const result = await plugins.load(extensionId)
      publishOperation(options, 'plugins.load', { extensionId })
      return result
    }
    if (action === 'unload') {
      const result = await plugins.unload(extensionId)
      publishOperation(options, 'plugins.unload', { extensionId })
      return result
    }
    if (action === 'enabled') {
      const result = await plugins.setEnabled({
        extensionId,
        enabled: optionalBoolean(body, 'enabled') ?? true,
        path: optionalString(body, 'path'),
      })
      publishOperation(options, 'plugins.set-enabled', { extensionId })
      return result
    }
    if (action === 'auto-reload') {
      const result = await plugins.setAutoReload({
        extensionId,
        enabled: optionalBoolean(body, 'enabled') ?? true,
      })
      publishOperation(options, 'plugins.set-auto-reload', { extensionId })
      return result
    }

    throw new ControlApiHttpError(404, 'NOT_FOUND', 'Plugin route not found.')
  }))

  return app
}
