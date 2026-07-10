import { describe, expect, it } from 'vitest'

import { normalizeActPayload } from './payloads'

describe('normalizeActPayload', () => {
  /**
   * @example
   * normalizeActPayload({ emotion: { name: 'happy', intensity: 0.8 }, motion: 'nod' })
   * // -> { emotion: { name: 'happy', intensity: 0.8 }, motion: 'nod' }
   */
  it('normalizes object emotion and motion from ACT payloads', () => {
    expect(normalizeActPayload({
      emotion: { name: 'happy', intensity: 0.8 },
      motion: 'nod',
    })).toEqual({
      emotion: { name: 'happy', intensity: 0.8 },
      motion: 'nod',
    })
  })

  /**
   * @example
   * normalizeActPayload({ emotion: 'surprised', motion: ' lean forward ' })
   * // -> { emotion: { name: 'surprised', intensity: 1 }, motion: 'lean forward' }
   */
  it('normalizes string emotion and trims motion cues', () => {
    expect(normalizeActPayload({
      emotion: 'surprised',
      motion: ' lean forward ',
    })).toEqual({
      emotion: { name: 'surprised', intensity: 1 },
      motion: 'lean forward',
    })
  })

  /**
   * @example
   * normalizeActPayload({ emotion: { name: 'happy', intensity: 2 } })
   * // -> { emotion: { name: 'happy', intensity: 1 } }
   */
  it('clamps emotion intensity into the supported range', () => {
    expect(normalizeActPayload({
      emotion: { name: 'happy', intensity: 2 },
    })).toEqual({
      emotion: { name: 'happy', intensity: 1 },
    })
  })

  it('normalizes string expression presets without inventing a value axis', () => {
    expect(normalizeActPayload({
      emotion: 'happy',
      expression: '脸红',
    })).toEqual({
      emotion: { name: 'happy', intensity: 1 },
      expression: { op: 'set', name: '脸红' },
    })
  })

  it('normalizes expression object with optional auto-clear duration', () => {
    expect(normalizeActPayload({
      expression: { name: '星星眼', duration: 3 },
    })).toEqual({
      expression: { op: 'set', name: '星星眼', duration: 3 },
    })
  })

  it('normalizes expression reset and single clear', () => {
    expect(normalizeActPayload({ expression: 'reset' })).toEqual({
      expression: { op: 'reset' },
    })
    expect(normalizeActPayload({ expression: { name: '脸红', value: 0 } })).toEqual({
      expression: { op: 'clear', name: '脸红' },
    })
  })
})
