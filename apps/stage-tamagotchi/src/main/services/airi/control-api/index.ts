import type { BrowserWindow } from 'electron'
import type { InferOutput } from 'valibot'

import type { SettingsWindowManager } from '../../../windows/settings'
import type { SpotlightWindowManager } from '../../../windows/spotlight'
import type { WidgetsWindowManager } from '../../../windows/widgets'
import type { GodotStageManager } from '../godot-stage'
import type { ServerManager } from '../http-server/server-manager/types'
import type { McpStdioManager } from '../mcp-servers'
import type { ExtensionHostServiceInternal } from '../plugins/host'
import type { ControlApiServerAddressSnapshot } from './route'

import { randomUUID } from 'node:crypto'
import { env } from 'node:process'

import { useLogg } from '@guiiai/logg'
import { defineInvoke } from '@moeru/eventa'
import { createContext } from '@moeru/eventa/adapters/electron/main'
import { ipcMain } from 'electron'
import { boolean, number, object, optional, string } from 'valibot'

import {
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
  electronPluginToolsChanged,
} from '../../../../shared/eventa'
import { createConfig } from '../../../libs/electron/persistence'
import { createH3Server } from '../http-server/server'
import { createControlApiEventBus } from './event-bus'
import { createControlApiApp } from './route'

const DEFAULT_CONTROL_API_PORT = 6122
const CONTROL_API_HOST = '127.0.0.1'

const controlApiConfigSchema = object({
  enabled: optional(boolean(), true),
  port: optional(number(), DEFAULT_CONTROL_API_PORT),
  authToken: optional(string(), ''),
})

type ControlApiConfig = InferOutput<typeof controlApiConfigSchema>

export interface ControlApiServerOptions {
  mainWindow: BrowserWindow
  settingsWindow: SettingsWindowManager
  chatWindow: () => Promise<BrowserWindow>
  widgetsManager: WidgetsWindowManager
  spotlightWindow: SpotlightWindowManager
  mcpStdioManager: McpStdioManager
  godotStageManager: GodotStageManager
  pluginHost: ExtensionHostServiceInternal
}

function parseBooleanEnv(value: string | undefined): boolean | undefined {
  if (value === undefined)
    return undefined

  const normalized = value.trim().toLowerCase()
  if (['1', 'true', 'yes', 'on'].includes(normalized))
    return true
  if (['0', 'false', 'no', 'off'].includes(normalized))
    return false

  return undefined
}

function parsePortEnv(value: string | undefined): number | undefined {
  if (!value?.trim())
    return undefined

  const port = Number(value)
  if (!Number.isInteger(port) || port <= 0 || port > 65535)
    return undefined

  return port
}

function resolveControlApiConfig(config: {
  get: () => ControlApiConfig | undefined
  update: (next: ControlApiConfig) => void
}) {
  const stored: Partial<ControlApiConfig> = config.get() ?? {}
  const envToken = env.AIRI_CONTROL_API_TOKEN?.trim()
  const generatedToken = stored.authToken?.trim() || randomUUID()
  const authToken = envToken || generatedToken
  const port = parsePortEnv(env.AIRI_CONTROL_API_PORT) ?? stored.port ?? DEFAULT_CONTROL_API_PORT
  const enabled = parseBooleanEnv(env.AIRI_CONTROL_API_ENABLED) ?? stored.enabled ?? true

  if (!stored.authToken?.trim() || stored.port !== port || stored.enabled !== enabled) {
    config.update({
      enabled,
      port,
      authToken: stored.authToken?.trim() || generatedToken,
    })
  }

  return {
    enabled,
    port,
    authToken,
    authTokenSource: envToken ? 'env' : stored.authToken?.trim() ? 'config' : 'generated',
  }
}

function showAndFocusWindow(window: BrowserWindow) {
  if (window.isDestroyed())
    throw new Error('Target window is already destroyed.')

  if (window.isMinimized())
    window.restore()

  window.show()
  window.focus()
  window.moveTop()
}

/**
 * Creates the local-only AIRI control API server.
 *
 * Call stack:
 *
 * setupControlApiServer (./index)
 *   -> {@link createControlApiApp}
 *     -> Electron main managers + main-window Eventa bridge
 */
