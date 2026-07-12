/** Persistent affect dimensions owned by one companion relationship. */
export interface CompanionMoodState {
  /** Pleasantness from -1 (negative) to 1 (positive). */
  valence: number
  /** Activation from 0 (settled) to 1 (energized). */
  arousal: number
  /** Unix epoch timestamp anchoring lazy mood decay. */
  updatedAt: number
}

/** Human-facing mood labels derived from affect dimensions. */
export type CompanionMoodLabel = 'calm' | 'neutral' | 'curious' | 'happy' | 'sad' | 'tense'

/** Read-only projection of mood at a specific time. */
export interface CompanionMoodSnapshot extends CompanionMoodState {
  label: CompanionMoodLabel
  resolvedAt: number
}

/** Durable events allowed to change relationship mood. */
export type CompanionMoodEvent
  = | { type: 'interaction-completed', occurredAt: number }
    | { type: 'important-memory-marked', occurredAt: number }
    | { type: 'feedback-received', occurredAt: number, sentiment: 'positive' | 'negative' }

/** Decay policy for persistent affect dimensions. */
export interface CompanionMoodPolicy {
  valenceHalfLifeMs: number
  arousalHalfLifeMs: number
  baselineArousal: number
}

export const defaultCompanionMoodPolicy: CompanionMoodPolicy = {
  valenceHalfLifeMs: 6 * 60 * 60 * 1000,
  arousalHalfLifeMs: 90 * 60 * 1000,
  baselineArousal: 0.25,
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value))
}

function decayToward(value: number, baseline: number, elapsedMs: number, halfLifeMs: number) {
  if (elapsedMs <= 0)
    return value
  const retention = 2 ** (-elapsedMs / Math.max(1, halfLifeMs))
  return baseline + (value - baseline) * retention
}

/** Creates neutral persistent mood without scheduling background timers. */
export function createCompanionMoodState(now = Date.now()): CompanionMoodState {
  return {
    valence: 0,
    arousal: defaultCompanionMoodPolicy.baselineArousal,
    updatedAt: now,
  }
}

/** Derives a stable presentation label from resolved affect dimensions. */
export function companionMoodLabel(mood: Pick<CompanionMoodState, 'valence' | 'arousal'>): CompanionMoodLabel {
  if (mood.valence >= 0.35)
    return 'happy'
  if (mood.valence <= -0.35)
    return mood.arousal >= 0.55 ? 'tense' : 'sad'
  if (mood.arousal >= 0.55 && mood.valence >= -0.1)
    return 'curious'
  if (mood.arousal <= 0.15)
    return 'calm'
  return 'neutral'
}

/** Resolves lazy exponential decay without mutating or persisting the source state. */
export function resolveCompanionMood(
  mood: CompanionMoodState,
  now = Date.now(),
  policy: CompanionMoodPolicy = defaultCompanionMoodPolicy,
): CompanionMoodSnapshot {
  const resolvedAt = Math.max(mood.updatedAt, now)
  const elapsedMs = Math.max(0, now - mood.updatedAt)
  const resolved = {
    valence: clamp(decayToward(mood.valence, 0, elapsedMs, policy.valenceHalfLifeMs), -1, 1),
    arousal: clamp(decayToward(mood.arousal, policy.baselineArousal, elapsedMs, policy.arousalHalfLifeMs), 0, 1),
    updatedAt: resolvedAt,
  }
  return {
    ...resolved,
    label: companionMoodLabel(resolved),
    resolvedAt,
  }
}

/** Applies one explicit durable event after first resolving elapsed-time decay. */
export function applyCompanionMoodEvent(
  mood: CompanionMoodState,
  event: CompanionMoodEvent,
  policy: CompanionMoodPolicy = defaultCompanionMoodPolicy,
): CompanionMoodState {
  const current = resolveCompanionMood(mood, event.occurredAt, policy)
  let delta: { valence: number, arousal: number }
  if (event.type === 'interaction-completed')
    delta = { valence: 0.02, arousal: 0.08 }
  else if (event.type === 'important-memory-marked')
    delta = { valence: 0.08, arousal: 0.04 }
  else if (event.sentiment === 'positive')
    delta = { valence: 0.2, arousal: 0.1 }
  else
    delta = { valence: -0.2, arousal: 0.15 }

  return {
    valence: clamp(current.valence + delta.valence, -1, 1),
    arousal: clamp(current.arousal + delta.arousal, 0, 1),
    updatedAt: current.resolvedAt,
  }
}
