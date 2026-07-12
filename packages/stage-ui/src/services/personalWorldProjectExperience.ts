import type { PersonalWorldProject } from '@proj-airi/companion-core'
import type { MemoryExperienceInput, MemoryRecord } from '@proj-airi/memory'

/** Stable event schema shared by memory IDs, provenance, and presentation validation. */
const PROJECT_COMPLETED_EVENT = 'personal-world-project-completed'

/** Trusted application metadata used to localize a project-completion experience. */
export interface PersonalWorldProjectExperienceMetadata {
  /** Stable Personal World project identifier that must match the source event ID. */
  projectId: string
  /** Project title captured at the first completion transition. */
  title: string
  /** Project description captured at the first completion transition. */
  description: string
}

/** Creates neutral, idempotent evidence for one explicit project completion. */
export function createPersonalWorldProjectCompletionExperience(
  project: PersonalWorldProject,
): MemoryExperienceInput {
  if (project.status !== 'completed' || project.completedAt === undefined)
    throw new Error('Only completed Personal World projects can become experiences.')

  return {
    idempotencyKey: `${PROJECT_COMPLETED_EVENT}:${project.id}`,
    scope: { ...project.scope },
    content: [
      `Creative project completed: ${JSON.stringify(project.title)}`,
      `Project description: ${JSON.stringify(project.description)}`,
    ].join('\n'),
    occurredAt: project.completedAt,
    source: {
      eventName: PROJECT_COMPLETED_EVENT,
      eventId: project.id,
    },
    metadata: {
      personalWorldProjectId: project.id,
      personalWorldProjectTitle: project.title,
      personalWorldProjectDescription: project.description,
    },
  }
}

/** Returns validated presentation metadata only for application-owned project experiences. */
export function personalWorldProjectExperienceFromMemory(
  record: MemoryRecord,
): PersonalWorldProjectExperienceMetadata | undefined {
  if (
    record.source.type !== 'system-event'
    || record.source.eventName !== PROJECT_COMPLETED_EVENT
  ) {
    return undefined
  }

  const projectId = record.metadata?.personalWorldProjectId
  const title = record.metadata?.personalWorldProjectTitle
  const description = record.metadata?.personalWorldProjectDescription
  if (
    typeof projectId !== 'string'
    || projectId !== record.source.eventId
    || typeof title !== 'string'
    || !title.trim()
    || typeof description !== 'string'
    || !description.trim()
  ) {
    return undefined
  }

  return {
    projectId,
    title,
    description,
  }
}
