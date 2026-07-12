import type {
  CompanionIdentityProfile,
  CompanionState,
  PersonalWorldEntry,
  PersonalWorldProject,
} from '@proj-airi/companion-core'
import type { MemoryRecord, MemoryScope } from '@proj-airi/memory'

import type { CompanionProfileRepository } from '../database/repos/companion-profile.repo'
import type { CompanionStateRepository } from '../database/repos/companion-state.repo'
import type { MemoryRepository } from '../database/repos/memories.repo'
import type { PersonalWorldRepository } from '../database/repos/personal-world.repo'

import {
  array,
  literal,
  nullable,
  number,
  object,
  safeParse,
  string,
  unknown as unknownValue,
} from 'valibot'

import {
  companionProfileRepo,
  isCompanionIdentityProfile,
} from '../database/repos/companion-profile.repo'
import {
  companionStateRepo,
  isCompanionState,
} from '../database/repos/companion-state.repo'
import {
  memoriesRepo,
  parseMemoryRecord,
} from '../database/repos/memories.repo'
import {
  isPersonalWorldEntry,
  isPersonalWorldProject,
  personalWorldRepo,
} from '../database/repos/personal-world.repo'

const COMPANION_DATA_ARCHIVE_KIND = 'airi-companion-data'

const archiveEnvelopeSchema = object({
  kind: literal(COMPANION_DATA_ARCHIVE_KIND),
  schemaVersion: literal(1),
  exportedAt: number(),
  scope: object({
    ownerId: string(),
    characterId: string(),
  }),
  data: object({
    profile: nullable(unknownValue()),
    state: nullable(unknownValue()),
    memories: array(unknownValue()),
    personalWorld: object({
      entries: array(unknownValue()),
      projects: array(unknownValue()),
    }),
  }),
})

/** Versioned local backup for exactly one owner-and-character companion scope. */
export interface CompanionDataArchive {
  kind: typeof COMPANION_DATA_ARCHIVE_KIND
  schemaVersion: 1
  /** Unix epoch timestamp in milliseconds when the snapshot was read. */
  exportedAt: number
  /** Scope that must match the active import target exactly. */
  scope: MemoryScope
  data: {
    profile: CompanionIdentityProfile | null
    state: CompanionState | null
    memories: MemoryRecord[]
    personalWorld: {
      entries: PersonalWorldEntry[]
      projects: PersonalWorldProject[]
    }
  }
}

/** Record counts returned after a scoped import or clear operation. */
export interface CompanionDataArchiveSummary {
  profile: number
  state: number
  memories: number
  personalWorldEntries: number
  personalWorldProjects: number
}

/** Persistence dependencies used by the cross-domain companion data boundary. */
export interface CompanionDataPortabilityRepositories {
  profile: CompanionProfileRepository
  state: CompanionStateRepository
  memories: MemoryRepository
  personalWorld: PersonalWorldRepository
}

/** Configuration for scoped companion export, import, and deletion. */
export interface CompanionDataPortabilityOptions {
  repositories?: CompanionDataPortabilityRepositories
  /** Clock used only for archive metadata. @default Date.now */
  now?: () => number
}

function sameScope(left: MemoryScope, right: MemoryScope) {
  return left.ownerId === right.ownerId && left.characterId === right.characterId
}

function requireScope(recordScope: MemoryScope, archiveScope: MemoryScope, label: string) {
  if (!sameScope(recordScope, archiveScope))
    throw new Error(`Companion data archive contains ${label} from another owner or character.`)
}

function requireUniqueIds(records: Array<{ id: string }>, label: string) {
  const ids = new Set<string>()
  for (const record of records) {
    if (ids.has(record.id))
      throw new Error(`Companion data archive contains duplicate ${label} id: ${record.id}`)
    ids.add(record.id)
  }
}

/**
 * Parses a versioned companion data archive without remapping ownership.
 *
 * Imported records retain their original scope so a backup can never be used
 * to silently copy one user's relationship into another character.
 */
