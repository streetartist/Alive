import type { MemoryRecord, MemoryScope } from '@proj-airi/memory'

import { describe, expect, it } from 'vitest'

import {
  companionGrowthStageFromMemory,
  createCompanionGrowthStageMilestone,
} from './companionGrowthMilestone'

const scope = { ownerId: 'owner', characterId: 'character' } satisfies MemoryScope

describe('companion growth milestones', () => {
  it('builds a stable neutral milestone for every advancement stage', () => {
    const milestone = createCompanionGrowthStageMilestone(
      scope,
      { id: 'character', name: '  ReLU\nCompanion  ' },
      'child',
      123,
    )

    expect(milestone).toEqual({
      idempotencyKey: 'companion-growth-stage:child',
      scope,
      content: 'Relationship milestone: ReLU Companion reached the child growth stage.',
      occurredAt: 123,
      source: {
        eventName: 'companion-growth-stage',
        eventId: 'child',
      },
      metadata: {
        companionGrowthStage: 'child',
      },
    })
    expect(createCompanionGrowthStageMilestone(scope, { id: 'character', name: 'ReLU' }, 'seed', 123)).toBeUndefined()
  })

  it('recognizes only matching application-owned milestone metadata', () => {
    const input = createCompanionGrowthStageMilestone(
      scope,
      { id: 'character', name: 'ReLU' },
      'companion',
      123,
    )!
    const record: MemoryRecord = {
      schemaVersion: 2,
      id: `milestone:${input.idempotencyKey}`,
      scope,
      kind: 'milestone',
      importance: 0.5,
      emotionalWeight: 0,
      content: input.content,
      source: { type: 'system-event', ...input.source },
      createdAt: input.occurredAt,
      updatedAt: input.occurredAt,
      accessCount: 0,
      metadata: input.metadata,
    }

    expect(companionGrowthStageFromMemory(record)).toBe('companion')
    expect(companionGrowthStageFromMemory({
      ...record,
      source: {
        type: 'system-event',
        eventName: input.source.eventName,
        eventId: 'child',
      },
    })).toBeUndefined()
    expect(companionGrowthStageFromMemory({
      ...record,
      metadata: { companionGrowthStage: 'unknown' },
    })).toBeUndefined()
  })
})
