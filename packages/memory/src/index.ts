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
export type MemoryKind = 'fact' | 'experience' | 'emotion' | 'milestone'

/** Explicit user/application annotation applied without model inference. */
export interface MemoryAnnotation {
  kind?: MemoryKind
  /** Relative significance from 0 (ordinary) to 1 (essential). */
  importance?: number
  /** Emotional valence from -1 (strongly negative) to 1 (strongly positive). */
  emotionalWeight?: number
}

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

/** Provenance for a deterministic application-owned event. */
export interface MemorySystemEventSource {
  type: 'system-event'
  /** Stable event schema understood by the application that created it. */
  eventName: string
  /** Idempotent identifier within that event schema and memory scope. */
  eventId: string
}

/**
 * Source records supported by the AIRI-facing memory boundary.
 */
export type MemorySource = MemoryChatTurnSource | MemoryCharacterBookSource | MemorySystemEventSource

/**
 * Backend-neutral memory record returned to runtimes and management surfaces.
 */
export interface MemoryRecord {
  /** AIRI contract schema used to interpret this record. */
  schemaVersion: 2
  /** Backend-stable record identifier. */
  id: string
  /** Ownership boundary that every read and mutation must enforce. */
  scope: MemoryScope
  /** Human-facing evidence category, changed only through explicit annotation. */
  kind: MemoryKind
  /** Relative significance used as a bounded recall-ranking signal. */
  importance: number
  /** Explicit emotional valence; zero means neutral or not yet annotated. */
  emotionalWeight: number
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

/** Application-owned milestone offered to a durable memory backend. */
export interface MemoryMilestoneInput {
  /** Opaque key that makes repeated ingestion of the same milestone idempotent. */
  idempotencyKey: string
  /** User-and-character ownership boundary for the durable record. */
  scope: MemoryScope
  /** Canonical plain-text evidence retained for model context and export. */
  content: string
  /** Unix epoch timestamp when the milestone occurred or was first captured. */
  occurredAt: number
  /** Traceable system event that produced the milestone. */
  source: Omit<MemorySystemEventSource, 'type'>
  /** Optional structured data used only by application-owned presentation. */
  metadata?: Record<string, unknown>
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

/** Scoped request to explicitly annotate one durable memory. */
export interface MemoryAnnotationRequest extends MemoryRecordRequest {
  annotation: MemoryAnnotation
}

function normalizedUnitValue(value: number, minimum: number, maximum: number, field: string) {
  if (!Number.isFinite(value))
    throw new Error(`Memory ${field} must be a finite number.`)
  return Math.min(maximum, Math.max(minimum, value))
}

/** Applies bounded explicit annotations and preserves idempotency for unchanged values. */
export function annotateMemoryRecord(
  record: MemoryRecord,
  annotation: MemoryAnnotation,
  now = Date.now(),
): MemoryRecord {
  const kind = annotation.kind ?? record.kind
  const importance = annotation.importance === undefined
    ? record.importance
    : normalizedUnitValue(annotation.importance, 0, 1, 'importance')
  const emotionalWeight = annotation.emotionalWeight === undefined
    ? record.emotionalWeight
    : normalizedUnitValue(annotation.emotionalWeight, -1, 1, 'emotional weight')
  if (
    kind === record.kind
    && importance === record.importance
    && emotionalWeight === record.emotionalWeight
  ) {
    return record
  }

  return {
    ...record,
    kind,
    importance,
    emotionalWeight,
    updatedAt: now,
  }
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
  /** Stores one deterministic application milestone without inferring user significance. */
  rememberMilestone: (input: MemoryMilestoneInput) => Promise<MemoryRecord>
  /** Retrieves structured evidence without rendering provider prompt text. */
  recall: (input: MemoryRecallRequest) => Promise<MemoryRecallMatch[]>
  /** Lists records for human review in backend-defined stable order. */
  list: (input: MemoryListRequest) => Promise<MemoryRecord[]>
  /** Applies explicit category and affect annotations to one scoped record. */
  annotate: (input: MemoryAnnotationRequest) => Promise<MemoryRecord>
  /** Removes one record only when it belongs to the supplied scope. */
  remove: (input: MemoryRecordRequest) => Promise<void>
  /** Removes every record belonging to the supplied scope. */
  clear: (scope: MemoryScope) => Promise<void>
  /** Removes every record belonging to an account or local profile. */
  clearOwner: (ownerId: string) => Promise<void>
}
