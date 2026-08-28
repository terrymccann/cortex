# Cortex Cognitive Layer: Technical Design

Status: implementation baseline  
Scope: Cortex runtime and its simulation boundary  
Language target: TypeScript on Node.js

The extension and standalone-product boundary is specified separately in
[product-architecture.md](product-architecture.md). The contracts in this
document remain the behavioral foundation for that reusable SDK.

## 1. Purpose

Cortex is a PIANO-inspired cognitive layer for simulated agents. It exists to
produce coherent, persistent, bounded behavior in an evolving world while
keeping routine behavior cheap and keeping objective reality under deterministic
simulation control.

Cortex is not:

- the authoritative world simulation;
- an LLM-driven game loop;
- a dialogue system with memory attached;
- a collection of one process per agent;
- a requirement that every agent continually invokes an LLM; or
- a license for model output to create items, move actors, transfer resources,
  or declare that an action succeeded.

The first proof is a headless vertical slice. Rendering, broadcasting, the
Narrative Director, and production infrastructure are adjacent systems and are
deliberately outside the first implementation boundary.

## 2. Architectural invariants

These rules are requirements, not preferences.

1. **The simulation owns truth.** Cortex receives observations and action
   outcomes. It never writes world state.
2. **Belief is not truth.** An agent may hold incomplete, uncertain, or false
   beliefs without altering the world.
3. **Models choose bounded intentions.** Every model-facing decision includes a
   closed set of feasible high-level actions. Free-form text is never executed.
4. **Mechanics remain deterministic.** Navigation, inventory transfer,
   construction, damage, timing, and other mechanics belong to ordinary code.
5. **One decision coordinates behavior.** Speech and action are conditioned on
   the same committed high-level intention.
6. **Intention is not outcome.** An action is successful only when confirmed by
   authoritative observations.
7. **Slow cognition cannot pause the world.** Expensive work is asynchronous,
   versioned, cancellable, and safe to discard.
8. **Modules do not share mutable state.** They read immutable snapshots and
   return typed, ownership-scoped patches.
9. **The world keeps running through failure.** Invalid output, timeouts, queue
   outages, and provider outages have deterministic fallbacks.
10. **Cognitive cost follows significance.** Background agents use utility AI;
    rich cognition is promoted only when useful.
11. **Every consequential decision is auditable.** Inputs, feasible choices,
    selected intent, validation, model metadata, and resulting action outcomes
    are logged.
12. **Replay does not call a model.** Recorded cognitive decisions are replayed
    as inputs to deterministic reducers and skill execution.

## 3. System boundary

```text
AUTHORITATIVE SIMULATION
  world truth, clock, legality, mechanics, utility behavior
        |
        | perceptible events, action outcomes, feasible actions
        v
CORTEX
  agent interpretations, memories, beliefs, goals, plans, decisions
        |
        | intention + validated action request
        v
SIMULATION ACTION VALIDATOR
        |
        | accept/reject, then authoritative event
        v
AUTHORITATIVE SIMULATION
```

The boundary consists of two ports.

```ts
interface CortexWorldPort {
  getPerception(agentId: AgentId): Promise<PerceptionSnapshot>;
  getFeasibleIntentions(query: FeasibleIntentionQuery): Promise<FeasibleIntention[]>;
  resolveEntity(ref: EntityRef): Promise<ResolvedEntity | undefined>;
  validateAssumptions(assumptions: readonly WorldAssumption[]): Promise<AssumptionResult>;
  submitAction(command: ActionCommand): Promise<ActionSubmission>;
}

interface CortexRuntimePort {
  registerAgent(seed: AgentSeed): Promise<void>;
  ingest(event: PerceptibleWorldEvent): Promise<void>;
  advanceClock(time: SimTime): Promise<void>;
  setResolution(agentId: AgentId, tier: CognitiveTier, reason: TierReason): Promise<void>;
  inspect(agentId: AgentId): Promise<Readonly<AgentState>>;
}
```

`CortexWorldPort` is the only route from Cortex back into the world. The world
must validate every command even if Cortex already selected it from a feasible
set. Feasibility can change between planning and execution.

## 4. Core domain types

Opaque identifiers prevent accidental cross-domain substitution.

