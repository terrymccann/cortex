# Phase 3.1 Slice D: Record, Replay, and Inspection

Status: implemented on `phase-3.1-bounded-emergent-autonomy`

## Outcome

Slice D makes accepted cognition a durable, inspectable trajectory. Goal and
plan managers now emit immutable accepted records alongside the existing
accepted-decision records. A complete goal-plan-decision-outcome run can be
replayed with zero model calls and must reproduce the same accepted records,
plan lifecycle, actions, outcomes, inspection report, and final state
fingerprint.

## Accepted records

`AcceptedGoalRecord` and `AcceptedPlanRecord` include:

- schema and cognitive-frame versions;
- exact frame and runtime-manifest fingerprints;
- domain, pack, state-slice, and frame-section compatibility components;
- the registered vocabulary offered to the reasoner;
- active obligations and the accepted structured proposal;
- the committed goal or plan and resulting state version; and
- optional provider-neutral reasoner metadata.

Replay reasoners return the recorded structured proposal. Before any state
commit, managers verify the current frame, manifest, offered vocabulary,
accepted artifact, outcome, and expected resulting version. Any difference
raises `ReplayMismatchError`; mismatched replay does not mutate agent state.

The record contains no chain of thought or hidden provider reasoning.

## Trajectory bundles

The sandbox adds `cortex-replay-bundle-v3` for the
`drone-autonomy-trajectory-v1` scenario. It contains accepted goal, plan, and
decision records plus the expected trajectory, final state fingerprint, and
structured inspection report. Replay consumes every record in order and fails
if records are missing, unused, incompatible, or reproduced differently.

Schema-v1 and schema-v2 live-runtime bundles remain immutable and continue
through their existing compatibility paths.

## Inspection

`CognitionInspector` creates a provider-neutral report showing:

- goal trigger, offered definitions, selected definition, motivations, and
  grounded evidence;
- plan goal, offered and selected capabilities, conditions, obligations, and
  source;
- decision eligibility, selected intention, reason code, commitment,
  obligations, and fallback metadata;
- plan-step lifecycle links to decisions, actions, and outcome events;
- recovery escalations; and
- structured goal and plan rejection diagnostics.

This is causal observability, not an attempt to expose hidden reasoning.

## Reference commands

From `cortex-sandbox-sim`:

```bash
corepack pnpm sim:autonomy
corepack pnpm sim:replay -- --bundle results/<autonomy-run>.replay.json
```

The first command uses deterministic reference reasoners to write a v3 bundle.
The replay command makes zero model calls and ends with
`AUTONOMY_REPLAY_RESULT matched=true ... modelCalls=0`.

## Verification

- Cortex core: 105 tests across 15 files, plus TypeScript build.
- Sandbox simulation: 40 tests across 10 files, plus TypeScript build.
- Full offline trajectory: one accepted goal, one accepted two-step plan, two
  accepted decisions, two authoritative actions, two observed outcomes, exact
  inspection equality, and zero-call replay.

Behavioral diversity and reasoning-quality baselines remain Slice E work.
