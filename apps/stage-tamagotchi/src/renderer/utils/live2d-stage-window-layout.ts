import type { Live2DModelLayoutBounds } from '@proj-airi/stage-ui-live2d'

/** Stable virtual stage size used to lay out Live2D independently from the cropped Electron window. */
export interface StageWindowLayoutSize {
  /** Virtual stage width in CSS pixels. */
  width: number
  /** Virtual stage height in CSS pixels. */
  height: number
}

/** Visible rectangle of the virtual Live2D stage currently occupied by the Electron window. */
export interface StageWindowCrop {
  /** Left edge of the crop in virtual stage coordinates. */
  left: number
  /** Top edge of the crop in virtual stage coordinates. */
  top: number
  /** Crop width in CSS pixels. */
  width: number
  /** Crop height in CSS pixels. */
  height: number
}

/** Electron window bounds in display-independent pixels. */
export interface StageWindowBounds {
  /** Window left position in screen coordinates. */
  x: number
  /** Window top position in screen coordinates. */
  y: number
  /** Window width in display-independent pixels. */
  width: number
  /** Window height in display-independent pixels. */
  height: number
}

/** Padding added around model bounds before the Electron window crop is resolved. */
export interface StageWindowPadding {
  /** Extra room on the left side of the model bounds. */
  left: number
  /** Extra room above the model bounds. */
  top: number
  /** Extra room on the right side of the model bounds. */
  right: number
  /** Extra room below the model bounds, also reserving space for stage controls. */
  bottom: number
}

/** Default crop padding for Live2D desktop windows. */
export const defaultLive2DStageWindowPadding: StageWindowPadding = {
  left: 24,
  top: 24,
  right: 24,
  bottom: 96,
}

const defaultLayoutSize: StageWindowLayoutSize = {
  width: 450,
  height: 600,
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

function finitePositive(value: number | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
}

/**
 * Normalizes a persisted Live2D stage layout size.
 *
 * Before:
 * - `{ width: Number.NaN, height: 0 }`
 *
 * After:
 * - `{ width: 450, height: 600 }`
 */
export function normalizeStageWindowLayoutSize(
  size: Partial<StageWindowLayoutSize> | null | undefined,
  fallback: StageWindowLayoutSize = defaultLayoutSize,
): StageWindowLayoutSize {
  return {
    width: Math.round(finitePositive(size?.width) ? size.width : fallback.width),
    height: Math.round(finitePositive(size?.height) ? size.height : fallback.height),
  }
}

/** Creates a crop that shows the complete virtual stage. */
export function createFullStageWindowCrop(layoutSize: StageWindowLayoutSize): StageWindowCrop {
  return {
    left: 0,
    top: 0,
    width: Math.round(layoutSize.width),
    height: Math.round(layoutSize.height),
  }
}

/**
 * Normalizes a persisted Live2D crop rectangle.
 *
 * Before:
 * - `{ left: -10, top: 20, width: 9999, height: 200 }`
 *
 * After:
 * - A rectangle clamped inside the current virtual stage layout.
 */
export function normalizeStageWindowCrop(
  crop: Partial<StageWindowCrop> | null | undefined,
  layoutSize: StageWindowLayoutSize,
): StageWindowCrop {
  const layout = normalizeStageWindowLayoutSize(layoutSize)
  if (!crop)
    return createFullStageWindowCrop(layout)

  const left = clamp(Math.round(crop.left ?? 0), 0, Math.max(0, layout.width - 1))
  const top = clamp(Math.round(crop.top ?? 0), 0, Math.max(0, layout.height - 1))
  const width = clamp(Math.round(crop.width ?? layout.width), 1, layout.width - left)
  const height = clamp(Math.round(crop.height ?? layout.height), 1, layout.height - top)

  return { left, top, width, height }
}

/**
 * Resolves the smallest practical window crop for the current Live2D model.
 *
 * The crop is calculated in virtual stage coordinates, so resizing the
 * Electron window does not feed back into Live2D model fitting.
 */
export function resolveLive2DStageWindowCrop(options: {
  modelBounds: Live2DModelLayoutBounds
  layoutSize: StageWindowLayoutSize
  minWidth?: number
  minHeight?: number
  padding?: Partial<StageWindowPadding>
}): StageWindowCrop {
  const layout = normalizeStageWindowLayoutSize(options.layoutSize)
  const padding = {
    ...defaultLive2DStageWindowPadding,
    ...options.padding,
  }
  const minWidth = Math.min(layout.width, Math.max(1, options.minWidth ?? 220))
  const minHeight = Math.min(layout.height, Math.max(1, options.minHeight ?? 240))

  let left = clamp(Math.floor(options.modelBounds.left - padding.left), 0, layout.width)
  let top = clamp(Math.floor(options.modelBounds.top - padding.top), 0, layout.height)
  let right = clamp(Math.ceil(options.modelBounds.right + padding.right), 0, layout.width)
  let bottom = clamp(Math.ceil(options.modelBounds.bottom + padding.bottom), 0, layout.height)

  if (right <= left || bottom <= top)
    return createFullStageWindowCrop(layout)

  if (right - left < minWidth) {
    const centerX = (left + right) / 2
    left = clamp(Math.round(centerX - minWidth / 2), 0, layout.width - minWidth)
    right = left + minWidth
  }

  if (bottom - top < minHeight) {
    const centerY = (top + bottom) / 2
    top = clamp(Math.round(centerY - minHeight / 2), 0, layout.height - minHeight)
    bottom = top + minHeight
  }

  return {
    left: Math.round(left),
    top: Math.round(top),
    width: Math.round(right - left),
    height: Math.round(bottom - top),
  }
}

/**
 * Converts a crop change into Electron window bounds while preserving the
 * virtual stage screen origin.
 */
export function resolveLive2DStageWindowBounds(options: {
  currentWindowBounds: StageWindowBounds
  currentCrop: StageWindowCrop
  nextCrop: StageWindowCrop
}): StageWindowBounds {
  const virtualOriginX = options.currentWindowBounds.x - options.currentCrop.left
  const virtualOriginY = options.currentWindowBounds.y - options.currentCrop.top

  return {
    x: Math.round(virtualOriginX + options.nextCrop.left),
    y: Math.round(virtualOriginY + options.nextCrop.top),
    width: Math.round(options.nextCrop.width),
    height: Math.round(options.nextCrop.height),
  }
}

/** Compares Electron window bounds with a tolerance for platform rounding. */
export function stageWindowBoundsEqual(
  a: StageWindowBounds,
  b: StageWindowBounds,
  tolerance = 1,
) {
  return Math.abs(a.x - b.x) <= tolerance
    && Math.abs(a.y - b.y) <= tolerance
    && Math.abs(a.width - b.width) <= tolerance
    && Math.abs(a.height - b.height) <= tolerance
}
