# Phase 3.0: Core Generalization and Extension Contracts

Status: proposed implementation specification  
Scope: Cortex runtime, contracts, SDK, and reference-world conformance  
Depends on: [technical-design.md](technical-design.md),
[product-architecture.md](product-architecture.md)  
Precedes:
[Phase 3.1: Bounded Emergent Autonomy](phase-3.1-bounded-emergent-autonomy.md)

## 1. Purpose

Phase 3.0 removes genre assumptions from Cortex's public contracts before
agent-proposed goals and multi-step plans depend on them. It turns the existing
extension mechanisms into enforceable product contracts without weakening the
authoritative-simulation boundary.

The phase answers one question:

> Can an unfamiliar game describe its entities, constraints, cognitive state,
> and frame content without changing the Cortex runtime?

The answer must be demonstrated by conformance tests, not inferred from type
names or documentation.

## 2. Motivation

The current runtime contains no reconnaissance-drone or Marcus/Elena behavior,
and the drone reference world already runs outside Cortex core. The remaining
constraints are structural rather than scenario-specific:

- `EntityRef.kind` is a closed four-value union;
- relationship dimensions are fixed fields on core agent state;
- relationships and `socialSignals` are fixed cognitive-frame sections;
- world assumptions are a closed union understood by core contracts;
- memory, social cognition, goals, planning, and communication are not yet
  consistently separated into runtime-owned and pack-owned state; and
- pack compatibility and schema validation are intentionally minimal.

These constraints are acceptable for the grounded vertical slice, but they are
the wrong foundation for a general-purpose autonomy layer.

## 3. Outcome

At the end of Phase 3.0:

1. Cortex production packages contain no game, genre, or optional social
   vocabulary.
2. Games register versioned domain types, capabilities, constraints, and effect
   schemas through the SDK.
3. Optional cognition is installed through versioned packs with exclusive state
   ownership.
4. Controller frames have a small mandatory envelope and deterministic,
   schema-declared extension sections.
5. The social and drone reference worlds retain equivalent behavior without
   kernel branches.
6. A third reference domain exercises types and constraints that do not fit the
   original closed contracts.
7. Record/replay detects all relevant domain, pack, schema, and frame-version
   differences before committing a replayed decision.

## 4. Non-goals

Phase 3.0 does not include:

- model-proposed goals;
- multi-step plan generation or replanning;
- unrestricted model-authored actions, entities, or world facts;
- PostgreSQL, vector retrieval, Redis, BullMQ, or hosted workers;
- a visual pack or domain editor;
- a public marketplace or remote pack loading;
- full multi-agent social simulation;
- balancing behavioral preferences; or
- abstractions without a requirement from one of the three reference domains.

Phase 3.0 is complete when the contracts are sufficiently general for Phase
3.1. It is not an attempt to design every future genre in advance.

## 5. Architectural rules

The existing runtime invariants remain mandatory. Phase 3.0 adds the following
rules:

1. **Core owns lifecycle, not genre semantics.** Versioning, scheduling,
   cancellation, commitment, validation, execution coordination, and replay
   remain core responsibilities.
2. **Domains describe world vocabulary.** Entity types, perceptions,
   capabilities, constraints, resources, motivations, and effects are
   namespaced, versioned domain definitions.
3. **Packs own optional cognitive state.** A pack may read shared snapshots but
   may mutate only its declared state slices.
4. **Registration precedes use.** Public identifiers and schemas must be
   registered before events, intentions, frames, or actions reference them.
5. **Opaque does not mean unvalidated.** Cortex need not understand a domain
   payload, but the owning schema validator must.
6. **Extension order is deterministic.** Registration, frame construction,
   hashing, patch reduction, and replay cannot depend on object insertion order
   or plugin discovery timing.
7. **Compatibility is explicit.** Schema or semantic changes require a new
   version and, where supported, an explicit migration.
8. **Models remain bounded.** Generalized contracts do not permit models to
   register capabilities or bypass the authoritative world adapter.

## 6. Target product boundary

```text
Authoritative game / simulation
  world adapter + domain manifest + legal capabilities + evidence
                              |
Domain registry and Cortex SDK
  schema validation + compatibility + conformance
                              |
Installed cognitive packs
  owned state + modules + frame sections + policies
                              |
Cortex runtime
  lifecycle + decisions + commitments + grounding + replay
                              |
Optional provider adapters
```

