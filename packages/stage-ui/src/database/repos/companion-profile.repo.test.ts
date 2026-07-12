import type { CompanionIdentityProfile } from '@proj-airi/companion-core'
import type { MemoryScope } from '@proj-airi/memory'

import memoryDriver from 'unstorage/drivers/memory'

import { createCompanionIdentityProfile } from '@proj-airi/companion-core'
import { createStorage } from 'unstorage'
import { beforeEach, describe, expect, it } from 'vitest'

import { createCompanionProfileRepository } from './companion-profile.repo'

const ownerACharacterA = { ownerId: 'owner-a', characterId: 'character-a' } satisfies MemoryScope
const ownerACharacterB = { ownerId: 'owner-a', characterId: 'character-b' } satisfies MemoryScope
const ownerBCharacterA = { ownerId: 'owner-b', characterId: 'character-a' } satisfies MemoryScope

function makeProfile(scope: MemoryScope, interest: string): CompanionIdentityProfile {
  return {
    ...createCompanionIdentityProfile(scope, 1, 2),
    interests: [interest],
  }
}

describe('companion profile repository', () => {
  let repository: ReturnType<typeof createCompanionProfileRepository>

  beforeEach(() => {
    repository = createCompanionProfileRepository(createStorage({ driver: memoryDriver() }))
  })

  it('isolates profiles by owner and character', async () => {
    await repository.save(makeProfile(ownerACharacterA, 'drawing'))
    await repository.save(makeProfile(ownerACharacterB, 'music'))
    await repository.save(makeProfile(ownerBCharacterA, 'walking'))

    expect((await repository.get(ownerACharacterA))?.interests).toEqual(['drawing'])
    expect((await repository.get(ownerACharacterB))?.interests).toEqual(['music'])
    expect((await repository.get(ownerBCharacterA))?.interests).toEqual(['walking'])
  })

  it('clears one scope without removing sibling profiles', async () => {
    await repository.save(makeProfile(ownerACharacterA, 'drawing'))
    await repository.save(makeProfile(ownerACharacterB, 'music'))

    await repository.clear(ownerACharacterA)

    expect(await repository.get(ownerACharacterA)).toBeNull()
    expect(await repository.get(ownerACharacterB)).not.toBeNull()
  })

  it('clears profiles for one owner only', async () => {
    await repository.save(makeProfile(ownerACharacterA, 'drawing'))
    await repository.save(makeProfile(ownerACharacterB, 'music'))
    await repository.save(makeProfile(ownerBCharacterA, 'walking'))

    await repository.clearOwner('owner-a')

    expect(await repository.get(ownerACharacterA)).toBeNull()
    expect(await repository.get(ownerACharacterB)).toBeNull()
    expect(await repository.get(ownerBCharacterA)).not.toBeNull()
  })
})
