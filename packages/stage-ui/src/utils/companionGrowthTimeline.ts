import type { CompanionGrowthEvent } from '@proj-airi/companion-core'

export type CompanionGrowthTimelineKind
  = | 'interaction'
    | 'importantMemory'
    | 'positiveFeedback'
    | 'negativeFeedback'

/** One presentation-safe relationship event without its encoded source identifier. */
export interface CompanionGrowthTimelineEntry {
  kind: CompanionGrowthTimelineKind
  /** Valid JavaScript epoch timestamp, or undefined when restored data is outside the Date range. */
  occurredAt: number | undefined
  growthPointsDelta: number
  relationshipDelta: number
  icon: string
}

function presentationKind(event: CompanionGrowthEvent): CompanionGrowthTimelineKind {
  if (event.type === 'interaction-completed')
    return 'interaction'
  if (event.type === 'important-memory-marked')
    return 'importantMemory'
  return event.sentiment === 'positive' ? 'positiveFeedback' : 'negativeFeedback'
}

const eventIcons: Record<CompanionGrowthTimelineKind, string> = {
  interaction: 'i-solar:chat-round-dots-bold-duotone',
  importantMemory: 'i-solar:star-bold-duotone',
  positiveFeedback: 'i-solar:like-bold-duotone',
  negativeFeedback: 'i-solar:dislike-bold-duotone',
}

function validOccurredAt(event: CompanionGrowthEvent) {
  return Number.isFinite(new Date(event.occurredAt).getTime())
    ? event.occurredAt
    : undefined
}

/**
 * Builds the newest-first, bounded relationship timeline used by settings UI.
 * Encoded event IDs remain inside the state ledger and are deliberately omitted
 * because they may contain session, message, memory, or repository identifiers.
 */
export function companionGrowthTimeline(
  events: readonly CompanionGrowthEvent[],
  limit = 20,
): CompanionGrowthTimelineEntry[] {
  const maximumEntries = Number.isFinite(limit) ? Math.max(0, Math.floor(limit)) : 20
  if (maximumEntries === 0)
    return []

  return events
    .map(event => ({ event, occurredAt: validOccurredAt(event) }))
    .sort((left, right) => (right.occurredAt ?? Number.NEGATIVE_INFINITY) - (left.occurredAt ?? Number.NEGATIVE_INFINITY))
    .slice(0, maximumEntries)
    .map(({ event, occurredAt }) => {
      const kind = presentationKind(event)
      return {
        kind,
        occurredAt,
        growthPointsDelta: event.growthPointsDelta,
        relationshipDelta: event.relationshipDelta,
        icon: eventIcons[kind],
      }
    })
}