Dependencies point downward in this diagram. The runtime must never import an
installed domain, pack, game adapter, or provider.

## 7. Universal runtime state

The runtime-owned agent envelope is limited to state required to coordinate
cognition safely:

- agent ID, state version, and simulation update time;
- minimal registration metadata;
- cognitive resolution and budgets;
- grounded observation references required for versioning;
- current committed decision;
- active decision obligations;
- pending action expectations; and
- namespaced pack-owned state slices.

The following concepts become optional pack-owned state rather than mandatory
top-level arrays:

- personality or trait models;
- beliefs;
- episodic and semantic memory;
- relationships, reputation, and emotion;
- goals;
- plans; and
- conversation history.

Core may expose common read-only interfaces for these concepts, but an agent is
not required to install every corresponding pack. A compatibility layer may
project legacy state fields while existing scenarios migrate; new code must use
owned slices.

### 7.1 State ownership

Every writable slice declares:

- a namespaced slice ID;
- an owning pack ID and pack version;
- a state schema ID and version;
- an initial-state factory;
- a validator;
- a reducer;
- supported migration sources; and
- the module IDs allowed to emit patches for that slice.

Registration fails if two packs claim the same slice or if a module attempts to
declare write access to a slice it does not own. Runtime patch application
revalidates ownership; SDK validation alone is insufficient.

Cross-pack behavior uses typed events, read-only capability interfaces, or
explicitly declared dependencies. Direct writes into another pack's slice are
forbidden.

## 8. Domain-defined entities

Replace the closed `agent | location | organization | object` entity kind with
a registered namespaced entity type.

The target contract is conceptually:

```ts
interface EntityRef {
  readonly type: NamespacedId;
  readonly id: EntityId;
}
```

Domains define each entity type and its property schema. `cortex:agent` may be a
standard type for cognitive actors, but domains may define types such as
`colony:facility`, `colony:resource-node`, or `ecology:hazard` without modifying
the contracts package.

Entity IDs remain opaque. An entity reference does not prove existence,
visibility, accessibility, or any other fact; the world adapter remains
authoritative.

### 8.1 Legacy mapping

Schema-v1 references have an explicit built-in migration mapping:

| Legacy kind | Versioned type |
| --- | --- |
| `agent` | `cortex:agent` |
| `location` | `cortex:location` |
| `organization` | `cortex:organization` |
| `object` | `cortex:object` |

The migration utility creates a new artifact and never rewrites a frozen replay
bundle or baseline in place.

## 9. Extensible constraints and effects

World preconditions and expected effects become references to registered,
versioned definitions rather than closed core unions.

Conceptually:

```ts
interface DomainConstraint {
  readonly definitionId: NamespacedId;
  readonly version: number;
  readonly subject?: EntityRef;
  readonly parameters: Readonly<Record<string, unknown>>;
}

interface EffectExpectation {
  readonly definitionId: NamespacedId;
  readonly version: number;
  readonly subject: EntityRef;
  readonly parameters: Readonly<Record<string, unknown>>;
  readonly deadline: SimTime;
}
```

Requirements:

- manifests provide the parameter schema for every constraint and effect;
- registration validates all referenced definitions;
- the world adapter validates constraints immediately before action submission;
- authoritative observations provide the evidence used to resolve effects;
- effect matching is deterministic and registered by the domain adapter;
- replay uses recorded observations and the same matcher version; and
- unknown definition IDs or versions fail closed.

Cortex may ship standard definitions such as `cortex:entity-exists`, but their
use is optional. A game can express domain rules without adding a new union
member to a core package.

## 10. Composable cognitive frames

The controller frame is divided into a mandatory runtime envelope and optional
pack sections.

The mandatory envelope contains only:

- frame schema version and frame ID;
- agent ID and state version;
- situation ID and simulation-provided description;
- legal feasible intentions;
- enforced decision obligations; and
- a deterministic manifest fingerprint.

Optional content is contributed as namespaced sections:

```ts
interface CognitiveFrameSection {
  readonly id: NamespacedId;
  readonly schemaVersion: number;
  readonly value: unknown;
}
```

Examples include `cortex-memory:relevant`, `cortex-social:relationships`, and
`drone-recon:mission-state`. These are examples of installed extensions, not
reserved frame fields.

Every frame contributor declares:

- owning pack;
- section ID and schema version;
- output validator;
- deterministic ordering and selection rules;
- maximum item or byte budget; and
- pack dependencies required to read other sections or slices.

