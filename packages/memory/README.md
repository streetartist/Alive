# `@proj-airi/memory`

Backend-neutral contracts for connecting AIRI runtimes to durable memory.

## What it owns

- Stable user-and-character memory scope
- Conversation-turn ingestion envelopes
- Structured recall results with provenance
- Review and deletion operations required by memory management surfaces

## How to use it

Implement `MemoryBackend` in a storage adapter, then pass only the operations a
runtime needs. Core agent code consumes structured records and owns prompt
formatting, so a backend cannot inject arbitrary prompt instructions.

All backend operations must enforce the supplied scope. `rememberTurn` must be
idempotent for the supplied `idempotencyKey`, and `recall` must return matches in
best-first order.

## When not to use it

This package is not a database driver, embedding pipeline, consolidation engine,
or prompt renderer. Local IndexedDB, pgvector, and external `plast-mem` adapters
belong outside this package. Current-run task state also belongs to its owning
runtime rather than durable character memory.
