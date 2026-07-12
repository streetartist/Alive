import { describe, expect, it } from 'vitest'

import { resolveCompanionLifeBehavior, resolveCompanionLifeMessageCue } from './life'

function timestamp(hour: number) {
  return new Date(2026, 0, 2, hour, 0, 0, 0).getTime()
}

function input(overrides: Partial<Parameters<typeof resolveCompanionLifeBehavior>[0]> = {}) {
  const now = timestamp(12)
  return {
    now,
    lastActiveAt: now,
    enabled: true,
    morningGreetingEnabled: true,
    busy: false,
    visible: true,
    personality: { curiosity: 0.5, creativity: 0.5 },
    previous: {},
    ...overrides,
  }
}

describe('companion desktop life', () => {
  it('greets once during the local morning window while the user is active', () => {
    const now = timestamp(8)
    const first = resolveCompanionLifeBehavior(input({ now, lastActiveAt: now }))

    expect(first?.kind).toBe('morning-greeting')
    expect(resolveCompanionLifeBehavior(input({
      now: now + 60_000,
      lastActiveAt: now + 60_000,
      previous: first?.nextState ?? {},
    }))).toBeUndefined()
  })

  it('selects an idle behavior from the stronger evolving trait', () => {
    const now = timestamp(12)
    const decision = resolveCompanionLifeBehavior(input({
      now,
      lastActiveAt: now - 31 * 60_000,
      personality: { curiosity: 0.3, creativity: 0.8 },
    }))

    expect(decision?.kind).toBe('idle-creative')
  })

  it('settles into rest after extended inactivity', () => {
    const now = timestamp(12)
    expect(resolveCompanionLifeBehavior(input({
      now,
      lastActiveAt: now - 121 * 60_000,
    }))?.kind).toBe('resting')
  })

  it('shares a cooldown across repeated idle behaviors', () => {
    const now = timestamp(12)
    expect(resolveCompanionLifeBehavior(input({
      now,
      lastActiveAt: now - 60 * 60_000,
      previous: { lastBehaviorAt: now - 10 * 60_000 },
    }))).toBeUndefined()
  })

  it('never runs while disabled, busy, or hidden', () => {
    const now = timestamp(12)
    const idle = { now, lastActiveAt: now - 60 * 60_000 }

    expect(resolveCompanionLifeBehavior(input({ ...idle, enabled: false }))).toBeUndefined()
    expect(resolveCompanionLifeBehavior(input({ ...idle, busy: true }))).toBeUndefined()
    expect(resolveCompanionLifeBehavior(input({ ...idle, visible: false }))).toBeUndefined()
  })

  it('does not personalize without durable context or while resting', () => {
    expect(resolveCompanionLifeMessageCue('morning-greeting', { interests: [], learned: [] }, timestamp(8))).toBeUndefined()
    expect(resolveCompanionLifeMessageCue('resting', { interests: ['painting'], learned: ['May enjoy music'] }, timestamp(8))).toBeUndefined()
  })

  it('normalizes whitespace and bounds cues to 120 Unicode code points', () => {
    const cue = resolveCompanionLifeMessageCue('morning-greeting', {
      interests: [`  ${'画'.repeat(125)}\n\t `],
      learned: [],
    }, timestamp(8))

    expect(cue?.type).toBe('interest')
    expect(Array.from(cue?.value ?? '')).toHaveLength(120)
    expect(cue?.value).toBe('画'.repeat(120))
  })

  it('rotates durable cues deterministically by local date', () => {
    const context = { interests: ['painting', 'music'], learned: [] }
    const firstDay = timestamp(8)
    const sameDay = firstDay + 60 * 60_000
    const nextDay = new Date(2026, 0, 3, 8).getTime()

    expect(resolveCompanionLifeMessageCue('idle-curious', context, sameDay)).toEqual(
      resolveCompanionLifeMessageCue('idle-curious', context, firstDay),
    )
    expect(resolveCompanionLifeMessageCue('idle-curious', context, nextDay)).not.toEqual(
      resolveCompanionLifeMessageCue('idle-curious', context, firstDay),
    )
  })

  it('keeps reflection observations explicitly tentative', () => {
    expect(resolveCompanionLifeMessageCue('idle-creative', {
      interests: [],
      learned: ['  User may enjoy   painting  '],
    }, timestamp(8))).toEqual({
      type: 'tentative-observation',
      value: 'User may enjoy painting',
    })
  })
})
