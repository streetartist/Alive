import type { CompanionLifeBehaviorKind, CompanionMoodLabel } from '@proj-airi/companion-core'

import { describe, expect, it } from 'vitest'

import { Emotion } from '../constants/emotions'
import { resolveCompanionLifeEmotion } from './companionLifePresentation'

function presentation(
  kind: CompanionLifeBehaviorKind,
  label: CompanionMoodLabel,
  arousal = 0.25,
) {
  return resolveCompanionLifeEmotion(kind, { label, arousal })
}

describe('companion life stage presentation', () => {
  it('preserves the behavior-owned expression for a neutral mood', () => {
    expect(presentation('morning-greeting', 'neutral')).toEqual({
      name: Emotion.Happy,
      intensity: 0.65,
    })
    expect(presentation('idle-curious', 'neutral')).toEqual({
      name: Emotion.Curious,
      intensity: 0.55,
    })
    expect(presentation('idle-creative', 'neutral')).toEqual({
      name: Emotion.Think,
      intensity: 0.5,
    })
    expect(presentation('resting', 'neutral')).toEqual({
      name: Emotion.Neutral,
      intensity: 0.3,
    })
  })

  it('makes happy and curious moods more expressive while calm softens them', () => {
    const neutral = presentation('idle-curious', 'neutral').intensity
    const happy = presentation('idle-creative', 'happy')
    const curious = presentation('idle-creative', 'curious')
    const calm = presentation('idle-creative', 'calm')

    expect(happy.name).toBe(Emotion.Happy)
    expect(happy.intensity).toBeGreaterThan(neutral)
    expect(curious.name).toBe(Emotion.Curious)
    expect(curious.intensity).toBeGreaterThan(neutral)
    expect(calm.name).toBe(Emotion.Neutral)
    expect(calm.intensity).toBeLessThan(neutral)
  })

  it('keeps low and tense mood quiet instead of presenting sadness or anger', () => {
    const kinds: CompanionLifeBehaviorKind[] = [
      'morning-greeting',
      'idle-curious',
      'idle-creative',
      'resting',
    ]

    for (const kind of kinds) {
      const sad = presentation(kind, 'sad', 0.4)
      const tense = presentation(kind, 'tense', 0.8)

      expect(sad.name).not.toBe(Emotion.Sad)
      expect(sad.name).not.toBe(Emotion.Angry)
      expect(sad.intensity).toBeLessThanOrEqual(0.45)
      expect(tense.name).not.toBe(Emotion.Sad)
      expect(tense.name).not.toBe(Emotion.Angry)
      expect(tense.intensity).toBeLessThanOrEqual(0.45)
    }
  })

  it('keeps resting neutral for every mood', () => {
    const labels: CompanionMoodLabel[] = ['calm', 'neutral', 'curious', 'happy', 'sad', 'tense']

    for (const label of labels) {
      const result = presentation('resting', label)
      expect(result.name).toBe(Emotion.Neutral)
      expect(result.intensity).toBeLessThanOrEqual(0.4)
    }
  })
})
