import type { StageModelRenderer } from '@proj-airi/stage-ui/stores/settings'

export type StageComponentState = 'pending' | 'loading' | 'mounted'

export function shouldHitTestStageTransparency(params: {
  componentState: StageComponentState
  stageModelRenderer: StageModelRenderer
  stagePaused: boolean
}) {
  return !params.stagePaused
    && params.componentState === 'mounted'
    && (params.stageModelRenderer === 'live2d' || params.stageModelRenderer === 'vrm')
}

export function shouldSampleStageTransparency(params: {
  componentState: StageComponentState
  fadeOnHoverEnabled: boolean
  stageModelRenderer: StageModelRenderer
  stagePaused: boolean
}) {
  return params.fadeOnHoverEnabled
    && shouldHitTestStageTransparency(params)
}
