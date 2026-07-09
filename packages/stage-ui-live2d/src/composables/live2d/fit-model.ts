import type { MaybeRefOrGetter } from 'vue'

import { isStageWeb } from '@proj-airi/stage-shared'
import { breakpointsTailwind, useBreakpoints } from '@vueuse/core'
import { computed, toValue } from 'vue'

const breakpoints = useBreakpoints(breakpointsTailwind)
const startingOffsetY = computed(() => {
  if (isStageWeb()) // showing upper half of the body in landscape, 3/4 in portrait, in web targets
    return breakpoints.smallerOrEqual('md').value ? 0.75 : 1
  return 1 // upper half
})

/**
 * Normalizes the model so that user `scale == 1` means twice the fitting
 * viewport height, while placement remains centered in the current canvas.
 *
 * Pass a stable `scaleCanvasDim` when layout can resize without implying a
 * model-size change, such as the transparent desktop stage window being
 * resized by dragging its border.
 */
export function useFitModel(
  canvasDim: MaybeRefOrGetter<{ width: number, height: number }>,
  modelDim: MaybeRefOrGetter<{ width: number, height: number }>,
  scaleCanvasDim: MaybeRefOrGetter<{ width: number, height: number }> = canvasDim,
) {
  const normalizedParam = computed(() => {
    const canvas = toValue(canvasDim)
    const scaleCanvas = toValue(scaleCanvasDim)
    const model = toValue(modelDim)

    const heightScale = (scaleCanvas.height / model.height * 2)
    const widthScale = (scaleCanvas.width / model.width * 2)
    let minScale = Math.min(heightScale, widthScale)

    if (Number.isNaN(minScale) || minScale <= 0) {
      minScale = 1e-6
    }
    return {
      scale: minScale,
      x: canvas.width / 2,
      y: canvas.height * startingOffsetY.value,
    }
  })

  return normalizedParam
}
