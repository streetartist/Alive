import type { Tool } from '@xsai/shared-chat'
import type { SourcesOptions } from 'electron'
import type { JsonSchema } from 'xsschema'
import type { z } from 'zod'

import type {
  ElectronDesktopControlAction,
  ElectronDesktopControlResult,
  ElectronDesktopSnapshot,
} from '../../../../shared/eventa'

import { defineInvoke } from '@moeru/eventa'
import { createContext } from '@moeru/eventa/adapters/electron/renderer'
import { VISION_WORKLOADS } from '@proj-airi/stage-ui/composables/vision/use-vision-workloads'
import { useVisionOrchestratorStore, useVisionStore } from '@proj-airi/stage-ui/stores/modules/vision'
import { rawTool } from '@xsai/tool'
import { shallowRef } from 'vue'
import { toJsonSchema } from 'xsschema'
import { z as zod } from 'zod'

import { electronDesktopGetSnapshot, electronDesktopRunAction } from '../../../../shared/eventa'
import { useVisionScreenCapture } from '../../../composables/use-vision-screen-capture'

interface DesktopControlInvokers {
  getSnapshot: () => Promise<ElectronDesktopSnapshot>
  runAction: (payload: ElectronDesktopControlAction) => Promise<ElectronDesktopControlResult>
}

interface DesktopControlToolDeps {
  invokers?: DesktopControlInvokers
  observeScreen?: (input: ScreenObserveToolInput) => Promise<string>
  makeConfirmationCode?: () => string
  sleep?: (durationMs: number) => Promise<void>
}

interface ScreenObservationRuntime {
  activeSourceId: ReturnType<typeof useVisionScreenCapture>['activeSourceId']
  activeStream: ReturnType<typeof useVisionScreenCapture>['activeStream']
  captureFrame: ReturnType<typeof useVisionScreenCapture>['captureFrame']
  refetchSources: ReturnType<typeof useVisionScreenCapture>['refetchSources']
  sources: ReturnType<typeof useVisionScreenCapture>['sources']
  startStream: ReturnType<typeof useVisionScreenCapture>['startStream']
  stopStream: ReturnType<typeof useVisionScreenCapture>['stopStream']
  video: HTMLVideoElement
}

interface PendingDesktopAction {
  actionKey: string
  actionLabel: string
  expiresAt: number
}

const screenSourcesParams = zod.object({
  refresh: zod.boolean().describe('Whether to refresh the desktop capturer source list before returning it.'),
}).strict()

const screenObserveParams = zod.object({
  sourceId: zod.string().describe('Desktop capturer source id. Use an empty string to automatically choose the primary screen.'),
  workloadId: zod.enum(['screen:interpret', 'screen:understand', 'screen:ocr', 'screen:ui-automation']).describe('Vision workload to run on the captured frame.'),
  publishContext: zod.boolean().describe('Whether to publish the result into AIRI character context. Use true when the observation should help the next reply.'),
}).strict()

const confirmationFields = {
  confirmed: zod.boolean().describe('Set false to request confirmation. Set true only after the user replies with the confirmation code for this exact action.'),
  confirmationCode: zod.string().describe('Confirmation code returned by the previous unconfirmed tool call. Use an empty string when confirmed=false.'),
}

const moveParams = zod.object({
  x: zod.number().describe('Global screen X coordinate in physical desktop pixels.'),
  y: zod.number().describe('Global screen Y coordinate in physical desktop pixels.'),
  ...confirmationFields,
}).strict()

const clickParams = zod.object({
  x: zod.number().describe('Global screen X coordinate in physical desktop pixels.'),
  y: zod.number().describe('Global screen Y coordinate in physical desktop pixels.'),
  button: zod.enum(['left', 'middle', 'right']).describe('Mouse button.'),
  clickCount: zod.number().int().min(1).max(3).describe('Number of clicks, 1 to 3.'),
  ...confirmationFields,
}).strict()

