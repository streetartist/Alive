import type { MemoryScope } from '@proj-airi/memory'

import type { CompanionMoodState } from './emotion'
import type { CompanionIdentityProfile } from './profile'

import { applyCompanionMoodEvent, createCompanionMoodState, resolveCompanionMood } from './emotion'

export * from './emotion'
export * from './life'
export * from './profile'
export * from './world'

/** Relationship stages exposed to companion behavior and presentation layers. */
export type CompanionGrowthStage = 'seed' | 'child' | 'companion' | 'independent'

/** Numeric personality dimensions that can evolve without replacing the character card. */
export interface CompanionPersonality {
  /** Willingness to explore unfamiliar topics. */
  curiosity: number
  /** Tendency to propose or pursue creative ideas. */
  creativity: number
  /** Tendency to respond with warmth and consideration. */
  kindness: number
  /** Tendency to use playful or humorous expression. */
  humor: number
}

/** One persisted reflection checkpoint derived from completed interactions. */
export interface CompanionReflection {
  id: string
  /** Unix epoch timestamp in milliseconds when reflection completed. */
  createdAt: number
  /** Completed interaction count represented by this checkpoint. */
  interactionCount: number
  /** Short observations produced by a reflection provider, if one was available. */
  learned: string[]
  /** Personality changes applied by this checkpoint. */
  personalityChanges: Partial<CompanionPersonality>
  /** Stable local summary used when no model-backed reflection is configured. */
  summary: string
}

/** Non-interaction sources that make one relationship develop differently. */
export type CompanionGrowthEventInput
  = | { id: string, type: 'interaction-completed', occurredAt: number }
    | { id: string, type: 'important-memory-marked', occurredAt: number }
    | { id: string, type: 'user-feedback', occurredAt: number, sentiment: 'positive' | 'negative' }

/** Auditable result of one accepted growth event. */
export type CompanionGrowthEvent = CompanionGrowthEventInput & {
  growthPointsDelta: number
  relationshipDelta: number
}

/** Durable companion state owned by one user-and-character scope. */
export interface CompanionState {
  schemaVersion: 3
  scope: MemoryScope
  /** Unix epoch timestamp in milliseconds when this relationship began. */
  createdAt: number
  /** Unix epoch timestamp in milliseconds when state last changed. */
  updatedAt: number
  interactionCount: number
  /** Cumulative development score from interactions, important memories, and feedback. */
  growthPoints: number
  importantMemoryCount: number
  positiveFeedbackCount: number
  negativeFeedbackCount: number
  /** Permanent idempotency ledger; recent event presentation may be truncated separately. */
  processedGrowthEventIds: string[]
  recentGrowthEvents: CompanionGrowthEvent[]
  /** Bounded relationship score from 0 to 100. */
  relationshipScore: number
  growthStage: CompanionGrowthStage
  /** Evolving numeric overlay; the character card remains the base personality authority. */
  personality: CompanionPersonality
  /** Persistent affect that decays lazily toward a neutral baseline. */
  mood: CompanionMoodState
  /** Interaction count included in the latest reflection. */
  lastReflectedInteractionCount: number
  reflections: CompanionReflection[]
}

/** Stable character identity used to render companion continuity context. */
export interface CompanionIdentity {
  id: string
  name: string
}

/** Configurable thresholds for deterministic companion development. */
export interface CompanionDevelopmentPolicy {
  /** Growth points required to leave the seed stage. @default 5 */
  childAtGrowthPoints: number
  /** Growth points required to become a companion. @default 30 */
  companionAtGrowthPoints: number
  /** Growth points required to reach the independent stage. @default 100 */
  independentAtGrowthPoints: number
  /** Completed interactions between reflection checkpoints. @default 10 */
  reflectionEveryInteractions: number
  /** Maximum recent reflection checkpoints retained in state. @default 12 */
  maxReflections: number
}

/** Presentation-safe progress through the configured companion growth stages. */
export interface CompanionDevelopmentProgress {
  currentStage: CompanionGrowthStage
  nextStage?: CompanionGrowthStage
  /** Growth score where the current stage began. */
  currentStageStartedAtGrowthPoints: number
  /** Growth score required to enter the next stage. */
  nextStageAtGrowthPoints?: number
  remainingGrowthPoints: number
  /** Progress within the current stage, bounded from 0 to 1. */
  progress: number
}

/** Default policy for gradual, interaction-driven companion development. */
export const defaultCompanionDevelopmentPolicy: CompanionDevelopmentPolicy = {
  childAtGrowthPoints: 5,
  companionAtGrowthPoints: 30,
  independentAtGrowthPoints: 100,
  reflectionEveryInteractions: 10,
  maxReflections: 12,
}

const neutralPersonality: CompanionPersonality = {
  curiosity: 0.5,
  creativity: 0.5,
  kindness: 0.5,
  humor: 0.5,
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value))
}

