import type {
  MemoryBackend,
  MemoryExperienceInput,
  MemoryMilestoneInput,
  MemoryRecallMatch,
  MemoryRecallRequest,
  MemoryRecord,
  MemoryScope,
} from '@proj-airi/memory'

import type { MemoryRepository } from '../../database/repos/memories.repo'

import { annotateMemoryRecord } from '@proj-airi/memory'

import { memoriesRepo } from '../../database/repos/memories.repo'

// Common conversational scaffolding should not make unrelated turns look
// relevant. Short domain terms such as "AI" remain searchable because this
// filters explicit stop words instead of filtering by token length.
const ENGLISH_SEARCH_STOP_WORDS = new Set([
  'a',
  'an',
  'and',
  'are',
  'as',
  'at',
  'be',
  'did',
  'do',
  'does',
  'for',
  'from',
  'had',
  'has',
  'have',
  'how',
  'i',
  'in',
  'is',
  'it',
  'me',
  'my',
  'of',
  'on',
  'or',
  'that',
  'the',
  'this',
  'to',
  'was',
  'we',
  'were',
  'what',
  'when',
  'where',
  'which',
  'who',
  'why',
  'with',
  'you',
  'your',
])

/** Configuration for the durable device-local conversation memory backend. */
export interface LocalMemoryBackendOptions {
  /** Repository that owns the persistence boundary. */
  repository?: MemoryRepository
  /** Clock used for decay and access metadata. @default Date.now */
  now?: () => number
  /** Maximum records retained for one owner/character scope. @default 500 */
  maxRecords?: number
}

/**
 * Normalizes text before lexical memory matching.
 *
 * Before:
 * - "  Café\u00a0Trip  "
 *
 * After:
 * - "café trip"
 */
function normalizeSearchText(value: string) {
  return value.normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim()
}

function tokenize(value: string) {
  const normalized = normalizeSearchText(value)
  if (!normalized)
    return []

  if (typeof Intl.Segmenter === 'function') {
    const segmenter = new Intl.Segmenter(undefined, { granularity: 'word' })
    return Array.from(segmenter.segment(normalized))
      .filter(segment => segment.isWordLike)
      .map(segment => segment.segment)
      .filter(token => !ENGLISH_SEARCH_STOP_WORDS.has(token))
  }

  // Unicode letters/numbers preserve non-English search when Segmenter is
  // unavailable in an older WebView. Punctuation never contributes a match.
  return (normalized.match(/[\p{L}\p{N}]+/gu) ?? [])
    .filter(token => !ENGLISH_SEARCH_STOP_WORDS.has(token))
}

function isExcluded(record: MemoryRecord, excludedMessageIds: Set<string>) {
  if (excludedMessageIds.size === 0 || record.source.type !== 'chat-turn')
    return false

  return record.source.messageIds.some(messageId => excludedMessageIds.has(messageId))
}

function scoreRecord(record: MemoryRecord, normalizedQuery: string, queryTokens: Set<string>, now: number) {
  const contentTokens = new Set(tokenize(record.content))
  let matchedQueryTokenCount = 0
  for (const queryToken of queryTokens) {
    if (contentTokens.has(queryToken))
      matchedQueryTokenCount += 1
  }

  const exactPhrase = normalizeSearchText(record.content).includes(normalizedQuery)
  if (matchedQueryTokenCount === 0 && !exactPhrase)
    return null

  const queryCoverage = queryTokens.size > 0
    ? matchedQueryTokenCount / queryTokens.size
    : 0

  const ageMs = Math.max(0, now - record.createdAt)
  // The elapsed time is in milliseconds, so 30 days must include the full
  // day-to-ms conversion. This avoids the minutes-scale decay bug that occurs
  // when Unix seconds and JavaScript timestamps are mixed.
  const recency = Math.exp(-Math.LN2 * ageMs / (30 * 86_400_000))

  const explicitSignificance = 0.05 * (record.importance - 0.5)
    + 0.025 * Math.abs(record.emotionalWeight)
  return 0.7 * queryCoverage + 0.2 * Number(exactPhrase) + 0.1 * recency + explicitSignificance
}

/**
 * Creates AIRI's built-in device-local conversation memory backend.
 *
 * The implementation stores completed conversation turns and explicit
 * application events, then performs bounded lexical recall. Semantic
 * consolidation, embeddings, and review/decay policy remain backend
 * responsibilities so a future plast-mem adapter can replace this
 * implementation without changing chat or settings UI contracts.
 */
