import type { CompanionGrowthEvent } from '@proj-airi/companion-core'

import { describe, expect, it } from 'vitest'

import { companionGrowthTimeline } from './companionGrowthTimeline'

const events: CompanionGrowthEvent[] = [
  {
    id: 'interaction:memory-1',
    type: 'interaction-completed',
    occurredAt: 1,
    growthPointsDelta: 1,
    relationshipDelta: 1,
  },
  {
    id: 'important-memory:memory-2',
    type: 'important-memory-marked',
    occurredAt: 2,
    growthPointsDelta: 4,
    relationshipDelta: 3,
  },
  {
    id: 'feedback:session-1:message-1',
    type: 'user-feedback',
    sentiment: 'positive',
    occurredAt: 3,
    growthPointsDelta: 2,
    relationshipDelta: 2,
  },
  {
    id: 'feedback:session-1:message-2',
    type: 'user-feedback',
    sentiment: 'negative',
    occurredAt: 4,
    growthPointsDelta: 0,
    relationshipDelta: -2,
  },
]

describe('companion growth timeline presentation', () => {
  it('maps every durable growth event into a presentation-safe kind', () => {
    const timeline = companionGrowthTimeline(events)

    expect(timeline.map(entry => entry.kind)).toEqual([
      'negativeFeedback',
      'positiveFeedback',
      'importantMemory',
      'interaction',
    ])
    expect(timeline[0].growthPointsDelta).toBe(0)
    expect(timeline[0].relationshipDelta).toBe(-2)
    expect(timeline.every(entry => !('id' in entry))).toBe(true)
  })

  it('returns the newest bounded window without mutating persisted event order', () => {
    const originalOrder = events.map(event => event.id)
    const unorderedEvents = [events[3], events[0], events[2], events[1]]
    const timeline = companionGrowthTimeline(unorderedEvents, 2)

    expect(timeline.map(entry => entry.occurredAt)).toEqual([4, 3])
    expect(events.map(event => event.id)).toEqual(originalOrder)
    expect(unorderedEvents.map(event => event.id)).toEqual([
      events[3].id,
      events[0].id,
      events[2].id,
      events[1].id,
    ])
  })

  it('returns no entries when the presentation limit is zero', () => {
    expect(companionGrowthTimeline(events, 0)).toEqual([])
  })

  it('keeps an out-of-range restored timestamp from reaching date formatting', () => {
    const timeline = companionGrowthTimeline([{
      ...events[0],
      occurredAt: Number.MAX_VALUE,
    }])

    expect(timeline[0].occurredAt).toBeUndefined()
  })
})
