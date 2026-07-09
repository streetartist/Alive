/** Bounds of the rendered character in stage-window coordinates. */
export interface StageChatBubbleAnchorBounds {
  left: number
  top: number
  right: number
  bottom: number
  width: number
  height: number
  centerX: number
  centerY: number
  scale?: number
}

/** Persisted bubble offset stored in model-scale units, not raw CSS pixels. */
export interface StageChatBubbleStoredOffset {
  x: number
  y: number
}

/** Inputs used to resolve the final on-screen chat bubble position. */
export interface StageChatBubblePlacementOptions {
  anchorBounds?: StageChatBubbleAnchorBounds | null
  bubbleHeight?: number
  bubbleWidth?: number
  gap?: number
  manualOffset?: Partial<StageChatBubbleStoredOffset> | null
  margin?: number
  maxWidthLimit?: number
  viewportHeight: number
  viewportWidth: number
}

/** Final bubble position in CSS pixels, plus metadata needed by the component. */
export interface StageChatBubblePlacement {
  anchorScale: number
  left: number
  maxWidth: number
  side: 'left' | 'right'
  top: number
}

/** Pointer drag state used to convert raw cursor movement into persisted offset units. */
export interface StageChatBubbleDragOffsetOptions {
  anchorScale: number
  currentClientX: number
  currentClientY: number
  startClientX: number
  startClientY: number
  startOffset: StageChatBubbleStoredOffset
}

const DEFAULT_BUBBLE_MARGIN = 12
const DEFAULT_BUBBLE_GAP = 8
const DEFAULT_BUBBLE_MAX_WIDTH = 352
const DEFAULT_BUBBLE_FALLBACK_HEIGHT = 96

function finiteNumber(value: number | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function finitePositive(value: number | undefined): value is number {
  return finiteNumber(value) && value > 0
}

function clampCoordinate(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

function normalizeOffset(offset: Partial<StageChatBubbleStoredOffset> | null | undefined): StageChatBubbleStoredOffset {
  return {
    x: finiteNumber(offset?.x) ? offset.x : 0,
    y: finiteNumber(offset?.y) ? offset.y : 0,
  }
}

/**
 * Resolves the chat bubble placement relative to the current model bounds.
 *
 * Manual offsets are stored in model-scale units. They are multiplied by the
 * current model scale here, so a dragged bubble keeps the same visual relation
 * to the character when the character is scaled up or down.
 */
export function resolveStageChatBubblePlacement(options: StageChatBubblePlacementOptions): StageChatBubblePlacement {
  const margin = finitePositive(options.margin) ? options.margin : DEFAULT_BUBBLE_MARGIN
  const gap = finitePositive(options.gap) ? options.gap : DEFAULT_BUBBLE_GAP
  const viewportWidth = Math.max(1, options.viewportWidth)
  const viewportHeight = Math.max(1, options.viewportHeight)
  const maxWidthLimit = finitePositive(options.maxWidthLimit) ? options.maxWidthLimit : DEFAULT_BUBBLE_MAX_WIDTH
  const maxWidth = Math.max(1, Math.min(maxWidthLimit, viewportWidth - margin * 2))
  const bubbleWidth = finitePositive(options.bubbleWidth) ? Math.min(options.bubbleWidth, maxWidth) : maxWidth
  const bubbleHeight = finitePositive(options.bubbleHeight) ? options.bubbleHeight : DEFAULT_BUBBLE_FALLBACK_HEIGHT
  const anchor = options.anchorBounds
  const anchorScale = finitePositive(anchor?.scale) ? anchor.scale : 1
  const manualOffset = normalizeOffset(options.manualOffset)

  let baseLeft = margin
  let baseTop = Math.min(60, Math.max(margin, viewportHeight - 120))
  let side: StageChatBubblePlacement['side'] = 'right'

  if (anchor) {
    side = anchor.centerX > viewportWidth / 2 ? 'left' : 'right'
    baseLeft = side === 'left'
      ? anchor.left - maxWidth - gap
      : anchor.right + gap
    baseTop = anchor.top + Math.max(8, anchor.height * 0.12)
  }

  const left = clampCoordinate(
    baseLeft + manualOffset.x * anchorScale,
    margin,
    Math.max(margin, viewportWidth - bubbleWidth - margin),
  )
  const top = clampCoordinate(
    baseTop + manualOffset.y * anchorScale,
    margin,
    Math.max(margin, viewportHeight - bubbleHeight - margin),
  )

  if (anchor)
    side = left + bubbleWidth / 2 < anchor.centerX ? 'left' : 'right'

  return {
    anchorScale,
    left,
    maxWidth,
    side,
    top,
  }
}

/**
 * Converts a pointer drag into the persisted model-scale offset units.
 */
export function resolveStageChatBubbleDragOffset(options: StageChatBubbleDragOffsetOptions): StageChatBubbleStoredOffset {
  const anchorScale = finitePositive(options.anchorScale) ? options.anchorScale : 1

  return {
    x: options.startOffset.x + (options.currentClientX - options.startClientX) / anchorScale,
    y: options.startOffset.y + (options.currentClientY - options.startClientY) / anchorScale,
  }
}
