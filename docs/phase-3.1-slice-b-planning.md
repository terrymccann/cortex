# Phase 3.1 Slice B: Capability Planning and Deterministic Manager

Status: implemented on `phase-3.1-bounded-emergent-autonomy`

## Outcome

Slice B adds bounded high-level planning above an active registered goal. Game
domains own versioned capability vocabulary and optional strategy grammars. The
optional `cortex:planning` pack owns planning frames, proposal validation,
diagnostics, deterministic fallback, and committed plan state.

The boundary remains deliberately non-executing: a committed plan says which
registered capabilities an agent intends to attempt and their partial order.
It does not make a capability feasible, choose an immediate intention, submit
an action, or assert that an effect occurred. Those responsibilities remain
with the authoritative simulation and Slice C coordination.

## Domain contracts

Every capability declares an exact version, object parameter schema, target
types, supported goals, requirements, risks, potential effects, backing action
IDs, normalized planning cost, and incompatibilities. Registration rejects
unknown or cross-domain references and requires the goal/capability relevance
relationship to be explicit in both directions.

A strategy template is an optional partial-order grammar. Its named stages
offer one or more registered capabilities, dependencies, and optionality. The
registry rejects duplicate or cyclic stages, capabilities that do not support
every strategy goal, and success or failure conditions that do not match those
goals. Templates offer alternatives; they do not encode world mechanics or
guaranteed outcomes.

Adding `capabilities` and `strategies` as explicit manifest collections
completes the autonomy portion of domain manifest v2. Their contents participate
in existing canonical domain and pack fingerprints.

## Planning frame and reasoner

`PlannerReasoner` is provider-neutral and distinct from both `GoalReasoner` and
the immediate `ControllerReasoner`. It receives exactly one active goal plus:

- only registered capabilities relevant to that goal;
- applicable strategy templates allowed by policy;
- observer-visible grounded entity references;
- active obligation IDs;
- validated installed frame sections; and
- deterministic step, depth, and parallelism bounds.

Its structured proposal names the active goal, optional strategy, capability
steps, dependency edges, registered conditions, acknowledged obligations, and
a stable reason code. Unknown fields and malformed steps are rejected.

## Deterministic Plan Manager

The manager validates proposals as untrusted data. It enforces:

- exact active-goal identity and absence of another active plan;
- capability identity, version, goal relevance, parameter schema, and grounded
  target type;
- selected strategy stages, alternatives, required stages, dependency grammar,
  and conditions;
- unique step IDs, acyclic dependencies, and configured length, depth, and
  concurrency bounds;
- registered goal success and failure conditions plus semantic reachability of
  the success effect;
- mutually incompatible and policy-protected capabilities;
- exact acknowledgement of every active obligation; and
- cancellation and optimistic state freshness before commitment.

A valid plan begins `active`. Root steps begin `available`; dependent steps
begin `pending`. The reducer accepts only the manager's initial commitment in
this slice. Step advancement, blocking, completion, invalidation, and replanning
are reserved for Slice C so no model can self-report execution or success.

Provider failure leaves goal state unchanged. A designer may register one
deterministic fallback function that must return the same validated proposal
shape. If it returns nothing, the manager reports `no-plan`. Invalid semantic
model output is rejected and is not silently repaired or replaced by fallback.

## Optionality and ownership

The planning pack depends on `cortex:goals` version 2 and owns only
`cortex-planning:state`. An agent without the planning pack has no planning
slice or planning frame contribution and receives a stable
`pack-not-installed` result. No drone, colony, social, or other genre branch was
added to the kernel or standard pack.

## Reference proof

The separate sandbox registers drone and colony capabilities and strategy
grammars through public domain contracts. The drone proof first forms the
grounded `drone:report-intelligence` goal and then commits a plan using
`drone:transmit-intelligence`. It asserts that no immediate decision, action,
expectation, or world effect was created. A paired adversarial case proves that
an invented capability cannot enter committed plan state.

## Verification boundary

The core suite covers valid partial-order commitment, readiness state, unknown
and wrong-version capabilities, invalid parameters and targets, strategy and
condition mismatch, cycles, bounds, reachability, incompatibility, policies,
obligations, duplicate active plans, stale state, cancellation, fallback,
diagnostics, and missing-pack behavior.

The completed default matrix makes no provider calls: Cortex passes build and
91 tests across 15 files; the sandbox passes build and 38 tests across 9 files.
Coordination with authoritative feasibility and outcomes begins in Slice C.