```ts
type Brand<T, Name extends string> = T & { readonly __brand: Name };

type AgentId = Brand<string, "AgentId">;
type EntityId = Brand<string, "EntityId">;
type EventId = Brand<string, "EventId">;
type DecisionId = Brand<string, "DecisionId">;
type ActionId = Brand<string, "ActionId">;
type GoalId = Brand<string, "GoalId">;
type PlanId = Brand<string, "PlanId">;
type MemoryId = Brand<string, "MemoryId">;
type JobId = Brand<string, "JobId">;
type SimTime = Brand<number, "SimTime">;

interface VersionStamp {
  readonly agentStateVersion: number;
  readonly worldVersion: number;
  readonly observedThroughSequence: number;
}
```

World time is a simulation value, not wall-clock time. Wall-clock timestamps are
recorded only for operations and observability.

## 5. Authoritative events and agent observations

Objective events and agent perceptions are different records.

```ts
interface WorldEvent<TType extends string = string, TPayload = unknown> {
  readonly id: EventId;
  readonly sequence: number;
  readonly worldVersion: number;
  readonly simTime: SimTime;
  readonly type: TType;
  readonly actor?: EntityRef;
  readonly targets: readonly EntityRef[];
  readonly location?: EntityRef;
  readonly payload: Readonly<TPayload>;
  readonly causedBy?: EventId | ActionId | DecisionId;
}

interface PerceptibleWorldEvent<T = unknown> {
  readonly event: WorldEvent<string, T>;
  readonly observer: AgentId;
  readonly channel: "seen" | "heard" | "told" | "felt" | "system";
  readonly clarity: number; // 0..1
  readonly observedFacts: readonly ObservedFact[];
}
```

The simulation produces the observer-specific projection. Cortex must not infer
that an agent perceived a global event merely because it exists in the event
log. This is how secrets, witnesses, rumors, and imperfect information remain
possible.

An observation is evidence for a belief; it is not automatically a belief and
is never a direct copy of all world truth.

## 6. Agent state

One authoritative state exists per cognitive agent inside Cortex.

```ts
interface AgentState {
  readonly id: AgentId;
  readonly version: number;
  readonly updatedAt: SimTime;

  readonly identity: Identity;
  readonly personality: Personality;
  readonly resolution: CognitiveResolution;

  readonly perception: PerceptionState;
  readonly beliefs: BeliefState;
  readonly needs: NeedsState;
  readonly emotions: EmotionalState;
  readonly relationships: RelationshipState;

  readonly workingMemory: WorkingMemory;
  readonly relevantMemories: readonly MemoryRef[];

  readonly goals: readonly Goal[];
  readonly activePlan?: Plan;
  readonly socialContext?: SocialContext;

  readonly currentDecision?: CommittedDecision;
  readonly currentAction?: ActionState;
  readonly expectations: readonly ActionExpectation[];

  readonly modules: Readonly<Record<ModuleId, ModuleRuntimeState>>;
}

interface Belief {
  readonly id: string;
  readonly subject: EntityRef;
  readonly predicate: string;
  readonly object: unknown;
  readonly confidence: number; // 0..1
  readonly sources: readonly EvidenceRef[];
  readonly acquiredAt: SimTime;
  readonly lastReinforcedAt: SimTime;
  readonly contradictedBy: readonly EvidenceRef[];
}

interface Relationship {
  readonly target: AgentId;
  readonly trust: number;       // -100..100
  readonly affection: number;
  readonly respect: number;
  readonly fear: number;
  readonly attraction: number;
  readonly resentment: number;
  readonly familiarity: number; // 0..100
  readonly lastInteractionAt?: SimTime;
}
```

Personality is structured and stable. Needs and emotions change frequently.
Relationships are directional: Marcus's trust in Elena is unrelated to Elena's
trust in Marcus unless an event changes both.

### 6.1 State store

```ts
interface AgentStateStore {
  snapshot(agentId: AgentId): Promise<Readonly<AgentState>>;
  apply(patch: StatePatch): Promise<PatchApplyResult>;
  appendDecision(record: DecisionRecord): Promise<void>;
}
```

`snapshot` returns an immutable value. `apply` is an atomic compare-and-apply
operation. Every accepted patch increments the state version once.

## 7. Typed patches and ownership

