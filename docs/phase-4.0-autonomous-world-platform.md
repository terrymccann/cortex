# Phase 4.0: Cortex Autonomous World Platform

Status: approved product specification; Slices A–C complete, Slice D ready
Last updated: 2026-08-30
Depends on: Phase 3.0 Core Generalization, Phase 3.1 Bounded Emergent
Autonomy, and the Phase 3.2–3.3 Living Story product proof

## 1. Product decision

Cortex will continue as an autonomous world-agency system, with a narrower and
more commercial product boundary:

> Cortex is a development platform for designing, testing, inspecting, and
> running autonomous characters, factions, and living worlds inside an
> authoritative host simulation.

The platform has two primary products:

1. **Cortex Runtime** — the engine-neutral cognitive runtime embedded in a game
   or simulation.
2. **Cortex Studio** — the local-first authoring, simulation, evaluation,
   comparison, and inspection environment used before and during integration.

A small autonomous society is the flagship validation world. It demonstrates
the product, but it is not embedded in Cortex Core and does not define the
universal schema.

Living Story remains a maintained research application and downstream consumer
of Cortex. It is not the primary product and its narrative renderer is not a
Runtime dependency.

## 2. Product thesis

Traditional game code is excellent at rules, resources, physics, pathfinding,
animation, and deterministic state transitions. Language models are useful for
interpreting context and choosing among several defensible high-level
strategies. Neither should own both responsibilities.

Cortex provides the missing boundary:

```text
Authoritative host simulation
  owns facts, mechanics, legality, time, and outcomes
                   |
                   | observer projections and legal capabilities
                   v
Cortex Runtime
  owns bounded cognition, private knowledge, goals, plans,
  obligations, decisions, budgets, replay, and inspection
                   |
                   | validated action proposals
                   v
Authoritative host simulation
  revalidates, resolves, and emits canonical outcome events
```

The Runtime answers why an autonomous actor wants to act and what registered
capability it proposes. The host remains the only authority on whether the
action is possible and what becomes true.

## 3. Target users and jobs

### 3.1 Primary user

The first user is a game or simulation developer building a persistent world
with autonomous actors.

Their core jobs are:

- describe a domain without changing Cortex source;
- define legal capabilities and deterministic host adapters;
- configure characters, groups, goals, knowledge, and cognitive budgets;
- run controlled worlds before integrating a graphical client;
- compare scripted, deterministic, and model-backed cognition;
- reproduce failures exactly;
- inspect why an actor selected an action without storing hidden reasoning;
- measure latency, model use, fallback behavior, diversity, and coherence; and
- ship the same validated configuration through the production Runtime.

### 3.2 Secondary users

- technical game designers authoring worlds and behavioral envelopes;
- narrative and quest designers inspecting emergent consequences;
- QA teams building behavioral regressions;
- AI engineers comparing providers, prompts, and activation policies; and
- researchers using fictional or controlled multi-agent worlds without
  claiming that they predict real people.

## 4. Product boundaries

### 4.1 Cortex Runtime owns

- agent registration and versioned cognitive state;
- observer-specific ingestion and grounding;
- event-driven activation and cognitive budgets;
- pack-owned traits, beliefs, memory, relationships, goals, and planning;
- bounded goal, plan, and immediate-decision lifecycles;
- obligations and outcome-aware replanning;
- deterministic validation and domain fallback;
- stale-result rejection and cancellation;
- action proposals tied to registered capabilities and decisions;
- provider-neutral invocation records and usage accounting;
- checkpoints, compatibility manifests, replay, and inspection; and
- repository interfaces for durable state and job execution.

### 4.2 Cortex Studio owns

- versioned World Project authoring;
- domain, pack, policy, and adapter validation;
- compiled previews and compatibility diagnostics;
- local session lifecycle controls;
- world, actor, event, cognition, budget, and proposal inspection;
- cohort construction and controlled interventions;
- provider and policy comparisons;
- behavioral evaluation, human review, and baseline promotion;
- replay, checkpoint, branch, and divergence visualization; and
- import and export of portable project and run artifacts.

### 4.3 The host game or simulation owns

- canonical world state and event ordering;
- mechanics, physics, movement, combat, economy, inventory, and pathfinding;
- legal capabilities for the current situation;
- constraints and action revalidation;
- random number generation;
- action acceptance, rejection, and outcome resolution;
- visibility and observer projections;
- graphical assets, animation, audio, input, and networking; and
- final player-facing presentation.

