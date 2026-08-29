# Phase 3.3: Living Story Session Runtime

Status: in progress; Slice A complete and Slice B next
Scope: sustained autonomous story sessions, lifecycle control, soak evaluation,
reader/operator workbench, and basic scenario authoring  
Depends on:
[Phase 3.0: Core Generalization and Extension Contracts](phase-3.0-core-generalization.md),
[Phase 3.1: Bounded Emergent Autonomy](phase-3.1-bounded-emergent-autonomy.md),
[Phase 3.2: Living Story Runtime](phase-3.2-living-story-runtime.md), and the
accepted Phase 3.2 live baseline

## 1. Purpose

Phase 3.2 proved that Cortex can drive several bounded characters through an
authoritative textual world and render the accepted trajectory as coherent
prose. Phase 3.3 turns that proof into a sustained, controllable product loop.

The phase answers one question:

> Can a designer launch an authored premise and let a bounded ensemble produce,
> direct, render, inspect, pause, resume, and replay an unscripted living story
> for a meaningful session without a predetermined event sequence?

The session runtime belongs to the Living Story product. Cortex remains a
scenario-agnostic cognitive layer.

## 2. Product outcome

At the end of Phase 3.3, a designer can:

1. author and validate a small story world without editing Cortex core;
2. launch a session whose characters independently form goals and plans;
3. watch accepted actions, dialogue, consequences, scenes, and thread changes
   become live prose;
4. pause, resume, single-step, and stop the session without corrupting state;
5. inspect character state, active threads, canonical events, Director choices,
   provider usage, fallbacks, and causal provenance;
6. save, resume, branch, and exactly replay an accepted session;
7. run repeatable headless and live-model soak evaluations; and
8. author and launch a second small scenario using public product contracts
   rather than story-specific source changes.

## 3. What Phase 3.2 proved—and what remains

Phase 3.2 established the authority boundary, multi-character trajectories,
thread management, grounded narration, style-invariant canon, evaluation, and
zero-model replay. Its clean-room proof deliberately used a bounded reference
trajectory so each subsystem could be isolated and verified.

Phase 3.3 removes that scaffolding from the normal runtime path. No fixture may
prescribe the required order of character goals, plans, actions, scenes, thread
switches, or conclusions. Fixtures may define initial state, legal
capabilities, deterministic consequences, pressures, secrets, and stop
conditions.

This is not a request for unconstrained model behavior. Emergence comes from
the interaction of bounded agents with an authoritative world over time.

## 4. Non-goals

Phase 3.3 does not include:

- a visual game engine, animation system, or asset pipeline;
- production-scale distributed simulation or persistent public worlds;
- a polished drag-and-drop commercial scenario editor;
- multiplayer reader control or unrestricted collaborative fiction;
- generated prose becoming canonical state;
- model-authored capabilities, ontology, rules, or executable code;
- continuous cognition for every character on every host tick;
- perfect literary quality or imitation of a named living author;
- voice, image, or video generation;
- a content marketplace, hosted control plane, billing system, or public API;
- unlimited autonomous execution without time, call, token, or cost budgets; or
- weakening the Phase 3.0–3.2 compatibility, safety, and replay boundaries.

## 5. Ownership and authority

| Concern | Owner |
| --- | --- |
| Beliefs, memories, goals, plans, relationships, and decisions | Cortex |
| Canonical facts, time, presence, possession, and action outcomes | Story world |
| Character activation and session lifecycle | Living Story session host |
| Legal capabilities and proposal conversion | Story domain adapters |
| Action validation and consequences | Authoritative world resolvers |
| Scene and viewpoint selection | Narrative Director |
| Prose expression | Narrative renderer |
| Reader/operator controls and projections | Story Workbench |
| Canonical history | Accepted world-event log |
| Accepted cognitive history | Cortex causal and reasoner records |

The Workbench and renderer are projections. Neither may mutate canonical state
except through an explicit, validated host command or world action.

## 6. Repository boundary

The product implementation remains in the separate `cortex-living-story`
repository. It consumes only public Cortex packages.

```text
cortex
  generic cognition, domain and pack contracts, provider adapters, replay

cortex-living-story
  story domain and resolvers
  session host and activation policy
  ensemble scheduler and Narrative Director
  renderer and Story Workbench
  authoring schemas and validators
  session evaluation and reference scenarios
```

