# Phase 3.3 Stabilization Amendment: Sustained Narrative Coherence

Status: complete; E1-E4 accepted and authenticated baseline frozen
Date: 2026-08-29  
Amends: [Phase 3.3: Living Story Session Runtime](phase-3.3-living-story-session-runtime.md)

## 1. Decision

Phase 3.3 acceptance is reopened. Slices A through D remain delivered, but the
phase is not complete until the sustained session can advance without reusing a
one-shot character plan, repeating unchanged actions or dialogue, or narrating
the same canonical event as if it were new in several story threads.

This is a stabilization amendment, not a new product phase. It corrects a gap
between the accepted authority/replay proof and the reader-visible behavior of
the sustained story loop.

## 2. Observed defect

The second reference scenario exposed four connected failures:

1. **One-shot cognition was reused as recurrent cognition.** A character formed
   one goal and plan, then the session reused its capability on later
   activations without advancing plan-step state or reconsidering the outcome.
2. **Completion quota amplified repetition.** Raising the required accepted
   actions per character extended the run but caused unchanged travel,
   communication, investigation, assistance, and waiting behavior to repeat.
3. **Presentation consumption was thread-local.** One canonical event could be
   associated with several threads and rendered again when each thread became
   foregrounded.
4. **Fallback rendering exposed event records rather than a continuing scene.**
   Without a Director or renderer reasoner, the deterministic fallback emitted
   isolated event sentences with no scene memory, compaction, or repetition
   control.

The defect is architectural. A live prose model may paraphrase repetition, but
it cannot make a repeated canonical action meaningful. The simulation must be
coherent before generated prose is allowed to improve its expression.

## 3. Preserved authority boundaries

Stabilization must preserve all accepted Phase 3.0 through 3.3 boundaries:

- Cortex owns beliefs, memories, goals, plans, obligations, and cognitive
  revision.
- The Living Story host owns activation, scheduling, progress, and lifecycle.
- Story resolvers remain the sole authority for canonical outcomes.
- The Director selects only from safe, authoritative presentation candidates.
- The renderer expresses accepted events and never invents world truth.
- Exact replay makes zero provider calls.
- Thread membership may be many-to-many; narrative publication may not confuse
  a reference to an old event with a new occurrence.
- No story identifier or scenario policy may be added to Cortex core.

## 4. Stabilization Slice E1 — Recurrent, outcome-aware cognition

**Status:** Complete and accepted on 2026-08-29. The Living Story integration
record is
[Phase 3.3 Stabilization E1](../../cortex-living-story/docs/phase-3.3-stabilization-e1.md).

### Deliverables

- explicit active goal, plan, current step, completed step, and superseded plan
  lifecycle in the session integration;
- outcome observation applied before the character is eligible to act again;
- deterministic re-evaluation triggers for completed, rejected, stale,
  interrupted, contradicted, obligation-changing, and materially changed
  states;
- a distinction between continuing a still-valid next step and requesting a
  revised goal or plan;
- bounded goal and planner calls with the existing provider, token, latency,
  retry, and fallback budgets;
- state-aware deterministic offline policies that can demonstrate the same
  lifecycle without credentials; and
- causal records linking every revised goal or plan to the authoritative event
  or outcome that triggered it.

### Rules

- A completed one-step plan cannot be executed again merely to satisfy a quota.
- A rejected or stale step cannot be resubmitted unchanged unless a recorded
  world change makes its preconditions materially different.
- Replanning does not permit arbitrary model text to become a capability or
  executable action.
- Characters without a meaningful trigger remain dormant.

### Gate

In a deterministic twelve-or-more-action session, all four characters must
advance through plan lifecycle state. At least one character must revise or
replace a plan after an authoritative outcome. Every accepted action must point
to the active plan step that authorized it.

### Acceptance record

The implementation now retains an immutable Cortex trajectory for every
cognition cycle and a separate session-owned execution lifecycle for each plan
revision. Step activation, completion, rejection, outcome evidence, and causal
reformation triggers are explicit. A still-active step continues without a
new provider call; a terminal outcome causes bounded cognition on the next
eligible activation. Actions and replay archives carry both plan revision and
step identity.