### 4.4 Phase 4.0 non-goals

Phase 4.0 does not include:

- a replacement for Unity, Unreal, Godot, or a custom game engine;
- a public hosted control plane, accounts, billing, or multitenancy;
- a content marketplace;
- production PostgreSQL or distributed job workers;
- voice, animation, or avatar generation;
- a complete RPG rules engine;
- a general-purpose agent observability competitor;
- unrestricted action, tool, schema, or code invention;
- simulation of identifiable real people;
- claims that synthetic populations predict real populations;
- thousand-agent scale; or
- literary-quality autonomous novel generation.

## 5. Assessment of the current implementation

### 5.1 Cortex Core repository

Current packages:

| Package | Existing value | Product disposition |
| --- | --- | --- |
| `@cortex/contracts` | Branded IDs, world events, observer projections, constraints, effects, intentions, actions, and the world port | Retain; complete the v2 public session and proposal boundary |
| `@cortex/domain` | Versioned domain manifests, goals, capabilities, strategies, validation, and fingerprints | Retain; extend with World Project references and migrations |
| `@cortex/sdk` | Pack registration, dependencies, state ownership, frame contributors, compatibility, and fingerprints | Retain; add authoring diagnostics and conformance entry points |
| `@cortex/runtime` | Immutable agent state, patches, in-memory store, scheduler, decisions, execution, action awareness, fallback, and stale protection | Retain; introduce world-session orchestration and repository interfaces |
| `@cortex/standard-packs` | Optional traits, beliefs, memory, social, goals, planning, conversation, lifecycle, and inspection | Retain; add group/faction primitives only after the flagship domain proves the contract |
| `@cortex/openai` | Strict structured outputs, goal/planner/controller reasoners, cancellation, retry classification, usage, and audit | Retain as optional provider adapter; add routing only after provider-neutral run records stabilize |

Verified current state:

- typecheck passes;
- all 16 test files pass;
- all 111 Core tests pass;
- domain, pack, state, scheduler, decision, autonomy, OpenAI adapter, and
  production-boundary conformance are covered; and
- the repository is clean before this specification change.

Core limitations relevant to productization:

- state and job scheduling are in-memory only;
- the public contract is agent-oriented rather than world-session-oriented;
- the scheduler is manual and has no lease, retry, reconciliation, or durable
  job semantics;
- `SkillExecutor` directly submits through a world port and does not yet expose
  a first-class host-pull proposal mode;
- schema constants show an incomplete v1-to-v2 migration across contracts and
  pack manifests;
- packages are private local workspace packages linked by sibling repos;
- there is no generic World Project artifact, CLI, service boundary, or Studio;
- there is no generic multi-agent run bundle owned by Core; and
- scale, cost-envelope, and activation-selectivity benchmarks are not frozen.

### 5.2 Sandbox simulation repository

Existing reusable value:

- drone and colony domains prove genre independence;
- fake authoritative worlds and deterministic skills;
- controller and autonomy scenario runners;
- offline oracle, adversarial, and live provider cohorts;
- behavioral metrics, confidence intervals, reports, and baselines;
- prompt-injection and follow-up verification;
- provider audit files; and
- zero-model replay across schema versions.

The sandbox is already the prototype for the evaluation portion of Cortex
Studio. It should remain a conformance and research repository until its generic
runner, cohort, report, and baseline formats move behind public Studio packages.

Current verification state:

- typecheck passes; and
- 46 of 48 tests pass, with both failures confined to immutable prompt-version
  baseline assertions described below.

Current defect to resolve before new baseline work:

- two frozen-baseline tests fail because linked Core now exposes planner prompt
  `cortex-planner-reasoner-v5` while immutable Phase 3.1 manifests record v4.
  Frozen manifests must not be rewritten. A compatibility fixture or new
  candidate baseline must explicitly record the new prompt identity.

### 5.3 Living Story repository

Existing components worth generalizing:

- portable project authoring, migration, validation, fingerprinting, preview,
  import, export, and launch;
- sustained session lifecycle, budgets, checkpoints, resume, and branches;
- multi-agent activation and proposal serialization;
- event ledger, observer-safe inspection, usage, and replay;
- local Workbench server and application shell;
- cohort-bound review and baseline promotion; and
- global event consumption and source-linked projections.

