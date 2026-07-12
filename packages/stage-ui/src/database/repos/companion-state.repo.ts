import type { CompanionState } from '@proj-airi/companion-core'
import type { MemoryScope } from '@proj-airi/memory'
import type { Storage, StorageValue } from 'unstorage'

import { createCompanionMoodState } from '@proj-airi/companion-core'

import { storage } from '../storage'

const COMPANION_STATE_PREFIX = 'local:companion/v1'

function encodeKeyPart(value: string) {
  return encodeURIComponent(value)
}

function ownerPrefix(ownerId: string) {
  return `${COMPANION_STATE_PREFIX}/${encodeKeyPart(ownerId)}/`
}

function stateKey(scope: MemoryScope) {
  return `${ownerPrefix(scope.ownerId)}${encodeKeyPart(scope.characterId)}/state`
}

function belongsToScope(state: CompanionState, scope: MemoryScope) {
  return state.scope.ownerId === scope.ownerId
    && state.scope.characterId === scope.characterId
}

interface CompanionStateV1 {
  schemaVersion: 1
  scope: MemoryScope
  createdAt: number
  updatedAt: number
  interactionCount: number
  relationshipScore: number
  growthStage: CompanionState['growthStage']
  personality: CompanionState['personality']
  lastReflectedInteractionCount: number
  reflections: CompanionState['reflections']
}

type CompanionStateV2 = Omit<CompanionStateV1, 'schemaVersion'> & {
  schemaVersion: 2
  mood: CompanionState['mood']
}

function hasStateFields(value: unknown): value is CompanionStateV1 | CompanionStateV2 | CompanionState {
  if (!value || typeof value !== 'object')
    return false

  const candidate = value as {
    scope?: Partial<MemoryScope>
    createdAt?: unknown
    updatedAt?: unknown
    interactionCount?: unknown
    relationshipScore?: unknown
    lastReflectedInteractionCount?: unknown
    reflections?: unknown
  }
  return typeof candidate.scope?.ownerId === 'string'
    && typeof candidate.scope?.characterId === 'string'
    && typeof candidate.createdAt === 'number'
    && typeof candidate.updatedAt === 'number'
    && typeof candidate.interactionCount === 'number'
    && typeof candidate.relationshipScore === 'number'
    && typeof candidate.lastReflectedInteractionCount === 'number'
    && Array.isArray(candidate.reflections)
}

function isCompanionPersonality(value: unknown): value is CompanionState['personality'] {
  if (!value || typeof value !== 'object')
    return false
  const personality = value as Partial<CompanionState['personality']>
  return ['curiosity', 'creativity', 'kindness', 'humor'].every((trait) => {
    const score = personality[trait as keyof CompanionState['personality']]
    return Number.isFinite(score) && score !== undefined && score >= 0 && score <= 1
  })
}

function isCompanionPersonalityChanges(value: unknown) {
  if (!value || typeof value !== 'object')
    return false
  const changes = value as Record<string, unknown>
  return Object.keys(changes).every(key => ['curiosity', 'creativity', 'kindness', 'humor'].includes(key))
    && Object.values(changes).every(change => (
      typeof change === 'number'
      && Number.isFinite(change)
      && change >= -1
      && change <= 1
    ))
}

function isCompanionReflection(value: unknown): value is CompanionState['reflections'][number] {
  if (!value || typeof value !== 'object')
    return false
  const reflection = value as Partial<CompanionState['reflections'][number]>
  return typeof reflection.id === 'string'
    && Number.isFinite(reflection.createdAt)
    && Number.isFinite(reflection.interactionCount)
    && Array.isArray(reflection.learned)
    && reflection.learned.every(item => typeof item === 'string')
    && isCompanionPersonalityChanges(reflection.personalityChanges)
    && typeof reflection.summary === 'string'
}

function isCompanionGrowthEvent(value: unknown): value is CompanionState['recentGrowthEvents'][number] {
  if (!value || typeof value !== 'object')
    return false
  const event = value as {
    id?: unknown
    type?: unknown
    occurredAt?: unknown
    sentiment?: unknown
    growthPointsDelta?: unknown
    relationshipDelta?: unknown
  }
  const hasBaseFields = typeof event.id === 'string'
    && typeof event.occurredAt === 'number'
    && Number.isFinite(event.occurredAt)
    && typeof event.growthPointsDelta === 'number'
    && Number.isFinite(event.growthPointsDelta)
    && typeof event.relationshipDelta === 'number'
    && Number.isFinite(event.relationshipDelta)
  if (!hasBaseFields)
    return false
  if (event.type === 'user-feedback')
    return event.sentiment === 'positive' || event.sentiment === 'negative'
  return event.type === 'interaction-completed' || event.type === 'important-memory-marked'
}

