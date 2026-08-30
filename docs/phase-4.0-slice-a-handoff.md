# Phase 4.0 Slice A implementation handoff

Status: complete
Date: 2026-08-30
Branch: `codex/phase-4.0-autonomous-world-platform`

## Identity baseline for new runs

Package identities are now `0.1.0` for `@cortex/contracts`, `@cortex/domain`,
`@cortex/runtime`, `@cortex/sdk`, `@cortex/standard-packs`, and
`@cortex/openai`. Core identities are exported by
`CORTEX_PACKAGE_IDENTITIES_V1`; the optional standard-pack identity is exported
by `CORTEX_STANDARD_PACKS_PACKAGE_IDENTITY`.

The new public product schemas are:

| Contract | Identity |
| --- | --- |
| Runtime identity set | `cortex-runtime-identities-v1` |
| World Project | `cortex-world-project-v1` |
| World Session | `cortex-world-session-v1` |
| Action Proposal | `cortex-action-proposal-v1` |
| Proposal disposition | `cortex-proposal-disposition-v1` |
| Authoritative action outcome | `cortex-authoritative-action-outcome-v1` |
| World Run Bundle | `cortex-world-run-bundle-v1` |
| Baseline Manifest | `cortex-baseline-manifest-v1` |

Existing identities remain explicit: contracts current v1 with a declared v2
target, domain manifest v2, pack manifest v1 with a declared v2 target,
cognitive frame v2, accepted decision record v2, accepted goal record v1,
accepted plan record v1, goal-formation frame v1, planning frame v1, and
cognition inspection v1.

Provider prompt and response identities exported by `@cortex/openai` are:

| Task | Prompt | Response schema |
| --- | --- | --- |
| Controller | `cortex-controller-v3` | `cortex-controller-output-v1` |
| Goal formation | `cortex-goal-reasoner-v4` | `cortex-goal-proposal-v1` |
| Planning | `cortex-planner-reasoner-v5` | `cortex-plan-proposal-v1` |

`createRuntimeIdentitySet` sorts package, schema, prompt, and compatibility
components and fingerprints the complete set. Every new World Session and World
Run Bundle binds to that fingerprint. Replay compares it exactly and fails
before accepting records if it differs.

## Frozen baseline locations and prompt mismatch

Frozen acceptance artifacts remain in:

- `/Users/dev/Development/cortex-sandbox-sim/baselines/`;
- `/Users/dev/Development/cortex-sandbox-sim/test/fixtures/live-runtime-v1.replay.json`; and
- the accepted Living Story artifacts under
  `/Users/dev/Development/cortex-living-story/baselines/`.

No existing file in those locations was modified. The known mismatch is
intentional and remains visible: the accepted Phase 3.1 manifests bind planner
prompt v4, while linked Core exposes planner prompt v5. The separate fixture
`cortex-sandbox-sim/test/fixtures/phase-3.1-v4-to-v5-prompt-compatibility.json`
records `incompatible-new-candidate-required`, prohibits manifest mutation and
replay coercion, and lets baseline checks distinguish historical identity from
the identity for new runs.

## Placement and implementation decisions

- Product contracts, bounds, canonical hashing, migrations, and fail-closed
  validators live in `@cortex/contracts` (`packages/contracts/src/product.ts`).
- Repository ports, in-memory references, proposal lifecycle, direct-world
  adapter, and the supported composition root live in `@cortex/runtime`.
- Provider prompt and response identity exports remain in `@cortex/openai`.
- The drone-specific conversion remains external in
  `cortex-sandbox-sim/src/world-run-bundle.ts`.
- Existing `CortexWorldPort` and `SkillExecutor` behavior is unchanged. New
  in-process hosts use `CortexWorldPortProposalAdapter`, which submits through
  the same recorded proposal/disposition lifecycle used by host-pull
  integrations.
- Phase 4.0 persistence stays in-memory behind interfaces. No distributed
  lease, database, hosted service, or engine-specific adapter was introduced.
- World Run Bundles use a generic envelope and retain scenario-specific replay
  material only inside `scenarioArtifacts`. Core never imports or interprets
  that vocabulary.
- Public namespaced identifiers, provider-controlled identifiers, reason codes,
  objectives, descriptions, and artifact arrays now have deterministic bounds.
  Canonical outcomes require at least one canonical event and matching host
  evidence.
- The repository decision is **two new repositories after Slice A**:
  `cortex-studio` for the generic local product/service layer and
  `cortex-society-sim` for the flagship validation world. This preserves the
  dependency direction and prevents flagship vocabulary from becoming Studio
  service contracts. Neither repository is created in Slice A.

## Cross-repository verification

```bash
cd /Users/dev/Development/cortex
corepack pnpm install
corepack pnpm typecheck
corepack pnpm build
corepack pnpm test
git diff --check

cd /Users/dev/Development/cortex-sandbox-sim
corepack pnpm typecheck
corepack pnpm build
corepack pnpm test
corepack pnpm sim:autonomy -- --output /tmp/cortex-phase4-slice-a
corepack pnpm sim:replay -- --bundle /tmp/cortex-phase4-slice-a/<run>.world-run.json

cd /Users/dev/Development/cortex-living-story
corepack pnpm typecheck
corepack pnpm test
```

The two Living Story localhost tests need permission to bind `127.0.0.1` in a
restricted runner. An `EPERM` there is an execution restriction, not a product
failure; the complete suite passes when localhost binding is allowed.

## Slice B starting point

Begin with batch observer-projection ingestion and deterministic activation on
the new `CortexRuntime` composition root. Persist session revisions and jobs
only through `WorldSessionRepository` and `CognitiveJobRepository`, emit
proposals through `ProposalLifecycle`, and make checkpoint/branch replay extend
the v1 World Run Bundle without adding world vocabulary to Runtime.