export function parseCompanionDataArchive(
  input: unknown,
  expectedScope?: MemoryScope,
): CompanionDataArchive {
  let candidate = input
  if (typeof input === 'string') {
    try {
      candidate = JSON.parse(input)
    }
    catch {
      throw new Error('Companion data archive is not valid JSON.')
    }
  }

  const envelope = safeParse(archiveEnvelopeSchema, candidate)
  if (!envelope.success)
    throw new Error('Companion data archive has an unsupported or malformed envelope.')

  const { output } = envelope
  if (expectedScope && !sameScope(output.scope, expectedScope))
    throw new Error('Companion data archive belongs to another owner or character.')

  const profile = output.data.profile === null
    ? null
    : isCompanionIdentityProfile(output.data.profile)
      ? output.data.profile
      : undefined
  if (profile === undefined)
    throw new Error('Companion data archive contains an invalid identity profile.')

  const state = output.data.state === null
    ? null
    : isCompanionState(output.data.state)
      ? output.data.state
      : undefined
  if (state === undefined)
    throw new Error('Companion data archive contains an invalid relationship state.')

  const memories = output.data.memories.map((memory) => {
    const parsed = parseMemoryRecord(memory)
    if (!parsed)
      throw new Error('Companion data archive contains an invalid memory record.')
    return parsed
  })
  const entries = output.data.personalWorld.entries.map((entry) => {
    if (!isPersonalWorldEntry(entry))
      throw new Error('Companion data archive contains an invalid Personal World entry.')
    return entry
  })
  const projects = output.data.personalWorld.projects.map((project) => {
    if (!isPersonalWorldProject(project))
      throw new Error('Companion data archive contains an invalid Personal World project.')
    return project
  })

  if (profile)
    requireScope(profile.scope, output.scope, 'an identity profile')
  if (state)
    requireScope(state.scope, output.scope, 'a relationship state')
  for (const memory of memories)
    requireScope(memory.scope, output.scope, 'a memory')
  for (const entry of entries)
    requireScope(entry.scope, output.scope, 'a Personal World entry')
  for (const project of projects)
    requireScope(project.scope, output.scope, 'a Personal World project')

  requireUniqueIds(memories, 'memory')
  requireUniqueIds(entries, 'Personal World entry')
  requireUniqueIds(projects, 'Personal World project')

  return {
    kind: COMPANION_DATA_ARCHIVE_KIND,
    schemaVersion: 1,
    exportedAt: output.exportedAt,
    scope: { ...output.scope },
    data: {
      profile,
      state,
      memories,
      personalWorld: {
        entries,
        projects,
      },
    },
  }
}

/** Serializes a validated archive with stable human-readable indentation. */
export function serializeCompanionDataArchive(archive: CompanionDataArchive) {
  return JSON.stringify(parseCompanionDataArchive(archive), null, 2)
}

/**
 * Normalizes a companion name for a cross-platform backup filename.
 *
 * Before:
 * - `"ReLU: desktop / companion"`
 *
 * After:
 * - `"airi-companion-ReLU-desktop-companion-2026-07-12T08-30-00-000Z.json"`
 */
