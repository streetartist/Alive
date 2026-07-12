import type { MemoryScope } from '@proj-airi/memory'

import { describe, expect, it } from 'vitest'

import {
  advanceCompanionState,
  applyCompanionGrowthEvent,
  createCompanionIdentityProfile,
  createCompanionState,
  formatCompanionContextText,
  getCompanionDevelopmentProgress,
  isCompanionDailyReflectionDue,
  isCompanionReflectionDue,
  recordCompanionInteraction,
  reflectCompanionState,
  updateCompanionIdentityProfile,
} from './index'

const scope = { ownerId: 'owner', characterId: 'character' } satisfies MemoryScope

describe('companion development', () => {
  it('advances stages and relationship score only after completed interactions', () => {
    let state = createCompanionState(scope, 1)

    for (let index = 0; index < 30; index += 1)
      state = recordCompanionInteraction(state, { eventId: `interaction-${index}`, now: index + 2 })

    expect(state.interactionCount).toBe(30)
    expect(state.relationshipScore).toBe(30)
    expect(state.growthStage).toBe('companion')
    expect(state.mood.valence).toBeGreaterThan(0)
    expect(state.mood.arousal).toBeGreaterThan(0.25)
  })

  it('describes progress toward the next configured growth stage', () => {
    expect(getCompanionDevelopmentProgress(0)).toEqual({
      currentStage: 'seed',
      nextStage: 'child',
      currentStageStartedAtGrowthPoints: 0,
      nextStageAtGrowthPoints: 5,
      remainingGrowthPoints: 5,
      progress: 0,
    })
    expect(getCompanionDevelopmentProgress(10)).toMatchObject({
      currentStage: 'child',
      nextStage: 'companion',
      remainingGrowthPoints: 20,
      progress: 0.2,
    })
    expect(getCompanionDevelopmentProgress(100)).toEqual({
      currentStage: 'independent',
      currentStageStartedAtGrowthPoints: 100,
      remainingGrowthPoints: 0,
      progress: 1,
    })
  })

  it('creates bounded reflection checkpoints at the configured cadence', () => {
    let state = createCompanionState(scope, 1)

    for (let index = 0; index < 10; index += 1)
      state = advanceCompanionState(state, { eventId: `interaction-${index}`, now: index + 2 })

    expect(isCompanionReflectionDue(state)).toBe(false)
    expect(state.lastReflectedInteractionCount).toBe(10)
    expect(state.reflections).toHaveLength(1)
    expect(state.reflections[0].summary).toContain('through 10 shared interactions')
  })

  it('schedules one catch-up reflection after a day with unreflected interactions', () => {
    const yesterday = new Date(2026, 0, 1, 18).getTime()
    const today = new Date(2026, 0, 2, 9).getTime()
    const state = recordCompanionInteraction(createCompanionState(scope, yesterday - 1), {
      eventId: 'interaction:yesterday',
      now: yesterday,
    })

    expect(isCompanionDailyReflectionDue(state, yesterday)).toBe(false)
    expect(isCompanionDailyReflectionDue(state, today)).toBe(true)

    const reflected = reflectCompanionState(state, { now: today })
    expect(isCompanionDailyReflectionDue(reflected, today)).toBe(false)
  })

  it('does not schedule daily reflection without a durable unreflected interaction', () => {
    const today = new Date(2026, 0, 2, 9).getTime()
    const empty = createCompanionState(scope, today - 86_400_000)

    expect(isCompanionDailyReflectionDue(empty, today)).toBe(false)
  })

  it('deduplicates insights and clamps reflected personality changes', () => {
    const reflected = reflectCompanionState(createCompanionState(scope, 1), {
      now: 2,
      learned: ['User enjoys painting', ' User enjoys painting ', ''],
      personalityChanges: { curiosity: 0.8, humor: -0.8 },
    })

    expect(reflected.reflections[0].learned).toEqual(['User enjoys painting'])
    expect(reflected.reflections[0].personalityChanges).toEqual({ curiosity: 0.5, humor: -0.5 })
    expect(reflected.personality.curiosity).toBe(1)
    expect(reflected.personality.humor).toBe(0)
  })

  it('renders relationship continuity without claiming specific memories', () => {
    const state = reflectCompanionState(
      recordCompanionInteraction(createCompanionState(scope, 1), { eventId: 'interaction-1', now: 2 }),
      { now: 3, learned: ['User may enjoy painting'] },
    )
    const profile = updateCompanionIdentityProfile(
      createCompanionIdentityProfile(scope, 1, 1),
      { interests: ['painting'], values: ['curiosity'] },
      2,
    )
    const text = formatCompanionContextText({ id: 'character', name: 'Alive' }, state, profile, 3)

    expect(text).toContain('[Companion continuity]')
    expect(text).toContain('Completed interactions: 1')
    expect(text).toContain('never invent shared memories')
    expect(text).toContain('[Tentative reflection observations]')
    expect(text).toContain('"User may enjoy painting"')
    expect(text).toContain('[Application-maintained identity profile]')
    expect(text).toContain('"curiosity"')
    expect(text).toContain('Current mood: neutral')
  })

  it('marks only the interactions analyzed by a delayed reflection', () => {
    let state = createCompanionState(scope, 1)
    for (let index = 0; index < 12; index += 1)
      state = recordCompanionInteraction(state, { eventId: `interaction-${index}`, now: index + 2 })

    const reflected = reflectCompanionState(state, {
      now: 20,
      throughInteractionCount: 10,
    })

    expect(reflected.lastReflectedInteractionCount).toBe(10)
    expect(reflected.reflections[0].interactionCount).toBe(10)
    expect(reflected.interactionCount).toBe(12)
  })

  it('combines important memories and explicit feedback into idempotent growth', () => {
    const initial = createCompanionState(scope, 1)
    const favorite = applyCompanionGrowthEvent(initial, {
      id: 'important-memory:memory-1',
      type: 'important-memory-marked',
      occurredAt: 2,
    })
    const positive = applyCompanionGrowthEvent(favorite, {
      id: 'feedback:message-1',
      type: 'user-feedback',
      sentiment: 'positive',
      occurredAt: 3,
    })
    const duplicate = applyCompanionGrowthEvent(positive, {
      id: 'feedback:message-1',
      type: 'user-feedback',
      sentiment: 'negative',
      occurredAt: 4,
    })

    expect(positive).toMatchObject({
      growthPoints: 6,
      importantMemoryCount: 1,
      positiveFeedbackCount: 1,
      negativeFeedbackCount: 0,
      relationshipScore: 5,
      growthStage: 'child',
    })
    expect(duplicate).toBe(positive)
  })

  it('lets negative feedback lower relationship and mood without reversing growth', () => {
    const initial = recordCompanionInteraction(createCompanionState(scope, 1), {
      eventId: 'interaction-1',
      now: 2,
    })
    const next = applyCompanionGrowthEvent(initial, {
      id: 'feedback:message-1',
      type: 'user-feedback',
      sentiment: 'negative',
      occurredAt: 3,
    })

    expect(next.growthPoints).toBe(1)
    expect(next.relationshipScore).toBe(0)
    expect(next.negativeFeedbackCount).toBe(1)
    expect(next.mood.valence).toBeLessThan(initial.mood.valence)
  })
})