Modules never emit JSON Patch and never receive a mutable `AgentState`. Each
module returns a domain-specific patch containing only fields it owns.

```ts
interface PatchEnvelope<TPatch extends DomainPatch = DomainPatch> {
  readonly patchId: string;
  readonly agentId: AgentId;
  readonly module: ModuleId;
  readonly basedOn: VersionStamp;
  readonly triggeredBy: readonly EventId[];
  readonly idempotencyKey: string;
  readonly assumptions: readonly Assumption[];
  readonly rebasePolicy: "never" | "event-delta" | "commutative";
  readonly patch: TPatch;
}

type DomainPatch =
  | PerceptionPatch
  | ActionAwarenessPatch
  | MemoryPatch
  | SocialPatch
  | GoalPatch
  | PlanPatch
  | DecisionPatch
  | CommunicationPatch;
```

Ownership is enforced by the patch type and reducer registry.

| Module | May produce | Must not mutate |
|---|---|---|
| Perception | perceived entities, local situation, observations | beliefs, goals, inventory |
| Action Awareness | expectation status, action failures, outcome evidence | world outcome, plans directly |
| Memory | episodic memories, summaries, working-memory references | relationships, truth |
| Social Awareness | social signals, relationship deltas, social hypotheses | world facts, inventory |
| Goal Manager | create, reprioritize, suspend, satisfy goals | plan steps, actions |
| Planner | plan and plan assumptions | goals, current action |
| Cognitive Controller | one committed intention | mechanics, action outcome |
| Communication | utterance proposal conditioned on decision | decision, relationships |
| Skill Executor | no state patch; emits `ActionCommand` | all cognitive state |

Cross-domain effects are explicit follow-up events. For example, Social
Awareness may emit a `SocialInferenceProduced` event. The belief reducer may
consume that evidence; Social Awareness does not directly rewrite beliefs.

### 7.1 Patch acceptance

A patch is accepted only when:

1. its schema is valid;
2. its idempotency key has not already been applied;
3. its module owns the patch type;
4. numerical and referential invariants hold;
5. its world and agent assumptions still hold; and
6. its version policy permits application.

Controller decisions and plans use `rebasePolicy: "never"`. If based on stale
state, they are discarded and may be rescheduled. Event-derived relationship
deltas and memory ingestion use `event-delta`; they may apply to a newer state
only if the triggering events have not already been consumed and all referenced
entities remain valid. Truly commutative patches should be rare and proven by
tests.

## 8. Cognitive modules

```ts
type ModuleId =
  | "perception"
  | "action-awareness"
  | "memory"
  | "social-awareness"
  | "goal-manager"
  | "planner"
  | "controller"
  | "communication";

interface CognitiveModule<TPatch extends DomainPatch> {
  readonly id: ModuleId;
  readonly cost: "deterministic" | "small-model" | "reasoning-model";
  shouldRun(input: ModuleTriggerContext): ModuleRunDecision;
  run(input: ModuleRunInput): Promise<PatchEnvelope<TPatch> | NoChange>;
}

interface ModuleRunInput {
  readonly state: Readonly<AgentState>;
  readonly events: readonly PerceptibleWorldEvent[];
  readonly time: SimTime;
  readonly budget: CognitiveBudget;
  readonly signal: AbortSignal;
}
```

The initial modules are:

### Perception

Maintains the agent's current, local, observer-specific situation from inputs
supplied by the simulation. It is deterministic.

### Action Awareness

Matches authoritative observations against expectations created when actions
were submitted. It records success, partial success, failure, timeout, or an
unexpected outcome. It never infers success from an intention or utterance.

### Memory

Turns significant perceived events into observer-specific episodic memories,
retrieves useful memories for a situation, and consolidates repeated memories
into summaries. Initial scoring is deterministic; optional summarization may use
a model.

### Social Awareness

Interprets ambiguous social events such as sarcasm, threat, loyalty, public
disrespect, deception, or persuasion. Deterministic relationship arithmetic
applies the validated inference. A small model is allowed when signals are
ambiguous.

### Goal Manager

Creates, prioritizes, suspends, satisfies, and abandons goals. It is triggered by
material events, unmet needs, reflection intervals, or invalidated plans—not by
every tick.

### Planner

Converts one or more goals into a high-level plan with explicit assumptions and
success/failure criteria. It does not pathfind or perform mechanics.

