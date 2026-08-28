# Phase 3.0 Contract Ownership Inventory

Status: schema-v1 baseline inventory  
Parent specification:
[Phase 3.0: Core Generalization and Extension Contracts](phase-3.0-core-generalization.md)

## Purpose

This document freezes the ownership classification of the public schema-v1
contracts before Phase 3.0 makes breaking changes. It is an implementation
inventory, not the target architecture. The target disposition column controls
the v2 migration.

Ownership categories are:

- **runtime:** required for safe cognitive lifecycle coordination;
- **domain:** vocabulary or semantics supplied by the authoritative game; and
- **pack:** optional cognitive state or behavior owned by an installed pack.

## Contracts package

| Schema-v1 contract | Current owner | Target owner or disposition |
| --- | --- | --- |
| Branded IDs and `SimTime` | runtime | retain; add missing plan and schema brands only when required |
| `EntityRef.kind` closed union | contracts | replace with domain-registered namespaced entity type |
| `ObservedFact.predicate` and value | domain-shaped | reference a registered observed-fact definition and schema |
| `WorldEvent` envelope and causality | runtime | retain envelope; domain owns event type and payload schema |
| `PerceptibleWorldEvent` projection | runtime/world boundary | retain observer projection; domain owns channel extensions and fact schemas |
| `WorldAssumption` closed union | contracts | replace with registered domain constraint definition |
| `ExpectedEffect` predicate/value match | contracts | replace with registered effect definition and deterministic matcher version |
| `ActionCommand` lifecycle fields | runtime | retain; domain owns capability, arguments, constraints, and effects |
| `FeasibleIntention` | world/runtime boundary | retain bounded choice envelope; reference registered capabilities and schemas |
| Follow-up obligations | runtime | retain as hard commitment constraints |
| `CortexWorldPort` | runtime/world boundary | retain authority direction; generalize referenced domain types |

## Runtime agent state

| Schema-v1 field | Current owner | Target owner or disposition |
| --- | --- | --- |
| `id`, `version`, `updatedAt` | runtime | retain |
| minimal registration identity | runtime metadata | retain only non-cognitive registration/display metadata |
| `resolution` and cognitive budgets | runtime | retain |
| grounded observation/version references | runtime | retain the minimum required for grounding and stale checks |
| `personality` | runtime top level | move to `cortex:traits` pack slice |
| `beliefs` | runtime top level | move to `cortex:beliefs` pack slice |
| `relationships` | runtime top level | move to `cortex:social` pack slice |
| `memories` | runtime top level | move to `cortex:memory` pack slice |
| `goals` | runtime top level | move to `cortex:goals` pack slice |
| `activePlan` | runtime top level | move to `cortex:planning` pack slice |
| `lastCommunication` | runtime top level | move to `cortex:conversation` pack slice |
| `currentDecision` | runtime | retain |
| `activeObligations` | runtime | retain |
| action expectations | runtime grounding | retain lifecycle envelope; generalize effect semantics |
| `slices` | pack storage | retain and strengthen schema/version/ownership metadata |

## Runtime patches and modules

| Schema-v1 contract | Current owner | Target owner or disposition |
| --- | --- | --- |
| `PatchEnvelope` versioning and idempotency | runtime | retain |
| built-in perception and decision patches | runtime | retain only lifecycle-owned forms |
| memory, social, goal, plan, and communication patches | runtime top-level union | replace with pack-owned state-slice operations and public capability interfaces |
| `ownedPatchKinds` string table | runtime | replace optional entries with registered slice ownership enforced by the store |
| scheduler, cancellation, deadlines | runtime | retain |
| fallback selection interface | pack/domain policy | retain extension point; fingerprint selected policy metadata |

## Cognitive frames

| Schema-v1 section | Current owner | Target owner or disposition |
| --- | --- | --- |
| frame ID, agent ID, state version, situation | runtime | retain mandatory envelope |
| feasible intentions | world/runtime boundary | retain mandatory envelope |
| active obligations | runtime | retain mandatory envelope |
| active goals | runtime fixed field | move to goal-pack frame section |
| beliefs | runtime fixed field | move to belief-pack frame section |
| memories | runtime fixed field | move to memory-pack frame section |
| relationships and `socialSignals` | runtime fixed fields | move to social-pack frame sections |
| `extensions` record | pack contribution | replace with ordered, versioned, schema-validated sections |

## Domain manifest

| Schema-v1 definition | Owner | Phase 3.0 disposition |
| --- | --- | --- |
| domain ID, version, SDK range | domain/SDK boundary | retain and fingerprint |
| entity definitions | domain | retain; connect directly to v2 entity references |
| actions and skills | domain plus adapter | generalize into registered capabilities with validated mappings |
| perceptions | domain | retain and validate all semantic references |
| resources and motivations | domain | retain |
| relationship dimensions | optional social domain/pack | remove as a universal expectation; social pack consumes registered dimensions |
| semantic tags | domain | retain; require every semantic reference to resolve |

## Pack manifest

| Schema-v1 definition | Owner | Phase 3.0 disposition |
| --- | --- | --- |
| pack ID, version, SDK range | SDK | retain and fingerprint |
| dependencies | SDK | add real range validation and cycle checks |
| state slices | pack | add schema IDs, versions, migrations, and allowed writer modules |
| modules | pack | add declared read/write sets |
| frame contributors | pack | add section schema, version, validation, and budgets |
| fallback policy | pack | retain; add stable policy identity/version metadata |
| optional domains | pack | retain only with explicit registration and fingerprints |

## Compatibility policy

Schema-v1 artifacts remain immutable. During Phase 3.0:

1. new recordings continue to identify their exact schema;
2. a committed v1 replay fixture proves the current compatibility path;
3. v2 readers never silently treat a v1 artifact as v2;
4. any v1 adapter is explicitly selected and makes zero model calls; and
5. migration tooling writes a new artifact and migration report rather than
   rewriting the source fixture.

## Slice A boundary

Slice A establishes schema identifiers, deterministic compatibility
fingerprints, this inventory, and frozen v1 fixtures. It does not yet change
entity references, state layout, frame layout, constraint/effect contracts, or
provider-visible prompts.