const dragParams = zod.object({
  fromX: zod.number().describe('Global screen X coordinate where the drag starts.'),
  fromY: zod.number().describe('Global screen Y coordinate where the drag starts.'),
  toX: zod.number().describe('Global screen X coordinate where the drag ends.'),
  toY: zod.number().describe('Global screen Y coordinate where the drag ends.'),
  button: zod.enum(['left', 'middle', 'right']).describe('Mouse button held during the drag.'),
  durationMs: zod.number().int().min(0).max(5000).describe('Drag duration in milliseconds.'),
  ...confirmationFields,
}).strict()

const scrollParams = zod.object({
  x: zod.number().describe('Global screen X coordinate where the wheel event should happen.'),
  y: zod.number().describe('Global screen Y coordinate where the wheel event should happen.'),
  deltaX: zod.number().int().min(-6000).max(6000).describe('Horizontal wheel delta. Positive scrolls right, negative scrolls left.'),
  deltaY: zod.number().int().min(-6000).max(6000).describe('Vertical wheel delta. Positive scrolls down, negative scrolls up.'),
  ...confirmationFields,
}).strict()

const typeTextParams = zod.object({
  text: zod.string().max(2000).describe('Text to type into the currently focused app.'),
  ...confirmationFields,
}).strict()

const hotkeyParams = zod.object({
  hotkey: zod.string().describe('Hotkey chord like "Ctrl+S", "Alt+Tab", "Enter", or "Ctrl+Shift+F".'),
  ...confirmationFields,
}).strict()

const waitParams = zod.object({
  durationMs: zod.number().int().min(100).max(10000).describe('How long to wait before observing again, in milliseconds.'),
}).strict()

type ScreenObserveToolInput = z.infer<typeof screenObserveParams>
type ScreenSourcesToolInput = z.infer<typeof screenSourcesParams>
type MoveToolInput = z.infer<typeof moveParams>
type ClickToolInput = z.infer<typeof clickParams>
type DragToolInput = z.infer<typeof dragParams>
type ScrollToolInput = z.infer<typeof scrollParams>
type TypeTextToolInput = z.infer<typeof typeTextParams>
type HotkeyToolInput = z.infer<typeof hotkeyParams>
type WaitToolInput = z.infer<typeof waitParams>

let cachedInvokers: DesktopControlInvokers | undefined
let cachedObservationRuntime: ScreenObservationRuntime | undefined
const pendingActions = new Map<string, PendingDesktopAction>()
const PENDING_ACTION_TTL_MS = 2 * 60 * 1000

function createInvokers(): DesktopControlInvokers {
  const { context } = createContext(window.electron.ipcRenderer)

  return {
    getSnapshot: defineInvoke(context, electronDesktopGetSnapshot),
    runAction: defineInvoke(context, electronDesktopRunAction),
  }
}

function resolveInvokers(override?: DesktopControlInvokers): DesktopControlInvokers {
  if (override)
    return override
  if (!cachedInvokers)
    cachedInvokers = createInvokers()
  return cachedInvokers
}

function createHiddenVideoElement(): HTMLVideoElement {
  const video = document.createElement('video')
  video.muted = true
  video.autoplay = true
  video.playsInline = true
  video.className = 'ph-no-capture'
  Object.assign(video.style, {
    height: '1px',
    left: '-10000px',
    opacity: '0',
    pointerEvents: 'none',
    position: 'fixed',
    top: '-10000px',
    width: '1px',
  })
  document.body.appendChild(video)
  return video
}

function resolveObservationRuntime(): ScreenObservationRuntime {
  if (cachedObservationRuntime)
    return cachedObservationRuntime

  const sourcesOptions = shallowRef<SourcesOptions>({
    types: ['screen', 'window'],
    fetchWindowIcons: false,
  })
  const capture = useVisionScreenCapture(sourcesOptions)

  cachedObservationRuntime = {
    activeSourceId: capture.activeSourceId,
    activeStream: capture.activeStream,
    captureFrame: capture.captureFrame,
    refetchSources: capture.refetchSources,
    sources: capture.sources,
    startStream: capture.startStream,
    stopStream: capture.stopStream,
    video: createHiddenVideoElement(),
  }

  return cachedObservationRuntime
}

