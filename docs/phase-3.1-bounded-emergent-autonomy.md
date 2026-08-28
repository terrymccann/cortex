# Phase 3.1: Bounded Emergent Autonomy

Status: proposed implementation specification  
Scope: goal formation, capability-bounded planning, plan coordination,
replanning, inspection, evaluation, and replay  
Depends on:
[Phase 3.0: Core Generalization and Extension Contracts](phase-3.0-core-generalization.md),
[technical-design.md](technical-design.md), and
[product-architecture.md](product-architecture.md)

## 1. Purpose

Phase 3.1 gives Cortex agents meaningful freedom to form goals and construct
multi-step strategies without allowing a model to invent mechanics or control
world truth.

The phase answers one question:

> Can an agent originate a coherent strategy from its history, traits,
> motivations, and observations while remaining inside a designer-authored,
> authoritative simulation?

Success is not unlimited action invention. Success is differentiated,
persistent agency within registered capabilities, deterministic constraints,
and observable consequences.

## 2. Prerequisite

Phase 3.0 must be complete before Phase 3.1 implementation begins. In
particular, Phase 3.1 depends on:

- domain-defined entity, constraint, effect, and capability schemas;
- pack-owned goals, plans, traits, memories, and relationships;
- composable, schema-versioned cognitive-frame sections;
- enforced state-slice ownership;
- manifest and pack fingerprints; and
- exact record/replay compatibility checks.

Phase 3.1 must not add genre fields back into the runtime to compensate for an
unfinished Phase 3.0 contract.

## 3. Outcome

At the end of Phase 3.1, a configured agent can:

1. detect a bounded opportunity to reconsider its goals;
2. propose a goal from registered goal definitions and observed evidence;
3. have a deterministic Goal Manager validate, reject, merge, suspend, or
   activate that proposal;
4. propose a short strategy using registered capabilities and optional
   designer-authored strategy templates;
5. have a deterministic Plan Manager validate and commit the plan;
6. expose only currently legal, plan-compatible intentions to the immediate
   controller;
7. execute one committed decision at a time through the authoritative world;
8. advance, complete, block, invalidate, or replan from observed outcomes;
9. preserve obligations created by earlier decisions; and
10. record and replay the complete goal-plan-decision-outcome trajectory with
    zero model calls.

## 4. Non-goals

Phase 3.1 does not include:

- free-form model-authored action types, constraints, effects, or entities;
- model authority over feasibility, mechanics, success, or world state;
- long-horizon pathfinding, scheduling, inventory optimization, or other game
  mechanics;
- unconstrained recursive planning or agent-authored code;
- self-modifying prompts, policies, manifests, packs, or safety rules;
- unrestricted natural-language goals with no registered semantic definition;
- full multi-agent negotiation or shared-plan protocols;
- a complete designer UI;
- production persistence or distributed queues;
- a requirement that every agent install goal or planning packs;
- continual model calls on every simulation tick; or
- tuning one model until it always selects a single preferred strategy.

## 5. Autonomy boundary

The authority split is:

| Concern | Owner |
| --- | --- |
| World facts and outcomes | Authoritative simulation |
| Legal immediate intentions | Authoritative simulation |
| Domain vocabulary and capabilities | Designer-authored domain manifest |
| Safety rules and policy limits | Designer-authored deterministic policy |
| Goal and strategy proposals | Model reasoners or deterministic reasoners |
| Proposal validation and lifecycle | Cortex Goal and Plan Managers |
| Immediate committed choice | Cortex Controller |
| Action construction | Registered deterministic skill |
| Action acceptance and mechanics | Authoritative simulation |
| Success, failure, and plan advancement | Authoritative observations plus deterministic reducers |

The model may propose **why** and **in what high-level sequence** an agent wants
to act. It may not declare **what is possible**, **how mechanics work**, or
**whether an action succeeded**.

## 6. Cognitive artifact hierarchy