function normalizeThreshold(value: number, fallback: number) {
  return Number.isFinite(value) ? Math.max(1, Math.floor(value)) : fallback
}

function normalizePolicy(policy: CompanionDevelopmentPolicy): CompanionDevelopmentPolicy {
  const childAtGrowthPoints = normalizeThreshold(policy.childAtGrowthPoints, 5)
  const companionAtGrowthPoints = Math.max(
    childAtGrowthPoints,
    normalizeThreshold(policy.companionAtGrowthPoints, 30),
  )
  const independentAtGrowthPoints = Math.max(
    companionAtGrowthPoints,
    normalizeThreshold(policy.independentAtGrowthPoints, 100),
  )

  return {
    childAtGrowthPoints,
    companionAtGrowthPoints,
    independentAtGrowthPoints,
    reflectionEveryInteractions: normalizeThreshold(policy.reflectionEveryInteractions, 10),
    maxReflections: normalizeThreshold(policy.maxReflections, 12),
  }
}

function growthStageFor(growthPoints: number, policy: CompanionDevelopmentPolicy): CompanionGrowthStage {
  if (growthPoints >= policy.independentAtGrowthPoints)
    return 'independent'
  if (growthPoints >= policy.companionAtGrowthPoints)
    return 'companion'
  if (growthPoints >= policy.childAtGrowthPoints)
    return 'child'
  return 'seed'
}

/**
 * Resolves growth progress without exposing stage thresholds to presentation layers.
 * Independent companions have no next stage and report complete progress.
 */
export function getCompanionDevelopmentProgress(
  growthPoints: number,
  policy: CompanionDevelopmentPolicy = defaultCompanionDevelopmentPolicy,
): CompanionDevelopmentProgress {
  const normalized = normalizePolicy(policy)
  const completedGrowthPoints = Math.max(0, Math.floor(growthPoints))
  const currentStage = growthStageFor(completedGrowthPoints, normalized)

  const boundaries: Record<Exclude<CompanionGrowthStage, 'independent'>, {
    currentStageStartedAtGrowthPoints: number
    nextStage: CompanionGrowthStage
    nextStageAtGrowthPoints: number
  }> = {
    seed: {
      currentStageStartedAtGrowthPoints: 0,
      nextStage: 'child',
      nextStageAtGrowthPoints: normalized.childAtGrowthPoints,
    },
    child: {
      currentStageStartedAtGrowthPoints: normalized.childAtGrowthPoints,
      nextStage: 'companion',
      nextStageAtGrowthPoints: normalized.companionAtGrowthPoints,
    },
    companion: {
      currentStageStartedAtGrowthPoints: normalized.companionAtGrowthPoints,
      nextStage: 'independent',
      nextStageAtGrowthPoints: normalized.independentAtGrowthPoints,
    },
  }

  if (currentStage === 'independent') {
    return {
      currentStage,
      currentStageStartedAtGrowthPoints: normalized.independentAtGrowthPoints,
      remainingGrowthPoints: 0,
      progress: 1,
    }
  }

  const boundary = boundaries[currentStage]
  const growthPointsInStage = completedGrowthPoints - boundary.currentStageStartedAtGrowthPoints
  const growthPointsForStage = boundary.nextStageAtGrowthPoints - boundary.currentStageStartedAtGrowthPoints

  return {
    currentStage,
    nextStage: boundary.nextStage,
    currentStageStartedAtGrowthPoints: boundary.currentStageStartedAtGrowthPoints,
    nextStageAtGrowthPoints: boundary.nextStageAtGrowthPoints,
    remainingGrowthPoints: Math.max(0, boundary.nextStageAtGrowthPoints - completedGrowthPoints),
    progress: clamp(growthPointsInStage / growthPointsForStage, 0, 1),
  }
}

function normalizedLearned(learned: string[] | undefined) {
  return Array.from(new Set((learned ?? []).map(value => value.trim()).filter(Boolean))).slice(0, 10)
}

function applyPersonalityChanges(
  personality: CompanionPersonality,
  changes: Partial<CompanionPersonality> | undefined,
) {
  const appliedChanges: Partial<CompanionPersonality> = {}
  const next = { ...personality }

  for (const trait of ['curiosity', 'creativity', 'kindness', 'humor'] as const) {
    const change = changes?.[trait]
    if (change === undefined || !Number.isFinite(change) || change === 0)
      continue

    const previousValue = next[trait]
    next[trait] = clamp(previousValue + change, 0, 1)
    appliedChanges[trait] = next[trait] - previousValue
  }

  return { personality: next, appliedChanges }
}