function sleep(durationMs: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, durationMs))
}

function createConfirmationCode(deps?: DesktopControlToolDeps): string {
  if (deps?.makeConfirmationCode)
    return deps.makeConfirmationCode()

  return Math.random().toString(36).slice(2, 8).toUpperCase()
}

function pruneExpiredPendingActions(now = Date.now()) {
  for (const [code, pending] of pendingActions) {
    if (pending.expiresAt <= now)
      pendingActions.delete(code)
  }
}

function stableActionKey(action: ElectronDesktopControlAction): string {
  return JSON.stringify(action, Object.keys(action).sort())
}

function requestConfirmation(action: ElectronDesktopControlAction, actionLabel: string, deps?: DesktopControlToolDeps): string {
  pruneExpiredPendingActions()
  const confirmationCode = createConfirmationCode(deps)
  pendingActions.set(confirmationCode, {
    actionKey: stableActionKey(action),
    actionLabel,
    expiresAt: Date.now() + PENDING_ACTION_TTL_MS,
  })

  return [
    `Confirmation required before ${actionLabel}.`,
    `Confirmation code: ${confirmationCode}`,
    'Ask the user to approve this exact action and repeat the tool call with confirmed=true and this confirmationCode.',
  ].join(' ')
}

function consumeConfirmation(action: ElectronDesktopControlAction, actionLabel: string, confirmationCode: string): string | null {
  pruneExpiredPendingActions()
  const normalizedCode = confirmationCode.trim().toUpperCase()
  const pending = pendingActions.get(normalizedCode)
  if (!pending) {
    return [
      `Confirmation code is missing, expired, or unknown for ${actionLabel}.`,
      'Call the tool once with confirmed=false to generate a fresh confirmation code.',
    ].join(' ')
  }

  if (pending.actionKey !== stableActionKey(action)) {
    return [
      `Confirmation code ${normalizedCode} belongs to a different desktop action.`,
      `Pending action: ${pending.actionLabel}.`,
      'Request a fresh confirmation code for the new action.',
    ].join(' ')
  }

  pendingActions.delete(normalizedCode)
  return null
}

function resolveConfirmedAction(
  params: { confirmed: boolean, confirmationCode: string },
  action: ElectronDesktopControlAction,
  actionLabel: string,
  deps?: DesktopControlToolDeps,
): string | null {
  if (!params.confirmed)
    return requestConfirmation(action, actionLabel, deps)

  return consumeConfirmation(action, actionLabel, params.confirmationCode)
}

async function ensureSourceSelected(runtime: ScreenObservationRuntime, sourceId: string) {
  if (!runtime.sources.value.length)
    await runtime.refetchSources()

  const requestedSourceId = sourceId.trim()
  if (requestedSourceId) {
    const requestedSource = runtime.sources.value.find(source => source.id === requestedSourceId)
    if (!requestedSource) {
      await runtime.refetchSources()
      if (!runtime.sources.value.some(source => source.id === requestedSourceId))
        throw new Error(`Screen source not found: ${requestedSourceId}`)
    }
    runtime.activeSourceId.value = requestedSourceId
    return
  }

  const currentSource = runtime.sources.value.find(source => source.id === runtime.activeSourceId.value)
  if (currentSource)
    return

  const primaryScreen = runtime.sources.value.find(source => source.id.startsWith('screen:'))
  const fallback = primaryScreen ?? runtime.sources.value[0]
  if (!fallback)
    throw new Error('No screen or window sources are available')

  runtime.activeSourceId.value = fallback.id
}

