/** Non-verbal desktop-life behaviors that can be presented without creating a chat turn. */
export type CompanionLifeBehaviorKind
  = | 'morning-greeting'
    | 'idle-curious'
    | 'idle-creative'
    | 'resting'

/** Persisted scheduler metadata isolated per owner-and-character companion scope. */
export interface CompanionLifeBehaviorState {
  lastBehaviorAt?: number
  lastMorningGreetingDate?: string
}

/** Thresholds for restrained, non-interrupting desktop-life behavior. */
export interface CompanionLifePolicy {
  /** User inactivity required before an idle behavior. @default 30 minutes */
  idleAfterMs: number
  /** User inactivity required before the companion settles into rest. @default 120 minutes */
  restAfterMs: number
  /** Minimum time between autonomous behaviors. @default 30 minutes */
  behaviorCooldownMs: number
  /** Inclusive local hour when a morning greeting may begin. @default 7 */
  morningStartsAtHour: number
  /** Exclusive local hour when the morning greeting window ends. @default 11 */
  morningEndsAtHour: number
}

/** Inputs used to decide whether one desktop-life behavior may run now. */
export interface CompanionLifeInput {
  now: number
  lastActiveAt: number
  enabled: boolean
  morningGreetingEnabled: boolean
  busy: boolean
  visible: boolean
  personality: {
    curiosity: number
    creativity: number
  }
  previous: CompanionLifeBehaviorState
  policy?: Partial<CompanionLifePolicy>
}

/** One behavior decision plus the scheduler metadata that must be persisted after presentation. */
export interface CompanionLifeDecision {
  kind: CompanionLifeBehaviorKind
  occurredAt: number
  nextState: CompanionLifeBehaviorState
}

/** Durable, presentation-safe context allowed to personalize desktop-life copy. */
export interface CompanionLifeMessageContext {
  /** Interests explicitly maintained in the companion identity profile. */
  interests: readonly string[]
  /** Fallible observations from the latest durable reflection. */
  learned: readonly string[]
}

/** One bounded personalization cue whose provenance remains visible to presentation code. */
export type CompanionLifeMessageCue
  = | { type: 'interest', value: string }
    | { type: 'tentative-observation', value: string }

/** Default policy keeps autonomous behavior infrequent and easy to interrupt. */
export const defaultCompanionLifePolicy: CompanionLifePolicy = {
  idleAfterMs: 30 * 60 * 1000,
  restAfterMs: 120 * 60 * 1000,
  behaviorCooldownMs: 30 * 60 * 1000,
  morningStartsAtHour: 7,
  morningEndsAtHour: 11,
}

function normalizedPolicy(policy: Partial<CompanionLifePolicy> | undefined): CompanionLifePolicy {
  const idleAfterMs = Math.max(60_000, policy?.idleAfterMs ?? defaultCompanionLifePolicy.idleAfterMs)
  return {
    idleAfterMs,
    restAfterMs: Math.max(idleAfterMs, policy?.restAfterMs ?? defaultCompanionLifePolicy.restAfterMs),
    behaviorCooldownMs: Math.max(60_000, policy?.behaviorCooldownMs ?? defaultCompanionLifePolicy.behaviorCooldownMs),
    morningStartsAtHour: Math.min(23, Math.max(0, Math.floor(policy?.morningStartsAtHour ?? defaultCompanionLifePolicy.morningStartsAtHour))),
    morningEndsAtHour: Math.min(24, Math.max(1, Math.floor(policy?.morningEndsAtHour ?? defaultCompanionLifePolicy.morningEndsAtHour))),
  }
}

function localDateKey(timestamp: number) {
  const date = new Date(timestamp)
  return [date.getFullYear(), date.getMonth() + 1, date.getDate()]
    .map(value => value.toString().padStart(2, '0'))
    .join('-')
}

function normalizedCueValue(value: string) {
  return Array.from(value.replace(/\s+/g, ' ').trim()).slice(0, 120).join('')
}

/**
 * Selects one deterministic, locally dated personalization cue.
 *
 * Only explicit profile interests and tentative reflection observations are
 * eligible. Resting stays generic so extended inactivity is never framed as
 * evidence about the user.
 */
export function resolveCompanionLifeMessageCue(
  kind: CompanionLifeBehaviorKind,
  context: CompanionLifeMessageContext,
  now: number,
): CompanionLifeMessageCue | undefined {
  if (kind === 'resting')
    return undefined

  const cues: CompanionLifeMessageCue[] = [
    ...context.interests.map(value => ({ type: 'interest' as const, value: normalizedCueValue(value) })),
    ...context.learned.map(value => ({ type: 'tentative-observation' as const, value: normalizedCueValue(value) })),
  ].filter(cue => cue.value.length > 0)

  if (!cues.length)
    return undefined

  const date = new Date(now)
  const localDayNumber = Math.floor(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86_400_000)
  return cues[localDayNumber % cues.length]
}

function idleBehavior(input: CompanionLifeInput, policy: CompanionLifePolicy): CompanionLifeBehaviorKind | undefined {
  const idleForMs = Math.max(0, input.now - input.lastActiveAt)
  if (idleForMs >= policy.restAfterMs)
    return 'resting'
  if (idleForMs < policy.idleAfterMs)
    return undefined

  if (input.personality.creativity > input.personality.curiosity)
    return 'idle-creative'
  if (input.personality.curiosity > input.personality.creativity)
    return 'idle-curious'

  // Equal traits alternate by cooldown window so a neutral companion does not
  // repeat the same idle performance indefinitely.
  return Math.floor(input.now / policy.behaviorCooldownMs) % 2 === 0
    ? 'idle-curious'
    : 'idle-creative'
}

/**
 * Resolves one autonomous desktop-life behavior.
 *
 * Busy, hidden, or disabled surfaces never emit a decision. Morning greetings
 * are limited to once per local day, while idle behaviors share one cooldown.
 */
export function resolveCompanionLifeBehavior(input: CompanionLifeInput): CompanionLifeDecision | undefined {
  if (!input.enabled || input.busy || !input.visible)
    return undefined

  const policy = normalizedPolicy(input.policy)
  const currentDate = localDateKey(input.now)
  const hour = new Date(input.now).getHours()
  const idleForMs = Math.max(0, input.now - input.lastActiveAt)
  const inMorningWindow = hour >= policy.morningStartsAtHour && hour < policy.morningEndsAtHour

  if (
    input.morningGreetingEnabled
    && inMorningWindow
    && idleForMs < policy.idleAfterMs
    && input.previous.lastMorningGreetingDate !== currentDate
  ) {
    return {
      kind: 'morning-greeting',
      occurredAt: input.now,
      nextState: {
        ...input.previous,
        lastBehaviorAt: input.now,
        lastMorningGreetingDate: currentDate,
      },
    }
  }

  const lastBehaviorAt = input.previous.lastBehaviorAt ?? 0
  if (input.now - lastBehaviorAt < policy.behaviorCooldownMs)
    return undefined

  const kind = idleBehavior(input, policy)
  if (!kind)
    return undefined

  return {
    kind,
    occurredAt: input.now,
    nextState: {
      ...input.previous,
      lastBehaviorAt: input.now,
    },
  }
}