### Cognitive Controller

Chooses exactly one intention from a supplied feasible set. It receives a
deliberately small cognitive frame, not the entire agent state.

### Communication

Generates an utterance act and optional surface text conditioned on the current
committed decision. It cannot contradict the decision's objective without
explicitly choosing a deceptive communication act that the decision permits.

### Skill Executor

Translates a committed intention into deterministic action commands. It is below
the cognitive modules and is not model-driven.

## 9. Scheduling and concurrency

Agents do not own loops or threads. A central scheduler reacts to events and due
times.

```ts
interface CognitiveJob {
  readonly id: JobId;
  readonly agentId: AgentId;
  readonly module: ModuleId;
  readonly basedOn: VersionStamp;
  readonly triggerEvents: readonly EventId[];
  readonly notBefore: SimTime;
  readonly deadline?: SimTime;
  readonly priority: number;
  readonly idempotencyKey: string;
  readonly assumptions: readonly Assumption[];
}

interface CognitiveScheduler {
  onEvent(event: PerceptibleWorldEvent): Promise<void>;
  onClock(time: SimTime): Promise<void>;
  claim(limit: number): Promise<readonly CognitiveJob[]>;
  complete(job: CognitiveJob, result: ModuleResult): Promise<void>;
  cancelWhere(predicate: JobPredicate, reason: CancellationReason): Promise<number>;
}
```

Recommended initial trigger cadence:

| Module | Typical trigger | Model use |
|---|---|---|
| Reflex/utility AI | simulation tick | none; outside Cortex |
| Perception | observation batch | none |
| Needs | simulation cadence | none; simulation-owned |
| Action Awareness | action-related observation or deadline | usually none |
| Memory ingestion | significant perceived event | usually none |
| Social Awareness | material social event | optional small model |
| Goal Manager | material event or 10–60 simulated seconds | optional model |
| Planner | new goal, invalidation, or failure | reasoning model |
| Controller | gated consequential decision | reasoning model |
| Communication | conversation turn permitted by decision | model |
| Reflection | simulated hours/days | model; post-MVP |

Jobs for deterministic modules may run inline. Model-backed jobs go through an
asynchronous executor. Redis/BullMQ is a production adapter, not part of the
domain contract.

### 9.1 Cancellation and invalidation

Every plan, decision, and expensive job declares assumptions such as:

- target exists and is alive;
- target remains accessible;
- agent remains conscious and available;
- goal remains active;
- relevant location is not under evacuation; and
- feasible action identifier is still offered by the world.

When an event contradicts an assumption, queued work is cancelled. Running work
receives an abort signal. A result that arrives anyway is validated and
discarded. Discarding a stale result is normal behavior, not an error.

## 10. Decision Gate and cognitive frame

Routine utility AI acts without a controller call. The Decision Gate decides
whether a situation deserves richer cognition.

```ts
interface DecisionGateScore {
  readonly consequence: number;
  readonly uncertainty: number;
  readonly novelty: number;
  readonly socialWeight: number;
  readonly conflict: number;
  readonly planFailure: number;
  readonly narrativeSignificance: number;
  readonly total: number;
}
```

The gate also checks tier capability, cooldown, remaining budget, existing
committed action, and whether a deterministic rule already resolves the case.
Weights and threshold are configuration and must be observable.

When opened, the Frame Builder constructs:

```ts
interface CognitiveFrame {
  readonly frameId: string;
  readonly agentId: AgentId;
  readonly basedOn: VersionStamp;
  readonly situation: SituationSummary;
  readonly urgentNeeds: readonly Need[];
  readonly activeGoals: readonly GoalSummary[];
  readonly currentPlan?: PlanSummary;
  readonly relevantBeliefs: readonly Belief[];
  readonly relevantMemories: readonly RetrievedMemory[];
  readonly importantRelationships: readonly Relationship[];
  readonly socialSignals: readonly SocialSignal[];
  readonly recentActionFailures: readonly ActionFailure[];
  readonly feasibleIntentions: readonly FeasibleIntention[];
  readonly constraints: readonly DecisionConstraint[];
}
```

Frame construction enforces per-section limits and a total token/byte budget.
Retrieval decisions are logged so the exact frame can be inspected later.

## 11. Structured model boundary

