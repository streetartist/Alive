# Alive Persistent Companion Architecture

Alive extends AIRI's existing character, chat, voice, and desktop surfaces with
device-local continuity. The model remains replaceable: durable relationship
state and memories, rather than one provider response, define the companion.

## System boundaries

```text
Electron / stage-web renderer
  -> stage-ui stores and composables
    -> companion services and repositories
      -> companion-core policies
      -> memory package
      -> IndexedDB through the existing unstorage adapter

Electron main process
  -> loopback-only control API
    -> typed Eventa bridge
      -> renderer companion and memory stores
```

| Boundary | Owns | Does not own |
| --- | --- | --- |
| `packages/companion-core` | Identity profile contracts, relationship growth, mood, reflection policy, Desktop Life decisions, Personal World entry contracts | Vue, Electron, databases, model calls |
| `packages/memory` | Scoped durable memories and retrieval | Relationship policy or UI |
| `packages/stage-ui` | Persistence adapters, model-backed reflection, Pinia state, schedulers, prompt integration | Electron HTTP routing |
| `packages/stage-pages` | Companion Growth and Personal World settings surfaces | Domain policy |
| `apps/stage-tamagotchi` | Desktop presentation, Eventa bridge, local control API | Companion state mutation rules |

## Ownership and isolation

Every durable companion record is scoped by both `ownerId` and `characterId`.
Changing the signed-in user or active character therefore changes the companion
scope instead of reusing another relationship's state.

The AIRI Card remains authored character configuration. Companion identity,
learned observations, relationship state, and mood are stored separately and
must never overwrite the card.

## Durable interaction flow

1. Chat generation completes with non-empty assistant text.
2. The memory runtime persists the completed turn.
3. Only after persistence succeeds, the durable-turn callback records the
   interaction growth event using the memory record ID.
4. The next prompt receives bounded relationship state and separately retrieved
   memories.
5. A reflection runs after the interaction checkpoint, or once on the next
   local day when earlier interactions remain unreviewed.
6. A new reflection is copied idempotently into Personal World journal and
   learned entries.

Memory decline, persistence failure, empty responses, streaming text, and
Desktop Life presentation never count as durable interactions.

Durable memory records distinguish facts, experiences, emotional memories, and
milestones. New conversation turns start as neutral experiences. Importance and
emotional weight are explicit bounded annotations, never automatic claims made
from the text. Marking a Favorite Moment explicitly promotes that memory to an
important milestone.

## Growth and feedback

Growth is auditable and idempotent:

```text
durable interaction + explicit important memory + message-bound feedback = growth
```

- Interaction event: `interaction:<memoryRecordId>`
- Important memory event: `important-memory:<memoryId>`
- Feedback event: `feedback:<sessionId>:<assistantMessageId>`

Negative feedback may reduce relationship and mood, but it does not erase
accumulated growth or reverse a growth stage. Important memories are explicit
Favorite Moments; the application does not silently infer importance.

When a relationship reaches Child, Companion, or Independent for the first
time, the memory backend records a deterministic `system-event` milestone for
that owner and character. The milestone category is application-owned evidence
of the stage transition; its importance remains `0.5` and emotional weight `0`
so the application does not infer user significance or affect. Stable IDs make
retries and cross-window refreshes idempotent.

## Reflection semantics

Reflections contain tentative observations and bounded personality changes.
They are not authoritative user facts and prompts label them accordingly.

Automatic reflection has two triggers:

- an interaction-count checkpoint; and
- next-day catch-up when at least one durable interaction from an earlier local
  day remains unreflected.

The latest durable interaction and reflection timestamps provide daily
idempotency, so the scheduler requires no separate timestamp or schema
migration. Model failure falls back to a local checkpoint, preserving progress
without inventing observations.

## Desktop Life

Desktop Life is transient presentation. Morning, curious, creative, and resting
behaviors may change animation, expression, or the stage bubble, but they do not
create chat messages or durable memories. Busy, hidden, disabled, and cooldown
states suppress autonomous behavior.

The main desktop stage keeps a compact, read-only companion status beside the
controls island. It shows the current growth stage and relationship score, with
resolved mood details in its tooltip, and opens Companion Growth directly. The
status reuses the scoped companion store and does not create a second source of
relationship state.

Personalized Desktop Life copy only uses identity interests explicitly saved by
the user and observations from the latest durable reflection. Reflection-derived
cues remain typed and worded as tentative, values are bounded before display,
and selection rotates deterministically by local date. When no eligible cue
exists, presentation falls back to the generic localized message. Resting stays
generic so inactivity is never treated as evidence about the user.

Each permitted Desktop Life behavior also receives a lazily resolved snapshot
of the persisted companion mood. Happy, curious, and calm states select among
the existing safe Happy, Curious, and Neutral motions, while the behavior still
owns scheduling and copy. Low or tense states use quiet thinking or neutral
presentation instead of sadness or anger, preventing explicit feedback from
turning into emotional pressure on the user. Mood never bypasses busy,
visibility, or cooldown policy.

Tentative reflection observations can become durable identity interests or
values only through an explicit Personal World confirmation action. Confirmation
copies the normalized observation into the scoped identity profile without
rewriting or deleting the original reflection entry, preserving its provenance.

## Personal World

Personal World currently provides:

- manually written and reflection-generated journal entries;
- tentative lessons captured from reflections;
- explicit favorite memories;
- creative projects with idea, active, and completed lifecycle states;
- existing image-journal creations; and
- a room backed by the character's existing background selection.

Images remain owned by the existing background journal. Personal World stores
references and text metadata instead of copying image blobs.

Creative projects reference existing journal/selfie creation IDs. The same
creation may belong to several projects. Deleting a project never deletes its
creations, while a missing creation remains as a visible removable reference
instead of silently rewriting project history.

The first transition of a creative project into `completed` records one
idempotent application `experience` in long-term memory. The record preserves
the project title, description, and stable project ID with neutral importance
and emotional weight. Memory-disabled completion proceeds without writing or
later backfilling the experience, respecting the user's memory policy.

## Local API

The Electron control API exposes authenticated, loopback-only companion reads
and reflection execution:

- `GET /v1/alive/profile`
- `GET /v1/alive/state`
- `GET /v1/alive/memory`
- `POST /v1/alive/reflection`

See `docs/ai/context/stage-tamagotchi-control-api.md` for transport and security
details.

## Privacy and future storage work

Current companion data is local-first and uses the repository's existing
IndexedDB/unstorage persistence. It is not yet encrypted at rest. Adding
encryption requires an explicit key lifecycle, migration, recovery, export, and
data-deletion design; it must not be represented by obfuscation or a hard-coded
application key.

Future storage work should preserve these rules:

1. Cloud model providers receive only the bounded context required for the
   active request.
2. Provider changes do not change durable identity or relationship ownership.
3. Semantic/vector indexes are derived data and can be rebuilt from the local
   source records.
4. Background-journal creations and user-uploaded rooms are scoped by owner and
   character; application-owned builtins remain global. The v1-to-v2 migration
   preserves localforage keys and asset IDs. Because v1 stored no owner, legacy
   user assets are assigned to the owner and active character that first opens
   the v2 store.

## Verification expectations

Changes to this system should be verified at the narrowest owning boundary,
then through the desktop composition:

1. companion-core unit tests for deterministic policy;
2. repository/service tests for migration and idempotency;
3. stage-ui and stage-pages type checks;
4. stage-tamagotchi type check and production build; and
5. a real Electron runtime check that preserves existing local state.
