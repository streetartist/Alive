import { describe, expect, it } from 'vitest'

import {
  applyCompanionMoodEvent,
  companionMoodLabel,
  createCompanionMoodState,
  resolveCompanionMood,
} from './emotion'

const policy = {
  valenceHalfLifeMs: 100,
  arousalHalfLifeMs: 100,
  baselineArousal: 0.25,
}

describe('companion mood', () => {
  it('starts neutral at the resting arousal baseline', () => {
    const mood = createCompanionMoodState(10)

    expect(mood).toEqual({ valence: 0, arousal: 0.25, updatedAt: 10 })
    expect(companionMoodLabel(mood)).toBe('neutral')
  })

  it('decays each dimension halfway after one configured half-life', () => {
    const resolved = resolveCompanionMood({ valence: 0.8, arousal: 0.75, updatedAt: 0 }, 100, policy)

    expect(resolved.valence).toBeCloseTo(0.4)
    expect(resolved.arousal).toBeCloseTo(0.5)
  })

  it('does not amplify mood when the clock moves backwards', () => {
    const mood = { valence: 0.4, arousal: 0.6, updatedAt: 100 }

    expect(resolveCompanionMood(mood, 50, policy)).toMatchObject(mood)
  })

  it('applies events after decay and clamps repeated feedback', () => {
    const initial = { valence: 0.4, arousal: 0.65, updatedAt: 0 }
    const interacted = applyCompanionMoodEvent(initial, { type: 'interaction-completed', occurredAt: 100 }, policy)

    expect(interacted.valence).toBeCloseTo(0.22)
    expect(interacted.arousal).toBeCloseTo(0.53)

    let next = interacted
    for (let index = 0; index < 10; index += 1) {
      next = applyCompanionMoodEvent(next, {
        type: 'feedback-received',
        sentiment: 'negative',
        occurredAt: 100,
      }, policy)
    }
    expect(next.valence).toBe(-1)
    expect(next.arousal).toBe(1)
    expect(companionMoodLabel(next)).toBe('tense')
  })

  it('derives calm, curious, happy, sad, and tense labels', () => {
    expect(companionMoodLabel({ valence: 0, arousal: 0.1 })).toBe('calm')
    expect(companionMoodLabel({ valence: 0.1, arousal: 0.7 })).toBe('curious')
    expect(companionMoodLabel({ valence: 0.5, arousal: 0.4 })).toBe('happy')
    expect(companionMoodLabel({ valence: -0.5, arousal: 0.3 })).toBe('sad')
    expect(companionMoodLabel({ valence: -0.5, arousal: 0.8 })).toBe('tense')
  })
})
