# Cortex Product Architecture

Status: productization boundary  
Depends on: [technical-design.md](technical-design.md)

## Product thesis

Cortex is an engine-neutral cognitive runtime for persistent autonomous game
agents. Games provide observer-specific world state, legal intentions, action
skills, and authoritative outcomes. Cortex supplies bounded high-level
decision-making, memory, goals, planning, relationships, conversation,
cancellation, grounding, budgets, replay, and observability.

Cortex answers **why an agent acts**. The game engine remains responsible for
**how the action is physically performed**.

The initial social-simulation scenario is a reference domain, not the universal
data model.

## Product vision: designer-authored living worlds

The long-term product is a toolkit a game designer can use to create rich worlds
of persistent AI agents without making an LLM authoritative over game state.
A designer supplies the world's vocabulary, capabilities, motivations,
constraints, and observable events. Cortex supplies the reusable cognitive
machinery that lets agents interpret those inputs, remember, form goals, plan,
relate to one another, communicate, and make coherent choices over time.

The intended autonomy boundary is:

> Cortex structures legality, commitments, and consequences. It must not
> prescribe which rational outcome an agent is required to prefer.

Evaluation rubrics such as `acceptable` and `preferred` are test-only judgments;
they are never runtime instructions. Runtime constraints should express world
legality, unavailable capabilities, safety invariants, and commitments created
by prior decisions. Personality, memory, emotion, relationships, and competing
goals should influence choices without becoming hidden scripts.

The present fixed feasible-intention set is a safe foundation, not the final
ceiling on agent autonomy. A product-quality authoring experience should allow
designers to control the behavioral envelope while agents retain meaningful
freedom inside it.

## Product layers

```text
Game / simulation
  domain manifest + world adapter + skills + policies
                         |
Official or third-party Cortex packs
  state slices + modules + frame contributors + evaluations
                         |
Cortex SDK
  registration + schemas + compatibility + conformance
                         |
Cortex runtime
  scheduling + versioning + patches + decisions + grounding + replay
```

The runtime must not import a game, engine adapter, genre pack, or provider.
Dependencies point toward the runtime, never away from it.

## Stable runtime invariants

Productization must not weaken these rules:

1. The game owns world truth and mechanics.
2. Cortex sees only observer-specific projections.
3. Models select from legal intentions supplied by the game.
4. Every action is revalidated by the game.
5. Intention, speech, and action share one decision identity.
6. Outcomes require authoritative evidence.
7. Slow cognition is versioned, cancellable, and discardable.
8. State mutation occurs only through owned, validated reducers.
9. Provider failure has deterministic domain policy.
10. Replay never silently calls a model.

## Domain manifests

Every game publishes a versioned domain manifest describing its vocabulary:

- entity types and semantic properties;
- legal action types, arguments, targets, risks, requirements, and potential
  effects;
- perception/event types;
- resources;
- relationship dimensions;
- generic motivations and their domain affordances; and
- schema versions used at the game boundary.

Metadata helps cognition compare unfamiliar options. It does not implement
mechanics or authorize an action.

All public identifiers are namespaced, for example:

```text
drone:retreat
social:trust
colony:grain
medieval:declare-war
```

Renaming or changing the meaning of a public identifier requires a versioned
migration. Domain manifests are immutable after registration.

## Packs

A Cortex pack is a compatible bundle of cognitive extensions:

- versioned state slices;
- state-slice reducers and validators;
- scheduled or event-driven module declarations;
- cognitive-frame contributors;
- fallback, routing, or tier policies;
- optional skills and semantic definitions; and
- conformance and behavioral evaluation fixtures.

Packs cannot mutate another pack's state slice. Cross-pack behavior uses typed
events or explicitly declared dependencies.

Official initial packs are expected to include memory, planning, social
relationships, and conversation. The runtime may expose common interfaces for
these concepts without forcing every agent to instantiate every pack.

## Compatibility

Each pack declares:

- an immutable pack ID;
- semantic version;
- compatible Cortex SDK range;
- dependencies with version ranges;
- owned state-slice IDs;
- contributed module and frame-section IDs; and
- all runtime schemas it exposes.

Registration fails on duplicate ownership, missing dependencies, incompatible
versions, invalid namespaced identifiers, or schema conflicts.

## Product validation

Genre independence is demonstrated, not asserted. The kernel must run at least
two materially different reference worlds:

1. Marcus/Elena social and political reasoning.
2. A reconnaissance drone balancing mission completion, battery, damage,
   stealth, and squad safety without social relationships or dialogue. This
   reference world is maintained in the separate `cortex-sandbox-sim`
   repository rather than in Cortex core.

The second world may add a domain, pack, world adapter, skills, and policies. It
must not require a change to the kernel.

## Autonomy and living-story roadmap

This work was deferred until the Phase 2 model boundary and obligation
invariants were stable. Phase 3.0 and Phase 3.1 have now completed that
foundation and frozen the first bounded-autonomy baseline.

The prerequisite contract work is specified in
[Phase 3.0: Core Generalization and Extension Contracts](phase-3.0-core-generalization.md).
It removes closed genre assumptions, strengthens pack ownership,
and proves the extension surface across three reference domains.

The emergent layer itself is specified in
[Phase 3.1: Bounded Emergent Autonomy](phase-3.1-bounded-emergent-autonomy.md).

The implemented layer adds:

- model-proposed goals that a deterministic Goal Manager validates before
  activation;
- bounded plan generation from registered capabilities and skills;
- compositional intentions for multi-step strategies;
- replanning or explicit escalation when commitments become impossible;
- designer-authored strategy templates and semantic affordances rather than
  exhaustive hand-authored action branches; and
- inspection tools showing how world state, memory, personality, goals, and
  relationships influenced a choice without storing hidden chain-of-thought.

Validation must use scenarios with several genuinely defensible strategies and
measure behavioral diversity, coherence across time, sensitivity to agent
history, and resistance to repetitive or dominant-choice collapse. Success is
not unconstrained action invention. Success is differentiated, emergent agency
inside an authoritative simulation.

With the Phase 3.1 baseline frozen, the next product-boundary proof is
[Phase 3.2: Living Story Runtime](phase-3.2-living-story-runtime.md). It applies
the public Cortex contracts in a separate text-first product where several
characters act inside an authoritative story world and accepted events are
rendered as live prose. The story host and Narrative Director remain consumers
of Cortex rather than new kernel responsibilities.

## Delivery sequence

1. Internal kernel packages and independently versioned reference-world repos.
2. Engine-adapter conformance suite and agent inspector.
3. Public SDK with versioned pack and domain authoring.
4. Provider adapters, persistence, replay inspection, and evaluation tooling.
5. Hosted cognition workers and control plane only after SDK integration is
   proven.

The initial business remains the reference game. The architecture preserves the
option for Cortex to become a standalone SDK or hosted product without forcing
that business decision prematurely.