Providers are hidden behind task-specific reasoners.

```ts
interface ControllerReasoner {
  decide(frame: CognitiveFrame, signal: AbortSignal): Promise<ControllerOutput>;
}

interface ControllerOutput {
  readonly intentionId: string; // must match a feasible intention
  readonly objective: string;
  readonly commitment: number; // 0..1
  readonly reasonCode: ControllerReasonCode;
  readonly target?: EntityRef;
}
```

Goal formation is not embedded in the immediate controller output. Phase 3.1
uses a separate goal-reasoner and deterministic Goal Manager lifecycle so a
decision cannot smuggle a durable goal into state. See
[Phase 3.1: Bounded Emergent Autonomy](phase-3.1-bounded-emergent-autonomy.md).

The model cannot create an executable action type. `intentionId` must exactly
match an opaque ID supplied in `feasibleIntentions`. Targets must be drawn from
that intention's allowed arguments.

Each invocation passes through:

```text
frame builder -> schema-constrained provider -> parser -> schema validator
-> semantic validator -> stale/assumption validator -> typed patch reducer
```

World dialogue, names, memories, and other simulation text are untrusted data.
They are delimited as data and never interpolated into system instructions.
Provider output is treated as untrusted until all validators pass.

### 11.1 Model routing and fallback

Routing considers task kind, tier, budget, latency target, and significance. It
must be configuration-driven and provider-neutral.

On timeout, provider error, invalid schema, unknown intention, stale state, or
exhausted budget:

1. use a deterministic policy to select a safe feasible intention;
2. mark the decision as fallback-generated;
3. continue the simulation; and
4. emit metrics and a diagnostic record.

No retry may block the simulation. At most one asynchronous retry is allowed for
retryable infrastructure failure, subject to deadline and idempotency.

### 11.2 Decision obligations

A feasible intention may declare structured follow-up obligations: a closed set
of intention identifiers, a deadline measured in future decision cycles, and an
auditable reason. When that intention is committed, Cortex stores the
obligations in versioned agent state.

Obligations are engine constraints, not reminders written into a prompt. On the
last permitted decision cycle, the Controller intersects the authoritative
feasible set with every due obligation before constructing the cognitive frame.
Model output outside that constrained set is invalid and triggers a compliant
deterministic fallback. If the world offers no intention that can satisfy all
due obligations, the Controller returns `obligation-unfulfillable` without
calling a model; orchestration can then escalate, replan, or apply a domain
policy without pretending the commitment was honored.

This mechanism preserves model flexibility before a deadline while making
commitment compliance deterministic at the runtime boundary.

## 12. Decision broadcast and skill execution

An accepted controller result becomes a committed decision.

```ts
interface CommittedDecision {
  readonly id: DecisionId;
  readonly agentId: AgentId;
  readonly intention: FeasibleIntentionRef;
  readonly objective: string;
  readonly commitment: number;
  readonly reasonCode: ControllerReasonCode;
  readonly basedOn: VersionStamp;
  readonly assumptions: readonly Assumption[];
  readonly committedAt: SimTime;
  readonly expiresAt?: SimTime;
}
```

The decision is broadcast internally to Communication and Skill Execution.
Downstream outputs retain `decisionId`, creating one causal chain.

```ts
interface ActionCommand {
  readonly id: ActionId;
  readonly agentId: AgentId;
  readonly decisionId: DecisionId;
  readonly actionType: string;
  readonly arguments: Readonly<Record<string, unknown>>;
  readonly preconditions: readonly WorldAssumption[];
  readonly expectedEffects: readonly ExpectedEffect[];
  readonly issuedAt: SimTime;
}
```

The world returns accepted, rejected, or deferred. Acceptance means the command
entered world execution; it does not mean the intended effect occurred.
Action Awareness later resolves expectations against observed events.

## 13. Memory design

Structured knowledge remains structured. Vector retrieval is reserved for
episodic or narrative memories whose relevance cannot be captured by direct
keys alone.