Current verification state:

- typecheck passes;
- 81 of 83 tests pass in this restricted execution environment; and
- the two failures are localhost server tests blocked from binding
  `127.0.0.1` by the sandbox (`EPERM`), while the separately launched local
  Workbench has been exercised successfully.

Components that remain story-specific:

- Character Codex presentation fields;
- story threads, scenes, viewpoints, style profiles, and narrative consumption;
- prose Director and renderer;
- reader UI and edition artifacts; and
- story-specific novelty and dramatic-continuity policies.

Human review identified important limitations despite accepted automated gates:

- canonical actions can remain dramatically repetitive while passing semantic
  novelty checks;
- dialogue does not yet guarantee reciprocal consumption;
- thread selection can fragment causal scenes;
- renderer context can repeat descriptive anchors; and
- valid director fields can coexist with malformed, excessively long reason
  codes.

These findings do not invalidate Cortex Runtime. They show that automated
behavioral gates must include task-level human validation and that a good world
simulation does not automatically produce good long-form prose.

### 5.4 Overall readiness

What is already proven:

1. authoritative host ownership;
2. observer-specific knowledge;
3. extensible domains and packs;
4. bounded goal and plan formation;
5. legal immediate decisions and deterministic skills;
6. obligation enforcement;
7. outcome-aware plan progression and replanning;
8. stale result rejection;
9. provider fallback and injection resistance;
10. exact zero-model replay;
11. controlled live-model cohorts; and
12. a local authoring and inspection UI in a downstream product.

What remains is primarily product architecture and hardening rather than a new
cognition research program.

## 6. Target architecture

```text
┌──────────────────────────────────────────────────────────────┐
│ Cortex Studio                                                │
│ Author · Validate · Simulate · Inspect · Evaluate · Compare │
└──────────────────────────────┬───────────────────────────────┘
                               │ portable artifacts and APIs
┌──────────────────────────────▼───────────────────────────────┐
│ Cortex Runtime                                               │
│ Session · Activation · Cognition · Proposal · Replay         │
├──────────────┬───────────────────┬───────────────────────────┤
│ Standard     │ Provider adapters │ Persistence/job ports     │
│ packs        │ OpenAI/reference  │ in-memory first           │
└──────┬───────┴──────────┬────────┴───────────────┬───────────┘
       │                  │                        │
┌──────▼───────┐  ┌───────▼────────┐      ┌───────▼──────────┐
│ World Project│  │ Host adapter    │      │ Run artifacts    │
│ domain/packs │  │ legality/outcome│      │ replay/evaluation│
└──────────────┘  └───────┬────────┘      └──────────────────┘
                           │
                 ┌─────────▼──────────┐
                 │ Game / simulation │
                 └────────────────────┘
```

### 6.1 Runtime composition root

Applications need one supported composition entry point instead of manually
assembling internal managers.

Conceptually:

```ts
interface CortexRuntimeConfig {
  readonly domainRegistry: DomainRegistry;
  readonly packRegistry: PackRegistry;
  readonly stateRepository: AgentStateRepository;
  readonly runRepository: RunRepository;
  readonly scheduler: CognitiveScheduler;
  readonly providers: ProviderRegistry;
  readonly policy: RuntimePolicy;
}

interface CortexRuntime {
  createSession(request: CreateWorldSessionRequest): Promise<WorldSession>;
  restoreSession(checkpoint: WorldSessionCheckpoint): Promise<WorldSession>;
  inspectSession(sessionId: WorldSessionId): Promise<WorldInspection>;
  replay(bundle: WorldRunBundle): Promise<ReplayResult>;
}
```

The concrete API may differ, but the ownership boundary is required.

### 6.2 World session

A world session groups agents, compatibility metadata, budgets, event order,
checkpoints, and run usage without becoming the canonical game world.

Required session operations:

- register and retire cognitive agents;
- ingest ordered observer projections in batches;
- notify Cortex of material host-state revisions;
- select due activations deterministically;
- form and validate goals and plans;
- produce bounded action proposals;
- accept authoritative action submission and outcome records;
- pause, resume, stop, checkpoint, and branch;
- expose inspection snapshots; and
- export a replay bundle.