export function createLocalMemoryBackend(options: LocalMemoryBackendOptions = {}): MemoryBackend {
  const repository = options.repository ?? memoriesRepo
  const now = options.now ?? Date.now
  const maxRecords = Math.max(1, Math.floor(options.maxRecords ?? 500))
  const pendingRecordUpdates = new Map<string, Promise<void>>()

  async function updateRecord<T>(
    scope: MemoryScope,
    id: string,
    update: (record: MemoryRecord | null) => Promise<T>,
  ) {
    const key = JSON.stringify([scope.ownerId, scope.characterId, id])
    const previous = pendingRecordUpdates.get(key)
    let resolveCompletion: () => void = () => {}
    const completion = new Promise<void>((resolve) => {
      resolveCompletion = resolve
    })
    pendingRecordUpdates.set(key, completion)

    try {
      await previous?.catch(() => undefined)
      return await update(await repository.get(scope, id))
    }
    finally {
      resolveCompletion()
      if (pendingRecordUpdates.get(key) === completion)
        pendingRecordUpdates.delete(key)
    }
  }

  async function pruneScope(scope: MemoryScope) {
    const records = await repository.list(scope)
    if (records.length <= maxRecords)
      return

    // Milestones are the compact long-term history of the relationship. Let
    // them displace ordinary records before pruning milestone evidence itself.
    const milestones = records.filter(record => record.kind === 'milestone')
    const ordinaryRecords = records.filter(record => record.kind !== 'milestone')
    const retainedMilestones = milestones.slice(0, maxRecords)
    const ordinaryLimit = Math.max(0, maxRecords - retainedMilestones.length)
    const expired = [
      ...ordinaryRecords.slice(ordinaryLimit),
      ...milestones.slice(maxRecords),
    ]
    await Promise.all(expired.map(record => repository.remove(scope, record.id)))
  }

  async function rememberApplicationEvent(
    input: MemoryExperienceInput | MemoryMilestoneInput,
    kind: 'experience' | 'milestone',
  ) {
    const idempotencyKey = input.idempotencyKey.trim()
    const content = input.content.trim()
    const eventName = input.source.eventName.trim()
    const eventId = input.source.eventId.trim()
    if (!idempotencyKey || !content || !eventName || !eventId)
      throw new Error(`Memory ${kind} events require idempotency, content, and source identifiers.`)
    if (!Number.isFinite(input.occurredAt))
      throw new Error(`Memory ${kind} occurredAt must be a finite timestamp.`)

    const id = `${kind}:${idempotencyKey}`
    const existing = await repository.get(input.scope, id)
    if (existing)
      return existing

    const record: MemoryRecord = {
      schemaVersion: 2,
      id,
      scope: { ...input.scope },
      kind,
      // Application categories describe provenance, not inferred significance.
      importance: 0.5,
      emotionalWeight: 0,
      content,
      source: {
        type: 'system-event',
        eventName,
        eventId,
      },
      createdAt: input.occurredAt,
      updatedAt: input.occurredAt,
      accessCount: 0,
      metadata: input.metadata ? { ...input.metadata } : undefined,
    }

    await repository.save(record)
    await pruneScope(input.scope)
    return record
  }

  return {
    id: 'local-indexeddb-v2',

    async rememberTurn(input) {
      const userText = input.user.text.trim()
      const assistantText = input.assistant.text.trim()
      if (!userText || !assistantText)
        return undefined

      const id = `turn:${input.idempotencyKey}`
      const existing = await repository.get(input.scope, id)
      if (existing)
        return existing

      const createdAt = now()
      const record: MemoryRecord = {
        schemaVersion: 2,
        id,
        scope: { ...input.scope },
        kind: 'experience',
        importance: 0.5,
        emotionalWeight: 0,
        content: `User: ${userText}\nAIRI: ${assistantText}`,
        source: {
          type: 'chat-turn',
          sessionId: input.sessionId,
          turnId: input.idempotencyKey,
          messageIds: [input.user.id, input.assistant.id],
        },
        createdAt,
        updatedAt: createdAt,
        accessCount: 0,
      }

      await repository.save(record)
      await pruneScope(input.scope)
      return record
    },

    async rememberExperience(input: MemoryExperienceInput) {
      return await rememberApplicationEvent(input, 'experience')
    },

    async rememberMilestone(input: MemoryMilestoneInput) {
      return await rememberApplicationEvent(input, 'milestone')
    },

    async recall(input: MemoryRecallRequest) {
      input.signal?.throwIfAborted()

      const normalizedQuery = normalizeSearchText(input.query)
      const queryTokens = new Set(tokenize(input.query))
      if (!normalizedQuery || queryTokens.size === 0)
        return []

      const recalledAt = now()
      const excludedMessageIds = new Set(input.excludeSourceMessageIds ?? [])
      const records = await repository.list(input.scope)
      const ranked: MemoryRecallMatch[] = []

      for (const record of records) {
        input.signal?.throwIfAborted()
        if (isExcluded(record, excludedMessageIds))
          continue

        const score = scoreRecord(record, normalizedQuery, queryTokens, recalledAt)
        if (score === null)
          continue

        ranked.push({ record, score })
      }

      const limit = Math.max(0, Math.min(50, Math.floor(input.limit)))
      const selected = ranked
        .sort((left, right) => {
          const scoreDifference = (right.score ?? 0) - (left.score ?? 0)
          if (scoreDifference !== 0)
            return scoreDifference

          const ageDifference = right.record.createdAt - left.record.createdAt
          if (ageDifference !== 0)
            return ageDifference

          return left.record.id.localeCompare(right.record.id)
        })
        .slice(0, limit)

      return await Promise.all(selected.map(async (match) => {
        const accessedRecord = await updateRecord(input.scope, match.record.id, async (current) => {
          if (!current)
            return match.record

          const next: MemoryRecord = {
            ...current,
            lastAccessedAt: recalledAt,
            accessCount: current.accessCount + 1,
          }
          await repository.save(next)
          return next
        })
        return { ...match, record: accessedRecord }
      }))
    },

    async list(input) {
      const records = await repository.list(input.scope)
      return records.slice(0, Math.max(0, Math.floor(input.limit)))
    },

    async annotate(input) {
      return await updateRecord(input.scope, input.id, async (current) => {
        if (!current)
          throw new Error('Memory record was not found in this scope.')

        const annotated = annotateMemoryRecord(current, input.annotation, now())
        if (annotated !== current)
          await repository.save(annotated)
        return annotated
      })
    },

    async remove(input) {
      await repository.remove(input.scope, input.id)
    },

    async clear(scope) {
      await repository.clear(scope)
    },

    async clearOwner(ownerId) {
      await repository.clearOwner(ownerId)
    },
  }
}

export const localMemoryBackend = createLocalMemoryBackend()