```ts
interface EpisodicMemory {
  readonly id: MemoryId;
  readonly agentId: AgentId;
  readonly sourceEvents: readonly EventId[];
  readonly summary: string;
  readonly participants: readonly EntityRef[];
  readonly location?: EntityRef;
  readonly occurredAt: SimTime;
  readonly encodedAt: SimTime;
  readonly importance: number;
  readonly emotionalValence: number; // -1..1
  readonly emotionalIntensity: number; // 0..1
  readonly confidence: number;
  readonly reinforcementCount: number;
  readonly lastRecalledAt?: SimTime;
  readonly embedding?: readonly number[];
}
```

Initial retrieval is a hybrid ranking:

```text
score =
  semanticSimilarity * 0.40
  + participantOrLocationMatch * 0.20
  + importance * 0.15
  + recencyDecay * 0.10
  + emotionalIntensity * 0.10
  + goalRelevance * 0.05
```

Weights are configurable and evaluated, not treated as universal constants.
Hard filters for agent ownership, perceptual access, and time precede ranking.

Recency uses simulation time. Important or reinforced memories decay slowly;
trivial memories become ineligible for retrieval. Consolidation produces a new
summary memory that cites its source memories. Source records may be archived
but are not silently destroyed during the prototype.

The same objective event produces different memories for different observers.
Memory text records the agent's interpretation and confidence, not an assertion
of world truth.

## 14. Cognitive resolution and budgets

```ts
type CognitiveTier = 0 | 1 | 2 | 3;

interface CognitiveResolution {
  readonly tier: CognitiveTier;
  readonly promotedAt?: SimTime;
  readonly minimumUntil?: SimTime;
  readonly reasons: readonly TierReason[];
  readonly budget: CognitiveBudget;
}
```

| Tier | Intended behavior |
|---|---|
| 0 — Background | utility AI, basic needs and relationships, no regular model calls |
| 1 — Normal | memory and goals, occasional small-model social reasoning |
| 2 — Active | planning, rich social awareness, conversation, broader retrieval |
| 3 — Focus | strategic reasoning, reflection, richer context, strongest allowed model |

The Director may recommend significance, but Cortex owns promotion policy. Other
signals include direct player/viewer focus, leadership role, active crisis,
relationship to an active character, and recent consequential events.

Promotion is immediate when thresholds are met. Demotion uses hysteresis and a
minimum residency time to prevent oscillation. Tier changes affect future jobs;
they do not retroactively alter recorded decisions.

Budgets are expressed per simulated interval and by work class, for example:

```ts
interface CognitiveBudget {
  readonly periodEndsAt: SimTime;
  readonly smallModelCallsRemaining: number;
  readonly reasoningCallsRemaining: number;
  readonly generatedTokensRemaining: number;
  readonly concurrentJobsRemaining: number;
}
```

Budgets are policy inputs, never economy money, and must be deterministic during
replay.

## 15. Persistence model

The in-memory prototype implements repository interfaces. The first durable
adapter uses PostgreSQL; pgvector is an extension of the memory table rather
than a separate database.

Minimum durable records:

| Record | Purpose |
|---|---|
| `agent_state_snapshots` | periodic versioned cognitive snapshots |
| `agent_beliefs` | structured propositions, confidence, and evidence |
| `agent_relationships` | directional structured relationship values |
| `agent_memories` | episodic memories, scoring fields, embedding |
| `agent_goals` | goal lifecycle and priority |
| `agent_plans` | plan versions, assumptions, and invalidation |
| `cognitive_jobs` | asynchronous job lifecycle and idempotency |
| `decision_records` | exact frame reference, choices, output, and validation |
| `action_expectations` | expected effects and observed resolution |
| `model_invocations` | provider metadata, latency, usage, status, schema version |
| `processed_events` | per-agent/module event idempotency cursor |

The authoritative `world_events` table belongs to the simulation. Cortex stores
references or an ingestion ledger, not a competing copy of truth.

Redis/BullMQ may transport jobs and hold leases, cooldowns, or transient caches.
PostgreSQL remains the durable source of cognitive state and job outcomes.

## 16. Determinism and replay

Pure reducers, scoring functions, the Decision Gate, and the deterministic
fallback use a seeded random source passed explicitly through context. They may
not read ambient time or global randomness.

Every model-generated decision record includes:

- schema and prompt-template versions;
- frame hash and retriever configuration;
- complete feasible intention identifiers;
- raw structured provider result, subject to retention policy;
- parsed and validated output;
- provider/model metadata, latency, and usage;
- base agent/world versions;
- validation or rejection reason; and
- committed decision and resulting action identifiers.