Frame construction sorts sections by ID before canonical serialization.
Duplicate section IDs, invalid output, undeclared dependencies, or budget
violations fail before a provider call. Frame hashes cover the envelope,
sections, their schema versions, and the manifest fingerprint.

Untrusted simulation strings remain data and never become provider
instructions.

## 11. Domain manifests

The existing `GameDomain` contract is extended to register:

- entity types;
- perceptions and observed-fact predicates;
- actions and skills;
- constraints and effects;
- resources;
- motivations and motivational affordances;
- optional relationship dimensions; and
- all associated schema versions.

Manifest registration must validate:

- namespaced identifiers and uniqueness;
- referenced definitions and target types;
- JSON schemas at external boundaries;
- semantic version and Cortex SDK compatibility;
- capability-to-skill mappings;
- constraint and effect references;
- deterministic matcher registrations; and
- immutable manifest fingerprints.

A manifest is immutable after registration. Changing the meaning of a public
identifier requires a new definition version or domain version.

## 12. Pack contracts

A pack is a versioned bundle of optional cognitive functionality. Phase 3.0
strengthens `CortexPack` so it declares:

- pack ID, semantic version, and compatible SDK range;
- dependencies with valid semantic-version ranges;
- owned state slices and migration versions;
- module declarations and their read/write sets;
- cognitive-frame contributors and section schemas;
- optional fallback, routing, and tier policies;
- referenced domain capabilities;
- deterministic conformance fixtures; and
- a content fingerprint used by replay.

Registration rejects:

- missing, cyclic, or incompatible dependencies;
- duplicate state, module, or frame-section ownership;
- undeclared cross-pack reads or writes;
- unknown domain references;
- invalid initial state or contributor output;
- incompatible schema migrations; and
- ambiguous public identifiers.

Pack discovery and remote code loading remain outside this phase. Tests and
applications register trusted pack objects directly.

## 13. Standard pack extraction

Existing optional cognition is migrated behind the same public pack contracts
available to third parties. The initial target packages are:

- `cortex:beliefs`;
- `cortex:memory`;
- `cortex:social`;
- `cortex:traits`;
- `cortex:conversation`; and
- placeholders or interfaces for `cortex:goals` and `cortex:planning` that Phase
  3.1 can extend.

Phase 3.0 need not make every pack feature-complete. It must prove that standard
packs have no privileged mutation path or private registration mechanism.

The social pack owns relationship dimensions, relationship state, social
inference modules, and social frame sections. A drone or logistics agent that
does not install the pack carries none of that state or frame content.

## 14. Replay and compatibility

Accepted-decision records and replay bundles are extended with:

- runtime and controller-frame schema versions;
- domain manifest ID, version, and fingerprint;
- installed pack IDs, versions, and fingerprints;
- state-slice schema versions;
- frame-section IDs and schema versions;
- constraint/effect matcher versions; and
- the existing canonical frame hash and accepted output.

Replay requires an exact compatible environment. Any mismatch fails loudly
before decision commitment and never invokes a provider or fallback.

Existing schema-v1 bundles are immutable. Phase 3.0 must provide one of these
explicit paths:

1. replay through a supported v1 compatibility runtime; or
2. run a deterministic migration command that writes a separate v2 bundle and
   a migration report.

Silent coercion is prohibited. Historical evaluation baselines remain frozen.
If the generalized frame changes provider-visible inputs, a new named baseline
is created rather than altering the Phase 2 baseline.

## 15. Reference-domain conformance

Genre independence is tested across three reference domains.

### 15.1 Social and political reference

The Marcus/Elena scenario verifies optional social state, private perception,
relationship updates, communication, false belief, and decision-conditioned
actions. Scenario fixtures may exist in tests or a reference-world package;
production runtime source cannot import them.

### 15.2 Reconnaissance drone reference

The sibling `cortex-sandbox-sim` repository continues to verify non-social
mission state, telemetry, domain fallback, obligations, action outcomes, live
reasoning, and deterministic replay.

### 15.3 Colony logistics reference

A minimal colony-logistics domain is added outside Cortex core specifically to
exercise generalized contracts. It defines custom entity types such as:

- `colony:facility`;
- `colony:resource-node`;
- `colony:transport-route`; and
- `colony:hazard`.