async function ensureVideoReady(runtime: ScreenObservationRuntime) {
  const stream = await runtime.startStream()
  const video = runtime.video

  if (video.srcObject !== stream)
    video.srcObject = stream

  await video.play()

  if (video.readyState >= 2)
    return

  await new Promise<void>((resolve) => {
    const handleLoadedMetadata = () => {
      video.removeEventListener('loadedmetadata', handleLoadedMetadata)
      resolve()
    }
    video.addEventListener('loadedmetadata', handleLoadedMetadata)
  })
}

function formatSnapshot(snapshot: ElectronDesktopSnapshot): string {
  const displays = snapshot.displays.map(display =>
    `display ${display.id}: bounds=${display.bounds.x},${display.bounds.y},${display.bounds.width}x${display.bounds.height}, workArea=${display.workArea.x},${display.workArea.y},${display.workArea.width}x${display.workArea.height}, scale=${display.scaleFactor}`,
  ).join('; ')

  return `platform=${snapshot.platform}; cursor=${snapshot.cursor.x},${snapshot.cursor.y}; ${displays || 'no displays'}`
}

function sourceKind(sourceId: string): 'screen' | 'window' | 'device' | 'unknown' {
  if (sourceId.startsWith('screen:'))
    return 'screen'
  if (sourceId.startsWith('window:'))
    return 'window'
  if (sourceId.startsWith('device:'))
    return 'device'
  return 'unknown'
}

async function listScreenSources(input: ScreenSourcesToolInput, deps?: DesktopControlToolDeps): Promise<string> {
  const invokers = resolveInvokers(deps?.invokers)
  const [snapshot] = await Promise.all([
    invokers.getSnapshot(),
  ])
  const runtime = resolveObservationRuntime()

  if (input.refresh || !runtime.sources.value.length)
    await runtime.refetchSources()

  const sources = runtime.sources.value.map(source => ({
    id: source.id,
    kind: sourceKind(source.id),
    name: source.name,
    selected: source.id === runtime.activeSourceId.value,
  }))

  return [
    'Desktop sources:',
    JSON.stringify(sources, null, 2),
    '',
    `Desktop snapshot: ${formatSnapshot(snapshot)}`,
    'Use screen_observe with a sourceId from this list, then use global desktop coordinates from the snapshot for control tools.',
  ].join('\n')
}

async function captureScreenObservation(input: ScreenObserveToolInput, deps?: DesktopControlToolDeps): Promise<string> {
  const invokers = resolveInvokers(deps?.invokers)
  const snapshot = await invokers.getSnapshot()
  const visionStore = useVisionStore()

  if (!visionStore.configured) {
    return [
      'Vision model is not configured, so AIRI cannot interpret the screen yet.',
      `Desktop snapshot: ${formatSnapshot(snapshot)}`,
      'Configure a vision provider/model in Settings, then call screen_observe again.',
    ].join('\n')
  }

  const runtime = resolveObservationRuntime()
  const workloadId = input.workloadId || 'screen:ui-automation'

  await ensureSourceSelected(runtime, input.sourceId)
  await ensureVideoReady(runtime)

  const imageDataUrl = runtime.captureFrame(runtime.video, 0.82, 1280, 720)
  if (!imageDataUrl)
    throw new Error('Unable to capture a screen frame from the selected source')

  const selectedSource = runtime.sources.value.find(source => source.id === runtime.activeSourceId.value)
  const orchestrator = useVisionOrchestratorStore()
  const result = await orchestrator.processCapture({
    imageDataUrl,
    workloadId,
    sourceId: runtime.activeSourceId.value,
    capturedAt: Date.now(),
    publishContext: input.publishContext,
  })

  return [
    `Source: ${runtime.activeSourceId.value}`,
    selectedSource ? `Source name: ${selectedSource.name}` : undefined,
    `Captured frame: ${runtime.video.videoWidth}x${runtime.video.videoHeight}`,
    `Workload: ${workloadId}`,
    `Desktop snapshot: ${formatSnapshot(snapshot)}`,
    'Coordinate guide: control tools use global desktop coordinates. For a full-screen source, use the matching display bounds as the origin and size.',
    '',
    result.text,
  ].filter((line): line is string => typeof line === 'string').join('\n')
}