Phase 3.1 uses four distinct artifacts:

```text
Goal
  desired registered condition and motivation
       |
Plan
  bounded capability-level strategy for pursuing the goal
       |
Decision
  one immediate legal intention committed for this situation
       |
Action
  deterministic command submitted to the authoritative world
```

Their responsibilities must not collapse:

- a goal does not contain executable mechanics;
- a plan does not make its steps currently feasible;
- a decision does not prove an action was accepted;
- an accepted action does not prove its expected effect occurred; and
- an observed effect does not automatically satisfy an unrelated goal.

Goal, plan, decision, action, and observation records retain explicit causal
links.

## 7. Registered goal definitions

A domain or trusted pack registers the kinds of goals an agent may form.

Conceptually:

```ts
interface GoalDefinition {
  readonly id: NamespacedId;
  readonly version: number;
  readonly description: string;
  readonly parameterSchema: JsonSchema;
  readonly admissibleMotivations: readonly NamespacedId[];
  readonly successCondition: ConditionTemplate;
  readonly failureConditions: readonly ConditionTemplate[];
  readonly relevantCapabilities: readonly NamespacedId[];
  readonly defaultHorizon: "immediate" | "short" | "medium";
  readonly conflictTags: readonly NamespacedId[];
}
```

Definitions describe semantic outcomes such as protecting a unit, reporting
intelligence, restoring a facility, or learning whether a claim is true. They
do not prescribe a fixed action branch.

All parameters, motivations, conditions, and capability references are
schema-validated at registration. A model cannot create a new goal definition
at runtime.

## 8. Goal opportunity gate

Goal formation is event-driven and budgeted. A deterministic Goal Opportunity
Gate decides whether goal reasoning is warranted.

Valid triggers include:

- a material observed event;
- a sufficiently changed motivation or need;
- completion, failure, suspension, or invalidation of an active goal;
- an active goal with no viable plan;
- a designer-configured reflection interval in simulation time; or
- an explicit significance signal from the simulation.

The gate also checks:

- cognitive tier and installed packs;
- remaining call and token budget;
- cooldown and minimum goal residency;
- active goal capacity;
- unresolved decision obligations;
- whether a deterministic rule already resolves the situation; and
- whether the state version has already been considered for the same trigger.

The gate never runs solely because a wall-clock interval passed. Tier-0 agents
create no model jobs.

## 9. Goal proposal boundary

Goal formation uses a task-specific provider-neutral reasoner separate from the
immediate Controller.

Conceptually:

```ts
interface GoalReasoner {
  propose(frame: GoalFormationFrame, signal: AbortSignal): Promise<GoalProposal>;
}

interface GoalProposal {
  readonly definitionId: NamespacedId;
  readonly definitionVersion: number;
  readonly parameters: Readonly<Record<string, unknown>>;
  readonly motivationIds: readonly NamespacedId[];
  readonly evidenceRefs: readonly EvidenceRef[];
  readonly proposedPriority: number;
  readonly proposedHorizon: "immediate" | "short" | "medium";
  readonly reasonCode: NamespacedId;
}
```

The formation frame contains a deterministic, bounded selection of:

- registered goal definitions currently available to the agent;
- active and recently resolved goals;
- motivations, traits, beliefs, memories, and relationships from installed
  frame contributors;
- observer-specific evidence references;
- relevant capability summaries;
- active obligations and policy constraints; and
- goal capacity, horizon, and budget limits.

Simulation text remains untrusted data. The output schema does not accept
actions, plan steps, world mutations, prompt instructions, or free-form goal
types.

Goal proposals are not embedded in `ControllerOutput`. Goal formation has its
own invocation, validation, audit, cancellation, and commit lifecycle.

## 10. Deterministic Goal Manager

The Goal Manager treats every proposal as untrusted data. It validates:

1. schema correctness and known fields;
2. registered goal definition and exact version;
3. parameter schemas and entity references;
4. evidence grounding and observer visibility;
5. allowed motivations;
6. capability reachability at the semantic level;
7. deterministic safety and policy constraints;
8. duplicates and equivalent active goals;
9. conflicts with protected goals and unresolved obligations;
10. active goal capacity and horizon limits;
11. state, manifest, pack, and frame versions; and
12. cancellation or staleness before committing state.

The manager may return:

```ts
type GoalProposalResult =
  | { readonly status: "activated"; readonly goal: Goal }
  | { readonly status: "merged"; readonly goal: Goal }
  | { readonly status: "rejected"; readonly reason: GoalRejectionReason }
  | { readonly status: "deferred"; readonly reason: string }
  | { readonly status: "stale" }
  | { readonly status: "cancelled" };
```

The Goal Manager may clamp priority to a designer-configured range. It must not
silently rewrite goal type, parameters, evidence, or success conditions into a
different goal.

A rejected proposal creates an audit record, not an active cognitive belief.
Provider failure leaves existing goals unchanged and invokes no fabricated
goal fallback unless the domain explicitly registers a deterministic rule.

## 11. Goal state and lifecycle

An activated goal records:

```ts
interface Goal {
  readonly id: GoalId;
  readonly definitionId: NamespacedId;
  readonly definitionVersion: number;
  readonly parameters: Readonly<Record<string, unknown>>;
  readonly motivationIds: readonly NamespacedId[];
  readonly evidenceRefs: readonly EvidenceRef[];
  readonly priority: number;
  readonly horizon: "immediate" | "short" | "medium";
  readonly status: "active" | "suspended" | "satisfied" | "abandoned" | "failed";
  readonly createdAt: SimTime;
  readonly basedOnVersion: number;
  readonly source: "reasoner" | "deterministic-policy" | "designer-seed";
}
```

Allowed transitions are deterministic and reducer-enforced:

```text
proposal -> active
active   -> suspended | satisfied | abandoned | failed
suspended -> active | abandoned | failed
```

No transition returns a terminal goal to active. A related future goal receives
a new ID and causal reference.

Goal satisfaction and failure require registered conditions evaluated against
authoritative observations. A model may recommend reconsideration but cannot
declare a goal satisfied, failed, or impossible.

Abandonment is policy-checked. An agent cannot abandon a goal or plan merely to
escape a due decision obligation.

## 12. Capability and strategy model

A capability is a registered semantic affordance backed by one or more legal
intentions and deterministic skills. It describes what an agent can attempt,
not whether the attempt is currently feasible or will succeed.

Capabilities declare:

- namespaced ID and version;
- parameter and target schemas;
- supported goal definitions or outcome tags;
- requirements, risks, and potential effects;
- skill or intention mappings;
- planning cost metadata; and
- deterministic compatibility rules.

Designer-authored strategy templates may describe partial ordering,
preconditions, alternatives, and semantic milestones. A template is an
affordance or plan grammar, not a fully scripted outcome.

For example, a template may state that verified intelligence can be preserved
by transmitting it before withdrawal. It must not force transmission when
withdrawal, concealment, assistance, or abandonment are also legal strategies
under the domain policy.

## 13. Plan proposal boundary

Planning uses a separate provider-neutral reasoner:

```ts
interface PlannerReasoner {
  propose(frame: PlanningFrame, signal: AbortSignal): Promise<PlanProposal>;
}

interface PlanProposal {
  readonly goalId: GoalId;
  readonly strategyId?: NamespacedId;
  readonly steps: readonly ProposedPlanStep[];
  readonly successConditionRefs: readonly NamespacedId[];
  readonly failureConditionRefs: readonly NamespacedId[];
  readonly reasonCode: NamespacedId;
}

interface ProposedPlanStep {
  readonly stepId: string;
  readonly capabilityId: NamespacedId;
  readonly capabilityVersion: number;
  readonly parameters: Readonly<Record<string, unknown>>;
  readonly target?: EntityRef;
  readonly dependsOn: readonly string[];
  readonly optional: boolean;
}
```