export function setupControlApiServer(options: ControlApiServerOptions): ServerManager {
  const log = useLogg('main/control-api').useGlobalConfig()
  const controlConfig = createConfig('control-api', 'config.json', controlApiConfigSchema, {
    default: {
      enabled: true,
      port: DEFAULT_CONTROL_API_PORT,
      authToken: '',
    },
    autoHeal: true,
  })
  controlConfig.setup()

  const resolvedConfig = resolveControlApiConfig(controlConfig)
  const events = createControlApiEventBus()
  const rendererContext = createContext(ipcMain, options.mainWindow).context
  const broadcastContext = createContext(ipcMain).context

  const invokeGetStatus = defineInvoke(rendererContext, electronControlApiGetStatus)
  const invokeChatSend = defineInvoke(rendererContext, electronControlApiChatSend)
  const invokeChatSpotlight = defineInvoke(rendererContext, electronControlApiChatSpotlight)
  const invokeChatRetry = defineInvoke(rendererContext, electronControlApiChatRetry)
  const invokeChatCleanup = defineInvoke(rendererContext, electronControlApiChatCleanup)
  const invokeChatInterrupt = defineInvoke(rendererContext, electronControlApiChatInterrupt)
  const invokeChatDeleteMessage = defineInvoke(rendererContext, electronControlApiChatDeleteMessage)
  const invokeChatListSessions = defineInvoke(rendererContext, electronControlApiChatListSessions)
  const invokeChatCreateSession = defineInvoke(rendererContext, electronControlApiChatCreateSession)
  const invokeChatSelectSession = defineInvoke(rendererContext, electronControlApiChatSelectSession)
  const invokeChatGetMessages = defineInvoke(rendererContext, electronControlApiChatGetMessages)
  const invokeGetProviderStatus = defineInvoke(rendererContext, electronControlApiGetProviderStatus)
  const invokeSetActiveProvider = defineInvoke(rendererContext, electronControlApiSetActiveProvider)
  const invokeGetProviderModels = defineInvoke(rendererContext, electronControlApiGetProviderModels)
  const invokeSpeechSynthesize = defineInvoke(rendererContext, electronControlApiSpeechSynthesize)
  const invokeExpressionList = defineInvoke(rendererContext, electronControlApiExpressionList)
  const invokeExpressionSet = defineInvoke(rendererContext, electronControlApiExpressionSet)
  const invokeExpressionToggle = defineInvoke(rendererContext, electronControlApiExpressionToggle)
  const invokeExpressionResetAll = defineInvoke(rendererContext, electronControlApiExpressionResetAll)
  const invokeExpressionSaveDefaults = defineInvoke(rendererContext, electronControlApiExpressionSaveDefaults)
  const invokeExpressionSetLlmMode = defineInvoke(rendererContext, electronControlApiExpressionSetLlmMode)
  const invokeExpressionSetLlmExposed = defineInvoke(rendererContext, electronControlApiExpressionSetLlmExposed)
  const invokeLive2DViewGet = defineInvoke(rendererContext, electronControlApiLive2DViewGet)
  const invokeLive2DViewSet = defineInvoke(rendererContext, electronControlApiLive2DViewSet)
  const invokeLive2DViewReset = defineInvoke(rendererContext, electronControlApiLive2DViewReset)
  const invokeLive2DMotionList = defineInvoke(rendererContext, electronControlApiLive2DMotionList)
  const invokeLive2DMotionPlay = defineInvoke(rendererContext, electronControlApiLive2DMotionPlay)

  let address: ControlApiServerAddressSnapshot | undefined

  const app = createControlApiApp({
    authToken: resolvedConfig.authToken,
    events,
    getAddress: () => address,
    renderer: {
      getStatus: () => invokeGetStatus(),
      chatSend: payload => invokeChatSend(payload),
      chatSpotlight: payload => invokeChatSpotlight(payload),
      chatRetry: payload => invokeChatRetry(payload),
      chatCleanup: payload => invokeChatCleanup(payload),
      chatInterrupt: payload => invokeChatInterrupt(payload),
      chatDeleteMessage: payload => invokeChatDeleteMessage(payload),
      chatListSessions: () => invokeChatListSessions(),
      chatCreateSession: payload => invokeChatCreateSession(payload),
      chatSelectSession: payload => invokeChatSelectSession(payload),
      chatGetMessages: payload => invokeChatGetMessages(payload),
      getProviderStatus: () => invokeGetProviderStatus(),
      setActiveProvider: payload => invokeSetActiveProvider(payload),
      getProviderModels: payload => invokeGetProviderModels(payload),
      speechSynthesize: payload => invokeSpeechSynthesize(payload),
      expressionList: () => invokeExpressionList(),
      expressionSet: payload => invokeExpressionSet(payload),
      expressionToggle: payload => invokeExpressionToggle(payload),
      expressionResetAll: () => invokeExpressionResetAll(),
      expressionSaveDefaults: () => invokeExpressionSaveDefaults(),
      expressionSetLlmMode: payload => invokeExpressionSetLlmMode(payload),
      expressionSetLlmExposed: payload => invokeExpressionSetLlmExposed(payload),
      live2dViewGet: () => invokeLive2DViewGet(),
      live2dViewSet: payload => invokeLive2DViewSet(payload),
      live2dViewReset: payload => invokeLive2DViewReset(payload),
      live2dMotionList: () => invokeLive2DMotionList(),
      live2dMotionPlay: payload => invokeLive2DMotionPlay(payload),
    },
    windows: {
      openMain: () => showAndFocusWindow(options.mainWindow),
      hideMain: () => options.mainWindow.hide(),
      focusMain: () => options.mainWindow.focus(),
      openChat: async () => {
        showAndFocusWindow(await options.chatWindow())
      },
      openSettings: route => options.settingsWindow.openWindow(route),
      openWidgets: params => options.widgetsManager.openWindow(params),
      hideWidgets: params => options.widgetsManager.hideWindow(params),
      openSpotlight: () => options.spotlightWindow.show(),
    },
    mcp: {
      getRuntimeStatus: () => options.mcpStdioManager.getRuntimeStatus(),
      listTools: () => options.mcpStdioManager.listTools(),
      callTool: payload => options.mcpStdioManager.callTool(payload),
      readConfigText: () => options.mcpStdioManager.readConfigText(),
      writeConfigText: text => options.mcpStdioManager.writeConfigText(text),
      applyAndRestart: () => options.mcpStdioManager.applyAndRestart(),
      testServer: payload => options.mcpStdioManager.testServer(payload),
    },
    widgets: {
      listWidgets: () => options.widgetsManager.listWidgets(),
      openWindow: params => options.widgetsManager.openWindow(params),
      hideWindow: params => options.widgetsManager.hideWindow(params),
      pushWidget: payload => options.widgetsManager.pushWidget(payload),
      updateWidget: payload => options.widgetsManager.updateWidget(payload),
      removeWidget: id => options.widgetsManager.removeWidget(id),
      clearWidgets: () => options.widgetsManager.clearWidgets(),
      publishWidgetEvent: (id, event) => options.widgetsManager.publishWidgetEvent(id, event),
    },
    godot: {
      getStatus: () => options.godotStageManager.getStatus(),
      start: () => options.godotStageManager.start(),
      stop: () => options.godotStageManager.stop(),
      getViewSnapshot: () => options.godotStageManager.getViewSnapshot(),
      applyViewPatch: payload => options.godotStageManager.applyViewPatch(payload),
      requestViewSnapshot: () => options.godotStageManager.requestViewSnapshot(),
    },
    plugins: {
      list: () => options.pluginHost.list(),
      loadEnabled: async () => {
        const result = await options.pluginHost.loadEnabled()
        broadcastContext.emit(electronPluginToolsChanged, { reason: 'load-enabled' })
        return result
      },
      load: async (extensionId) => {
        const result = await options.pluginHost.load(extensionId)
        broadcastContext.emit(electronPluginToolsChanged, { reason: 'loaded', extensionId })
        return result
      },
      unload: async (extensionId) => {
        const result = await options.pluginHost.unload(extensionId)
        broadcastContext.emit(electronPluginToolsChanged, { reason: 'unloaded', extensionId })
        return result
      },
      setEnabled: async (payload) => {
        const result = await options.pluginHost.setEnabled(payload)
        broadcastContext.emit(electronPluginToolsChanged, { reason: 'enabled-state-changed', extensionId: payload.extensionId })
        return result
      },
      setAutoReload: payload => options.pluginHost.setAutoReload(payload),
      inspect: () => options.pluginHost.inspect(),
      listTools: () => options.pluginHost.tools.listAvailableDescriptors(),
      invokeTool: payload => options.pluginHost.tools.invoke(payload.ownerExtensionId, payload.name, payload.input ?? {}),
    },
  })

  const server = createH3Server({
    app,
    host: CONTROL_API_HOST,
    port: resolvedConfig.port,
  })

  const stopSubscriptions: Array<() => void> = [
    options.godotStageManager.subscribe(status => events.publish('godot.status', status)),
    options.godotStageManager.subscribeViewSnapshot(snapshot => events.publish('godot.view.snapshot', snapshot)),
    options.godotStageManager.subscribeViewError(error => events.publish('godot.view.error', error)),
    options.widgetsManager.onWidgetEvent(event => events.publish('widgets.event', event)),
  ]

  return {
    key: 'control-api',
    async start() {
      if (!resolvedConfig.enabled) {
        log.log('local control API disabled')
        return
      }

      address = await server.start()
      log.withFields({
        baseUrl: address.baseUrl,
        authTokenSource: resolvedConfig.authTokenSource,
        configPath: controlConfig.getDiagnostics()?.path,
      }).log('local control API started')
    },
    async stop() {
      for (const stop of stopSubscriptions)
        stop()
      stopSubscriptions.length = 0
      address = undefined
      await server.stop()
    },
  }
}
