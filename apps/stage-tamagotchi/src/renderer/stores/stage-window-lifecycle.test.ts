import { describe, expect, it } from 'vitest'

import { shouldHitTestStageTransparency, shouldSampleStageTransparency } from '../utils/stage-three-transparency'
import { createDefaultWindowLifecycleState, shouldPauseStageFromLifecycle } from './stage-window-lifecycle'

describe('stage window lifecycle helpers', () => {
  it('pauses only for hidden or minimized window lifecycle states', () => {
    expect(shouldPauseStageFromLifecycle({
      ...createDefaultWindowLifecycleState(),
      reason: 'show',
      visible: true,
    })).toBe(false)

    expect(shouldPauseStageFromLifecycle({
      ...createDefaultWindowLifecycleState(),
      reason: 'restore',
      visible: true,
    })).toBe(false)

    expect(shouldPauseStageFromLifecycle({
      ...createDefaultWindowLifecycleState(),
      reason: 'hide',
      visible: false,
    })).toBe(false)

    expect(shouldPauseStageFromLifecycle({
      ...createDefaultWindowLifecycleState(),
      minimized: true,
      reason: 'minimize',
    })).toBe(true)
  })

  it('hit-tests transparency for mounted transparent stage renderers even when fade-on-hover is off', () => {
    expect(shouldHitTestStageTransparency({
      componentState: 'mounted',
      stageModelRenderer: 'live2d',
      stagePaused: false,
    })).toBe(true)

    expect(shouldHitTestStageTransparency({
      componentState: 'mounted',
      stageModelRenderer: 'vrm',
      stagePaused: false,
    })).toBe(true)

    expect(shouldHitTestStageTransparency({
      componentState: 'mounted',
      stageModelRenderer: 'spine',
      stagePaused: false,
    })).toBe(false)

    expect(shouldHitTestStageTransparency({
      componentState: 'loading',
      stageModelRenderer: 'live2d',
      stagePaused: false,
    })).toBe(false)

    expect(shouldHitTestStageTransparency({
      componentState: 'mounted',
      stageModelRenderer: 'live2d',
      stagePaused: true,
    })).toBe(false)
  })

  it('samples stage transparency for hover fade only while fade-on-hover is active', () => {
    expect(shouldSampleStageTransparency({
      componentState: 'mounted',
      fadeOnHoverEnabled: true,
      stageModelRenderer: 'vrm',
      stagePaused: false,
    })).toBe(true)

    expect(shouldSampleStageTransparency({
      componentState: 'loading',
      fadeOnHoverEnabled: true,
      stageModelRenderer: 'vrm',
      stagePaused: false,
    })).toBe(false)

    expect(shouldSampleStageTransparency({
      componentState: 'mounted',
      fadeOnHoverEnabled: false,
      stageModelRenderer: 'vrm',
      stagePaused: false,
    })).toBe(false)

    expect(shouldSampleStageTransparency({
      componentState: 'mounted',
      fadeOnHoverEnabled: true,
      stageModelRenderer: 'live2d',
      stagePaused: false,
    })).toBe(true)

    expect(shouldSampleStageTransparency({
      componentState: 'mounted',
      fadeOnHoverEnabled: true,
      stageModelRenderer: 'vrm',
      stagePaused: true,
    })).toBe(false)
  })
})