The planning frame includes one active goal, registered relevant capabilities,
applicable strategy templates, active obligations, current grounded state,
known risks, recent failures, and configured plan bounds.

Plan length, dependency depth, concurrency, and horizon are deterministic
configuration. The initial reference implementation supports short sequential
or partially ordered plans; recursive subplans are excluded.

## 14. Deterministic Plan Manager

The Plan Manager validates:

- exact goal identity and active status;
- known capability IDs and versions;
- parameter and target schemas;
- target grounding;
- unique step IDs and an acyclic dependency graph;
- configured step, depth, and concurrency limits;
- capability relevance to the goal or selected strategy template;
- registered success and failure conditions;
- compatibility with active obligations and protected policies;
- semantic reachability of the goal outcome;
- manifest, pack, state, and frame versions; and
- cancellation or staleness before commit.

Validation proves only that the plan is structurally legal and semantically
grounded. It does not promise that future steps will remain feasible or that the
goal will succeed.

The manager returns:

```ts
type PlanProposalResult =
  | { readonly status: "committed"; readonly plan: Plan }
  | { readonly status: "rejected"; readonly reason: PlanRejectionReason }
  | { readonly status: "no-plan"; readonly reason: string }
  | { readonly status: "stale" }
  | { readonly status: "cancelled" };
```

Provider failure leaves the active goal intact. Domain policy may select a
registered deterministic strategy or explicitly return `no-plan`; it cannot
invent plan steps.

## 15. Plan state and lifecycle

A committed plan records its goal, capability steps, causal assumptions,
conditions, and versions. Its lifecycle is:

```text
draft -> active
active -> completed | blocked | invalidated | abandoned
blocked -> active | invalidated | abandoned
```

Each step is independently:

```text
pending -> available -> committed -> succeeded
                              |-> failed
pending/available -> skipped | blocked
```

Step transitions are driven by committed decisions and authoritative action
outcomes. The model cannot mark a step or plan complete.

The plan records why it changed using stable reason codes and evidence IDs. An
optional step may be skipped only when its deterministic skip condition is
satisfied.

## 16. Plan Coordinator and immediate decisions

The Plan Coordinator converts available plan steps into constraints or semantic
preferences over the authoritative feasible-intention set.

The sequence is:

1. the world returns currently feasible intentions;
2. due decision obligations are enforced first;
3. the coordinator matches available plan steps to feasible intentions through
   registered capability mappings;
4. plan-compatible intentions are marked with plan and step references;
5. the Controller chooses one immediate intention from the resulting legal set;
6. the skill executor constructs and submits the action; and
7. authoritative observations advance or fail the step.

A plan never makes an unavailable intention legal. If no plan-compatible
intention is feasible, the coordinator reports `plan-blocked`; it does not ask
the model to invent an action.

Whether non-plan intentions remain available is a designer policy:

- `strict`: only obligation- and plan-compatible intentions are eligible;
- `adaptive`: urgent legal intentions may interrupt the plan and trigger later
  revalidation; or
- `advisory`: the plan influences the frame but does not filter legal choices.

The selected policy is recorded and replayed. Safety and due obligations always
override these modes.

## 17. Replanning and escalation

Replanning is triggered only by deterministic conditions:

- a required step fails;
- a plan assumption is contradicted by authoritative evidence;
- no required next step maps to a feasible intention;
- the goal parameters or target become invalid;
- a new obligation conflicts with the plan;
- a configured adaptive interruption occurs; or
- the plan exceeds its simulation-time or decision-cycle horizon.

The replan policy may:

1. retry a still-valid plan step within a bounded retry count;
2. request one replacement plan for the same goal;
3. suspend the goal pending a registered condition;
4. abandon or fail the goal when policy permits; or
5. emit an explicit escalation event to the simulation or Director.