async function executeMove(input: MoveToolInput, deps?: DesktopControlToolDeps): Promise<string> {
  const action: ElectronDesktopControlAction = {
    action: 'move',
    x: input.x,
    y: input.y,
  }
  const confirmationError = resolveConfirmedAction(input, action, `moving the cursor to (${input.x}, ${input.y})`, deps)
  if (confirmationError)
    return confirmationError

  const result = await resolveInvokers(deps?.invokers).runAction(action)
  return `${result.message}. Cursor is now at ${result.cursor.x},${result.cursor.y}.`
}

async function executeClick(input: ClickToolInput, deps?: DesktopControlToolDeps): Promise<string> {
  const action: ElectronDesktopControlAction = {
    action: 'click',
    x: input.x,
    y: input.y,
    button: input.button,
    clickCount: input.clickCount,
  }
  const confirmationError = resolveConfirmedAction(input, action, `clicking ${input.button} ${input.clickCount} time(s) at (${input.x}, ${input.y})`, deps)
  if (confirmationError)
    return confirmationError

  const result = await resolveInvokers(deps?.invokers).runAction(action)
  return `${result.message}. Cursor is now at ${result.cursor.x},${result.cursor.y}.`
}

async function executeDrag(input: DragToolInput, deps?: DesktopControlToolDeps): Promise<string> {
  const action: ElectronDesktopControlAction = {
    action: 'drag',
    fromX: input.fromX,
    fromY: input.fromY,
    toX: input.toX,
    toY: input.toY,
    button: input.button,
    durationMs: input.durationMs,
  }
  const confirmationError = resolveConfirmedAction(input, action, `dragging from (${input.fromX}, ${input.fromY}) to (${input.toX}, ${input.toY})`, deps)
  if (confirmationError)
    return confirmationError

  const result = await resolveInvokers(deps?.invokers).runAction(action)
  return `${result.message}. Cursor is now at ${result.cursor.x},${result.cursor.y}.`
}

async function executeScroll(input: ScrollToolInput, deps?: DesktopControlToolDeps): Promise<string> {
  const action: ElectronDesktopControlAction = {
    action: 'scroll',
    x: input.x,
    y: input.y,
    deltaX: input.deltaX,
    deltaY: input.deltaY,
  }
  const confirmationError = resolveConfirmedAction(input, action, `scrolling at (${input.x}, ${input.y}) by deltaX=${input.deltaX}, deltaY=${input.deltaY}`, deps)
  if (confirmationError)
    return confirmationError

  const result = await resolveInvokers(deps?.invokers).runAction(action)
  return `${result.message}. Cursor is now at ${result.cursor.x},${result.cursor.y}.`
}

async function executeTypeText(input: TypeTextToolInput, deps?: DesktopControlToolDeps): Promise<string> {
  const action: ElectronDesktopControlAction = {
    action: 'typeText',
    text: input.text,
  }
  const confirmationError = resolveConfirmedAction(input, action, `typing ${JSON.stringify(input.text)}`, deps)
  if (confirmationError)
    return confirmationError

  const result = await resolveInvokers(deps?.invokers).runAction(action)
  return `${result.message}.`
}

function parseHotkey(hotkey: string): string[] {
  return hotkey
    .split('+')
    .map(part => part.trim())
    .filter(Boolean)
}

async function executeHotkey(input: HotkeyToolInput, deps?: DesktopControlToolDeps): Promise<string> {
  const keys = parseHotkey(input.hotkey)
  const action: ElectronDesktopControlAction = {
    action: 'hotkey',
    keys,
  }
  const confirmationError = resolveConfirmedAction(input, action, `pressing ${input.hotkey}`, deps)
  if (confirmationError)
    return confirmationError

  const result = await resolveInvokers(deps?.invokers).runAction(action)
  return `${result.message}.`
}

