# Cortex Project Status

Last updated: 2026-08-29

This document is the lightweight milestone tracker for Cortex. It records
delivery progress rather than token, API, or model usage.

## Current position

**Current milestone:** Phase 3.3 — Living Story Session Runtime

**Status:** In progress; Slice B implementation and offline soak gate complete, authenticated acceptance pending

**Next step:** Run and review the authenticated Phase 3.3 session smoke test and three-trial acceptance cohort

## Milestones

| Milestone | Status | Result |
| --- | --- | --- |
| Foundational runtime | Complete | Deterministic cognitive loop, validation, fallback, stale-result rejection, outcome awareness, and observability |
| Phase 1 — Reasoning evaluation | Complete | Offline oracle and live-model evaluation harness established in `cortex-sandbox-sim` |
| Phase 2 — Live runtime and replay | Complete | Live provider execution, obligations, audit output, and zero-model deterministic replay proven |
| Phase 3.0 — Core Generalization | Complete | Scenario-agnostic public contracts, composable state and frames, standard packs, and cross-domain conformance |
| Phase 3.1 — Bounded Emergent Autonomy | Complete | Goal formation, capability planning, outcome-driven coordination, replay, inspection, and accepted behavioral baseline |
| Phase 3.2 — Living Story Runtime | Complete | Text-first ensemble simulation, Cortex character trajectories, story threads, grounded prose, reader modes, exact replay, behavioral evaluation, and an accepted live baseline |
| Phase 3.3 — Living Story Session Runtime | In progress | Headless session and offline soak/replay implementation accepted; authenticated Slice B gate, Story Workbench, and authoring workflow remain |

## Phase 3.2 delivery slices

| Slice | Status | Scope |
| --- | --- | --- |
| A | Complete | Story host and designer authoring contracts, including Character Codex and style profiles |
| B | Complete | Bounded story actions, dialogue, and observer projections |
| C | Complete | Ensemble scheduling, scenes, and story-thread orchestration |
| D | Complete | Narrative Director, grounded prose renderer, immutable style editions, and local reader experience |
| E | Complete | Exact replay, evaluation, inspection, clean-room product proof, and accepted live baseline |

## Phase 3.3 delivery slices

| Slice | Status | Scope |
| --- | --- | --- |
| A | Complete | Headless autonomous session lifecycle, activation, Cortex plan/action bridge, deterministic scheduling, progress recovery, budgets, checkpoint/resume, threads, scenes, and grounded prose |
| B | In progress | Replay, checkpoint equivalence, branching, diagnostics, recorded/live cohorts, usage, injection canary, and offline soak accepted; authenticated baseline pending |
| C | Pending | Local Story Workbench for prose, lifecycle controls, threads, inspection, usage, fallbacks, checkpoints, and replay |
| D | Pending | Schema-backed basic authoring workflow and a second portable scenario with no product-source changes |

## Status convention

- **Complete:** implementation and required verification are accepted.
- **In progress:** implementation work has begun.
- **Next:** the next bounded slice ready to begin.
- **Pending:** sequenced but not started.
- **Planned:** specified at phase level but not yet implemented.

The completed Phase 3.2 boundary remains authoritative in
[phase-3.2-living-story-runtime.md](phase-3.2-living-story-runtime.md). The
approved Phase 3.3 scope, delivery order, acceptance criteria, and stop
conditions are authoritative in
[phase-3.3-living-story-session-runtime.md](phase-3.3-living-story-session-runtime.md).
