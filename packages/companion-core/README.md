# `@proj-airi/companion-core`

Pure companion-domain policies for persistent identity, relationship growth,
and reflection checkpoints.

## What it owns

- Scoped companion state shared by one user and one character
- Deterministic relationship and growth-stage transitions
- Bounded personality evolution applied during reflection
- Interaction-checkpoint and next-day reflection policy
- Deterministic Desktop Life behavior and bounded personalization-cue policy
- Personal World text entries and creative-project lifecycle contracts
- Safe prompt context that never invents shared memories

## How to use it

Persist `CompanionState` in a runtime-specific adapter. Call
`advanceCompanionState` after a completed interaction, then render the latest
state with `formatCompanionContextText` when composing the next system prompt.

## When not to use it

This package does not own databases, Vue state, LLM calls, chat history, or
semantic memory retrieval. Those responsibilities remain in their runtime and
`@proj-airi/memory` boundaries.

See [`docs/architecture/alive-companion.md`](../../docs/architecture/alive-companion.md)
for the cross-layer runtime, persistence, privacy, and verification model.