A Cortex core change is allowed only when Phase 3.3 exposes a genuinely generic
contract gap. It must not add story identifiers or product workflow to core and
must pass all existing cross-domain and baseline tests.

## 7. Session architecture

The headless session loop is the foundation for every later interface:

```text
authoring bundle
      |
      v
validate and initialize authoritative world
      |
      v
observe changes -> activate characters -> Cortex goals/plans/decisions
      |                                      |
      |                                      v
      |                            bounded action proposals
      |                                      |
      v                                      v
update scenes/threads <- authoritative resolution and observer projection
      |
      v
Director safe-cut decision -> grounded prose -> reader/operator projections
      |
      +---------------- next session turn ----------------+
```

The loop advances on meaningful events and scheduled wakeups, not on prose
sentences and not by calling every character reasoner every tick.

## 8. Authoritative session state

The host owns a versioned session record containing at minimum:

- session identity, scenario version, seed, and lifecycle status;
- simulation time, turn number, and deterministic ordering cursor;
- authoritative story-world snapshot and event-log position;
- registered characters and their activation state;
- active, dormant, blocked, and resolved story threads;
- current scene, viewpoint, participants, and safe-cut state;
- pending action proposals and authoritative outcomes;
- pending obligations, deadlines, and scheduled wakeups;
- narration cursor and rendered-edition metadata;
- provider call, token, latency, error, and fallback totals;
- configured execution budgets and remaining allowances; and
- checkpoint, branch, audit, and replay provenance.

State serialization must be deterministic. Wall-clock timestamps may appear in
operational metadata but must not determine story outcomes.

## 9. Lifecycle and control contract

A session has explicit lifecycle states:

```text
created -> validated -> ready -> running <-> paused
                                  |
                                  +-> completed
                                  +-> budget-exhausted
                                  +-> deadlocked
                                  +-> failed
                                  +-> stopped
```

The host exposes bounded commands for:

- validate and initialize;
- start or resume;
- pause at the next safe boundary;
- advance one session turn;
- stop with a final checkpoint;
- save a checkpoint;
- resume from a compatible checkpoint;
- branch from a checkpoint with a new identity; and
- replay from an accepted bundle.

Commands are idempotent where practical and reject incompatible lifecycle
transitions with typed reasons.

Every turn returns one disposition:

- `progressed`;
- `waiting`;
- `deferred`;
- `paused`;
- `completed`;
- `budget-exhausted`;
- `deadlocked`; or
- `failed`.

## 10. Character activation

The activation policy decides which characters merit cognition after an
authoritative change. Inputs may include:

- newly observable world events;
- violated expectations or completed outcomes;
- active goals, plan deadlines, and obligations;
- conversation turns and direct address;
- material relationship or belief changes;
- thread relevance and viewpoint pressure;
- elapsed simulation time and scheduled wakeups; and
- starvation age since the character last received a meaningful opportunity.

Activation must be deterministic for the same accepted inputs. A configurable
per-turn budget limits concurrent or sequential reasoning work. Fairness
prevents one highly reactive character from consuming the session indefinitely.

Characters with no meaningful change remain dormant. The policy records why a
character was activated, deferred, or skipped.

## 11. Goal, plan, and story-action bridge

Cortex continues to form goals and plans from registered domain semantics. The
Living Story product supplies a capability-adapter registry that maps an
accepted plan step to a typed `StoryActionProposal`.

An adapter must:

- identify the capability and schema version it supports;
- validate actor, target, parameter, and evidence references;
- use only current observer-safe context;
- preserve goal, plan, step, and reasoner-record provenance;
- construct a proposal without mutating the world; and
- return a typed unsupported or invalid result instead of guessing.

The authoritative resolver then revalidates current presence, access,
possession, conversation membership, time, and other preconditions. A valid
plan never bypasses world authority.

No adapter may infer a canonical fact from generated prose or convert arbitrary
model text into an executable action.

## 12. Scheduling, conflicts, and staleness

The session scheduler creates a deterministic order from:

- simulation time;
- action priority defined by the story domain;
- explicit interruption rules;
- stable actor and proposal identifiers; and
- the accepted event cursor.

When proposals conflict, the world resolver—not the narrator—decides the
outcome. State changes between reasoning and submission produce stale or
rejected proposals and trigger the existing bounded recovery policy.

