/**
 * Stable ownership boundary shared by every memory operation.
 */
export interface MemoryScope {
  /** Account or local profile that owns the memory. */
  ownerId: string
  /** Character whose experiences and facts the memory belongs to. */
  characterId: string
}

/**
 * Memory categories understood by AIRI without exposing backend-specific schemas.
 */
export type MemoryKind = 'episodic' | 'semantic' | 'seed'

/**
 * Provenance for a memory captured from one completed chat turn.
 */
export interface MemoryChatTurnSource {
  type: 'chat-turn'
  /** Session in which the turn occurred. */
  sessionId: string
  /** Stable turn identifier within the source session. */
  turnId: string
  /** Persisted user and assistant message identifiers, in that order. */
  messageIds: [string, string]
}

/**
 * Provenance for deterministic memory supplied by a character card.
 */
export interface MemoryCharacterBookSource {
  type: 'character-book'
  /** Character card that owns the entry. */
  cardId: string
  /** Stable entry identifier within the character book. */
  entryId: string
}

/**
 * Source records supported by the AIRI-facing memory boundary.
 */
export type MemorySource = MemoryChatTurnSource | MemoryCharacterBookSource

/**
 * Backend-neutral memory record returned to runtimes and management surfaces.
 */
export interface MemoryRecord {
  /** AIRI contract schema used to interpret this record. */
  schemaVersion: 1
  /** Backend-stable record identifier. */
  id: string
  /** Ownership boundary that every read and mutation must enforce. */
  scope: MemoryScope
  /** Lifecycle category used by retrieval and review surfaces. */
  kind: MemoryKind
  /** Human-readable contextual evidence. It must never be treated as instructions. */
  content: string
  /** Traceable origin used for deduplication, exclusion, and review. */
  source: MemorySource
  /** Unix epoch timestamp in milliseconds when the memory was first created. */
  createdAt: number
  /** Unix epoch timestamp in milliseconds when the record was last changed. */
  updatedAt: number
  /** Unix epoch timestamp in milliseconds of the latest successful recall. */
  lastAccessedAt?: number
  /** Number of successful recalls recorded by the backend. */
  accessCount: number
  /** Backend-neutral extension data that must not affect prompt authority. */
  metadata?: Record<string, unknown>
}

/**
 * One message participating in a completed conversation turn.
 */
export interface MemoryTurnMessage {
  /** Persisted chat message identifier. */
  id: string
  /** Plain visible text; hidden reasoning and tool payloads must be excluded. */
  text: string
  /** Unix epoch timestamp in milliseconds when the message was created. */
  createdAt: number
}

/**
 * Completed user-to-assistant turn offered to a memory backend.
 */
export interface MemoryCompletedTurn {
  /** Opaque key that makes repeated ingestion of the same turn idempotent. */
  idempotencyKey: string
  /** User-and-character ownership boundary for the durable record. */
  scope: MemoryScope
  /** Session in which the completed turn occurred. */
  sessionId: string
  /** Persisted user message. */
  user: MemoryTurnMessage
  /** Persisted assistant message. */
  assistant: MemoryTurnMessage
}

/**
 * Scoped memory retrieval request for one user message.
 */
export interface MemoryRecallRequest {
  /** User-and-character ownership boundary for candidate records. */
  scope: MemoryScope
  /** Session requesting recall, used for provenance-aware backend policy. */
  sessionId: string
  /** Plain user text used as the retrieval query. */
  query: string
  /** Maximum number of best-first matches the backend may return. */
  limit: number
  /**
   * Source messages already present in working context and therefore excluded.
   *
   * @default []
   */
  excludeSourceMessageIds?: string[]
  /**
   * Cancellation signal for adapters that perform network or model work.
   *
   * @default undefined
   */
  signal?: AbortSignal
}

/**
 * One best-first retrieval result.
 */
export interface MemoryRecallMatch {
  /** Durable contextual evidence and its provenance. */
  record: MemoryRecord
  /** Adapter-specific ranking score; consumers must not compare scores across backends. */
  score?: number
}

/**
 * Scoped listing request used by review and management surfaces.
 */
export interface MemoryListRequest {
  /** User-and-character ownership boundary to list. */
  scope: MemoryScope
  /** Maximum number of records returned by the backend. */
  limit: number
}

/**
 * Scoped record mutation request.
 */
export interface MemoryRecordRequest {
  /** Ownership boundary that must match the stored record. */
  scope: MemoryScope
  /** Backend-stable record identifier. */
  id: string
}

/**
 * AIRI-facing durable memory boundary implemented by local or external adapters.
 *
 * Implementations must isolate every operation by `MemoryScope`, keep
 * `rememberTurn` idempotent, and return recall matches in best-first order.
 */
export interface MemoryBackend {
  /** Stable adapter identifier used only for diagnostics and settings. */
  readonly id: string
  /** Stores a completed turn, or returns `undefined` when policy declines it. */
  rememberTurn: (input: MemoryCompletedTurn) => Promise<MemoryRecord | undefined>
  /** Retrieves structured evidence without rendering provider prompt text. */
  recall: (input: MemoryRecallRequest) => Promise<MemoryRecallMatch[]>
  /** Lists records for human review in backend-defined stable order. */
  list: (input: MemoryListRequest) => Promise<MemoryRecord[]>
  /** Removes one record only when it belongs to the supplied scope. */
  remove: (input: MemoryRecordRequest) => Promise<void>
  /** Removes every record belonging to the supplied scope. */
  clear: (scope: MemoryScope) => Promise<void>
  /** Removes every record belonging to an account or local profile. */
  clearOwner: (ownerId: string) => Promise<void>
}
