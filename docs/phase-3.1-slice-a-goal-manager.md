# Phase 3.1 Slice A: Goal Contracts and Deterministic Manager

Status: implemented on `phase-3.1-bounded-emergent-autonomy`

## Outcome

Slice A introduces bounded goal formation without changing the Cortex runtime
agent envelope or immediate Controller. Goal vocabulary is registered by game
domains. Goal state, reasoning boundaries, policy, validation, and lifecycle
are owned by the optional `cortex:goals` standard pack.

Agents that do not install the goals pack retain no goal state or goal frame
section and make no goal-reasoner calls.

## Registered definitions

Each domain goal definition is namespaced and versioned and declares:

- a JSON parameter schema and entity-typed parameters;
- admissible registered motivations;
- registered success and failure effect conditions;
- relevant namespaced capability references;
- a default horizon; and
- registered conflict tags.

Adding goal definitions promotes the current domain manifest identity to
`cortex-domain-manifest-v2`. This intentionally changes domain and pack
fingerprints so Phase 3.0 replay artifacts cannot be silently reused against a
different goal vocabulary.

Domain registration rejects unknown motivations, effects, effect versions,
entity types, conflict tags, invalid condition parameters, empty capability
reachability, and malformed object parameter schemas. Capability references are
validated as namespaced semantic IDs in Slice A; their full registry and
compatibility validation belongs to Slice B.

## Opportunity gate

The deterministic gate prevents goal reasoning when:

- the agent is tier zero or has no goals pack;
- its reasoning, token, concurrency, or simulation-time budget is exhausted;
- the trigger is ungrounded or already deterministically resolved;
- the same trigger and state version were already considered;
- active-goal capacity or cooldown policy blocks formation; or
- configured obligation policy defers reflection.

No wall-clock-only trigger exists. Invalid semantic output is not retried for
the same trigger and state version.

## Goal Manager boundary

`GoalReasoner` is provider-neutral and separate from `ControllerReasoner`.
Its output cannot contain actions, mechanics, plan steps, policies, or world
mutations. The manager treats proposals as untrusted structured data and checks:

- exact output fields and namespaced IDs;
- registered definition identity and version;
- parameter schema and observer-visible entity grounding;
- observer-visible evidence events;
- admissible motivations and configured horizons;
- semantic capability reachability;
- protected policy tags and active-goal conflicts;
- unresolved-obligation policy; and
- state freshness and cancellation before commit.

The formation frame can reuse installed, validated cognitive-frame
contributors, so traits, memories, beliefs, relationships, or domain context
are present only when their packs are installed. They remain bounded and
schema-checked by the existing frame-section contracts.

Valid priorities are clamped only within designer policy. Equivalent active
goals merge evidence and priority rather than creating duplicates. The manager
does not rewrite a proposal into a different goal.

Every activated, merged, rejected, deferred, stale, or cancelled formation
attempt can emit a structured diagnostic with the trigger, state version,
outcome, stable reason, and proposed definition ID. Diagnostics do not contain
hidden reasoning or mutate goal state.

## Lifecycle

The goals state slice is schema version 2. Its reducer accepts only:

```text
proposal -> active
active -> suspended | satisfied | abandoned | failed
suspended -> active | abandoned | failed
```

Terminal goals cannot return to active. Satisfaction and failure require both
observer-visible authoritative evidence and a registered deterministic matcher
for the definition's success or failure condition. An arbitrary visible event
cannot complete a goal. Abandonment is rejected while an unresolved decision
obligation exists.

## Reference proof

The sandbox drone domain now registers reporting, preservation, and mission
completion goal definitions. Its Slice A scenario observes a confirmed emitter
and activates `drone:report-intelligence` from a grounded proposal. A paired
adversarial case proves that simulation text cannot invent a safety-bypassing
goal definition.

## Verification boundary

Slice A deterministically covers activation, merge, rejection, grounding,
conflicts, stale state, cancellation, gate suppression, suspension, resumption,
authoritative completion, and terminal-state rejection. Plan construction,
step coordination, full trajectory replay, inspection, and behavioral quality
evaluation remain assigned to Slices B through E.

The completed default matrix makes no provider calls: Cortex passes typecheck,
build, and 79 tests across 14 files; the sandbox passes typecheck, build, and 36
tests across 8 files.