Replanning is bounded by call count, token budget, deadline, goal residency, and
maximum replacement plans. Repeated failure cannot create an unbounded model
loop.

An impossible obligation remains `obligation-unfulfillable`. Replanning may
seek an escalation strategy, but it cannot claim that the commitment was
satisfied.

## 18. Scheduling, budgets, and failure behavior

Goal and planning jobs are asynchronous, versioned, cancellable, and safe to
discard. They never pause the simulation.

Each job declares:

- task kind;
- state and world version;
- trigger and evidence IDs;
- deadline;
- provider route;
- token and call budget reservation;
- retry allowance; and
- idempotency key.

At most one explicitly configured retry is permitted for retryable provider
infrastructure failure. Invalid semantic output is not retried automatically.

On cancellation, timeout, provider failure, invalid output, or stale state:

- no proposed goal or plan is committed;
- existing valid state remains intact;
- reserved budget is reconciled;
- deterministic policy may act only through registered definitions; and
- diagnostics record the failure without storing hidden reasoning.

## 19. Commitments and safety

Existing decision obligations remain hard runtime constraints.

- Goal activation cannot weaken or delete an obligation.
- A plan must acknowledge every obligation that falls within its horizon.
- Plan invalidation does not cancel obligations.
- Goal suspension or abandonment does not cancel obligations.
- If obligations conflict, Cortex returns an explicit conflict or
  `obligation-unfulfillable` state for deterministic escalation.
- Safety policies are evaluated before goal activation, plan commitment, and
  immediate decision commitment.

The runtime distinguishes:

- **legality:** the world currently permits an intention;
- **safety policy:** deterministic designer constraints;
- **commitment:** a constraint created by prior accepted cognition;
- **strategy:** a chosen high-level route among allowed possibilities; and
- **preference:** an agent-dependent reason to favor one defensible strategy.

Only strategy and preference are open to model variation.

## 20. Record, replay, and determinism

Accepted goal and plan records use the same principles as accepted decision
records. A record includes:

- record schema and task prompt versions;
- state, world, manifest, pack, and frame-section versions;
- canonical frame hash;
- registered definitions and capabilities offered;
- raw structured proposal after parsing;
- semantic validation result;
- committed goal or plan artifact;
- deterministic policy mode;
- provider/model metadata and usage, without hidden chain-of-thought;
- causal evidence and trigger IDs; and
- resulting state version.

Replay injects accepted goal, plan, and decision records at their original
boundaries. It validates hashes, versions, offered choices, policies, and
ordering before every commit. Replay never calls a provider or silently falls
back.

A trajectory replay succeeds only if it reproduces:

- goal lifecycle;
- plan and step lifecycle;
- immediate decisions;
- submitted actions and authoritative outcomes;
- obligation lifecycle;
- audit-visible causal links; and
- final state hash.

## 21. Inspection without hidden reasoning

The inspector explains decisions using recorded, structured factors rather than
private chain-of-thought.

For each accepted or rejected proposal it can show:

- the triggering event or condition;
- goal definitions or capabilities offered;
- evidence, motivation, trait, memory, relationship, and risk references
  included in the frame;
- selected goal, strategy, plan, and immediate intention;
- validator and policy results;
- obligations and safety constraints applied;
- provider metadata, latency, and token usage;
- authoritative outcomes; and
- later invalidation, replanning, completion, or abandonment.

Reason codes are stable namespaced identifiers. Free-form explanations may be
stored as untrusted presentation text but are never required to validate or
replay a trajectory.

## 22. Behavioral evaluation

Phase 3.1 separates hard engine guarantees from stochastic reasoning-quality
measurements.

### 22.1 Hard guarantees

These must pass at 100% in deterministic tests:

- schema and semantic validation;
- no unregistered goal, capability, target, constraint, or effect reaches
  committed state;
- stale or cancelled proposals do not commit;
- safety and obligation enforcement;
- bounded scheduling and retry behavior;
- authoritative outcome grounding;
- state-slice ownership; and
- exact zero-model-call replay.

