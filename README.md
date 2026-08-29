# Cortex Cognitive Layer

Cortex is a headless cognitive runtime for agents living inside an authoritative
simulation. It gives selected agents persistent beliefs, memories, goals,
planning, social interpretation, conversation, and coherent high-level
decisions without allowing an LLM to invent or mutate world state.

The foundational rule is:

> The simulation owns reality. Cortex interprets reality and proposes legal
> actions inside it.

The implementation contract is defined in
[docs/technical-design.md](docs/technical-design.md),
including:

- authority and data-flow boundaries;
- versioned agent state and typed state patches;
- module, scheduler, controller, and skill-execution contracts;
- world events, perceptions, beliefs, memories, and relationships;
- structured LLM requests and validated responses;
- asynchronous result invalidation and deterministic replay;
- dynamic cognitive-resolution tiers and budgets;
- persistence and observability requirements; and
- a complete Marcus/Elena reference scenario with acceptance tests.

The reusable product boundary, domain ontology, pack compatibility model, and
cross-genre validation strategy are defined in
[docs/product-architecture.md](docs/product-architecture.md).
That document also records the parked emergent-autonomy roadmap and the
long-term goal of a designer-facing toolkit for building living AI worlds.
The prerequisite contract-generalization work is specified in
[docs/phase-3.0-core-generalization.md](docs/phase-3.0-core-generalization.md).

Slice C composition and compatibility notes are in
[docs/phase-3.0-slice-c-composition.md](docs/phase-3.0-slice-c-composition.md).

Slice D standard-pack extraction notes are in
[docs/phase-3.0-slice-d-standard-packs.md](docs/phase-3.0-slice-d-standard-packs.md).
The bounded goal formation and capability-planning layer that follows is
specified in
[docs/phase-3.1-bounded-emergent-autonomy.md](docs/phase-3.1-bounded-emergent-autonomy.md).
Implemented Slice A and Slice B boundaries are recorded in
[docs/phase-3.1-slice-a-goal-manager.md](docs/phase-3.1-slice-a-goal-manager.md)
and
[docs/phase-3.1-slice-b-planning.md](docs/phase-3.1-slice-b-planning.md).
Slice C coordination, authoritative outcome advancement, and bounded recovery
are recorded in
[docs/phase-3.1-slice-c-coordination.md](docs/phase-3.1-slice-c-coordination.md).
Slice D accepted cognition records, zero-model full-trajectory replay, and
structured inspection are recorded in
[docs/phase-3.1-slice-d-replay-inspection.md](docs/phase-3.1-slice-d-replay-inspection.md).

The first implementation milestone is a deterministic, in-memory vertical slice.
PostgreSQL, pgvector, Redis, BullMQ, a visual client, and a narrative Director are
later adapters or consumers—not prerequisites for proving Cortex's core loop.

The deterministic kernel now includes shared branded contracts, immutable agent
state snapshots, ownership-scoped typed patches, optimistic stale-result
rejection, idempotent event ingestion, a manual cognitive scheduler, and a fake
authoritative world that revalidates action preconditions. The grounded
Marcus/Elena slice also exercises the Decision Gate, bounded controller outputs,
deterministic fallback, cancellation, observer-backed memory and social updates,
decision-conditioned speech and skill execution, outcome awareness, and stale
reasoning rejection.

Phase 2 has begun at the model boundary. The controller now treats provider
output as unknown data, enforces a configurable reasoning deadline, permits at
most one explicitly configured retry, records provider-neutral diagnostics, and
falls back deterministically on timeout, provider failure, or invalid output.
Domain packs can attach structured follow-up obligations to feasible
intentions. Those obligations become versioned agent state and constrain later
feasible choices before another model call, so a locally rational model answer
cannot silently violate an earlier commitment.

The workspace now also contains:

- `@cortex/domain`, for versioned actions, entity types, perceptions,
  motivations, resources, relationship dimensions, and semantic metadata;
- `@cortex/sdk`, for pack compatibility, state-slice ownership, module and frame
  registration, and domain-specific fallback policies;
- `@cortex/standard-packs`, for optional traits, beliefs, memory, social,
  goals, planning, and conversation state using only public pack contracts; and
- `@cortex/openai`, an optional provider adapter that calls the OpenAI Responses
  API with strict structured output, cancellation, retry classification, usage
  metadata, and audit hooks while keeping API details out of `@cortex/runtime`.

The non-social reconnaissance-drone reference world and its executable scenario
suite live in the separate sibling repository `cortex-sandbox-sim`. That repo
links to these packages locally while keeping game-specific packs, skills,
fixtures, runners, and simulation tests outside Cortex core.

```bash
corepack pnpm install
corepack pnpm typecheck
corepack pnpm test
```
