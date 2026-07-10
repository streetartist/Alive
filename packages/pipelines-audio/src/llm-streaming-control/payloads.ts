const emotionValues = [
  'happy',
  'sad',
  'angry',
  'think',
  'surprised',
  'awkward',
  'question',
  'curious',
  'neutral',
] as const

export type StreamingControlEmotion = typeof emotionValues[number]

export interface StreamingControlEmotionPayload {
  name: StreamingControlEmotion
  intensity: number
}

/**
 * Speech-timed Live2D/VRM expression preset control.
 *
 * Expression is a named on/off preset (exp3 group name), not a free numeric axis.
 * Target parameter values live in the model file; the model only picks the name.
 */
export type NormalizedActExpression
  = | { op: 'set', name: string, duration?: number }
    | { op: 'clear', name: string }
    | { op: 'reset' }

export interface NormalizedActPayload {
  /** Emotion request emitted by the model, when present and supported. */
  emotion?: StreamingControlEmotionPayload
  /** Motion cue emitted by the model, when present. */
  motion?: string
  /** Expression preset request emitted by the model, when present. */
  expression?: NormalizedActExpression
}

function normalizeEmotionName(value: string): StreamingControlEmotion | undefined {
  const normalized = value.trim().toLowerCase()
  if (emotionValues.includes(normalized as StreamingControlEmotion)) {
    return normalized as StreamingControlEmotion
  }

  return undefined
}

function normalizeIntensity(value: unknown): number {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return 1
  }

  return Math.min(1, Math.max(0, value))
}

function normalizeEmotion(value: unknown): StreamingControlEmotionPayload | undefined {
  if (typeof value === 'string') {
    const name = normalizeEmotionName(value)
    return name ? { name, intensity: 1 } : undefined
  }

  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined
  }

  if (!('name' in value) || typeof value.name !== 'string') {
    return undefined
  }

  const name = normalizeEmotionName(value.name)
  if (!name) {
    return undefined
  }

  return {
    name,
    intensity: normalizeIntensity('intensity' in value ? value.intensity : undefined),
  }
}

function normalizeMotion(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined
  }

  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

function normalizeDuration(value: unknown): number | undefined {
  if (typeof value !== 'number' || Number.isNaN(value) || value <= 0) {
    return undefined
  }

  return value
}

/**
 * Normalizes ACT expression field.
 *
 * Before:
 * - "脸红"
 * - { name: "脸红", duration: 3 }
 * - "reset"
 *
 * After:
 * - { op: "set", name: "脸红" }
 * - { op: "set", name: "脸红", duration: 3 }
 * - { op: "reset" }
 */
function normalizeExpression(value: unknown): NormalizedActExpression | undefined {
  if (value === null || value === undefined) {
    return undefined
  }

  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (!trimmed)
      return undefined

    const lower = trimmed.toLowerCase()
    if (lower === 'reset' || lower === 'clear' || lower === 'none')
      return { op: 'reset' }

    return { op: 'set', name: trimmed }
  }

  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined
  }

  const record = value as Record<string, unknown>

  if (record.reset === true || record.op === 'reset')
    return { op: 'reset' }

  if (typeof record.name !== 'string')
    return undefined

  const name = record.name.trim()
  if (!name)
    return undefined

  // Explicit off for one preset: value 0/false or op clear.
  if (record.op === 'clear' || record.value === 0 || record.value === false)
    return { op: 'clear', name }

  const duration = normalizeDuration(record.duration)
    ?? normalizeDuration(record.durationSeconds)

  if (duration !== undefined)
    return { op: 'set', name, duration }

  return { op: 'set', name }
}

/**
 * Normalizes ACT token payloads.
 *
 * Before:
 * - `{ emotion: "Surprised", motion: " nod ", expression: "脸红" }`
 *
 * After:
 * - `{ emotion: { name: "surprised", intensity: 1 }, motion: "nod", expression: { op: "set", name: "脸红" } }`
 */
export function normalizeActPayload(payload: Record<string, unknown>): NormalizedActPayload {
  const normalized: NormalizedActPayload = {}
  const emotion = normalizeEmotion(payload.emotion)
  const motion = normalizeMotion(payload.motion)
  const expression = normalizeExpression(payload.expression)

  if (emotion) {
    normalized.emotion = emotion
  }
  if (motion) {
    normalized.motion = motion
  }
  if (expression) {
    normalized.expression = expression
  }

  return normalized
}