/** Returns whether a persisted value is a current companion state record. */
export function isCompanionState(value: unknown): value is CompanionState {
  if (!hasStateFields(value) || value.schemaVersion !== 3)
    return false

  return typeof value.mood?.valence === 'number'
    && typeof value.mood?.arousal === 'number'
    && value.mood.valence >= -1
    && value.mood.valence <= 1
    && value.mood.arousal >= 0
    && value.mood.arousal <= 1
    && Number.isFinite(value.mood.updatedAt)
    && Number.isInteger(value.interactionCount)
    && value.interactionCount >= 0
    && Number.isInteger(value.growthPoints)
    && value.growthPoints >= 0
    && Number.isInteger(value.importantMemoryCount)
    && value.importantMemoryCount >= 0
    && Number.isInteger(value.positiveFeedbackCount)
    && value.positiveFeedbackCount >= 0
    && Number.isInteger(value.negativeFeedbackCount)
    && value.negativeFeedbackCount >= 0
    && Array.isArray(value.processedGrowthEventIds)
    && value.processedGrowthEventIds.every(eventId => typeof eventId === 'string')
    && Array.isArray(value.recentGrowthEvents)
    && value.recentGrowthEvents.every(isCompanionGrowthEvent)
    && Number.isFinite(value.relationshipScore)
    && value.relationshipScore >= 0
    && value.relationshipScore <= 100
    && ['seed', 'child', 'companion', 'independent'].includes(value.growthStage)
    && isCompanionPersonality(value.personality)
    && Number.isInteger(value.lastReflectedInteractionCount)
    && value.lastReflectedInteractionCount >= 0
    && value.reflections.every(isCompanionReflection)
}

function isCompanionStateV1(value: unknown): value is CompanionStateV1 {
  return hasStateFields(value) && value.schemaVersion === 1
}

function isCompanionStateV2(value: unknown): value is CompanionStateV2 {
  if (!hasStateFields(value) || value.schemaVersion !== 2)
    return false
  return typeof value.mood?.valence === 'number'
    && typeof value.mood?.arousal === 'number'
    && typeof value.mood?.updatedAt === 'number'
}

/**
 * Migrates the original relationship schema at the persistence boundary.
 * Keeping this conversion centralized prevents optional mood fallbacks from
 * spreading through prompt, UI, and control API consumers.
 */
function migrateCompanionStateV1(state: CompanionStateV1): CompanionStateV2 {
  return {
    ...state,
    schemaVersion: 2,
    mood: createCompanionMoodState(state.updatedAt),
  }
}

function migrateCompanionStateV2(state: CompanionStateV2): CompanionState {
  return {
    ...state,
    schemaVersion: 3,
    growthPoints: state.interactionCount,
    importantMemoryCount: 0,
    positiveFeedbackCount: 0,
    negativeFeedbackCount: 0,
    processedGrowthEventIds: [],
    recentGrowthEvents: [],
  }
}

/** Persistence boundary for one durable companion state per owner and character. */
export interface CompanionStateRepository {
  get: (scope: MemoryScope) => Promise<CompanionState | null>
  save: (state: CompanionState) => Promise<void>
  clear: (scope: MemoryScope) => Promise<void>
  clearOwner: (ownerId: string) => Promise<void>
}

/** Creates a scoped companion repository over an unstorage instance. */
export function createCompanionStateRepository(
  companionStorage: Storage<StorageValue>,
): CompanionStateRepository {
  return {
    async get(scope) {
      const value = await companionStorage.getItemRaw<unknown>(stateKey(scope))
      const state = isCompanionState(value)
        ? value
        : isCompanionStateV2(value)
          ? migrateCompanionStateV2(value)
          : isCompanionStateV1(value)
            ? migrateCompanionStateV2(migrateCompanionStateV1(value))
            : null
      if (!state || !belongsToScope(state, scope))
        return null

      if (isCompanionStateV1(value) || isCompanionStateV2(value))
        await companionStorage.setItemRaw(stateKey(scope), state)
      return state
    },

    async save(state) {
      await companionStorage.setItemRaw(stateKey(state.scope), state)
    },

    async clear(scope) {
      await companionStorage.removeItem(stateKey(scope))
    },

    async clearOwner(ownerId) {
      const keys = await companionStorage.getKeys(ownerPrefix(ownerId))
      await Promise.all(keys.map(key => companionStorage.removeItem(key)))
    },
  }
}

export const companionStateRepo = createCompanionStateRepository(storage)
