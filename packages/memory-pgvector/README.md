# `@proj-airi/memory-pgvector`

Experimental process scaffold for a future pgvector-backed AIRI memory adapter.

## Current status

This package is not connected to chat, does not create a database schema, and
does not store or recall memories. Running its `dev` script only starts the
extension peer lifecycle. AIRI's working built-in backend currently lives in
`@proj-airi/stage-ui` and implements the contracts from `@proj-airi/memory`.

## Future use

A pgvector implementation should implement `MemoryBackend` from
`@proj-airi/memory` and keep every operation scoped by owner and character. It
must return structured records; prompt rendering and authority rules remain in
`@proj-airi/core-agent`.

If durable consolidation and semantic retrieval are delegated to `plast-mem`,
this package should become a transport adapter or be removed rather than grow a
second competing memory domain.

## When not to use it

Do not use this package for production persistence, local desktop memory, or
current-task execution state until it has a real backend and protocol surface.
