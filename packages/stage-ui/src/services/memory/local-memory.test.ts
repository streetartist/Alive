import type { MemoryCompletedTurn, MemoryRecord, MemoryScope } from '@proj-airi/memory'

import memoryDriver from 'unstorage/drivers/memory'

import { createStorage } from 'unstorage'
import { beforeEach, describe, expect, it } from 'vitest'

import { createMemoryRepository } from '../../database/repos/memories.repo'
import { createLocalMemoryBackend } from './local-memory'

const DAY_MS = 86_400_000
const scope = { ownerId: 'owner-a', characterId: 'character-a' } satisfies MemoryScope

function makeTurn(id: string, overrides: Partial<MemoryCompletedTurn> = {}): MemoryCompletedTurn {
  return {
    idempotencyKey: `turn-${id}`,
    scope,
    sessionId: `session-${id}`,
    user: {
      id: `user-${id}`,
      text: `User message ${id}`,
      createdAt: 1,
    },
    assistant: {
      id: `assistant-${id}`,
      text: `Assistant response ${id}`,
      createdAt: 2,
    },
    ...overrides,
  }
}

function makeRecord(input: {
  id: string
  content: string
  createdAt: number
  scope?: MemoryScope
  messageIds?: [string, string]
}): MemoryRecord {
  const recordScope = input.scope ?? scope
  return {
    schemaVersion: 2,
    id: input.id,
    scope: recordScope,
    kind: 'experience',
    importance: 0.5,
    emotionalWeight: 0,
    content: input.content,
    source: {
      type: 'chat-turn',
      sessionId: `session-${input.id}`,
      turnId: `turn-${input.id}`,
      messageIds: input.messageIds ?? [`user-${input.id}`, `assistant-${input.id}`],
    },
    createdAt: input.createdAt,
    updatedAt: input.createdAt,
    accessCount: 0,
  }
}

