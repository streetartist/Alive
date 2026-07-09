import { describe, expect, it } from 'vitest'

import {
  createFullStageWindowCrop,
  normalizeStageWindowCrop,
  normalizeStageWindowLayoutSize,
  resolveLive2DStageWindowBounds,
  resolveLive2DStageWindowCrop,
  stageWindowBoundsEqual,
} from './live2d-stage-window-layout'

describe('live2d stage window layout helpers', () => {
  it('crops away transparent top space around a downscaled Live2D model', () => {
    const crop = resolveLive2DStageWindowCrop({
      layoutSize: { width: 450, height: 600 },
      modelBounds: {
        left: 120,
        top: 300,
        right: 330,
        bottom: 600,
        width: 210,
        height: 300,
        centerX: 225,
        centerY: 600,
        stageWidth: 450,
        stageHeight: 600,
        scale: 0.5,
      },
    })

    expect(crop.left).toBe(96)
    expect(crop.top).toBe(276)
    expect(crop.width).toBe(258)
    expect(crop.height).toBe(324)
  })

  it('keeps the full crop when the model fills the virtual stage', () => {
    const crop = resolveLive2DStageWindowCrop({
      layoutSize: { width: 450, height: 600 },
      modelBounds: {
        left: 0,
        top: 0,
        right: 450,
        bottom: 600,
        width: 450,
        height: 600,
        centerX: 225,
        centerY: 600,
        stageWidth: 450,
        stageHeight: 600,
        scale: 1,
      },
    })

    expect(crop).toEqual(createFullStageWindowCrop({ width: 450, height: 600 }))
  })

  it('preserves the virtual stage origin when changing crop rectangles', () => {
    const bounds = resolveLive2DStageWindowBounds({
      currentWindowBounds: { x: 196, y: 376, width: 258, height: 324 },
      currentCrop: { left: 96, top: 276, width: 258, height: 324 },
      nextCrop: { left: 0, top: 0, width: 450, height: 600 },
    })

    expect(bounds).toEqual({ x: 100, y: 100, width: 450, height: 600 })
  })

  it('normalizes persisted layout and crop values inside the virtual stage', () => {
    expect(normalizeStageWindowLayoutSize({ width: Number.NaN, height: 0 })).toEqual({ width: 450, height: 600 })

    expect(normalizeStageWindowCrop(
      { left: -10, top: 20, width: 9999, height: 200 },
      { width: 450, height: 600 },
    )).toEqual({
      left: 0,
      top: 20,
      width: 450,
      height: 200,
    })
  })

  it('compares window bounds with pixel tolerance', () => {
    expect(stageWindowBoundsEqual(
      { x: 100, y: 100, width: 450, height: 600 },
      { x: 101, y: 100, width: 449, height: 601 },
      1,
    )).toBe(true)

    expect(stageWindowBoundsEqual(
      { x: 100, y: 100, width: 450, height: 600 },
      { x: 103, y: 100, width: 450, height: 600 },
      1,
    )).toBe(false)
  })
})
