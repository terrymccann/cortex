# Phase 3.1 Slice E: Behavioral Evaluation and Baseline

Status: implementation complete; bounded live baseline pending

## Purpose

Slice E measures whether bounded autonomy is varied and causally coherent
without tuning Cortex toward one rubric-author preferred outcome. Hard engine
guarantees remain deterministic tests. Stochastic provider behavior is reported
as separate quality and operational metrics.

## Provider boundary

`@cortex/openai` now includes task-specific goal and planner reasoners. They:

- use strict structured outputs;
- keep simulation text in untrusted input rather than provider instructions;
- constrain identifiers to vocabulary present in each frame;
- record provider-neutral latency and token usage; and
- return proposals to deterministic managers, which retain all semantic and
  state-commit authority.

The OpenAI package consumes structural frame contracts and does not import or
depend on optional standard-pack implementations.

## Controlled corpus

The sandbox corpus contains 16 cases split evenly between goal formation and
capability planning. It covers:

- critical risk, healthy operation, information duty, recovery, and existing
  commitments;
- controlled cautious versus mission-committed profiles;
- controlled reported versus unreported histories;
- controlled concealment versus support-oriented planning profiles; and
- injection text in memory and template-like context.

Rubrics are stored outside provider frames. Every case permits one or more
defensible choices, and preferred choices are diagnostic only.

## Reported metrics

Reports keep these measurements separate:

- proposal validity and defensible-choice rate;
- preferred-choice rate;
- controlled sensitivity;
- temporal coherence;
- unique goal and strategy counts plus normalized entropy;
- dominant-goal and dominant-plan share;
- repetitive-plan rate;
- safety violations and injection resistance; and
- latency, calls, input/output/reasoning tokens, and optional caller-supplied
  cost estimates.

The harness does not hardcode model pricing. Cost is calculated only when the
caller supplies per-million input and output rates.

## Contract correction found by evaluation

The initial oracle matrix found that the drone domain advertised concealment
and requesting assistance as preservation strategies while defining success as
`location-observed`, an effect only withdrawal could reach. The domain now uses
the semantic `drone:unit-preserved` condition, reachable by all three registered
preservation capabilities. A deterministic manager conformance test proves each
advertised strategy can commit.

This was a semantic contract defect, not a reason to tune model preferences.

## Offline results

The 2x oracle run produced 32 trials with:

- 100% valid, defensible, coherent, sensitive, and injection-resistant output;
- three distinct goal choices and five plan strategies;
- 37.5% dominant goal share and 25% dominant plan share;
- zero repetitive plans and zero safety violations; and
- zero provider calls.

Adversarial fixtures deliberately invent goal and capability vocabulary and
produce cyclic plans. The scorer identifies all as invalid; deterministic
manager tests prove such proposals cannot commit.

Final offline verification passes 108 Cortex core tests across 16 files and 46
sandbox tests across 11 files, plus both TypeScript builds.

## Live baseline workflow

From `cortex-sandbox-sim`, first run one bounded smoke case:

```bash
corepack pnpm eval:autonomy:live -- \
  --model gpt-5.6-terra \
  --reasoning medium \
  --case goal-critical-damage \
  --trials 1
```

Then run the initial matrix:

```bash
corepack pnpm eval:autonomy:live -- \
  --model gpt-5.6-terra \
  --reasoning medium \
  --trials 3
```

Optional `--input-cost-per-million` and `--output-cost-per-million` arguments
add an estimated cost using caller-supplied rates. Raw reports and audit JSONL
remain under ignored `results/`.

`baselines/phase-3.1-autonomy-v1-candidate.json` freezes the corpus, scorer,
adapter, and prompt identities. It contains no invented live metrics. After the
recorded 3x run is reviewed, a new immutable frozen manifest will capture that
result; the candidate will not be overwritten.

## Stop condition

Preferred rate is not a completion gate. Further tuning after baseline freeze
requires a documented authority breach, safety or grounding defect, invalid
transition, injection vulnerability, unbounded loop, replay mismatch, or a
material regression across a controlled cohort.
