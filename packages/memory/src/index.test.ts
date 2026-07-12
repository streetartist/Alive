import type { MemoryRecord } from './index'

import { describe, expect, it } from 'vitest'

import { annotateMemoryRecord } from './index'

const record: MemoryRecord = {
  schemaVersion: 2,
  id: 'memory-1',
  scope: { ownerId: 'owner', characterId: 'character' },
  kind: 'experience',
  importance: 0.5,
  emotionalWeight: 0,
  content: 'We watched the rain together.',
  source: {
    type: 'chat-turn',
    sessionId: 'session',
    turnId: 'turn',
    messageIds: ['user', 'assistant'],
  },
  createdAt: 1,
  updatedAt: 1,
  accessCount: 0,
}

describe('memory annotation', () => {
  it('clamps explicit values without changing immutable evidence fields', () => {
    expect(annotateMemoryRecord(record, {
      kind: 'emotion',
      importance: 2,
      emotionalWeight: -2,
    }, 2)).toEqual({
      ...record,
      kind: 'emotion',
      importance: 1,
      emotionalWeight: -1,
      updatedAt: 2,
    })
  })

  it('returns the original record when normalized annotations are unchanged', () => {
    expect(annotateMemoryRecord(record, {
      kind: 'experience',
      importance: 0.5,
      emotionalWeight: 0,
    }, 2)).toBe(record)
  })

  it('rejects non-finite annotation values', () => {
    expect(() => annotateMemoryRecord(record, { importance: Number.NaN })).toThrow('finite number')
  })
})
