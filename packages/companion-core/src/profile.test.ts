import type { MemoryScope } from '@proj-airi/memory'

import { describe, expect, it } from 'vitest'

import {
  createCompanionIdentityProfile,
  createCompanionIdentityPromotionUpdate,
  isCompanionIdentityObservationConfirmed,
  normalizeCompanionIdentityProfileItem,
  updateCompanionIdentityProfile,
} from './profile'

const scope = { ownerId: 'owner', characterId: 'character' } satisfies MemoryScope

describe('companion identity profile', () => {
  it('creates an empty profile with an ISO relationship birthday', () => {
    expect(createCompanionIdentityProfile(scope, 1_000, 2_000)).toEqual({
      schemaVersion: 1,
      scope,
      birthday: '1970-01-01T00:00:01.000Z',
      interests: [],
      values: [],
      updatedAt: 2_000,
    })
  })

  it('normalizes bounded interests and values without changing the birthday', () => {
    const profile = createCompanionIdentityProfile(scope, 1_000, 2_000)
    const interests = [
      ' drawing ',
      '',
      'drawing',
      ...Array.from({ length: 25 }, (_, index) => `interest-${index}`),
    ]

    const updated = updateCompanionIdentityProfile(profile, {
      interests,
      values: [' kindness ', 'kindness', 'curiosity'],
    }, 3_000)

    expect(updated.birthday).toBe(profile.birthday)
    expect(updated.interests).toHaveLength(20)
    expect(updated.interests.slice(0, 3)).toEqual(['drawing', 'interest-0', 'interest-1'])
    expect(updated.values).toEqual(['kindness', 'curiosity'])
    expect(updated.updatedAt).toBe(3_000)
  })

  it('rejects an invalid relationship birthday', () => {
    expect(() => createCompanionIdentityProfile(scope, 'not-a-date')).toThrow('valid birthday')
  })

  it('normalizes one item consistently for explicit confirmation checks', () => {
    expect(normalizeCompanionIdentityProfileItem(`  ${'a'.repeat(110)}  `)).toBe('a'.repeat(100))
    expect(normalizeCompanionIdentityProfileItem('   ')).toBe('')
  })

  it('builds an update only for the explicitly selected identity field', () => {
    const profile = updateCompanionIdentityProfile(
      createCompanionIdentityProfile(scope, 1_000, 2_000),
      { interests: ['painting'], values: ['curiosity'] },
      3_000,
    )

    expect(createCompanionIdentityPromotionUpdate(profile, 'interest', '  calm mornings  ')).toEqual({
      interests: ['painting', 'calm mornings'],
    })
    expect(createCompanionIdentityPromotionUpdate(profile, 'value', '  patience  ')).toEqual({
      values: ['curiosity', 'patience'],
    })
  })

  it('does not create duplicate or empty confirmation updates', () => {
    const profile = updateCompanionIdentityProfile(
      createCompanionIdentityProfile(scope, 1_000, 2_000),
      { interests: ['painting'], values: ['curiosity'] },
      3_000,
    )

    expect(createCompanionIdentityPromotionUpdate(profile, 'interest', ' painting ')).toBeUndefined()
    expect(createCompanionIdentityPromotionUpdate(profile, 'value', ' curiosity ')).toBeUndefined()
    expect(createCompanionIdentityPromotionUpdate(profile, 'interest', '   ')).toBeUndefined()
    expect(isCompanionIdentityObservationConfirmed(profile, 'interest', ' painting ')).toBe(true)
    expect(isCompanionIdentityObservationConfirmed(profile, 'value', 'painting')).toBe(false)
  })
})