The deterministic Glass Orchard gate completed 12 accepted actions across all
four characters with 12 completed plan lifecycles and 24 bounded Cortex calls.
Each character progressed through revisions 1, 2, and 3; revisions 2 and 3
were linked to the preceding accepted outcome. A separate rejection test
proved `initial -> rejected -> outcome-rejected revision -> completed`.
Checkpoint and full-session replay validate plan authorization and make zero
model calls.

Verification: TypeScript typecheck; 17 test files and 74 tests; deterministic
session completion; 12-trial offline cohort with 100% authority,
defensibility, replay, and fallback health; and the unchanged Phase 3.2 offline
proof with all authority and quality gates passing.

## 5. Stabilization Slice E2 — Semantic repetition and progress control

**Status:** Complete and accepted on 2026-08-29. The Living Story integration
record is
[Phase 3.3 Stabilization E2](../../cortex-living-story/docs/phase-3.3-stabilization-e2.md).

### Deliverables

- a deterministic action signature containing actor, capability, semantic
  target, relevant parameters, and a bounded precondition-state fingerprint;
- an utterance signature containing speaker, addressees, communicative intent,
  referenced knowledge, and normalized accepted text where applicable;
- configurable cooldown and novelty policy for unchanged action and utterance
  signatures;
- typed `repetitive-no-change` rejection or deferral with causal diagnostics;
- progress accounting that distinguishes accepted world events from meaningful
  progress; and
- bounded recovery that wakes another character, advances a scheduled
  consequence, replans, or terminates honestly instead of emitting filler.

### Rules

- Reusing a capability is legal when target, intent, evidence, obligation, or
  authoritative state has materially changed.
- Exact dialogue repetition is not legal merely because another thread is in
  the foreground.
- A wait event counts as meaningful progress only when it advances authored
  time toward a scheduled consequence or changes an authoritative condition.
- Novelty checks may reject proposals; they may not fabricate replacements.

### Gate

Accepted deterministic sessions must contain zero unchanged repeated action
signatures, zero exact repeated utterance signatures, and zero waits counted as
progress without a scheduled consequence. Repetition rejections must not cause
an unbounded retry loop.

### Acceptance record

The Living Story runtime now computes deterministic semantic and material-state
fingerprints before authoritative resolution. A bounded cooldown admits legal
capability reuse after relevant state changes while rejecting unchanged action
repetition, exact per-speaker utterance repetition, and unscheduled waits with
typed dispositions. Rejections close the plan revision with causal evidence;
actors without a legal meaningful proposal are deferred against the current
world fingerprint and wake only after canon changes.

Progress and character quotas now count canonical non-wait outcomes rather
than cognition or filler. Replay archives validate semantic uniqueness and
reject false-progress records. Session, checkpoint, replay, evaluation, and
cohort contracts were versioned for the new audit fields.

The 12-trial offline cohort completed 12 accepted actions in every trial with
zero unchanged accepted actions, zero exact repeated utterances, zero accepted
waits, zero false-progress turns, no deadlocks, and 100% authority,
defensibility, and exact replay. Focused tests cover repeated travel,
inspection, assistance, communication, waits, and legal reuse after a material
state change.

## 6. Stabilization Slice E3 — Narrative consumption and scene continuity

Implementation status: complete and accepted offline. The Living Story
verification record is
[Phase 3.3 Stabilization E3](../../cortex-living-story/docs/phase-3.3-stabilization-e3.md).

### Deliverables

- a global narrative-consumption ledger for canonical event identifiers;
- separate `primary`, `supporting-reference`, `recap`, and `withheld`
  presentation dispositions;
- Director candidates containing only globally unpresented primary events,
  unless an explicit recap is authorized;
- thread projections that may reference previously presented evidence without
  rendering it as a new occurrence;
- continuing-scene context containing prior beat identifiers, current scene and
  viewpoint, active tensions, unresolved dialogue obligations, and a bounded
  summary of already presented material;
- deterministic beat compaction that groups related new events without copying
  them into later editions; and
- a fallback renderer that produces a coherent continuing passage rather than
  one template sentence per raw event.

### Rules

- A canonical event may be a primary source for at most one edition in the main
  manuscript.
- An explicit recap must cite the original event, be marked as recap, and must
  not reproduce accepted dialogue verbatim.
- Scene context is presentation state only and cannot mutate canon.
- Accepted dialogue remains exact when quoted for the first time.

