import type { MemoryRecord, MemoryScope } from '@proj-airi/memory'

import { createPersonalWorldProject } from '@proj-airi/companion-core'
import { describe, expect, it } from 'vitest'

import {
  createPersonalWorldProjectCompletionExperience,
  personalWorldProjectExperienceFromMemory,
} from './personalWorldProjectExperience'

const scope = { ownerId: 'owner', characterId: 'character' } satisfies MemoryScope

describe('personal world project experience', () => {
  it('creates neutral application evidence from one completed project', () => {
    const project = createPersonalWorldProject({
      id: 'project-1',
      scope,
      title: 'Rain sketches',
      description: 'Create a small visual series from rainy evenings.',
      status: 'completed',
      now: 30,
    })

    expect(createPersonalWorldProjectCompletionExperience(project)).toEqual({
      idempotencyKey: 'personal-world-project-completed:project-1',
      scope,
      content: [
        'Creative project completed: "Rain sketches"',
        'Project description: "Create a small visual series from rainy evenings."',
      ].join('\n'),
      occurredAt: 30,
      source: {
        eventName: 'personal-world-project-completed',
        eventId: 'project-1',
      },
      metadata: {
        personalWorldProjectId: 'project-1',
        personalWorldProjectTitle: 'Rain sketches',
        personalWorldProjectDescription: 'Create a small visual series from rainy evenings.',
      },
    })
  })

  it('rejects projects that have not reached the completed lifecycle state', () => {
    const project = createPersonalWorldProject({
      id: 'project-1',
      scope,
      title: 'Rain sketches',
      description: 'Create a small visual series from rainy evenings.',
      status: 'active',
      now: 30,
    })

    expect(() => createPersonalWorldProjectCompletionExperience(project))
      .toThrow('Only completed Personal World projects can become experiences')
  })

  it('uses only validated source and metadata for localized presentation', () => {
    const record = {
      schemaVersion: 2,
      id: 'experience:personal-world-project-completed:project-1',
      scope,
      kind: 'experience',
      importance: 0.5,
      emotionalWeight: 0,
      content: 'Canonical evidence',
      source: {
        type: 'system-event',
        eventName: 'personal-world-project-completed',
        eventId: 'project-1',
      },
      createdAt: 30,
      updatedAt: 30,
      accessCount: 0,
      metadata: {
        personalWorldProjectId: 'project-1',
        personalWorldProjectTitle: 'Rain sketches',
        personalWorldProjectDescription: 'Rainy evenings.',
      },
    } satisfies MemoryRecord

    expect(personalWorldProjectExperienceFromMemory(record)).toEqual({
      projectId: 'project-1',
      title: 'Rain sketches',
      description: 'Rainy evenings.',
    })
    expect(personalWorldProjectExperienceFromMemory({
      ...record,
      kind: 'milestone',
    })).toEqual({
      projectId: 'project-1',
      title: 'Rain sketches',
      description: 'Rainy evenings.',
    })
    expect(personalWorldProjectExperienceFromMemory({
      ...record,
      source: { ...record.source, eventId: 'other-project' },
    })).toBeUndefined()
  })
})