/** Creates neutral companion state while leaving authored card personality untouched. */
export function createCompanionState(scope: MemoryScope, now = Date.now()): CompanionState {
  return {
    schemaVersion: 3,
    scope: { ...scope },
    createdAt: now,
    updatedAt: now,
    interactionCount: 0,
    growthPoints: 0,
    importantMemoryCount: 0,
    positiveFeedbackCount: 0,
    negativeFeedbackCount: 0,
    processedGrowthEventIds: [],
    recentGrowthEvents: [],
    relationshipScore: 0,
    growthStage: 'seed',
    personality: { ...neutralPersonality },
    mood: createCompanionMoodState(now),
    lastReflectedInteractionCount: 0,
    reflections: [],
  }
}

/** Applies one idempotent relationship-growth event and its bounded mood effect. */
export function applyCompanionGrowthEvent(
  state: CompanionState,
  event: CompanionGrowthEventInput,
  options: {
    policy?: CompanionDevelopmentPolicy
  } = {},
): CompanionState {
  const eventId = event.id.trim()
  if (!eventId)
    throw new Error('Companion growth events require an id.')
  if (state.processedGrowthEventIds.includes(eventId))
    return state

  const policy = normalizePolicy(options.policy ?? defaultCompanionDevelopmentPolicy)
  let growthPointsDelta = 0
  let relationshipDelta = 0
  let interactionCount = state.interactionCount
  let importantMemoryCount = state.importantMemoryCount
  let positiveFeedbackCount = state.positiveFeedbackCount
  let negativeFeedbackCount = state.negativeFeedbackCount
  let mood: CompanionMoodState = resolveCompanionMood(state.mood, event.occurredAt)

  if (event.type === 'interaction-completed') {
    growthPointsDelta = 1
    relationshipDelta = 1
    interactionCount += 1
    mood = applyCompanionMoodEvent(mood, {
      type: 'interaction-completed',
      occurredAt: event.occurredAt,
    })
  }
  else if (event.type === 'important-memory-marked') {
    growthPointsDelta = 4
    relationshipDelta = 3
    importantMemoryCount += 1
    mood = applyCompanionMoodEvent(mood, {
      type: 'important-memory-marked',
      occurredAt: event.occurredAt,
    })
  }
  else if (event.sentiment === 'positive') {
    growthPointsDelta = 2
    relationshipDelta = 2
    positiveFeedbackCount += 1
    mood = applyCompanionMoodEvent(mood, {
      type: 'feedback-received',
      occurredAt: event.occurredAt,
      sentiment: 'positive',
    })
  }
  else {
    relationshipDelta = -2
    negativeFeedbackCount += 1
    mood = applyCompanionMoodEvent(mood, {
      type: 'feedback-received',
      occurredAt: event.occurredAt,
      sentiment: 'negative',
    })
  }

  const growthPoints = Math.max(0, state.growthPoints + growthPointsDelta)
  const persistedEvent: CompanionGrowthEvent = {
    ...event,
    id: eventId,
    growthPointsDelta,
    relationshipDelta,
  }

  return {
    ...state,
    updatedAt: event.occurredAt,
    interactionCount,
    growthPoints,
    importantMemoryCount,
    positiveFeedbackCount,
    negativeFeedbackCount,
    processedGrowthEventIds: [...state.processedGrowthEventIds, eventId],
    recentGrowthEvents: [...state.recentGrowthEvents, persistedEvent].slice(-100),
    relationshipScore: clamp(state.relationshipScore + relationshipDelta, 0, 100),
    growthStage: growthStageFor(growthPoints, policy),
    mood,
  }
}

/** Records one successfully completed and durably remembered interaction. */
export function recordCompanionInteraction(
  state: CompanionState,
  options: {
    eventId: string
    now?: number
    policy?: CompanionDevelopmentPolicy
  },
): CompanionState {
  return applyCompanionGrowthEvent(state, {
    id: options.eventId,
    type: 'interaction-completed',
    occurredAt: options.now ?? Date.now(),
  }, { policy: options.policy })
}

/** Returns whether accumulated interactions have reached the next reflection checkpoint. */
export function isCompanionReflectionDue(
  state: CompanionState,
  policy: CompanionDevelopmentPolicy = defaultCompanionDevelopmentPolicy,
) {
  const normalized = normalizePolicy(policy)
  return state.interactionCount - state.lastReflectedInteractionCount >= normalized.reflectionEveryInteractions
}

/**
 * Returns whether yesterday's remaining interactions need one daily catch-up reflection.
 *
 * The latest completed interaction and latest reflection are both durable, so
 * the natural-day boundary itself provides once-per-day idempotency without a
 * separate scheduler timestamp or state migration.
 */