export function companionDataArchiveFilename(characterName: string, exportedAt: number) {
  // Windows reserves these characters while browsers may save the same file on
  // any desktop platform, so the download name uses the strict shared subset.
  const safeCharacterName = characterName
    .trim()
    .replace(/[<>:"/\\|?*\u0000-\u001F]+/g, '-')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60) || 'companion'
  const timestamp = new Date(exportedAt).toISOString().replace(/[:.]/g, '-')
  return `airi-companion-${safeCharacterName}-${timestamp}.json`
}

function summarizeArchive(archive: CompanionDataArchive): CompanionDataArchiveSummary {
  return {
    profile: archive.data.profile ? 1 : 0,
    state: archive.data.state ? 1 : 0,
    memories: archive.data.memories.length,
    personalWorldEntries: archive.data.personalWorld.entries.length,
    personalWorldProjects: archive.data.personalWorld.projects.length,
  }
}

/**
 * Creates a serialized data-lifecycle boundary across all companion-owned stores.
 *
 * Imports replace exactly one scope. Because unstorage does not provide a
 * transaction spanning these repositories, a failed write clears the partial
 * target and restores the snapshot captured immediately before the operation.
 */
export function createCompanionDataPortabilityService(
  options: CompanionDataPortabilityOptions = {},
) {
  const repositories = options.repositories ?? {
    profile: companionProfileRepo,
    state: companionStateRepo,
    memories: memoriesRepo,
    personalWorld: personalWorldRepo,
  }
  const now = options.now ?? Date.now
  const pendingOperations = new Map<string, Promise<void>>()

  function scopeKey(scope: MemoryScope) {
    return JSON.stringify([scope.ownerId, scope.characterId])
  }

  async function runExclusive<T>(scope: MemoryScope, operation: () => Promise<T>) {
    const key = scopeKey(scope)
    const previous = pendingOperations.get(key)
    let resolveCompletion: () => void = () => {}
    const completion = new Promise<void>((resolve) => {
      resolveCompletion = resolve
    })
    pendingOperations.set(key, completion)

    try {
      await previous?.catch(() => undefined)
      return await operation()
    }
    finally {
      resolveCompletion()
      if (pendingOperations.get(key) === completion)
        pendingOperations.delete(key)
    }
  }

  async function readArchive(scope: MemoryScope): Promise<CompanionDataArchive> {
    const [profile, state, memories, entries, projects] = await Promise.all([
      repositories.profile.get(scope),
      repositories.state.get(scope),
      repositories.memories.list(scope),
      repositories.personalWorld.list(scope),
      repositories.personalWorld.listProjects(scope),
    ])
    return {
      kind: COMPANION_DATA_ARCHIVE_KIND,
      schemaVersion: 1,
      exportedAt: now(),
      scope: { ...scope },
      data: {
        profile,
        state,
        memories,
        personalWorld: {
          entries,
          projects,
        },
      },
    }
  }

  async function clearRepositories(scope: MemoryScope) {
    // Complete each repository mutation before moving on. If a write rejects,
    // rollback must not race still-running work from an earlier Promise.all.
    await repositories.profile.clear(scope)
    await repositories.state.clear(scope)
    await repositories.memories.clear(scope)
    await repositories.personalWorld.clearScope(scope)
  }

  async function writeArchive(archive: CompanionDataArchive) {
    if (archive.data.profile)
      await repositories.profile.save(archive.data.profile)
    if (archive.data.state)
      await repositories.state.save(archive.data.state)
    for (const record of archive.data.memories)
      await repositories.memories.save(record)
    for (const entry of archive.data.personalWorld.entries)
      await repositories.personalWorld.save(entry)
    for (const project of archive.data.personalWorld.projects)
      await repositories.personalWorld.saveProject(project)
  }

  async function replaceScope(
    scope: MemoryScope,
    target: CompanionDataArchive | undefined,
  ) {
    const previous = await readArchive(scope)
    try {
      await clearRepositories(scope)
      if (target)
        await writeArchive(target)
    }
    catch (operationError) {
      try {
        await clearRepositories(scope)
        await writeArchive(previous)
      }
      catch (rollbackError) {
        throw new AggregateError(
          [operationError, rollbackError],
          'Companion data operation failed and the previous scope could not be fully restored.',
        )
      }
      throw operationError
    }
  }

  return {
    /** Reads a stable snapshot without creating missing companion defaults. */
    async exportScope(scope: MemoryScope) {
      return await runExclusive(scope, async () => readArchive(scope))
    },

    /** Replaces one scope after validating archive ownership and every record. */
    async importScope(scope: MemoryScope, input: unknown) {
      const archive = parseCompanionDataArchive(input, scope)
      await runExclusive(scope, async () => replaceScope(scope, archive))
      return summarizeArchive(archive)
    },

    /** Clears one scope and restores it when a repository reports a partial failure. */
    async clearScope(scope: MemoryScope) {
      const before = await runExclusive(scope, async () => {
        const archive = await readArchive(scope)
        await replaceScope(scope, undefined)
        return archive
      })
      return summarizeArchive(before)
    },
  }
}

export const companionDataPortabilityService = createCompanionDataPortabilityService()
