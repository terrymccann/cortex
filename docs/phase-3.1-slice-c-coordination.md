# Phase 3.1 Slice C: Coordination, Outcomes, and Replanning

Status: implemented on `phase-3.1-bounded-emergent-autonomy`

## Outcome

Slice C connects committed capability plans to the existing authoritative
decision and action loop. It does not grant plans authority over feasibility or
world state. The simulation still supplies legal immediate intentions,
revalidates skill preconditions, accepts or rejects actions, and emits observed
outcomes.

The authority order is now executable:

```text
world-feasible intentions
  -> due obligation filter
  -> strict/adaptive/advisory plan coordination
  -> bounded Controller decision
  -> deterministic skill and world submission
  -> observer-visible action awareness
  -> deterministic plan-step transition
```

## Runtime integration boundary

`BoundedController` accepts an optional provider-neutral
`IntentionCoordinator`. The runtime contract knows only state, feasible
intentions, due obligations, simulation time, and an eligible-or-blocked
result. It contains no goal, plan, capability, pack, drone, colony, or genre
branch.

The hook runs only after existing due-obligation enforcement. A coordinator
cannot add an intention that the world did not return. Agents that do not
install or pass a coordinator retain the pre-Slice-C controller behavior.

An explicit `coordination-blocked` result prevents an empty coordinated choice
set from being mistaken for a provider failure or silently replaced by a
fallback action.

## Plan Coordinator

The planning pack implements three deterministic policy modes:

- `strict` exposes only feasible intentions backed by currently available plan
  capabilities;
- `adaptive` also exposes designer-declared urgent intention kinds; and
- `advisory` preserves the complete authoritative feasible set.

Capability matching uses registered action mappings, exact capability version,
and exact planned target membership in the intention's world-supplied targets.
Parameters remain plan semantics; the deterministic skill owns concrete action
arguments and preconditions.

Due obligations always take precedence over plan filtering. When a strict or
adaptive plan has available steps but no matching feasible intention, the
coordinator records the plan as blocked and returns `plan-no-feasible-step`.
When a committed step is awaiting an outcome, it returns
`plan-awaiting-outcome` without inventing another decision.

## Step and plan lifecycle

The planning reducer now owns these deterministic transitions:

```text
pending -> available -> committed -> succeeded
                              |-> failed
failed -> available                 bounded retry only

active -> completed | blocked
blocked -> active                   bounded retry
blocked -> invalidated              bounded replacement preparation
```

A plan-compatible decision records its decision ID on exactly one
deterministically selected available step. An accepted submission records the
action ID. Rejected or deferred submission blocks a required step without
claiming an outcome.

Successful or failed execution is reconciled only from the core action
awareness state. Successful effects must cite observer-visible event IDs.
Expectation expiry is a deterministic failure; partial success that remains
unresolved beyond every expected-effect deadline also fails. Required-step
failure blocks the plan. Successful dependencies release pending steps.

A plan completes only when every required step succeeded. Remaining optional
steps are then deterministically skipped with a stable reason. Completed and
other terminal plans are retained in bounded recent history when a later plan
is committed.

## Bounded recovery and escalation

`PlanRecoveryManager` has explicit designer limits for:

- retries per failed step;
- replacement plans per goal instance; and
- plan age in simulation time.

Preparing a replacement archives the blocked plan and clears the active slot;
the existing `PlanManager` must still validate any replacement proposal.
Reaching the replacement limit creates a structured escalation instead of a
recursive planner call. Horizon expiry blocks the plan deterministically.

An impossible due obligation can be recorded as
`obligation-unfulfillable`. The obligation remains active; escalation never
marks it satisfied or deletes it. Duplicate escalations are suppressed and
stored escalation/history collections are bounded.

## Reference proof

The separate sandbox runs a two-step drone trajectory chosen as a free-form
registered-capability plan rather than a forced template:

```text
report intelligence -> withdraw
```

The authoritative world offers reporting, withdrawal, and continued scouting.
Strict coordination selects reporting first. Only after the accepted report
action produces a grounded `intelligence-reported` observation does withdrawal
become available. The second accepted action produces a grounded location
observation, after which the plan completes. Both actions use existing drone
skills and world constraint evaluators outside Cortex core.

## Verification boundary

Deterministic coverage includes all three coordination modes, strict controller
integration, obligation precedence, explicit blocked state, decision-to-step
linkage, accepted submission linkage, grounded success, rejected submission,
bounded retry, bounded replacement, horizon expiry, terminal-plan history, and
obligation escalation.

The completed matrix makes no provider calls: Cortex passes build, typecheck,
and 99 tests across 15 files; the sandbox passes build, typecheck, and 39 tests
across 10 files. Accepted goal and plan record schemas, full trajectory replay,
and inspector output remain assigned to Slice D.