Parallel provider calls may be used only when their inputs are independent and
their results are committed in deterministic order. The session must cap
parallelism and must never allow response arrival time to establish canon.

## 13. Dialogue and obligations

Dialogue remains a world action. The runtime validates speaker presence,
recipients, audibility, topic references, knowledge provenance, and policy
constraints before an utterance is accepted.

Promises, warnings, requests, disclosures, and other dialogue acts may create
typed obligations. These obligations influence later activation, goal
selection, planning, thread state, and Director attention. Satisfaction,
violation, expiry, and supersession are authoritative events.

Conversation turn-taking is bounded. A stalled conversation must yield to a
different action, safe cut, wait state, or deadlock diagnosis rather than
generate repetitive dialogue indefinitely.

## 14. Scenes, threads, and the Narrative Director

The Director observes accepted events and structured story state. It may:

- continue the current scene;
- cut to another active thread at a safe boundary;
- choose an eligible viewpoint;
- merge related threads;
- mark a thread dormant, blocked, or resolved; and
- request a bounded authored pressure event when permitted by the scenario.

It may not decide character actions, rewrite outcomes, reveal observer-hidden
facts, invent a world event, or force a preferred plot.

Switch pressure should consider:

- a material change or unresolved question in another thread;
- current-scene payoff or a safe dramatic boundary;
- time since an eligible thread was shown;
- chronological constraints and simultaneous-event ordering;
- viewpoint knowledge and secret-containment policy;
- repetition, stagnation, and pacing targets; and
- explicit reader mode or designer policy.

All Director choices are structured, validated, and auditable. Starvation
freedom is a policy constraint, not a mandate to rotate mechanically.

## 15. Narrative rendering cadence

The renderer consumes accepted event ranges selected by the Director. It may
combine several causally adjacent events into a passage but must preserve:

- actor, action, target, location, and outcome;
- chronological and causal order;
- viewpoint knowledge boundaries;
- dialogue attribution and accepted wording constraints;
- unresolved uncertainty; and
- canonical provenance for every material assertion.

Rendering occurs at presentation boundaries, not after every reducer event.
Style profiles may control perspective, tense, density, rhythm, dialogue
balance, description, and permitted genre characteristics. Changing style
creates a new edition over the same canon.

## 16. Progress, completion, and deadlock

A turn counts as meaningful progress when it produces at least one of:

- an accepted world action or outcome;
- a material observation, belief, goal, plan, or obligation transition;
- a scene or thread transition;
- an accepted authored pressure event;
- a rendered passage that advances the narration cursor; or
- a scheduled advance to the next known simulation event.

The host tracks repeated no-progress signatures. A configurable threshold
triggers deterministic recovery in this order:

1. wake an eligible deferred character;
2. reconsider blocked goals or plans;
3. permit a safe Director cut;
4. apply a scenario-authorized pressure event;
5. advance to the next scheduled event; and
6. terminate as `deadlocked` with a structured diagnosis.

Completion is defined by scenario-authored terminal predicates, explicit
operator stop, or the absence of unresolved work after all legal recovery has
been exhausted. The narrator cannot declare completion.

## 17. Budgets and failure behavior

Every session configures limits for:

- simulation turns and accepted actions;
- provider calls and concurrent calls;
- input, output, and total tokens when reported;
- elapsed operational time;
- narration passages;
- retries and fallbacks; and
- optional estimated cost.

Budget checks occur before work is dispatched. Exhaustion produces a final
checkpoint and typed disposition rather than partial hidden mutation.

Provider errors, invalid outputs, timeouts, and cancellation use existing
bounded retry and deterministic fallback contracts. A fallback must be visible
in the audit stream and Workbench. Persistent provider failure may pause or end
the session according to scenario policy; it may not silently substitute
unbounded generation.

## 18. Persistence, checkpoints, branching, and replay

A checkpoint contains or references everything needed to resume:

- authoritative world state and event cursor;
- Cortex agent snapshots and accepted cognition records;
- session lifecycle and scheduler state;
- scene, thread, Director, and narration cursors;
- pending obligations and scheduled events;
- deterministic seed and identifier state;
- authoring and schema versions; and
- provider and fallback audit metadata.

Resume validates compatibility before applying any change. Branching preserves
parent checkpoint identity and begins a new accepted history.

