import { describe, expect, it } from 'vitest'

import { clampPointToBounds, findDisplayBoundsAtPoint, mapFramePointToGlobal } from './coordinates'

describe('mapFramePointToGlobal', () => {
  it('maps frame coordinates onto source bounds', () => {
    const point = mapFramePointToGlobal({
      frameX: 100,
      frameY: 50,
      frameWidth: 1280,
      frameHeight: 720,
      sourceBounds: { x: 0, y: 0, width: 1920, height: 1080 },
    })

    expect(point).toEqual({ x: 150, y: 75 })
  })

  it('respects non-origin display bounds', () => {
    const point = mapFramePointToGlobal({
      frameX: 640,
      frameY: 360,
      frameWidth: 1280,
      frameHeight: 720,
      sourceBounds: { x: 1920, y: 0, width: 1920, height: 1080 },
    })

    expect(point).toEqual({ x: 2880, y: 540 })
  })

  it('rejects non-positive frame size', () => {
    expect(() => mapFramePointToGlobal({
      frameX: 0,
      frameY: 0,
      frameWidth: 0,
      frameHeight: 720,
      sourceBounds: { x: 0, y: 0, width: 100, height: 100 },
    })).toThrow(/frameWidth/)
  })
})

describe('clampPointToBounds', () => {
  it('clamps into display bounds', () => {
    expect(clampPointToBounds({ x: -10, y: 5000 }, { x: 0, y: 0, width: 1920, height: 1080 }))
      .toEqual({ x: 0, y: 1079 })
  })
})

describe('findDisplayBoundsAtPoint', () => {
  it('returns containing display bounds', () => {
    const displays = [
      { bounds: { x: 0, y: 0, width: 1920, height: 1080 } },
      { bounds: { x: 1920, y: 0, width: 1920, height: 1080 } },
    ]
    expect(findDisplayBoundsAtPoint({ x: 2000, y: 10 }, displays)).toEqual(displays[1]!.bounds)
    expect(findDisplayBoundsAtPoint({ x: -1, y: 0 }, displays)).toBeUndefined()
  })
})