### 6.3 Proposal-first host integration

Production hosts need an integration mode that does not require Cortex to call
back into the game process.

```ts
interface ActionProposal {
  readonly proposalId: NamespacedId;
  readonly sessionId: WorldSessionId;
  readonly agentId: AgentId;
  readonly decisionId: DecisionId;
  readonly capabilityId: NamespacedId;
  readonly actionType: NamespacedId;
  readonly arguments: Readonly<Record<string, unknown>>;
  readonly constraints: readonly WorldConstraint[];
  readonly expectedEffects: readonly ExpectedEffect[];
  readonly basedOnWorldVersion: number;
  readonly expiresAt?: SimTime;
}
```

The host retrieves or receives a proposal, revalidates it, and returns an
accepted, deferred, or rejected submission. Later canonical events resolve the
expected effects. Direct in-process `CortexWorldPort` integration remains a
supported adapter over the same proposal lifecycle.

### 6.4 Activation and cost control

Model reasoning must be event-driven rather than tick-driven.

Every activation records:

- deterministic trigger reasons;
- material world-state fingerprint;
- agent and world versions;
- selected cognitive tier;
- call, token, latency, and wall-clock budgets;
- cooldown and recent consideration keys;
- provider and fallback outcome; and
- whether a meaningful proposal or state transition resulted.

The Runtime must support deterministic-only actors and mixed populations. A
host can assign cognition tiers and budgets by actor, group, distance from the
player, narrative importance, or current world significance.

### 6.5 Provider boundary

Provider adapters remain optional. The Runtime consumes task-specific,
provider-neutral reasoners for goal formation, planning, and immediate
decisions.

Phase 4.0 requires:

- stable prompt and response schema identities;
- invocation deadlines and cancellation;
- strict output-size limits, including bounded reason-code fields;
- retry classification without silent recursive calls;
- recorded-provider execution for exact evaluation;
- usage and error records; and
- deterministic fallback policies.

Model routing, small-model tiers, and local providers are Phase 4.1 concerns
unless required to meet the flagship cost envelope.

### 6.6 Persistence ports

Phase 4.0 remains in-memory, but all new orchestration depends on repository
interfaces rather than concrete maps.

Required ports:

- `AgentStateRepository`;
- `WorldSessionRepository`;
- `CognitiveJobRepository`;
- `RunRepository`;
- `ArtifactRepository`; and
- `LeaseClock` or equivalent scheduler time boundary.

PostgreSQL and distributed queues are deferred until the in-memory contracts
survive the flagship world and Studio integration.

## 7. Portable artifacts

### 7.1 World Project

A World Project is the Studio authoring and Runtime launch unit.

It contains references or embedded immutable definitions for:

- project metadata and schema version;
- domain manifests;
- installed packs and dependency locks;
- host-adapter capability declarations;
- actor and group seeds;
- initial observer-safe knowledge;
- deterministic world fixture for local simulation;
- activation, budget, fallback, and safety policies;
- provider profiles without credentials;
- evaluation suites and interventions; and
- compatibility and content fingerprints.

Credentials, hidden provider reasoning, executable arbitrary code, and mutable
host state are never embedded.

### 7.2 World Run Bundle

A World Run Bundle records enough accepted data to replay without a model:

- project and compatibility fingerprints;
- session configuration and seed;
- canonical observer projections consumed by Cortex;
- accepted goal, plan, decision, proposal, submission, and outcome records;
- deterministic frame hashes;
- fallback and error diagnostics;
- checkpoints and branch lineage;
- provider metadata and usage, excluding credentials and hidden reasoning;
- final cognitive state fingerprints; and
- evaluation and human-review bindings where applicable.

Replay fails closed on compatibility mismatch, missing records, tampering,
different proposal order, different lifecycle transitions, or different final
state.

### 7.3 Baseline manifest

Baselines are immutable promotion records. A changed prompt, schema, pack,
domain, policy, corpus, or evaluator creates a new candidate. Existing frozen
baselines are never edited to match current code.

## 8. Cortex Studio functional specification

### 8.1 Author

- create or import a World Project;
- edit metadata, domains, actors, groups, policies, and evaluation scenarios;
- validate JSON-schema and semantic references;
- preview compiled entities, capabilities, goals, packs, and budgets;
- show compatibility fingerprints and migrations; and
- export a portable source bundle.

