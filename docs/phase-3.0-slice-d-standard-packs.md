# Phase 3.0 Slice D: Standard Pack Extraction

Status: implemented on `phase-3.0-core-generalization`

## Outcome

Optional cognition no longer has fixed fields or specialized mutation variants
inside the Cortex runtime. The runtime agent state contains only lifecycle
coordination data and versioned pack slices. The runtime patch union retains
perception, action-awareness, decision, and generic state-slice patches.

The `@cortex/standard-packs` workspace package supplies these trusted optional
packs through the public SDK contracts:

| Pack | Owned slice | Frame section(s) |
| --- | --- | --- |
| `cortex:traits` | `cortex-traits:state` | `cortex-traits:profile` |
| `cortex:beliefs` | `cortex-beliefs:state` | `cortex-beliefs:relevant` |
| `cortex:memory` | `cortex-memory:state` | `cortex-memory:relevant` |
| `cortex:social` | `cortex-social:state` | relationships and signals |
| `cortex:goals` | `cortex-goals:state` | `cortex-goals:active` |
| `cortex:planning` | `cortex-planning:state` | `cortex-planning:active` |
| `cortex:conversation` | `cortex-conversation:state` | recent communication |

Social relationship dimensions and their reducer are owned entirely by the
social pack. Memory ingestion, social inference, and communication rendering
write ordinary generic state-slice operations under declared namespaced module
IDs. They receive no private mutation path.

## Installation semantics

Applications explicitly register only the packs an agent archetype uses. Pack
registration supplies reducers, initial slice envelopes, frame contributors,
and compatibility fingerprints. An uninstalled pack contributes no state and
no provider-visible frame section.

The drone reference pack depends on `cortex:traits` for its agent profile. It
does not install social, memory, conversation, belief, goal, or planning packs,
and tests assert that those slices are absent from its final state.

The social reference scenario installs memory, social, goals, and conversation
through `PackRegistry`, exercising the same ownership checks as a third-party
pack.

## Provider and baseline policy

Provider instructions are pack-neutral and refer only to registered sections
that are present. The provider-visible prompt identity is
`cortex-controller-v3`. The frozen Phase 2 baseline remains unchanged; the
sandbox carries a separate Phase 3 candidate manifest that requires a new live
matrix run before promotion.