describe('local memory backend', () => {
  let currentTime: number
  let repository: ReturnType<typeof createMemoryRepository>

  beforeEach(() => {
    currentTime = 60 * DAY_MS
    repository = createMemoryRepository(createStorage({ driver: memoryDriver() }))
  })

  function createBackend(maxRecords = 500) {
    return createLocalMemoryBackend({
      repository,
      now: () => currentTime,
      maxRecords,
    })
  }

  it('stores only one experience record when a completed turn is retried', async () => {
    const backend = createBackend()
    const first = await backend.rememberTurn(makeTurn('one'))
    const retried = await backend.rememberTurn(makeTurn('one', {
      assistant: {
        id: 'assistant-one',
        text: 'A retry must not overwrite the first durable turn.',
        createdAt: 3,
      },
    }))

    expect(first).toEqual(retried)
    expect(await backend.list({ scope, limit: 500 })).toHaveLength(1)
    expect(first?.content).toBe('User: User message one\nAIRI: Assistant response one')
    expect(first).toMatchObject({
      schemaVersion: 2,
      kind: 'experience',
      importance: 0.5,
      emotionalWeight: 0,
    })
  })

  it('stores one neutral milestone for repeated application events', async () => {
    const backend = createBackend()
    const input = {
      idempotencyKey: 'companion-growth-stage:child',
      scope,
      content: 'Relationship milestone: AIRI reached the child growth stage.',
      occurredAt: 123,
      source: {
        eventName: 'companion-growth-stage',
        eventId: 'child',
      },
      metadata: { companionGrowthStage: 'child' },
    }

    const first = await backend.rememberMilestone(input)
    const repeated = await backend.rememberMilestone({
      ...input,
      content: 'A retry must not overwrite the original milestone.',
    })

    expect(repeated).toEqual(first)
    expect(first).toMatchObject({
      id: 'milestone:companion-growth-stage:child',
      kind: 'milestone',
      importance: 0.5,
      emotionalWeight: 0,
      createdAt: 123,
      source: {
        type: 'system-event',
        eventName: 'companion-growth-stage',
        eventId: 'child',
      },
      metadata: { companionGrowthStage: 'child' },
    })
    expect(await backend.list({ scope, limit: 500 })).toHaveLength(1)
  })

  it('stores one neutral experience for repeated application events', async () => {
    const backend = createBackend()
    const input = {
      idempotencyKey: 'personal-world-project-completed:project-1',
      scope,
      content: 'Creative project completed: "Rain sketches"',
      occurredAt: 456,
      source: {
        eventName: 'personal-world-project-completed',
        eventId: 'project-1',
      },
      metadata: { personalWorldProjectId: 'project-1' },
    }

    const first = await backend.rememberExperience(input)
    const repeated = await backend.rememberExperience({
      ...input,
      content: 'A retry must not overwrite the original experience.',
    })

    expect(repeated).toEqual(first)
    expect(first).toMatchObject({
      id: 'experience:personal-world-project-completed:project-1',
      kind: 'experience',
      importance: 0.5,
      emotionalWeight: 0,
      createdAt: 456,
      source: {
        type: 'system-event',
        eventName: 'personal-world-project-completed',
        eventId: 'project-1',
      },
      metadata: { personalWorldProjectId: 'project-1' },
    })
    expect(await backend.list({ scope, limit: 500 })).toHaveLength(1)
  })

  it('isolates application experiences by owner and character scope', async () => {
    const backend = createBackend()
    const otherScope = { ownerId: scope.ownerId, characterId: 'character-b' }
    const input = {
      idempotencyKey: 'personal-world-project-completed:project-1',
      content: 'Creative project completed: "Rain sketches"',
      occurredAt: 456,
      source: {
        eventName: 'personal-world-project-completed',
        eventId: 'project-1',
      },
    }

    await backend.rememberExperience({ ...input, scope })
    await backend.rememberExperience({ ...input, scope: otherScope })

    expect(await backend.list({ scope, limit: 500 })).toHaveLength(1)
    expect(await backend.list({ scope: otherScope, limit: 500 })).toHaveLength(1)
  })

  it('applies only bounded explicit annotations and keeps repeated updates idempotent', async () => {
    const backend = createBackend()
    const record = await backend.rememberTurn(makeTurn('annotated'))
    currentTime += 1
    const annotated = await backend.annotate({
      scope,
      id: record!.id,
      annotation: { kind: 'emotion', importance: 2, emotionalWeight: -2 },
    })
    currentTime += 1
    const repeated = await backend.annotate({
      scope,
      id: record!.id,
      annotation: { kind: 'emotion', importance: 1, emotionalWeight: -1 },
    })

    expect(annotated).toMatchObject({
      kind: 'emotion',
      importance: 1,
      emotionalWeight: -1,
      updatedAt: 60 * DAY_MS + 1,
    })
    expect(repeated).toBe(annotated)
    expect(repeated.content).toBe(record?.content)
    expect(repeated.source).toEqual(record?.source)
  })

  it('rejects annotation through another memory scope', async () => {
    const backend = createBackend()
    const record = await backend.rememberTurn(makeTurn('scoped'))

    await expect(backend.annotate({
      scope: { ownerId: scope.ownerId, characterId: 'other' },
      id: record!.id,
      annotation: { kind: 'milestone' },
    })).rejects.toThrow('not found in this scope')
  })

  it('returns only lexically relevant memories and excludes current source messages', async () => {
    const backend = createBackend()
    await repository.save(makeRecord({
      id: 'kyoto',
      content: 'User: We visited Kyoto in spring.\nAIRI: The cherry blossoms were memorable.',
      createdAt: currentTime,
      messageIds: ['user-kyoto', 'assistant-kyoto'],
    }))
    await repository.save(makeRecord({
      id: 'unrelated',
      content: 'User: The build is green.\nAIRI: All checks passed.',
      createdAt: currentTime,
    }))

    const recalled = await backend.recall({
      scope,
      sessionId: 'session-current',
      query: 'What happened in Kyoto?',
      limit: 5,
      excludeSourceMessageIds: ['assistant-current'],
    })

    expect(recalled.map(match => match.record.id)).toEqual(['kyoto'])
    expect(recalled[0]?.record.accessCount).toBe(1)
    expect(recalled[0]?.record.lastAccessedAt).toBe(currentTime)

    const excluded = await backend.recall({
      scope,
      sessionId: 'session-current',
      query: 'Kyoto',
      limit: 5,
      excludeSourceMessageIds: ['assistant-kyoto'],
    })
    expect(excluded).toEqual([])
  })

  it('does not recall memories from conversational stop words alone', async () => {
    const backend = createBackend()
    await repository.save(makeRecord({
      id: 'generic-overlap',
      content: 'User: We walked in the park.\nAIRI: It was quiet.',
      createdAt: currentTime,
    }))

    const recalled = await backend.recall({
      scope,
      sessionId: 'session-current',
      query: 'What did we do in it?',
      limit: 5,
    })

    expect(recalled).toEqual([])
  })

  it('uses a real 30-day half-life and ranks fresh equal matches first', async () => {
    const backend = createBackend()
    await repository.save(makeRecord({
      id: 'old',
      content: 'Kyoto memory',
      createdAt: currentTime - 30 * DAY_MS,
    }))
    await repository.save(makeRecord({
      id: 'fresh',
      content: 'Kyoto memory',
      createdAt: currentTime,
    }))

    const recalled = await backend.recall({ scope, sessionId: 'session-current', query: 'Kyoto', limit: 5 })

    expect(recalled.map(match => match.record.id)).toEqual(['fresh', 'old'])
    expect(recalled[0]?.score).toBeCloseTo(1, 8)
    expect(recalled[1]?.score).toBeCloseTo(0.95, 8)
  })

  it('uses record identity as the final stable ordering tie-breaker', async () => {
    const backend = createBackend()
    await repository.save(makeRecord({ id: 'b', content: 'Kyoto memory', createdAt: currentTime }))
    await repository.save(makeRecord({ id: 'a', content: 'Kyoto memory', createdAt: currentTime }))

    const recalled = await backend.recall({ scope, sessionId: 'session-current', query: 'Kyoto', limit: 5 })

    expect(recalled.map(match => match.record.id)).toEqual(['a', 'b'])
  })

  it('uses explicit importance and emotional intensity only to reorder relevant matches', async () => {
    const backend = createBackend()
    await repository.save({
      ...makeRecord({ id: 'ordinary', content: 'Kyoto memory', createdAt: currentTime }),
      importance: 0.5,
      emotionalWeight: 0,
    })
    await repository.save({
      ...makeRecord({ id: 'significant', content: 'Kyoto memory', createdAt: currentTime }),
      importance: 1,
      emotionalWeight: -1,
    })
    await repository.save({
      ...makeRecord({ id: 'unrelated-important', content: 'A quiet coding afternoon', createdAt: currentTime }),
      importance: 1,
      emotionalWeight: 1,
    })

    const recalled = await backend.recall({ scope, sessionId: 'session-current', query: 'Kyoto', limit: 5 })

    expect(recalled.map(match => match.record.id)).toEqual(['significant', 'ordinary'])
  })

  it('preserves annotation and access metadata when annotation overlaps recall', async () => {
    const backend = createBackend()
    await repository.save(makeRecord({ id: 'shared', content: 'Kyoto memory', createdAt: currentTime }))

    await Promise.all([
      backend.annotate({ scope, id: 'shared', annotation: { kind: 'milestone', importance: 1 } }),
      backend.recall({ scope, sessionId: 'session-current', query: 'Kyoto', limit: 5 }),
    ])

    expect(await repository.get(scope, 'shared')).toMatchObject({
      kind: 'milestone',
      importance: 1,
      accessCount: 1,
      lastAccessedAt: currentTime,
    })
  })

  it('prunes the oldest records after the configured per-scope retention bound', async () => {
    const backend = createBackend(2)

    currentTime = 1
    await backend.rememberTurn(makeTurn('one'))
    currentTime = 2
    await backend.rememberTurn(makeTurn('two'))
    currentTime = 3
    await backend.rememberTurn(makeTurn('three'))

    const records = await backend.list({ scope, limit: 500 })
    expect(records.map(record => record.id)).toEqual(['turn:turn-three', 'turn:turn-two'])
  })

  it('retains milestone evidence while pruning older conversation records', async () => {
    const backend = createBackend(2)
    await backend.rememberMilestone({
      idempotencyKey: 'companion-growth-stage:child',
      scope,
      content: 'Relationship milestone: AIRI reached the child growth stage.',
      occurredAt: 1,
      source: { eventName: 'companion-growth-stage', eventId: 'child' },
    })

    currentTime = 2
    await backend.rememberTurn(makeTurn('two'))
    currentTime = 3
    await backend.rememberTurn(makeTurn('three'))

    const records = await backend.list({ scope, limit: 500 })
    expect(records.map(record => record.id)).toEqual([
      'turn:turn-three',
      'milestone:companion-growth-stage:child',
    ])
  })
})