Phase 4.0 may use a structured JSON editor plus high-value forms. A complete
node editor is not required.

### 8.2 Simulate

- start, pause, step, stop, reset, checkpoint, restore, and branch;
- inject declared world interventions;
- select deterministic, recorded, or live providers;
- control simulation speed without altering canonical simulation time;
- show active and deferred actors; and
- expose provider status without blocking state inspection.

### 8.3 Inspect

Studio must expose:

- canonical host events supplied to the local fixture;
- observer projections by actor;
- current traits, beliefs, memories, relationships, goals, plans, and
  obligations;
- activation reasons and deferrals;
- offered and selected capabilities;
- accepted and rejected proposals;
- action submissions and authoritative outcomes;
- state and frame fingerprints;
- fallback and error diagnostics; and
- usage, latency, and meaningful-progress counters.

No view stores or reconstructs hidden chain-of-thought.

### 8.4 Evaluate

- define controlled cases and interventions;
- run repeated deterministic, adversarial, recorded, and live cohorts;
- compare providers, prompts, packs, activation policies, and scripted controls;
- distinguish schema validity, legality, defensibility, preference, diversity,
  sensitivity, safety, repetition, progress, and cost;
- display confidence intervals and per-case distributions;
- attach human review to an immutable cohort; and
- promote a reviewed candidate baseline without mutating prior baselines.

### 8.5 Compare

Every flagship evaluation includes at least two agency implementations behind
the same host contract:

1. deterministic scripted or state-machine control; and
2. Cortex bounded autonomy.

The product must demonstrate a perceptible advantage in at least one target
behavior—adaptation, differentiated goals, offscreen consequences, knowledge
use, recovery, or trajectory diversity—without unacceptable regressions in
authority, latency, repetition, or cost.

## 9. Flagship autonomous society

The flagship world lives outside Cortex Core in a separate application
repository. It is a product proof and Studio fixture, not a built-in genre.

### 9.1 Minimum world

- 8 autonomous actors;
- 2 competing or partially aligned groups;
- 5 locations;
- 3 scarce resources;
- asymmetric private and shared knowledge;
- relationships and at least one explicit obligation;
- registered goals for survival, acquisition, protection, investigation,
  cooperation, and influence;
- multi-step capabilities with authoritative success and failure;
- offscreen activity;
- deterministic world mechanics and event ordering; and
- operator interventions that materially change available strategies.

### 9.2 Required demonstration scenarios

1. **Scarcity:** a resource shortage forces several defensible strategies.
2. **Conflicting information:** actors receive different evidence and should
   not behave omnisciently.
3. **Broken commitment:** an authoritative failure makes an active plan
   impossible and requires recovery or escalation.
4. **Group pressure:** individual and faction goals conflict without scripting
   one required outcome.
5. **External intervention:** the operator changes the world and stale
   cognition is discarded.
6. **Longitudinal run:** the world advances far enough to expose repetition,
   collapse, starvation, or cost problems.

### 9.3 Presentation

The first UI is an operational world dashboard:

- event timeline;
- map or location occupancy view;
- actor and group inspector;
- goal and plan lifecycle;
- resource state;
- knowledge and relationship projections;
- proposal and outcome stream;
- branch comparison; and
- concise deterministic summaries.

Polished prose is optional and cannot be used to conceal repeated or
incoherent canonical behavior.

## 10. Quality and acceptance gates

### 10.1 Authority

- zero model-authored canonical world mutations;
- every executed action traces to a registered capability, accepted decision,
  host revalidation, and authoritative outcome;
- no private fact appears in an unauthorized actor projection;
- replay makes zero model calls; and
- tampered artifacts fail closed.

### 10.2 Runtime correctness

- 100% schema-valid committed cognition;
- stale model results never commit;
- duplicate events and jobs are idempotent;
- obligations cannot be silently abandoned;
- terminal goal and plan transitions are irreversible; and
- no world-specific identifier is imported by Runtime packages.

### 10.3 Behavioral quality

- all controlled cases are legally defensible;
- materially changed evidence produces measured behavioral sensitivity;
- no single goal or plan dominates cases designed for multiple strategies
  beyond the frozen collapse threshold;
- repeated proposals against unchanged material state are deferred or rejected;
- failures produce recovery, replanning, escalation, or a bounded terminal
  state; and
