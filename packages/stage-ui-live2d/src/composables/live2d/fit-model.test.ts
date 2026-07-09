import { describe, expect, it } from 'vitest'
import { ref } from 'vue'

import { useFitModel } from './fit-model'

describe('useFitModel', () => {
  it('keeps model scale tied to the supplied scale canvas while layout canvas resizes', () => {
    const layoutCanvas = ref({ width: 1200, height: 800 })
    const scaleCanvas = ref({ width: 1200, height: 800 })
    const model = ref({ width: 400, height: 1000 })
    const normalized = useFitModel(layoutCanvas, model, scaleCanvas)

    expect(normalized.value.scale).toBe(1.6)
    expect(normalized.value.x).toBe(600)
    expect(normalized.value.y).toBe(800)

    // ROOT CAUSE:
    //
    // The desktop stage window can be resized by dragging its border. If the
    // fitting scale uses the live window size, that resize also changes the
    // rendered Live2D model size.
    //
    // Before the fix, increasing the layout canvas to 1600x1000 changed scale
    // from 1.6 to 2.0 because the same canvas drove both placement and scale.
    //
    // We fixed this by allowing callers to keep scale tied to the model-load
    // canvas while placement still follows the current layout canvas.
    layoutCanvas.value = { width: 1600, height: 1000 }

    expect(normalized.value.scale).toBe(1.6)
    expect(normalized.value.x).toBe(800)
    expect(normalized.value.y).toBe(1000)
  })
})
