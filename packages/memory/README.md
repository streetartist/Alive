# `@proj-airi/memory`

Backend-neutral contracts for connecting AIRI runtimes to durable memory.

## What it owns

- Stable user-and-character memory scope
- Conversation-turn ingestion envelopes
- Deterministic application milestone ingestion with system-event provenance
- Structured recall results with provenance
- Explicit fact, experience, emotion, and milestone annotations
- Bounded importance and emotional-weight metadata
- Review and deletion operations required by memory management surfaces

## How to use it

Implement `MemoryBackend` in a storage adapter, then pass only the operations a
runtime needs. Core agent code consumes structured records and owns prompt
formatting, so a backend cannot inject arbitrary prompt instructions.

All backend operations must enforce the supplied scope. `rememberTurn` and
`rememberMilestone` must be idempotent for the supplied `idempotencyKey`, and
`recall` must return matches in best-first order.

Conversation turns begin as neutral `experience` records. Category, importance,
and emotional weight change only through explicit annotation; adapters must not
present model inference as durable fact. Importance and emotional intensity may
slightly reorder already relevant candidates, but they never make unrelated
records eligible for recall.

Application milestones represent deterministic system events rather than model
inference. They may set `kind: 'milestone'`, but must keep importance and
emotional weight neutral unless a user explicitly annotates them later.

## When not to use it

This package is not a database driver, embedding pipeline, consolidation engine,
or prompt renderer. Local IndexedDB, pgvector, and external `plast-mem` adapters
belong outside this package. Current-run task state also belongs to its owning
runtime rather than durable character memory.