- human review can follow cause and effect without reading provider internals.

### 10.4 Product value

- the society world is authored without modifying Cortex Runtime source;
- a second existing domain still passes the same conformance path;
- Studio can reproduce a selected failed cohort run exactly;
- the Cortex implementation demonstrates at least one reviewed behavioral
  advantage over the scripted control; and
- a developer can create, run, inspect, export, and replay a local project from
  documented commands.

### 10.5 Performance and cost

Initial targets, excluding external provider latency:

- deterministic scheduling, validation, state transition, and proposal
  bookkeeping for the 8-actor world complete within 50 ms per host step on the
  reference development machine;
- idle or unchanged actors cause zero provider calls;
- every provider call has a declared deadline and token budget;
- cohort reports include calls, tokens, latency, fallbacks, and meaningful
  accepted outcomes; and
- cost is evaluated per meaningful accepted outcome and per completed
  trajectory, not only per call.

These are candidate targets and must be frozen with machine metadata when the
first baseline is accepted.

## 11. Security and trust boundaries

- world, character, and scenario text is untrusted provider input;
- provider output is unknown data until schema and semantic validation pass;
- API keys come only from process or deployment secrets;
- project exports contain no credentials;
- reason codes and all free-text fields have explicit length and character
  limits;
- logs contain metadata and accepted structured outputs, not hidden reasoning;
- imported projects cannot execute arbitrary code;
- host adapters are trusted application code installed outside portable data;
- Studio binds to localhost in Phase 4.0; and
- observer-safe projections are tested independently from UI presentation.

## 12. Repository strategy

### 12.1 `cortex`

Owns public contracts, domain and pack SDKs, Runtime, standard packs, provider
adapters, generic replay and inspection contracts, and authoritative product
specifications.

### 12.2 `cortex-sandbox-sim`

Remains the compatibility and evaluation reference while generic run, cohort,
and baseline services are extracted into product packages. Drone and colony
fixtures remain external conformance worlds.

### 12.3 `cortex-living-story`

Remains a downstream research application. Reusable project, session,
Workbench, replay, and review patterns may be extracted through public
contracts. Story-specific code is not moved into Core.

### 12.4 New repositories

Do not create new repositories during Slice A. At the end of Slice A, decide
whether Studio and the flagship world require one repository or two based on
the stabilized artifact and service boundaries. The likely target is:

```text
cortex/                    public SDK and Runtime
cortex-sandbox-sim/        conformance and evaluation fixtures
cortex-living-story/       maintained research application
cortex-studio/             Studio application and generic service layer
cortex-society-sim/        flagship autonomous-world project
```

## 13. Delivery plan

### Slice A — Product contracts and baseline integrity

Size: medium
Purpose: make the current research code safe to build a product on.

Deliverables:

1. resolve the sandbox prompt-version baseline drift without changing frozen
   manifests;
2. freeze package, schema, prompt, and compatibility identities used by new
   runs;
3. define versioned World Project, World Session, Action Proposal, World Run
   Bundle, and Baseline Manifest public contracts;
4. add strict length limits to provider-generated identifiers and reason codes;
5. introduce the Runtime composition-root and repository interfaces with
   in-memory adapters;
6. preserve direct `CortexWorldPort` behavior through a proposal-lifecycle
   adapter;
7. add contract and migration tests; and
8. record the Studio/flagship repository decision.

Exit criteria:

- Core, sandbox, and applicable Living Story tests pass;
- all frozen baselines remain byte-for-byte unchanged;
- an existing drone run exports and replays the new generic run envelope;
- no drone, colony, story, or society identifier enters Runtime source; and
- the public contracts are documented with one complete host integration
  example.

### Slice B — Headless World Session

Size: large
Purpose: provide a generic sustained multi-agent runtime independent of Living
Story.

Status: complete (2026-08-30). The implementation and verification record is
in [phase-4.0-slice-b-handoff.md](phase-4.0-slice-b-handoff.md).

Deliverables:

- session lifecycle and budgets;
- batch observer-event ingestion;
- event-driven activation and deferral;
- proposal-first host integration;
- action submission and outcome ingestion;
- checkpoints, branches, and generic zero-model replay;
- session inspection and usage aggregation; and
- deterministic and recorded-provider tests.

Exit criteria:

