import type { MemoryScope } from '@proj-airi/memory'

import { describe, expect, it } from 'vitest'

import {
  createPersonalWorldEntry,
  createPersonalWorldProject,
  PERSONAL_WORLD_PROJECT_CREATION_LIMIT,
  updatePersonalWorldProject,
} from './world'

const scope = { ownerId: 'owner', characterId: 'character' } satisfies MemoryScope

describe('personal world entries', () => {
  it('normalizes user-authored text while preserving its ownership and source', () => {
    expect(createPersonalWorldEntry({
      id: ' journal-1 ',
      scope,
      kind: 'journal',
      title: ' A quiet day ',
      content: ' We watched the rain. ',
      source: { type: 'manual' },
      now: 10,
    })).toEqual({
      schemaVersion: 1,
      id: 'journal-1',
      scope,
      kind: 'journal',
      title: 'A quiet day',
      content: 'We watched the rain.',
      source: { type: 'manual' },
      createdAt: 10,
      updatedAt: 10,
    })
  })

  it('rejects empty durable content', () => {
    expect(() => createPersonalWorldEntry({
      id: 'journal-1',
      scope,
      kind: 'journal',
      title: '',
      content: '   ',
      source: { type: 'manual' },
    })).toThrow('require content')
  })
})

describe('personal world projects', () => {
  it('creates a normalized project that references existing creations', () => {
    const project = createPersonalWorldProject({
      id: ' project-1 ',
      scope,
      title: ' Flower study ',
      description: ' Paint a small series together. ',
      creationIds: [' creation-1 ', 'creation-1', ''],
      now: 10,
    })

    expect(project).toEqual({
      schemaVersion: 1,
      id: 'project-1',
      scope,
      title: 'Flower study',
      description: 'Paint a small series together.',
      status: 'idea',
      creationIds: ['creation-1'],
      createdAt: 10,
      updatedAt: 10,
    })
  })

  it('preserves the first completion time and clears it when work resumes', () => {
    const project = createPersonalWorldProject({
      id: 'project-1',
      scope,
      title: 'Flower study',
      description: 'Paint a small series together.',
      now: 10,
    })
    const completed = updatePersonalWorldProject(project, { status: 'completed' }, 20)
    const edited = updatePersonalWorldProject(completed, { title: 'Flower studies' }, 30)
    const resumed = updatePersonalWorldProject(edited, { status: 'active' }, 40)

    expect(completed.completedAt).toBe(20)
    expect(edited.completedAt).toBe(20)
    expect(resumed.completedAt).toBeUndefined()
  })

  it('returns the existing project for an idempotent update', () => {
    const project = createPersonalWorldProject({
      id: 'project-1',
      scope,
      title: 'Flower study',
      description: 'Paint a small series together.',
      creationIds: ['creation-1'],
      now: 10,
    })

    expect(updatePersonalWorldProject(project, {
      title: ' Flower study ',
      description: ' Paint a small series together. ',
      status: 'idea',
      creationIds: ['creation-1', 'creation-1'],
    }, 20)).toBe(project)
  })

  it('rejects projects that exceed the bounded creation-reference limit', () => {
    expect(() => createPersonalWorldProject({
      id: 'project-1',
      scope,
      title: 'Large collection',
      description: 'Keep the project references bounded.',
      creationIds: Array.from({ length: PERSONAL_WORLD_PROJECT_CREATION_LIMIT + 1 }, (_, index) => `creation-${index}`),
    })).toThrow(`at most ${PERSONAL_WORLD_PROJECT_CREATION_LIMIT}`)
  })
})