Exact replay consumes recorded accepted reasoner outputs and proposals, makes
zero provider calls, and reproduces authoritative state, decisions, Director
choices, rendered event selection, and final hashes. Re-rendering in a new style
is a derived edition, not exact presentation replay.

## 19. Headless session evaluation

Automated evaluation precedes UI work. The harness must run deterministic,
oracle, recorded-provider, and authenticated live modes where applicable.

It measures at minimum:

- schema validity and authoritative acceptance;
- continuity and causal grounding;
- character knowledge and secret containment;
- goal, plan, and obligation coherence over time;
- goal and plan churn;
- action, dialogue, and strategy repetition;
- character differentiation;
- thread creation, return, merge, resolution, and starvation;
- Director cut validity and pacing signals;
- deadlock frequency and recovery effectiveness;
- fallback, retry, error, call, token, latency, and cost totals;
- exact replay and checkpoint-resume equivalence; and
- meaningful divergence across repeated live runs.

The evaluator distinguishes invalid, unsafe, indefensible, defensible, and
preferred behavior. Preference is diagnostic; it must not turn one acceptable
plot into a hidden required script.

## 20. Story Workbench

After the headless loop and soak harness are accepted, Phase 3.3 adds a thin
local Workbench over the same session APIs and event projections.

The MVP displays:

- live prose with scene, time, viewpoint, and style context;
- start, pause, resume, single-step, speed, checkpoint, and stop controls;
- active, dormant, blocked, merged, and resolved threads;
- character location, current goal, plan, obligations, and observer-safe
  knowledge;
- canonical event ledger and selected causal provenance;
- Director decisions and safe-cut reasons;
- provider usage, latency, errors, retries, and fallback state; and
- replay timeline with branch and checkpoint markers.

The Workbench may submit explicit operator commands through validated host
contracts. It must not maintain a second copy of authoritative state or contain
story progression logic required by the headless runtime.

## 21. Basic authoring workflow

The final slice provides a practical, schema-backed workflow for:

- scenario metadata, premise, opening state, and terminal predicates;
- Character Codices and relationships;
- locations, connections, objects, access, and initial possession;
- public facts, secrets, information sources, and observer rules;
- legal capabilities and deterministic resolver configuration;
- Director policies, permitted pressure events, and reader modes;
- narrative style profiles and pacing targets;
- execution budgets and provider selection; and
- validation, preview, launch, export, and version migration.

Versioned source files remain the authoritative authoring format. The UI may
provide forms and helpful projections, but it does not replace validation or
create opaque state. A designer must be able to export a complete portable
bundle.

## 22. Security and trust boundaries

Authored content, memories, dialogue, observations, and model output are
untrusted data. The product must:

- isolate instruction-bearing configuration from story content;
- pass only observer-safe facts to each character and viewpoint;
- validate all identifiers and references against registered schemas;
- reject unknown capabilities and executable payloads;
- prevent narration or dialogue from issuing host commands;
- redact credentials and provider secrets from audits, checkpoints, and UI;
- bound prompt and output sizes; and
- retain injection-resistance cases in every live baseline cohort.

## 23. Reference proof

The Phase 3.3 reference proof extends the existing four-character Living Story
scenario. It must begin from authored initial state and pressures, then proceed
without a required event script.

The accepted proof should demonstrate:

- at least four independently activated characters;
- at least three story threads, including one return after a viewpoint cut;
- dialogue that creates and later resolves or violates an obligation;
- a goal or plan revised because of an authoritative outcome;
- a secret that remains contained until an accepted disclosure or discovery;
- a conflict or stale proposal resolved authoritatively;
- multiple scenes and viewpoints selected at valid safe cuts;
- coherent prose grounded in the accepted ledger;
- pause, checkpoint, resume, and exact zero-model replay; and
- at least two defensible live trajectories from the same initial scenario.

These are coverage requirements, not a prescribed plot order.

## 24. Delivery slices

### Slice A — Headless autonomous session loop

Implement lifecycle state, session configuration, character activation,
capability adapters, deterministic scheduling, progress detection, budgets,
checkpointing, and a fully headless reference run.

Slice A is complete when the reference ensemble advances from initial state to
a typed terminal disposition without a scripted event order and all accepted
changes have causal provenance.

### Slice B — Soak evaluation and replay hardening

