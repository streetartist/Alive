import type { MemoryScope } from '@proj-airi/memory'

/** Durable self-description that evolves independently from the authored AIRI Card. */
export interface CompanionIdentityProfile {
  schemaVersion: 1
  scope: MemoryScope
  /** ISO timestamp marking when this companion relationship began. */
  birthday: string
  interests: string[]
  values: string[]
  /** Unix epoch timestamp in milliseconds when editable profile fields last changed. */
  updatedAt: number
}

/** Editable fields accepted by identity-profile updates. */
export interface CompanionIdentityProfileUpdate {
  interests?: readonly string[]
  values?: readonly string[]
}

/** Identity field selected by the user for one tentative reflection observation. */
export type CompanionIdentityPromotionKind = 'interest' | 'value'

const MAX_PROFILE_ITEMS = 20
const MAX_PROFILE_ITEM_LENGTH = 100

/**
 * Normalizes one identity-profile item before comparison or persistence.
 *
 * Before:
 * - `"  watercolor painting  "`
 *
 * After:
 * - `"watercolor painting"`
 */
export function normalizeCompanionIdentityProfileItem(item: string) {
  return item.trim().slice(0, MAX_PROFILE_ITEM_LENGTH)
}

/** Returns whether an observation has already been explicitly confirmed in one identity field. */
export function isCompanionIdentityObservationConfirmed(
  profile: CompanionIdentityProfile,
  kind: CompanionIdentityPromotionKind,
  observation: string,
) {
  const normalized = normalizeCompanionIdentityProfileItem(observation)
  if (!normalized)
    return false

  return kind === 'interest'
    ? profile.interests.includes(normalized)
    : profile.values.includes(normalized)
}

/**
 * Builds the smallest identity update for an explicitly confirmed observation.
 * The tentative reflection entry remains unchanged as provenance.
 */
export function createCompanionIdentityPromotionUpdate(
  profile: CompanionIdentityProfile,
  kind: CompanionIdentityPromotionKind,
  observation: string,
): CompanionIdentityProfileUpdate | undefined {
  const normalized = normalizeCompanionIdentityProfileItem(observation)
  if (!normalized || isCompanionIdentityObservationConfirmed(profile, kind, normalized))
    return undefined

  return kind === 'interest'
    ? { interests: [...profile.interests, normalized] }
    : { values: [...profile.values, normalized] }
}

/**
 * Normalizes identity-profile list items.
 *
 * Before:
 * - `[" drawing ", "", "drawing"]`
 *
 * After:
 * - `["drawing"]`
 */
function normalizeProfileItems(items: readonly string[]) {
  return Array.from(new Set(
    items
      .map(normalizeCompanionIdentityProfileItem)
      .filter(Boolean),
  )).slice(0, MAX_PROFILE_ITEMS)
}

function normalizeBirthday(birthday: number | string) {
  const date = new Date(birthday)
  if (!Number.isFinite(date.getTime()))
    throw new Error('Companion identity profiles require a valid birthday.')
  return date.toISOString()
}

/** Creates an empty identity profile for one persisted companion relationship. */
export function createCompanionIdentityProfile(
  scope: MemoryScope,
  birthday: number | string,
  now = Date.now(),
): CompanionIdentityProfile {
  return {
    schemaVersion: 1,
    scope: { ...scope },
    birthday: normalizeBirthday(birthday),
    interests: [],
    values: [],
    updatedAt: now,
  }
}

/** Updates editable profile fields while preserving relationship ownership and birthday. */
export function updateCompanionIdentityProfile(
  profile: CompanionIdentityProfile,
  update: CompanionIdentityProfileUpdate,
  now = Date.now(),
): CompanionIdentityProfile {
  return {
    ...profile,
    interests: update.interests === undefined
      ? profile.interests
      : normalizeProfileItems(update.interests),
    values: update.values === undefined
      ? profile.values
      : normalizeProfileItems(update.values),
    updatedAt: now,
  }
}