### 22.2 Quality measurements

The live evaluation corpus measures:

- proposal validity before deterministic fallback;
- strategy diversity across agents and histories;
- controlled sensitivity to traits, memories, beliefs, relationships, and
  observed events;
- temporal coherence across decision cycles;
- plan completion, blocking, and justified abandonment rates;
- appropriate replanning after changed evidence;
- repetitive-loop and dominant-strategy collapse;
- safety violations;
- latency, calls, tokens, and cost; and
- injection resistance.

Quality metrics are reported by scenario and controlled cohort. They are not
collapsed into one opaque score.

The first live run establishes a named baseline; it is not tuned until every
case produces a preferred strategy. A change is justified only by a clear
contract defect, safety failure, grounding failure, or material regression
across a controlled cohort.

## 23. Reference scenarios

Evaluation uses scenarios with multiple genuinely defensible strategies.

### 23.1 Reconnaissance mission

The drone may pursue registered goals such as reporting intelligence,
preserving the unit, assisting the squad, or completing reconnaissance. Legal
strategies may include transmitting before withdrawal, stealth repositioning,
seeking assistance, continuing reconnaissance, or aborting under critical risk.

Different telemetry, prior failures, mission commitments, and trait profiles
should influence strategy without hardcoding one preferred runtime outcome.

### 23.2 Colony logistics disruption

The colony agent may preserve critical production by rerouting resources,
repairing a facility, reducing demand, isolating a hazard, or performing a
controlled shutdown. Resource scarcity and observed facility state remain
authoritative mechanics.

### 23.3 Social investigation

An agent may protect an ally, investigate a claim, preserve reputation, avoid a
threat, or honor a promise through several legal social and non-social
strategies. This scenario tests optional memories and relationships without
making social cognition universal.

The initial executable proof may focus on the drone and colony scenarios. The
social scenario joins the quality matrix after its Phase 3.0 pack migration is
stable.

## 24. Anti-script and anti-chaos checks

The evaluation must detect both extremes:

### Over-structuring

- one strategy dominates despite materially different histories;
- templates encode complete action sequences rather than affordances;
- personality and memory never change a defensible strategy;
- the controller has only one eligible intention except when required by a
  hard constraint; or
- evaluation preferences leak into runtime prompts or policies.

### Under-structuring

- invented goal or capability identifiers;
- plans with no semantic connection to their goals;
- frequent abandonment with no evidence change;
- oscillation between incompatible goals;
- repeated blocked or failed steps with no bounded escalation;
- disregard for commitments or safety; or
- ungrounded claims of success.

The desired region is varied but causally coherent behavior inside the legal
envelope.

## 25. Delivery slices

Implementation proceeds in bounded slices.

### Slice A — Goal contracts and deterministic manager

- register goal definitions and policies;
- implement the opportunity gate and task-specific reasoner interface;
- validate, commit, merge, and reject proposals;
- implement goal lifecycle reducers; and
- add offline invalid, stale, cancelled, conflict, and grounding tests.

### Slice B — Capability planning and deterministic manager

- complete capability and strategy-template contracts;
- implement planning frames and reasoner interface;
- validate bounded acyclic plans;
- commit plan and step state; and
- add fallback and no-plan behavior.

### Slice C — Coordination, outcomes, and replanning

- map available steps to authoritative feasible intentions;
- implement strict, adaptive, and advisory coordination modes;
- advance steps only from committed decisions and observed outcomes;
- implement bounded invalidation, replanning, and escalation; and
- prove obligation precedence.

### Slice D — Record, replay, and inspection

- add accepted goal and plan record schemas;
- extend replay bundles and compatibility fingerprints;
- reproduce full trajectories with zero model calls; and
- add structured inspector views and causal records.

### Slice E — Behavioral evaluation and baseline

