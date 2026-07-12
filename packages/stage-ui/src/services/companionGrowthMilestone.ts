import type { CompanionGrowthStage, CompanionIdentity } from '@proj-airi/companion-core'
import type { MemoryMilestoneInput, MemoryRecord, MemoryScope } from '@proj-airi/memory'

const EVENT_NAME = 'companion-growth-stage'
const milestoneStages = new Set<CompanionGrowthStage>(['child', 'companion', 'independent'])

function boundedIdentityName(identity: CompanionIdentity) {
  const normalized = identity.name.replace(/\s+/g, ' ').trim() || identity.id
  return Array.from(normalized).slice(0, 120).join('')
}

/**
 * Builds a deterministic memory input for a relationship growth transition.
 * Seed is the initial state and therefore does not create an advancement milestone.
 */
export function createCompanionGrowthStageMilestone(
  scope: MemoryScope,
  identity: CompanionIdentity,
  stage: CompanionGrowthStage,
  occurredAt: number,
): MemoryMilestoneInput | undefined {
  if (stage === 'seed')
    return undefined

  return {
    idempotencyKey: `${EVENT_NAME}:${stage}`,
    scope: { ...scope },
    content: `Relationship milestone: ${boundedIdentityName(identity)} reached the ${stage} growth stage.`,
    occurredAt,
    source: {
      eventName: EVENT_NAME,
      eventId: stage,
    },
    metadata: {
      companionGrowthStage: stage,
    },
  }
}

/** Returns a validated companion stage only for application-owned growth milestones. */
export function companionGrowthStageFromMemory(record: MemoryRecord): CompanionGrowthStage | undefined {
  if (record.source.type !== 'system-event' || record.source.eventName !== EVENT_NAME)
    return undefined

  const stage = record.metadata?.companionGrowthStage
  if (typeof stage !== 'string' || !milestoneStages.has(stage as CompanionGrowthStage))
    return undefined
  if (record.source.eventId !== stage)
    return undefined
  return stage as CompanionGrowthStage
}