- drone and colony can execute through the World Session API;
- at least four agents can run concurrently without shared private state;
- checkpoint/resume matches uninterrupted execution; and
- replay reconstructs accepted cognition and final state with zero model calls.

### Slice C — Flagship society simulation

Size: large
Purpose: prove useful autonomous world behavior before building the full UI.

Status: complete (2026-08-30); project-owner human value review accepted. See
[phase-4.0-slice-c-handoff.md](phase-4.0-slice-c-handoff.md).

Deliverables:

- external society domain and packs;
- deterministic host mechanics;
- eight actors, groups, resources, knowledge, relationships, and obligations;
- six required demonstration scenarios;
- scripted control and Cortex agency implementations;
- headless timeline and inspection reports; and
- offline behavioral cohort.

Exit criteria:

- no Core changes are required for society vocabulary;
- authority, knowledge, replay, and recovery gates pass;
- longitudinal runs expose no unbounded repetition or provider-call loop; and
- human review identifies a concrete Cortex advantage over scripted control.

### Slice D — Cortex Studio local product

Size: large
Purpose: turn the headless product into a usable developer workflow.

Deliverables:

- local Studio server and application shell;
- World Project authoring, validation, preview, import, export, and launch;
- simulation lifecycle and interventions;
- event, actor, group, cognition, proposal, budget, and usage inspection;
- checkpoint, replay, branch, and comparison views; and
- no dependence on Living Story prose, scenes, or threads.

Exit criteria:

- a developer can launch the society project from a clean checkout;
- malformed projects receive precise diagnostics;
- private knowledge is not leaked by the inspector;
- all controls use the same Runtime authority path as headless execution; and
- a failed run can be selected and exactly reproduced from Studio.

### Slice E — Evaluation, comparison, and product baseline

Size: medium-to-large
Purpose: prove Cortex adds value rather than merely adding model calls.

Deliverables:

- deterministic, adversarial, recorded, and live society cohorts;
- state-machine versus Cortex comparison;
- behavioral, safety, performance, and cost metrics;
- cohort-bound human review;
- immutable candidate and accepted baseline process; and
- an integration-readiness report.

Exit criteria:

- all authority and correctness gates pass;
- live validity and defensibility meet frozen thresholds;
- the reviewed Cortex advantage is measurable and repeatable;
- provider costs and latency fit the declared prototype envelope; and
- the Phase 4.0 baseline is explicitly promoted.

## 14. Post-Phase 4.0 roadmap

Phase 4.1 — Production adapters:

- PostgreSQL repositories and migrations;
- durable scheduler and job reconciliation;
- provider routing and smaller-model tiers;
- authentication-ready service API;
- Unity, Godot, or custom-engine adapter proof;
- load, soak, failure-recovery, and cost testing; and
- package publication and semantic-version policy.

Phase 4.2 — Early product pilots:

- documented SDK onboarding;
- selected external developer projects;
- Studio collaboration and artifact storage;
- enterprise deployment requirements; and
- evidence-based pricing and packaging.

Hosted control plane, marketplace, billing, and broad engine integrations remain
conditional on successful pilots.

## 15. Stop conditions

Phase 4.0 pauses for architectural review if any of the following occurs:

- the flagship world requires society-specific fields in Runtime;
- providers must invent legal actions or canonical outcomes to remain useful;
- replay cannot remain zero-model and fail-closed;
- private knowledge cannot be reliably isolated;
- model calls scale with every actor on every host tick;
- Cortex shows no reviewed advantage over the scripted control;
- acceptable behavior requires hidden scenario-specific prompt answers; or
- Studio begins accumulating story, game-engine, or hosted-control-plane
  responsibilities that violate the product boundary.

## 16. Immediate starting checklist

Slice A begins with this order:

1. create a Phase 4.0 implementation branch;
2. capture current package and prompt identities;
3. repair sandbox baseline compatibility through a new explicit candidate or
   compatibility fixture;
4. add the new public artifact contracts behind schema-v1 identifiers;
5. write contract round-trip, tamper, migration, and compatibility tests;
6. introduce repository interfaces with existing in-memory behavior as the
   reference implementation;
7. route the drone scenario through the generic run envelope;
8. verify all three repositories; and
9. document the repository split decision before Slice B.

No live provider run is required until deterministic Slice A acceptance passes.
