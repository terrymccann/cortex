# Phase 3.0 Slice C: State and Frame Composition

Status: implemented on `phase-3.0-core-generalization`

## Runtime state envelope

`AgentRuntimeEnvelope` now identifies the state Cortex itself must coordinate:

- agent identity, state version, and simulation timestamp;
- cognitive resolution and budgets;
- grounded perceptions;
- the current committed decision and hard follow-up obligations;
- action expectations; and
- namespaced, versioned state-slice envelopes.

Each state slice stores its schema version with its value. Its registered
reducer declares the exact namespaced modules allowed to write it. Agent
registration and patch application fail on unknown slices, incompatible schema
versions, invalid values, or undeclared writers.

The fixed optional fields on `AgentState` are explicitly deprecated during this
slice. Slice D removes them as their implementations move into standard packs;
they are not part of `AgentRuntimeEnvelope`.

## Cognitive frame v2

The provider-visible frame contains only the mandatory runtime envelope plus an
ordered `sections` array. Every section has a namespaced ID, schema version,
validated value, and deterministic item/byte budget supplied by its owning
pack contributor.

Frame construction:

1. validates contributor metadata;
2. evaluates and validates each contributed value;
3. enforces item and serialized-byte budgets;
4. sorts sections by ID;
5. rejects duplicate section IDs; and
6. hashes the frame schema, manifest fingerprint, envelope, and sections.

Pack registration validates contributor ownership and declared state-slice
reads. Pack compatibility fingerprints now cover slice schemas, writer sets,
module read/write sets, and frame-section compatibility metadata.

## Replay compatibility

New accepted-decision records identify the frame schema, manifest fingerprint,
and ordered section schema metadata in addition to the canonical frame hash.
Replay rejects any mismatch before commitment.

The sandbox's explicit v1 adapter reconstructs the legacy fixed-field frame and
legacy unversioned slice shape only while reading the frozen v1 fixture. It does
not rewrite or reinterpret that fixture as v2.

## Slice D boundary

Slice C established public composition and enforcement contracts. Slice D
subsequently removed the deprecated fields and extracted traits, beliefs,
memory, social state, goals, planning, and conversation into standard packs.