### Gate

Across headless, Workbench, checkpoint-resume, branch, and replay paths, the
main manuscript must have zero duplicate primary event identifiers. Scene
continuations must retain location, viewpoint, and causal context until an
accepted safe cut changes them. Exact replay must reproduce both consumption
records and prose editions with zero model calls.

## 7. Stabilization Slice E4 — Evaluation and reacceptance

Implementation status: complete and accepted. Deterministic and authenticated
gates passed, the human comprehension review was accepted, and the cohort-bound
baseline was frozen. The Living Story verification record is
[Phase 3.3 Stabilization E4](../../cortex-living-story/docs/phase-3.3-stabilization-e4.md).

### Deterministic evaluation

The offline suite must report at minimum:

- unchanged action repetition rate;
- exact utterance repetition rate;
- duplicate primary-event rendering rate;
- non-consequential wait-as-progress count;
- plan completion and revision counts;
- accepted actions per character and capability signature diversity;
- scene continuity violations;
- thread starvation, deadlock, and fallback health; and
- replay, checkpoint-resume, and branch equivalence.

Hard deterministic gates are:

- 100% authority and exact replay;
- zero unchanged accepted action repetitions;
- zero exact utterance repetitions;
- zero duplicate primary-event renderings;
- zero non-consequential waits counted as progress;
- zero scene continuity violations;
- at least one causally justified plan revision in the reference session; and
- no regression in secret containment or injection resistance.

### Authenticated evaluation

After deterministic acceptance, run a minimum three-trial authenticated cohort
with live Cortex goal/planning, Director, and renderer reasoners. Report calls,
tokens, latency, errors, fallbacks, and configured cost in addition to:

- causal coherence;
- character and dialogue distinction;
- action and phrasing repetition;
- scene continuity;
- thread-transition defensibility; and
- trajectory diversity.

The live gate does not require one preferred plot or perfect literary prose. It
requires 100% schema validity, authority, secret containment, injection
resistance, and exact replay; zero exact action/dialogue duplication; and no
more than 5% adjudicated near-repetition across accepted editions. All three
runs must be judged defensible, and at least two distinct trajectories must
remain.

### Human acceptance

A reader reviews the complete three-run cohort. Acceptance requires that a
reader can identify what changed, why the next character acted, and why a
thread or viewpoint changed without consulting the canonical ledger. This is a
comprehension gate, not a preference for a specific writing style or outcome.

## 8. Required tests

Add deterministic coverage for:

- multi-step plan continuation and completion;
- outcome-triggered replanning;
- repeated travel, inspect, assist, communicate, and wait proposals;
- legal capability reuse after a material state change;
- duplicate dialogue across turns and across threads;
- one event associated with several threads but rendered once;
- explicit recap provenance;
- scene continuation and safe-cut transitions;
- checkpoint and branch preservation of cognition and consumption ledgers;
- terminal predicates based on meaningful accepted progress; and
- fallback behavior with no provider configured.

## 9. Non-goals

This amendment does not require:

- unlimited autonomous sessions;
- a general natural-language semantic-equivalence service;
- a model call to approve every action or detect every duplicate;
- perfect prose or imitation of a named author;
- hiding weak simulation behavior through paraphrase;
- changing the Story Workbench into a world authority; or
- weakening deterministic replay, validation, or execution budgets.

## 10. Delivery order and stop conditions

Implement E1 through E4 in order. Do not start live prose tuning before E1 and
E2 pass offline. Do not accept E3 by suppressing duplicate text in the UI while
leaving duplicate canonical actions or narrative records underneath it.

Stop and repair the architecture if:

- the renderer is asked to invent a new action to improve flow;
- novelty is determined only by opaque model judgment;
- a repeated action is silently discarded without an audit record;
- plan revision loses its outcome provenance;
- thread evidence is removed merely to prevent duplicate prose;
- replay requires recomputing cognition, Director, or renderer output; or
- a longer quota is used as evidence of a sustained story without state-aware
  cognitive progression.

## 11. Exit condition

Phase 3.3 is complete. E1 through E4 passed, the authenticated stabilization
baseline was explicitly reviewed and frozen, and the Workbench demonstrated a
coherent second scenario without repeated unchanged actions, dialogue, or
primary event narration.
