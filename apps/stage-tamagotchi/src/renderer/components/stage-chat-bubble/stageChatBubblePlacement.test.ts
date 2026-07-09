import { describe, expect, it } from 'vitest'

import {
  resolveStageChatBubbleDragOffset,
  resolveStageChatBubblePlacement,
} from './stageChatBubblePlacement'

describe('stage chat bubble placement', () => {
  it('places the bubble next to the model bounds by default', () => {
    const placement = resolveStageChatBubblePlacement({
      anchorBounds: {
        left: 300,
        top: 100,
        right: 400,
        bottom: 300,
        width: 100,
        height: 200,
        centerX: 350,
        centerY: 200,
        scale: 0.5,
      },
      bubbleHeight: 100,
      bubbleWidth: 200,
      viewportHeight: 800,
      viewportWidth: 1000,
    })

    expect(placement.left).toBe(408)
    expect(placement.top).toBe(124)
    expect(placement.side).toBe('right')
    expect(placement.anchorScale).toBe(0.5)
  })

  it('applies the stored manual offset in current model-scale units', () => {
    const placement = resolveStageChatBubblePlacement({
      anchorBounds: {
        left: 300,
        top: 100,
        right: 400,
        bottom: 300,
        width: 100,
        height: 200,
        centerX: 350,
        centerY: 200,
        scale: 0.5,
      },
      bubbleHeight: 100,
      bubbleWidth: 200,
      manualOffset: { x: 100, y: -20 },
      viewportHeight: 800,
      viewportWidth: 1000,
    })

    expect(placement.left).toBe(458)
    expect(placement.top).toBe(114)
  })

  it('converts drag distance back to model-scale offset units', () => {
    const offset = resolveStageChatBubbleDragOffset({
      anchorScale: 0.5,
      currentClientX: 260,
      currentClientY: 170,
      startClientX: 200,
      startClientY: 200,
      startOffset: { x: 10, y: 20 },
    })

    expect(offset).toEqual({ x: 130, y: -40 })
  })

  it('keeps the bubble inside the viewport', () => {
    const placement = resolveStageChatBubblePlacement({
      anchorBounds: {
        left: 760,
        top: 560,
        right: 820,
        bottom: 760,
        width: 60,
        height: 200,
        centerX: 790,
        centerY: 660,
        scale: 1,
      },
      bubbleHeight: 120,
      bubbleWidth: 280,
      manualOffset: { x: -1000, y: 1000 },
      viewportHeight: 700,
      viewportWidth: 800,
    })

    expect(placement.left).toBe(12)
    expect(placement.top).toBe(568)
  })
})
