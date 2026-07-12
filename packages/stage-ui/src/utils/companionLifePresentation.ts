import type { CompanionLifeBehaviorKind, CompanionMoodSnapshot } from '@proj-airi/companion-core'

import type { EmotionPayload } from '../constants/emotions'

import { Emotion } from '../constants/emotions'

const behaviorEmotion: Record<CompanionLifeBehaviorKind, EmotionPayload> = {
  'morning-greeting': { name: Emotion.Happy, intensity: 0.65 },
  'idle-curious': { name: Emotion.Curious, intensity: 0.55 },
  'idle-creative': { name: Emotion.Think, intensity: 0.5 },
  'resting': { name: Emotion.Neutral, intensity: 0.3 },
}

function clampIntensity(value: number, minimum = 0.2, maximum = 0.8) {
  return Math.min(maximum, Math.max(minimum, value))
}

/**
 * Resolves a restrained stage expression for one autonomous life behavior.
 *
 * Positive and curious moods may make the existing behavior more expressive,
 * while calm moods soften it. Low or tense mood deliberately maps to a quiet
 * thinking/neutral presentation instead of sadness or anger, so explicit user
 * feedback cannot become emotional pressure on the user.
 */
export function resolveCompanionLifeEmotion(
  kind: CompanionLifeBehaviorKind,
  mood: Pick<CompanionMoodSnapshot, 'label' | 'arousal'>,
): EmotionPayload {
  if (kind === 'resting') {
    return {
      name: Emotion.Neutral,
      intensity: clampIntensity(0.3 + (mood.arousal - 0.25) * 0.1, 0.2, 0.4),
    }
  }

  if (mood.label === 'sad' || mood.label === 'tense') {
    return {
      name: Emotion.Think,
      intensity: clampIntensity(
        (mood.label === 'tense' ? 0.35 : 0.3) + mood.arousal * 0.1,
        0.25,
        0.45,
      ),
    }
  }

  const baseline = behaviorEmotion[kind]
  let emotion = baseline.name
  let moodAdjustment = 0
  if (mood.label === 'happy') {
    emotion = Emotion.Happy
    moodAdjustment = 0.12
  }
  else if (mood.label === 'curious') {
    emotion = Emotion.Curious
    moodAdjustment = 0.1
  }
  else if (mood.label === 'calm') {
    emotion = Emotion.Neutral
    moodAdjustment = -0.12
  }

  // Live2D does not consume intensity, so the mood selects among existing safe
  // motion names while arousal nudges strength for renderers that support it.
  const arousalAdjustment = (mood.arousal - 0.25) * 0.15
  return {
    name: emotion,
    intensity: clampIntensity(baseline.intensity + moodAdjustment + arousalAdjustment),
  }
}