Add long-running cohorts, deadlock and repetition diagnostics, checkpoint-resume
equivalence, branch comparisons, usage aggregation, and exact full-session
replay.

Slice B is complete when deterministic and live cohorts expose actionable
session-level metrics and replay accepted sessions with zero model calls.

### Slice C — Story Workbench

Build the local reader/operator interface over the accepted session contracts.
It must render prose and inspection state, expose lifecycle controls, and make
threads, provenance, usage, fallbacks, checkpoints, and replay visible.

Slice C is complete when the full reference session can be operated and
understood without using the terminal while producing the same authoritative
results as headless mode.

### Slice D — Basic authoring workflow

Add schema-backed forms, validation, preview, portable bundle export, and launch
for the bounded MVP authoring surface.

Slice D is complete when a second scenario can be authored, validated, launched,
inspected, checkpointed, and replayed without product-source or Cortex-core
changes.

## 25. Required verification

Each slice must preserve:

- Cortex unit, integration, conformance, replay, and public-surface tests;
- the frozen Phase 3.1 bounded-autonomy baseline;
- the frozen Phase 3.2 Living Story baseline;
- deterministic offline verification with no credentials;
- strict schema and authority-boundary checks;
- secret-containment and prompt-injection cases; and
- zero-provider replay for accepted cognition.

Slice-specific tests include:

- lifecycle transition and idempotency matrices;
- deterministic activation, fairness, and scheduling cases;
- capability-adapter contract tests;
- stale, conflicting, rejected, partial, and interrupted actions;
- no-progress detection and every recovery stage;
- budget exhaustion before dispatch;
- checkpoint compatibility and corruption rejection;
- thread starvation and safe-cut validation;
- narration provenance and style-invariant canon;
- Workbench command/API parity; and
- authoring-bundle round trips and migrations.

## 26. Phase acceptance criteria

Phase 3.3 is complete only when:

1. a four-character reference session runs headlessly for at least 30 accepted
   actions or outcomes across at least six scenes, unless an authored terminal
   predicate ends it earlier;
2. no fixture prescribes the required sequence of goals, plans, actions,
   Director cuts, or conclusion;
3. every executed action originates from a registered capability adapter and is
   revalidated by the authoritative world;
4. the session demonstrates the coverage in Section 23 without violating
   authority, knowledge, or secret boundaries;
5. pause, single-step, checkpoint, resume, stop, budget exhaustion, and deadlock
   produce correct typed behavior;
6. checkpoint-resume reaches the same result as uninterrupted execution for a
   deterministic session;
7. exact replay reproduces the accepted session and final hashes with zero
   provider calls;
8. authenticated repeated runs show at least two defensible trajectories while
   retaining zero safety violations and full injection resistance in the
   accepted cohort;
9. the Workbench exposes the required reader, control, thread, inspection,
   usage, fallback, checkpoint, and replay surfaces;
10. headless and Workbench execution share the same runtime and authority path;
11. a second scenario is authored and launched without changes to Cortex core
    or story-product runtime source; and
12. all Phase 3.0–3.2 regression boundaries remain green.

## 27. Stop conditions

Stop and repair the architecture before continuing if:

- generated prose, dialogue, or raw model text mutates world truth;
- session behavior depends on response arrival order or wall-clock timing;
- the reference scenario requires story-specific changes to Cortex core;
- fixtures or evaluators encode one preferred plot as the only acceptable one;
- the Workbench becomes an alternative world authority;
- secrets leak across observer or viewpoint boundaries;
- deadlocks are hidden by endless retries, dialogue, or narration;
- checkpoint resume cannot establish compatibility and provenance;
- replay requires fresh model calls; or
- a polished UI is used to conceal an incomplete headless session loop.

## 28. Exit artifacts

Phase 3.3 exits with:

- versioned session-runtime and capability-adapter contracts;
- a headless autonomous session runner;
- deterministic and live soak-evaluation reports;
- checkpoint, branch, audit, and replay bundles;
- an accepted authenticated session baseline;
- a local Story Workbench;
- a versioned basic authoring workflow;
- at least two portable reference scenarios;
- updated public-contract and architecture reports; and
- a Phase 3.4 recommendation based on observed product and runtime limits.

This specification is the authoritative Phase 3.3 scope. Slice documents may
refine implementation details but may not broaden authority, weaken replay, or
replace these acceptance criteria without an explicit phase amendment.