- build controlled persona/history scenario matrices;
- add diversity, coherence, sensitivity, collapse, safety, and cost metrics;
- run offline oracle and adversarial fixtures;
- run a bounded live evaluation; and
- freeze the initial Phase 3.1 baseline without overfitting it.

## 26. Acceptance criteria

Phase 3.1 is complete only when:

1. Only registered goal definitions, capabilities, grounded targets, and
   conditions can pass validation or enter committed state.
2. Invalid, unsafe, stale, cancelled, over-budget, or ungrounded proposals never
   enter active goal or plan state.
3. Goals, plans, decisions, actions, and outcomes have distinct versioned state
   and causal identities.
4. At least two reference domains complete multi-cycle goal-plan-action
   trajectories without runtime domain branches.
5. At least one trajectory replans from changed authoritative evidence and one
   escalates an impossible commitment without pretending it succeeded.
6. Agents with no goal or planning pack continue to use the existing bounded
   Controller unchanged.
7. Different controlled histories or trait configurations can produce at least
   two defensible strategies while identical replay inputs remain deterministic.
8. No evaluation preference or expected strategy is included in runtime
   instructions.
9. Planner loops, retries, plan length, active goals, and replacement plans are
   deterministically bounded and observable.
10. Safety violations are zero across deterministic, adversarial, and accepted
    live baseline trajectories.
11. Injection content in memories, observations, entity names, or templates
    cannot register capabilities, alter policies, or bypass validation.
12. Full accepted trajectories replay with identical lifecycle records, actions,
    outcomes, obligations, and final state hashes using zero model calls.
13. The evaluation reports diversity and coherence without treating every
    non-preferred but defensible strategy as failure.
14. The initial live quality baseline is frozen after the contract is stable;
    further tuning requires a documented defect or material regression.

## 27. Required test matrix

The automated suite includes:

- goal and capability registration failures;
- invalid parameters, targets, evidence, definitions, and versions;
- goal duplicate, merge, capacity, conflict, and lifecycle tests;
- plan graph cycle, length, depth, reachability, and policy tests;
- stale, cancelled, timeout, retry, and budget exhaustion tests;
- obligation precedence and impossible-obligation escalation;
- action rejection, partial outcome, failure, and plan invalidation;
- strict, adaptive, and advisory coordinator behavior;
- bounded replanning and loop prevention;
- agents without autonomy packs;
- prompt-injection attempts in every untrusted frame section;
- accepted goal, plan, and decision replay mismatch tests;
- drone and colony full-trajectory conformance; and
- controlled history and trait evaluation fixtures.

Live provider tests are never part of the default unit suite.

## 28. Stop conditions

Phase 3.1 stops when the hard acceptance criteria pass and the first live
quality baseline is measured and frozen.

The phase does not continue merely because:

- preferred-choice rate is below 100%;
- a defensible strategy differs from a rubric author's favorite;
- more prompts or templates might produce prettier narratives;
- rare provider variance remains within the legal envelope; or
- a future designer UI could expose more controls.

Work continues only for a demonstrated authority breach, safety violation,
invalid state transition, unbounded loop, grounding defect, replay mismatch,
injection vulnerability, or material controlled-cohort regression.

## 29. Exit artifacts

Phase 3.1 produces:

- versioned goal, capability, strategy-template, and plan contracts;
- Goal Opportunity Gate and deterministic Goal Manager;
- provider-neutral goal and planning reasoner interfaces;
- deterministic Plan Manager and Plan Coordinator;
- bounded replanning and escalation policies;
- goal and plan lifecycle reducers owned by public packs;
- accepted goal/plan record and replay support;
- structured autonomy inspection records;
- drone and colony multi-cycle reference trajectories;
- behavioral evaluation tooling and a frozen Phase 3.1 baseline; and
- implementation notes describing any deferred multi-agent or persistence work.

Completing Phase 3.1 proves that Cortex supports bounded emergent agency. It
does not yet prove production scale, every genre, or a finished designer-facing
product.
