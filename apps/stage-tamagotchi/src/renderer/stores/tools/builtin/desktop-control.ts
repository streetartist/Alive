import type { Tool } from '@xsai/shared-chat'
import type { SourcesOptions } from 'electron'
import type { JsonSchema } from 'xsschema'
import type { z } from 'zod'

import type {
  ElectronDesktopControlAction,
  ElectronDesktopControlPolicy,
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

// NOTICE: Import coordinates-only entry so the renderer never pulls nut.js natives.
import { mapFramePointToGlobal } from '@proj-airi/desktop-control/coordinates'

import {
  electronDesktopGetPolicy,
  electronDesktopGetSnapshot,
  electronDesktopRunAction,
} from '../../../../shared/eventa'
import { useVisionScreenCapture } from '../../../composables/use-vision-screen-capture'

interface DesktopControlInvokers {
  getSnapshot: () => Promise<ElectronDesktopSnapshot>
  runAction: (payload: ElectronDesktopControlAction) => Promise<ElectronDesktopControlResult>
  getPolicy: () => Promise<ElectronDesktopControlPolicy>
}

interface DesktopControlToolDeps {
  invokers?: DesktopControlInvokers
  observeScreen?: (input: ScreenObserveToolInput) => Promise<string>
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

const screenSourcesParams = zod.object({
  refresh: zod.boolean().describe('Whether to refresh the desktop capturer source list before returning it.'),
}).strict()

const screenObserveParams = zod.object({
  sourceId: zod.string().describe('Desktop capturer source id. Use an empty string to automatically choose the primary screen.'),
  workloadId: zod.enum(['screen:interpret', 'screen:understand', 'screen:ocr', 'screen:ui-automation']).describe('Vision workload to run on the captured frame.'),
  publishContext: zod.boolean().describe('Whether to publish the result into AIRI character context. Use true when the observation should help the next reply.'),
}).strict()

const moveParams = zod.object({
  x: zod.number().describe('Global screen X coordinate in physical desktop pixels.'),
  y: zod.number().describe('Global screen Y coordinate in physical desktop pixels.'),
}).strict()

const clickParams = zod.object({
  x: zod.number().describe('Global screen X coordinate in physical desktop pixels.'),
  y: zod.number().describe('Global screen Y coordinate in physical desktop pixels.'),
  button: zod.enum(['left', 'middle', 'right']).describe('Mouse button.'),
  clickCount: zod.number().int().min(1).max(3).describe('Number of clicks, 1 to 3.'),
}).strict()

const dragParams = zod.object({
  fromX: zod.number().describe('Global screen X coordinate where the drag starts.'),
  fromY: zod.number().describe('Global screen Y coordinate where the drag starts.'),
  toX: zod.number().describe('Global screen X coordinate where the drag ends.'),
  toY: zod.number().describe('Global screen Y coordinate where the drag ends.'),
  button: zod.enum(['left', 'middle', 'right']).describe('Mouse button held during the drag.'),
  durationMs: zod.number().int().min(0).max(5000).describe('Drag duration in milliseconds.'),
}).strict()

const scrollParams = zod.object({
  x: zod.number().describe('Global screen X coordinate where the wheel event should happen.'),
  y: zod.number().describe('Global screen Y coordinate where the wheel event should happen.'),
  deltaX: zod.number().int().min(-6000).max(6000).describe('Horizontal wheel delta. Positive scrolls right, negative scrolls left.'),
  deltaY: zod.number().int().min(-6000).max(6000).describe('Vertical wheel delta. Positive scrolls down, negative scrolls up.'),
}).strict()

const typeTextParams = zod.object({
  text: zod.string().max(2000).describe('Text to type into the currently focused app.'),
}).strict()

const hotkeyParams = zod.object({
  hotkey: zod.string().describe('Hotkey chord like "Ctrl+S", "Alt+Tab", "Enter", or "Ctrl+Shift+F". Dangerous chords like Alt+F4 are blocked.'),
}).strict()

const waitParams = zod.object({
  durationMs: zod.number().int().min(100).max(10000).describe('How long to wait before observing again, in milliseconds.'),
}).strict()

const focusWindowParams = zod.object({
  titleIncludes: zod.string().min(1).max(200).describe('Case-insensitive substring matched against open window titles.'),
}).strict()

const clipboardWriteParams = zod.object({
  text: zod.string().max(20000).describe('Text to write to the system clipboard.'),
}).strict()

// NOTICE: Provider-strict tool schemas require every property key to be listed in
// `required`. Use a single required boolean instead of an empty object schema.
const clipboardReadParams = zod.object({
  acknowledge: zod.boolean().describe('Set true to acknowledge reading the system clipboard.'),
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
type FocusWindowToolInput = z.infer<typeof focusWindowParams>
type ClipboardWriteToolInput = z.infer<typeof clipboardWriteParams>

let cachedInvokers: DesktopControlInvokers | undefined
let cachedObservationRuntime: ScreenObservationRuntime | undefined

function createInvokers(): DesktopControlInvokers {
  const { context } = createContext(window.electron.ipcRenderer)

  return {
    getSnapshot: defineInvoke(context, electronDesktopGetSnapshot),
    runAction: defineInvoke(context, electronDesktopRunAction),
    getPolicy: defineInvoke(context, electronDesktopGetPolicy),
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

async function ensureEnabledForMutation(deps?: DesktopControlToolDeps): Promise<string | null> {
  const policy = await resolveInvokers(deps?.invokers).getPolicy()
  if (policy.killSwitched) {
    return 'Desktop control is kill-switched (emergency stop). Clear emergency stop and re-enable desktop control in settings before injecting input.'
  }
  if (!policy.enabled) {
    return 'Desktop control is disabled. Enable it in Settings → System → Desktop Control first.'
  }
  return null
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

  const active = snapshot.activeWindow
    ? `activeWindow="${snapshot.activeWindow.title}" @${snapshot.activeWindow.region.x},${snapshot.activeWindow.region.y},${snapshot.activeWindow.region.width}x${snapshot.activeWindow.region.height}`
    : 'activeWindow=unknown'

  const windows = snapshot.windows?.length
    ? `windows=${snapshot.windows.map(window => JSON.stringify(window.title)).join(', ')}`
    : 'windows=none'

  const policy = snapshot.policy
    ? `policy enabled=${snapshot.policy.enabled} confirm=${snapshot.policy.requireUserConfirmation} killSwitched=${snapshot.policy.killSwitched}`
    : 'policy=unknown'

  return `platform=${snapshot.platform}; cursor=${snapshot.cursor.x},${snapshot.cursor.y}; ${displays || 'no displays'}; ${active}; ${windows}; ${policy}`
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
  const snapshot = await invokers.getSnapshot()
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
    'Mutating desktop_* tools require desktop control to be enabled; OS may still show a confirmation dialog.',
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

  const frameWidth = runtime.video.videoWidth || 1280
  const frameHeight = runtime.video.videoHeight || 720
  const primaryDisplay = snapshot.displays[0]
  const coordinateExample = primaryDisplay
    ? (() => {
        const center = mapFramePointToGlobal({
          frameX: frameWidth / 2,
          frameY: frameHeight / 2,
          frameWidth,
          frameHeight,
          sourceBounds: primaryDisplay.bounds,
        })
        return `Example: frame center (${Math.round(frameWidth / 2)}, ${Math.round(frameHeight / 2)}) on display ${primaryDisplay.id} maps to global (${center.x}, ${center.y}).`
      })()
    : 'Example: map frame (x,y) with display bounds as sourceBounds before calling desktop_* tools.'

  return [
    `Source: ${runtime.activeSourceId.value}`,
    selectedSource ? `Source name: ${selectedSource.name}` : undefined,
    `Captured frame: ${frameWidth}x${frameHeight}`,
    `Workload: ${workloadId}`,
    `Desktop snapshot: ${formatSnapshot(snapshot)}`,
    'Coordinate guide: control tools use global desktop physical pixels, not frame pixels.',
    'For a full-screen source, treat the matching display bounds as the capture region, then scale frame x/y by bounds.width/frameWidth and bounds.height/frameHeight.',
    coordinateExample,
    '',
    result.text,
  ].filter((line): line is string => typeof line === 'string').join('\n')
}

async function runMutatingAction(
  action: ElectronDesktopControlAction,
  deps?: DesktopControlToolDeps,
): Promise<string> {
  const disabled = await ensureEnabledForMutation(deps)
  if (disabled)
    return disabled

  try {
    const result = await resolveInvokers(deps?.invokers).runAction(action)
    const extras = [
      result.window ? `window="${result.window.title}"` : undefined,
      result.clipboardText !== undefined ? `clipboardText=${JSON.stringify(result.clipboardText.slice(0, 200))}` : undefined,
    ].filter(Boolean)
    return `${result.message}. Cursor is now at ${result.cursor.x},${result.cursor.y}.${extras.length ? ` ${extras.join(' ')}` : ''}`
  }
  catch (error) {
    return error instanceof Error ? error.message : String(error)
  }
}

function parseHotkey(hotkey: string): string[] {
  return hotkey
    .split('+')
    .map(part => part.trim())
    .filter(Boolean)
}

async function toolSchema(schema: z.ZodTypeAny): Promise<JsonSchema> {
  const json = await toJsonSchema(schema) as JsonSchema & {
    type?: string
    properties?: Record<string, unknown>
    required?: string[]
  }

  // NOTICE: Provider-strict schemas require `required` whenever `properties` exists.
  // zod/xsschema often omits empty `required` for all-optional objects.
  if (json && typeof json === 'object' && json.properties && !Array.isArray(json.required))
    json.required = []

  return json
}

/**
 * Creates AIRI's desktop observation and control tools.
 *
 * Observation is always available. Mutating input requires desktop control to be
 * enabled in main-process policy; OS confirmation is enforced in main, not via
 * soft confirmation codes in the tool layer.
 */
export async function desktopControlTools(deps: DesktopControlToolDeps = {}): Promise<Tool[]> {
  return [
    rawTool({
      name: 'screen_sources',
      description: 'List capturable screens/windows plus desktop display bounds, active window, and control policy.',
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
      description: 'Move the cursor to a global desktop coordinate. Requires desktop control enabled; may prompt the user for OS confirmation.',
      execute: params => runMutatingAction({
        action: 'move',
        x: (params as MoveToolInput).x,
        y: (params as MoveToolInput).y,
      }, deps),
      parameters: await toolSchema(moveParams),
    }),
    rawTool({
      name: 'desktop_click',
      description: 'Click a global desktop coordinate. Requires desktop control enabled; may prompt the user for OS confirmation.',
      execute: params => runMutatingAction({
        action: 'click',
        x: (params as ClickToolInput).x,
        y: (params as ClickToolInput).y,
        button: (params as ClickToolInput).button,
        clickCount: (params as ClickToolInput).clickCount,
      }, deps),
      parameters: await toolSchema(clickParams),
    }),
    rawTool({
      name: 'desktop_drag',
      description: 'Drag the mouse between global desktop coordinates. Requires desktop control enabled; may prompt the user for OS confirmation.',
      execute: params => runMutatingAction({
        action: 'drag',
        fromX: (params as DragToolInput).fromX,
        fromY: (params as DragToolInput).fromY,
        toX: (params as DragToolInput).toX,
        toY: (params as DragToolInput).toY,
        button: (params as DragToolInput).button,
        durationMs: (params as DragToolInput).durationMs,
      }, deps),
      parameters: await toolSchema(dragParams),
    }),
    rawTool({
      name: 'desktop_scroll',
      description: 'Send a wheel scroll at a global desktop coordinate. Positive deltaY scrolls down. Requires desktop control enabled.',
      execute: params => runMutatingAction({
        action: 'scroll',
        x: (params as ScrollToolInput).x,
        y: (params as ScrollToolInput).y,
        deltaX: (params as ScrollToolInput).deltaX,
        deltaY: (params as ScrollToolInput).deltaY,
      }, deps),
      parameters: await toolSchema(scrollParams),
    }),
    rawTool({
      name: 'desktop_type_text',
      description: 'Type text into the currently focused desktop app. Prefer desktop_focus_window first. Requires desktop control enabled.',
      execute: params => runMutatingAction({
        action: 'typeText',
        text: (params as TypeTextToolInput).text,
      }, deps),
      parameters: await toolSchema(typeTextParams),
    }),
    rawTool({
      name: 'desktop_hotkey',
      description: 'Press a keyboard shortcut like Ctrl+S or Enter. Dangerous chords (e.g. Alt+F4) are blocked. Requires desktop control enabled.',
      execute: params => runMutatingAction({
        action: 'hotkey',
        keys: parseHotkey((params as HotkeyToolInput).hotkey),
      }, deps),
      parameters: await toolSchema(hotkeyParams),
    }),
    rawTool({
      name: 'desktop_focus_window',
      description: 'Focus an open desktop window by title substring (case-insensitive). Use before typing into a specific app.',
      execute: params => runMutatingAction({
        action: 'focusWindow',
        titleIncludes: (params as FocusWindowToolInput).titleIncludes,
      }, deps),
      parameters: await toolSchema(focusWindowParams),
    }),
    rawTool({
      name: 'desktop_clipboard_write',
      description: 'Write text to the system clipboard. Requires desktop control enabled.',
      execute: params => runMutatingAction({
        action: 'clipboardWrite',
        text: (params as ClipboardWriteToolInput).text,
      }, deps),
      parameters: await toolSchema(clipboardWriteParams),
    }),
    rawTool({
      name: 'desktop_clipboard_read',
      description: 'Read text from the system clipboard. Set acknowledge=true. Does not require OS confirmation.',
      execute: async (params) => {
        if (!(params as { acknowledge?: boolean }).acknowledge)
          return 'Set acknowledge=true to read the system clipboard.'
        try {
          const result = await resolveInvokers(deps?.invokers).runAction({ action: 'clipboardRead' })
          return result.clipboardText !== undefined
            ? `Clipboard text: ${JSON.stringify(result.clipboardText)}`
            : result.message
        }
        catch (error) {
          return error instanceof Error ? error.message : String(error)
        }
      },
      parameters: await toolSchema(clipboardReadParams),
    }),
    rawTool({
      name: 'desktop_wait',
      description: 'Wait briefly for the desktop UI to change before observing again.',
      execute: async (params) => {
        await (deps?.sleep ?? sleep)((params as WaitToolInput).durationMs)
        return `Waited ${(params as WaitToolInput).durationMs} ms.`
      },
      parameters: await toolSchema(waitParams),
    }),
  ]
}

export type { DesktopControlInvokers, DesktopControlToolDeps, ScreenObserveToolInput }
