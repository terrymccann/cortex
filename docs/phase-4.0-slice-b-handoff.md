# Phase 4.0 Slice B implementation handoff

Status: complete
Date: 2026-08-30
Branch: `codex/phase-4.0-autonomous-world-platform`

## Delivered runtime surface

`@cortex/runtime` now exposes `HeadlessWorldSession` through the supported
`CortexRuntime` composition root. A session can start, pause, resume, stop, and
complete; register or retire actors; ingest ordered observer projections in
batches; receive material host revisions; and select due activations in stable
time-and-agent order. Independent activations execute concurrently, while each
provider request contains only that actor's observer projections.

The provider boundary supports deterministic, recorded, and live modes.
Activation results are checked against the session identity, actor, current
world version, and project capability registration. Pausing or changing the
session while cognition is in flight aborts work and records its result as
discarded rather than accepting stale output. Idle host steps do not invoke a
provider. Session limits bound activations, proposals, live provider calls,
per-step concurrency, cooldown, and consecutive no-progress steps; exhaustion
or deadlock becomes an explicit terminal lifecycle.

Actions remain proposal-first. Cortex records the bounded proposal; the host
returns an accepted, deferred, or rejected disposition; only a later outcome
with matching host event evidence is authoritative. The session inspection
surface reports projections by actor, activation and usage records, accepted
cognition, proposals, submissions, outcomes, and a deterministic state
fingerprint.

## Persistence, checkpoints, branches, and replay

`WorldSessionRepository` now persists optimistic, revisioned runtime state in
addition to the session descriptor. `AgentStateStore` and its repository expose
snapshot restoration. The new versioned contracts are:

| Contract | Identity |
| --- | --- |
| Activation record | `cortex-world-activation-record-v1` |
| World Session runtime state | `cortex-world-session-state-v1` |
| World Session checkpoint | `cortex-world-session-checkpoint-v1` |

Checkpoints fingerprint the descriptor, complete runtime state, and available
agent snapshots. Restore replaces the session atomically at the repository
boundary. Branch creation assigns a new session identity and records explicit
parent-session and parent-checkpoint lineage without copying proposal lifecycle
identities into the child.

World Run Bundle v1 remains backward compatible: `runtimeState` is an optional
additive field. New session exports include it and bind the final-state
fingerprint to it. Replay validates identities, bundle integrity, lifecycle
links, projection/cognition/provider ledgers, proposal order, submissions,
outcomes, and final state before returning the recorded state with exactly zero
model calls.

## Cross-domain proof

The external `cortex-sandbox-sim` repository contains
`src/world-session-scenario.ts`. It takes the real commands and authoritative
outcome projections produced by the existing reconnaissance and logistics
scenarios through the generic World Session proposal, submission, outcome,
inspection, export, and replay APIs. Domain vocabulary remains outside Cortex
Core.

Core tests prove four concurrent actors receive isolated private projections,
provider calls remain event-driven, pause cancels and discards in-flight work,
the host outcome boundary is authoritative, checkpoint/resume matches the
uninterrupted result, branches retain lineage, recorded execution exports, and
replay performs zero model calls.

## Verification commands

```bash
cd /Users/dev/Development/cortex
corepack pnpm typecheck
corepack pnpm build
corepack pnpm test
git diff --check

cd /Users/dev/Development/cortex-sandbox-sim
corepack pnpm typecheck
corepack pnpm build
corepack pnpm test

cd /Users/dev/Development/cortex-living-story
corepack pnpm typecheck
corepack pnpm test
```

Frozen Phase 3.1 and Living Story baselines remain immutable. The historical
planner-v4 versus current planner-v5 mismatch continues to be handled only by
the explicit compatibility fixture recorded in the Slice A handoff.

## Slice C starting point

Create the flagship society in its separate application repository and consume
`HeadlessWorldSession` without adding society concepts to Core. Start with the
deterministic host fixture, eight actor seeds and observer-safe initial
projections, then implement the scripted-control comparison against the same
host proposal and outcome contract before adding provider-backed cohorts.
