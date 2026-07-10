import type { DesktopPoint, DesktopRectangle, FrameToGlobalMappingInput } from './types'

/**
 * Maps a point inside a scaled capture frame to global desktop coordinates.
 *
 * Vision tools often observe a downscaled frame (e.g. 1280×720). Control
 * injection uses global physical pixels. This helper assumes the frame covers
 * `sourceBounds` uniformly (letterboxing is not modeled).
 *
 * Before:
 * - frame (100, 50) on 1280×720 over bounds {x:0,y:0,w:1920,h:1080}
 *
 * After:
 * - global ≈ (150, 75)
 */
export function mapFramePointToGlobal(input: FrameToGlobalMappingInput): DesktopPoint {
  const { frameX, frameY, frameWidth, frameHeight, sourceBounds } = input

  if (!Number.isFinite(frameX) || !Number.isFinite(frameY))
    throw new TypeError('frameX and frameY must be finite numbers')
  if (!Number.isFinite(frameWidth) || frameWidth <= 0 || !Number.isFinite(frameHeight) || frameHeight <= 0)
    throw new TypeError('frameWidth and frameHeight must be positive finite numbers')
  assertRectangle(sourceBounds, 'sourceBounds')

  const x = sourceBounds.x + (frameX / frameWidth) * sourceBounds.width
  const y = sourceBounds.y + (frameY / frameHeight) * sourceBounds.height

  return {
    x: Math.round(x),
    y: Math.round(y),
  }
}

/**
 * Clamps a global point into a rectangle (inclusive min, exclusive max on far edge).
 */
export function clampPointToBounds(point: DesktopPoint, bounds: DesktopRectangle): DesktopPoint {
  assertRectangle(bounds, 'bounds')
  const maxX = bounds.x + Math.max(0, bounds.width - 1)
  const maxY = bounds.y + Math.max(0, bounds.height - 1)
  return {
    x: Math.min(Math.max(Math.round(point.x), bounds.x), maxX),
    y: Math.min(Math.max(Math.round(point.y), bounds.y), maxY),
  }
}

/**
 * Finds the display bounds that contain a global point, if any.
 */
export function findDisplayBoundsAtPoint(
  point: DesktopPoint,
  displays: Array<{ bounds: DesktopRectangle }>,
): DesktopRectangle | undefined {
  for (const display of displays) {
    if (pointInRectangle(point, display.bounds))
      return display.bounds
  }
  return undefined
}

function pointInRectangle(point: DesktopPoint, rect: DesktopRectangle): boolean {
  return point.x >= rect.x
    && point.y >= rect.y
    && point.x < rect.x + rect.width
    && point.y < rect.y + rect.height
}

function assertRectangle(rect: DesktopRectangle, field: string) {
  if (!rect || typeof rect !== 'object')
    throw new TypeError(`${field} must be a rectangle`)
  for (const key of ['x', 'y', 'width', 'height'] as const) {
    if (typeof rect[key] !== 'number' || !Number.isFinite(rect[key]))
      throw new TypeError(`${field}.${key} must be a finite number`)
  }
  if (rect.width <= 0 || rect.height <= 0)
    throw new TypeError(`${field}.width and ${field}.height must be positive`)
}