One agent must choose among legal resource allocation, repair, rerouting, and
shutdown intentions using domain-defined resource constraints and effects. The
domain installs no social pack. Its purpose is contract conformance, not a rich
game or a new LLM-quality benchmark.

Adding this domain may add manifests, a pack, skills, a world adapter, and
fixtures. It may not change the Cortex runtime.

## 16. Delivery slices

Implementation proceeds in bounded slices. Each slice must keep the repository
buildable and preserve deterministic tests.

### Slice A — Contract inventory and schema versioning

- classify every public field as runtime-, domain-, or pack-owned;
- assign v2 schema identifiers;
- introduce manifest and pack fingerprints; and
- add compile-time and runtime tests that prohibit unregistered references.

The schema-v1 ownership baseline is maintained in
[phase-3.0-contract-inventory.md](phase-3.0-contract-inventory.md).

### Slice B — Entity, constraint, and effect generalization

- add namespaced entity types;
- add registered constraint and effect definitions;
- update world and skill ports;
- add legacy entity-reference migration; and
- migrate fake-world tests.

### Slice C — State and frame composition

- reduce the universal agent envelope;
- enforce state-slice ownership at patch application;
- replace fixed optional frame fields with validated sections; and
- preserve deterministic canonical hashing.

### Slice D — Standard pack extraction

- move social state and inference into `cortex:social`;
- migrate other optional state through public pack contracts;
- strengthen dependency and schema validation; and
- demonstrate agents with different installed pack sets.

### Slice E — Reference-world migration and conformance

- migrate social and drone references;
- add colony-logistics conformance;
- update replay bundle metadata;
- provide the v1 compatibility or migration path; and
- run the complete offline verification matrix.

## 17. Acceptance criteria

Phase 3.0 is complete only when all of the following pass:

1. Production runtime, contracts, and provider packages contain no reference
   world identifiers or optional social dimensions.
2. Entity types, constraints, effects, actions, perceptions, and frame sections
   are registered, namespaced, and versioned.
3. Unknown or incompatible identifiers fail at registration or boundary
   validation, never during arbitrary reducer execution.
4. Runtime patch application rejects cross-pack state mutation even if a caller
   bypasses SDK registration helpers.
5. Agents can run without memory, social, conversation, goal, or planning packs.
6. Frame construction is deterministic across pack registration order.
7. Social, drone, and colony-logistics scenarios complete decision, execution,
   authoritative outcome observation, and replay without kernel branches.
8. The drone live trajectory still creates and satisfies its withdrawal
   obligation; its replay makes zero model calls and exactly matches the newly
   versioned recorded state.
9. A deliberately altered manifest, pack version, frame section, constraint
   matcher, or decision order causes replay to fail before commitment.
10. Schema-v1 replay artifacts remain immutable and have a tested explicit
    compatibility or migration path.
11. Frozen Phase 2 evaluation artifacts are not rewritten. Any provider-visible
    v2 change receives a separately named baseline.
12. No Phase 3.1 goal or plan API requires a scenario-specific type or field.

## 18. Required test matrix

The automated suite includes:

- domain manifest success and failure fixtures;
- semantic-version dependency, missing dependency, and cycle tests;
- state ownership and unauthorized patch tests;
- frame-section collision, schema, budget, and ordering tests;
- entity, constraint, and effect schema validation tests;
- legacy-reference migration fixtures;
- social agent with the social pack installed;
- non-social agents without social state or frame sections;
- all three reference-domain vertical slices;
- accepted-decision record/replay for all three domains;
- replay mismatch tests for every new compatibility fingerprint; and
- a production-source scan for forbidden reference-domain identifiers.

Live provider calls are not part of the default test suite. One bounded drone
smoke run may establish a new v2 replay artifact after all offline conformance
tests pass.

## 19. Exit artifacts

Phase 3.0 produces:

- v2 contracts and migration notes;
- strengthened domain and pack registries;
- standard optional packs using public extension points;
- a conformance kit reusable by game adapters and third-party packs;
- migrated social and drone reference worlds;
- the colony-logistics conformance world;
- versioned replay compatibility tests and tooling; and
- an architecture decision record listing any intentionally retained core
  concepts.

[Phase 3.1](phase-3.1-bounded-emergent-autonomy.md) begins only after these
artifacts and all acceptance criteria are complete. It may then add validated
agent-proposed goals and bounded multi-step planning using registered domain
capabilities rather than expanding the core schema again.
