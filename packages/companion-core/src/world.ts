import type { MemoryScope } from '@proj-airi/memory'

/** Categories persisted in a companion's Personal World. */
export type PersonalWorldEntryKind = 'journal' | 'learned' | 'favorite'

/** Traceable origin for one Personal World entry. */
export type PersonalWorldEntrySource
  = | { type: 'manual' }
    | { type: 'reflection', reflectionId: string, learnedIndex?: number }
    | { type: 'memory', memoryId: string }

/** Durable text entry owned by one user-and-character Personal World. */
export interface PersonalWorldEntry {
  schemaVersion: 1
  id: string
  scope: MemoryScope
  kind: PersonalWorldEntryKind
  title: string
  content: string
  source: PersonalWorldEntrySource
  /** Unix epoch timestamp in milliseconds when the entry was first created. */
  createdAt: number
  /** Unix epoch timestamp in milliseconds when the entry was last changed. */
  updatedAt: number
}

/** Input required to create a validated Personal World entry. */
export interface CreatePersonalWorldEntryInput {
  id: string
  scope: MemoryScope
  kind: PersonalWorldEntryKind
  title: string
  content: string
  source: PersonalWorldEntrySource
  now?: number
}

/** Lifecycle states for a durable creative project. */
export type PersonalWorldProjectStatus = 'idea' | 'active' | 'completed'

/** A companion-owned creative project that references existing creation assets. */
export interface PersonalWorldProject {
  schemaVersion: 1
  id: string
  scope: MemoryScope
  title: string
  description: string
  status: PersonalWorldProjectStatus
  /** Existing background-journal entry ids; project records never copy image blobs. */
  creationIds: string[]
  createdAt: number
  updatedAt: number
  completedAt?: number
}

/** Input required to create one validated creative project. */
export interface CreatePersonalWorldProjectInput {
  id: string
  scope: MemoryScope
  title: string
  description: string
  status?: PersonalWorldProjectStatus
  creationIds?: string[]
  now?: number
}

/** Fields that can change while a creative project evolves. */
export interface PersonalWorldProjectUpdate {
  title?: string
  description?: string
  status?: PersonalWorldProjectStatus
  creationIds?: string[]
}

/** Maximum existing creations one project can reference without copying asset data. */
export const PERSONAL_WORLD_PROJECT_CREATION_LIMIT = 24

function normalizedCreationIds(creationIds: string[] | undefined) {
  const normalized = Array.from(new Set((creationIds ?? []).map(id => id.trim()).filter(Boolean)))
  if (normalized.length > PERSONAL_WORLD_PROJECT_CREATION_LIMIT)
    throw new Error(`Personal World projects support at most ${PERSONAL_WORLD_PROJECT_CREATION_LIMIT} creations.`)
  return normalized
}

/** Creates a normalized Personal World entry and rejects empty durable content. */
export function createPersonalWorldEntry(input: CreatePersonalWorldEntryInput): PersonalWorldEntry {
  const id = input.id.trim()
  const title = input.title.trim()
  const content = input.content.trim()
  if (!id)
    throw new Error('Personal World entries require an id.')
  if (!content)
    throw new Error('Personal World entries require content.')

  const now = input.now ?? Date.now()
  return {
    schemaVersion: 1,
    id,
    scope: { ...input.scope },
    kind: input.kind,
    title,
    content,
    source: { ...input.source },
    createdAt: now,
    updatedAt: now,
  }
}

/** Creates a validated creative project without taking ownership of linked assets. */
export function createPersonalWorldProject(input: CreatePersonalWorldProjectInput): PersonalWorldProject {
  const id = input.id.trim()
  const title = input.title.trim()
  const description = input.description.trim()
  if (!id)
    throw new Error('Personal World projects require an id.')
  if (!title)
    throw new Error('Personal World projects require a title.')
  if (!description)
    throw new Error('Personal World projects require a description.')

  const now = input.now ?? Date.now()
  const status = input.status ?? 'idea'
  return {
    schemaVersion: 1,
    id,
    scope: { ...input.scope },
    title,
    description,
    status,
    creationIds: normalizedCreationIds(input.creationIds),
    createdAt: now,
    updatedAt: now,
    ...(status === 'completed' ? { completedAt: now } : {}),
  }
}

/** Updates project content and keeps completion time aligned with its lifecycle state. */
export function updatePersonalWorldProject(
  project: PersonalWorldProject,
  update: PersonalWorldProjectUpdate,
  now = Date.now(),
): PersonalWorldProject {
  const title = update.title?.trim() ?? project.title
  const description = update.description?.trim() ?? project.description
  if (!title)
    throw new Error('Personal World projects require a title.')
  if (!description)
    throw new Error('Personal World projects require a description.')

  const status = update.status ?? project.status
  const creationIds = update.creationIds === undefined
    ? [...project.creationIds]
    : normalizedCreationIds(update.creationIds)
  const unchanged = title === project.title
    && description === project.description
    && status === project.status
    && creationIds.length === project.creationIds.length
    && creationIds.every((id, index) => id === project.creationIds[index])
  if (unchanged)
    return project

  return {
    ...project,
    title,
    description,
    status,
    creationIds,
    updatedAt: now,
    ...(status === 'completed'
      ? { completedAt: project.completedAt ?? now }
      : { completedAt: undefined }),
  }
}