Replay mode reads the recorded accepted output. If code changes make the record
invalid under a newer schema, replay fails loudly with a version error; it never
silently calls a model or invents a replacement.

World snapshots plus ordered events plus accepted decision records are
sufficient to reconstruct a run.

## 17. Observability

Required traces and metrics:

- module runs, duration, trigger, and outcome;
- queue wait and model latency;
- patch accepted, rebased, duplicate, rejected, or stale;
- assumption invalidations and cancellations;
- Decision Gate score and threshold;
- frame size and retrieval composition;
- model calls, tokens, cost estimate, validation failures, and fallback rate;
- decisions by agent, tier, intention, and reason code;
- action acceptance, rejection, success, partial success, and failure;
- tier promotions/demotions and budget exhaustion; and
- memory ingestion, retrieval, consolidation, and decay.

Every trace propagates `eventId`, `agentId`, `jobId`, `decisionId`, and `actionId`
where applicable. Logs must explain behavior without requiring access to hidden
model reasoning. `reasonCode` and selected evidence are audit fields; free-form
chain-of-thought is neither requested nor stored.

## 18. Reference vertical slice: Marcus and Elena

The first executable slice proves the architecture with two cognitive agents and
a minimal fake world.

### Initial state

- Elena is a council member trying to stop political violence.
- Marcus leads an emerging conspiracy against the mayor.
- Marcus asks Elena to join him.
- Elena distrusts Marcus, respects his influence, and has a relevant memory of
  him threatening a rival.
- Legal intentions supplied by the world are `accept`, `reject`,
  `report_marcus`, and `pretend_to_accept`.

### Trace

1. The fake simulation emits a private `CONSPIRACY_INVITATION` event perceptible
   to Elena.
2. Perception records Marcus, the invitation, location, and immediate context.
3. Memory retrieves the prior threat and Elena's earlier promise to protect the
   council.
4. Social Awareness produces a high-confidence coercion/recruitment inference
   and bounded relationship deltas.
5. The Decision Gate opens because consequence, social weight, conflict, and
   uncertainty exceed the threshold.
6. The world supplies four opaque feasible intentions with target constraints.
7. The Frame Builder includes the invitation, active safety goal, relevant
   beliefs and memories, Elena-to-Marcus relationship, social signals, and four
   legal intentions.
8. A scripted reasoner for the first test selects `pretend_to_accept`, with the
   objective of gathering evidence.
9. Validators confirm the output and current assumptions. The reducer commits
   one decision. A later goal-opportunity event may independently trigger the
   Phase 3.1 goal-formation lifecycle.
10. Decision broadcast conditions both the Communication module and Skill
    Executor. Elena's utterance signals guarded agreement; the action command is
    `RESPOND_TO_INVITATION` with the permitted response argument.
11. The simulation accepts the command and creates an expectation that Marcus
    observed an affirmative response.
12. In the success test, the simulation emits a matching observed outcome.
    Action Awareness marks success and Memory ingests Elena's interpretation.
13. In the failure test, a guard interrupts before Marcus hears the reply. The
    deadline passes without the expected observation. Action Awareness marks
    failure, the investigation plan is invalidated, and replanning is scheduled.
14. In the stale-result test, Marcus dies while the controller job is running.
    The returned decision fails its target-alive assumption and is discarded.
15. Replay uses the accepted decision record and produces the same action chain
    without invoking a reasoner.

This slice proves separation of truth and belief, observer-specific memory,
bounded decisions, decision/speech coherence, expectation grounding,
asynchronous invalidation, deterministic fallback, and replay.

## 19. Acceptance tests

The initial implementation is complete only when these tests pass.

### Authority

- No Cortex interface can directly mutate world state.
- A fabricated model action or target fails semantic validation.
- A once-feasible action rejected by the world is recorded as rejected, not
  successful.

### State and concurrency

- A module cannot apply another module's patch type.
- Duplicate event-derived patches are idempotent.
- A stale controller or planner result never commits.
- A safe event-delta patch can apply exactly once to a newer version.
- Cancellation and late completion produce the same final state.

### Belief and perception

- An unobserved world event does not enter an agent's perception or memory.
- Two observers can form conflicting memories from the same event.
- A false belief does not change the fake world's truth.