async function executeWait(input: WaitToolInput, deps?: DesktopControlToolDeps): Promise<string> {
  await (deps?.sleep ?? sleep)(input.durationMs)
  return `Waited ${input.durationMs} ms.`
}

async function toolSchema(schema: z.ZodTypeAny): Promise<JsonSchema> {
  return await toJsonSchema(schema) as JsonSchema
}

/**
 * Creates AIRI's desktop observation and control tools.
 *
 * The toolset intentionally separates observation from input actions. Input
 * actions require a confirmation flag so the model has to ask before it mutates
 * the user's desktop state.
 */
export async function desktopControlTools(deps: DesktopControlToolDeps = {}): Promise<Tool[]> {
  return [
    rawTool({
      name: 'screen_sources',
      description: 'List capturable screens/windows plus desktop display bounds and cursor position. Use this before screen_observe when choosing a source or coordinate system.',
      execute: params => listScreenSources(params as ScreenSourcesToolInput, deps),
      parameters: await toolSchema(screenSourcesParams),
    }),
    rawTool({
      name: 'screen_observe',
      description: `Capture the user's selected screen/window and interpret it with AIRI vision. Use screen_sources first if sourceId or display bounds are unknown. Available workloads: ${VISION_WORKLOADS.map(workload => workload.id).join(', ')}.`,
      execute: params => deps.observeScreen
        ? deps.observeScreen(params as ScreenObserveToolInput)
        : captureScreenObservation(params as ScreenObserveToolInput, deps),
      parameters: await toolSchema(screenObserveParams),
    }),
    rawTool({
      name: 'desktop_move',
      description: 'Move the cursor to a global desktop coordinate. First call with confirmed=false to get a confirmation code; execute only after the user approves that exact code.',
      execute: params => executeMove(params as MoveToolInput, deps),
      parameters: await toolSchema(moveParams),
    }),
    rawTool({
      name: 'desktop_click',
      description: 'Click a global desktop coordinate. First call with confirmed=false to get a confirmation code; execute only after the user approves that exact code.',
      execute: params => executeClick(params as ClickToolInput, deps),
      parameters: await toolSchema(clickParams),
    }),
    rawTool({
      name: 'desktop_drag',
      description: 'Drag the mouse between global desktop coordinates. First call with confirmed=false to get a confirmation code; execute only after the user approves that exact code.',
      execute: params => executeDrag(params as DragToolInput, deps),
      parameters: await toolSchema(dragParams),
    }),
    rawTool({
      name: 'desktop_scroll',
      description: 'Send a wheel scroll at a global desktop coordinate. Positive deltaY scrolls down. First call with confirmed=false to get a confirmation code; execute only after approval.',
      execute: params => executeScroll(params as ScrollToolInput, deps),
      parameters: await toolSchema(scrollParams),
    }),
    rawTool({
      name: 'desktop_type_text',
      description: 'Type text into the currently focused desktop app. First call with confirmed=false to get a confirmation code; execute only after the user approves that exact code.',
      execute: params => executeTypeText(params as TypeTextToolInput, deps),
      parameters: await toolSchema(typeTextParams),
    }),
    rawTool({
      name: 'desktop_hotkey',
      description: 'Press a keyboard shortcut like Ctrl+S, Alt+Tab, Enter, or Escape. First call with confirmed=false to get a confirmation code; execute only after approval.',
      execute: params => executeHotkey(params as HotkeyToolInput, deps),
      parameters: await toolSchema(hotkeyParams),
    }),
    rawTool({
      name: 'desktop_wait',
      description: 'Wait briefly for the desktop UI to change before observing again.',
      execute: params => executeWait(params as WaitToolInput, deps),
      parameters: await toolSchema(waitParams),
    }),
  ]
}

export type { DesktopControlInvokers, DesktopControlToolDeps, ScreenObserveToolInput }