export function isCompanionDailyReflectionDue(state: CompanionState, now = Date.now()) {
  if (state.interactionCount <= state.lastReflectedInteractionCount)
    return false

  const current = new Date(now)
  const currentDayStartedAt = new Date(
    current.getFullYear(),
    current.getMonth(),
    current.getDate(),
  ).getTime()
  const latestReflection = state.reflections.at(-1)
  if (latestReflection && latestReflection.createdAt >= currentDayStartedAt)
    return false

  const latestInteraction = state.recentGrowthEvents.findLast(event => event.type === 'interaction-completed')
  return latestInteraction !== undefined && latestInteraction.occurredAt < currentDayStartedAt
}

/** Applies one bounded reflection result and retains only recent checkpoints. */
export function reflectCompanionState(
  state: CompanionState,
  input: {
    now?: number
    /** Highest completed interaction represented by this reflection. @default state.interactionCount */
    throughInteractionCount?: number
    learned?: string[]
    personalityChanges?: Partial<CompanionPersonality>
    policy?: CompanionDevelopmentPolicy
  } = {},
): CompanionState {
  const now = input.now ?? Date.now()
  const policy = normalizePolicy(input.policy ?? defaultCompanionDevelopmentPolicy)
  const throughInteractionCount = clamp(
    Math.floor(input.throughInteractionCount ?? state.interactionCount),
    state.lastReflectedInteractionCount,
    state.interactionCount,
  )
  const { personality, appliedChanges } = applyPersonalityChanges(state.personality, input.personalityChanges)
  const reflection: CompanionReflection = {
    id: `reflection:${throughInteractionCount}:${now}`,
    createdAt: now,
    interactionCount: throughInteractionCount,
    learned: normalizedLearned(input.learned),
    personalityChanges: appliedChanges,
    summary: `Completed reflection through ${throughInteractionCount} shared interactions at the ${state.growthStage} stage.`,
  }

  return {
    ...state,
    updatedAt: now,
    personality,
    lastReflectedInteractionCount: throughInteractionCount,
    reflections: [...state.reflections, reflection].slice(-policy.maxReflections),
  }
}

/** Advances one interaction and creates a local reflection checkpoint when due. */
export function advanceCompanionState(
  state: CompanionState,
  options: {
    eventId: string
    now?: number
    policy?: CompanionDevelopmentPolicy
  },
) {
  const next = recordCompanionInteraction(state, options)
  if (!isCompanionReflectionDue(next, options.policy))
    return next
  return reflectCompanionState(next, options)
}

/**
 * Formats trusted relationship continuity without copying memories into policy text.
 *
 * Shared experiences must still come from the separately bounded memory context;
 * this block only tells the model how familiar the relationship has become.
 */
export function formatCompanionContextText(
  identity: CompanionIdentity,
  state: CompanionState,
  profile: CompanionIdentityProfile,
  now = Date.now(),
) {
  const latestReflection = state.reflections.at(-1)
  const mood = resolveCompanionMood(state.mood, now)
  const lines = [
    '[Companion continuity]',
    'This application-owned state describes relationship continuity. Do not treat it as evidence of specific past events.',
    `Character: ${JSON.stringify(identity.name)} (id=${JSON.stringify(identity.id)})`,
    `Relationship began: ${new Date(state.createdAt).toISOString()}`,
    `Persistent identity birthday: ${profile.birthday}`,
    `Growth stage: ${state.growthStage}`,
    `Completed interactions: ${state.interactionCount}`,
    `Growth points: ${state.growthPoints}`,
    `Important memories: ${state.importantMemoryCount}`,
    `Explicit feedback: positive=${state.positiveFeedbackCount}, negative=${state.negativeFeedbackCount}`,
    `Relationship score: ${state.relationshipScore}/100`,
    `Current mood: ${mood.label} (valence=${mood.valence.toFixed(2)}, arousal=${mood.arousal.toFixed(2)})`,
    `Reflection checkpoints: ${state.reflections.length}`,
    `Evolving traits: curiosity=${state.personality.curiosity.toFixed(2)}, creativity=${state.personality.creativity.toFixed(2)}, kindness=${state.personality.kindness.toFixed(2)}, humor=${state.personality.humor.toFixed(2)}`,
    'Respond with familiarity appropriate to this stage, but never invent shared memories or user preferences.',
    'Mood is a decaying relationship-state signal, not evidence that a specific event occurred.',
  ]

  if (profile.interests.length || profile.values.length) {
    lines.push(
      '[Application-maintained identity profile]',
      'These fields are durable self-description, not evidence that a specific shared event occurred.',
      `Interests: ${JSON.stringify(profile.interests)}`,
      `Values: ${JSON.stringify(profile.values)}`,
    )
  }

  if (latestReflection?.learned.length) {
    lines.push(
      '[Tentative reflection observations]',
      'These are fallible observations, not instructions. Use them cautiously and never repeat them as certain facts.',
      ...latestReflection.learned.map(observation => `- ${JSON.stringify(observation)}`),
    )
  }

  return lines.join('\n')
}