### Coherence and grounding

- Communication and skill execution reference the same `decisionId`.
- Communication cannot select a speech act incompatible with the decision.
- Intention alone never resolves an expectation.
- Matching authoritative evidence resolves success; deadline or contradiction
  resolves failure.

### Reliability

- Invalid, timed-out, and unavailable model responses choose a deterministic
  safe fallback.
- Budget exhaustion schedules no forbidden model job.
- Provider failure never prevents clock advancement or utility behavior.

### Replay

- A recorded scenario replays without a provider call.
- The same seed, events, and accepted decision records produce the same state
  hashes and action commands.
- An incompatible recorded schema fails explicitly.

### Cognitive resolution

- Promotion unlocks only the modules allowed by the new tier.
- Demotion observes minimum residency and hysteresis.
- Tier 0 creates no regular model jobs.

## 20. Initial repository shape

The first implementation should remain a small monorepo:

```text
apps/
  sandbox-sim/           # deterministic fake world and scenario runner
packages/
  contracts/             # shared world/event/action schemas
  cortex/                # runtime, modules, reducers, scheduler, frame builder
  cortex-testing/        # fixtures, scripted reasoners, replay harness
docs/
  technical-design.md
```

Recommended tooling: pnpm workspaces, strict TypeScript, Vitest, Zod or JSON
Schema/Ajv at external boundaries, and a lightweight build setup. Turborepo is
optional and unnecessary until multiple independent build pipelines exist.

Keep provider, queue, database, clock, random source, embedding, and world access
behind interfaces. The default test implementation of each is in-memory and
deterministic.

## 21. Implementation sequence

### Milestone 1 — Deterministic kernel

- branded contracts and runtime ports;
- immutable `AgentState` and in-memory state store;
- typed patch reducers and ownership validation;
- world event ingestion and idempotency;
- scheduler with a manual simulation clock; and
- fake world action validation.

### Milestone 2 — Grounded vertical slice

- Perception, Action Awareness, Memory, and Social Awareness;
- Decision Gate and bounded Frame Builder;
- scripted Controller reasoner;
- decision broadcast, Communication stub, and Skill Executor; and
- all Marcus/Elena success, failure, and stale-result tests.

### Milestone 3 — Model boundary

- versioned schemas and semantic validation;
- provider-neutral controller and communication adapters;
- routing, deadlines, cancellation, budgets, and deterministic fallback;
- invocation audit records; and
- prompt-injection boundary tests using hostile world dialogue.

Before emergent goal formation and planning, the product contracts complete
[Phase 3.0: Core Generalization and Extension Contracts](phase-3.0-core-generalization.md).
This is a bounded generalization pass over entity types, world constraints,
pack-owned state, composable frames, compatibility, and cross-domain
conformance. It does not add autonomous goal or plan generation.

The subsequent goal formation, capability planning, plan coordination,
replanning, inspection, evaluation, and replay requirements are specified in
[Phase 3.1: Bounded Emergent Autonomy](phase-3.1-bounded-emergent-autonomy.md).

### Milestone 4 — Persistence and scale adapters

- PostgreSQL repositories and migrations;
- pgvector hybrid retrieval and evaluation fixtures;
- Redis/BullMQ job transport with durable job reconciliation;
- snapshots and replay runner; and
- OpenTelemetry instrumentation.

### Milestone 5 — Integration surface

- real simulation adapter;
- Director significance input for cognitive tiering;
- operational admin inspection; and
- headless long-run simulations and cost/behavior reports.

Godot, broadcast overlays, TTS, AWS deployment, and broader world mechanics begin
only after the grounded vertical slice demonstrates that agents remain coherent
through success, failure, stale reasoning, false belief, and replay.

## 22. Deferred decisions

The following are intentionally deferred until measurements or integration
constraints exist:

- exact LLM providers and model routing;
- precise memory ranking weights and embedding model;
- production queue choice beyond the initial BullMQ assumption;
- final PostgreSQL table partitioning and snapshot cadence;
- whether consolidated source memories are archived or retained online;
- Director-to-Cortex significance scoring contract;
- conversation turn-taking policy for groups; and
- how much cognition a promoted background agent reconstructs from historical
  observations.

Deferring these does not block the deterministic kernel or reference vertical
slice.
