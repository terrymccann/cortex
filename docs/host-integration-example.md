# Proposal-first host integration

This example shows the complete authority path for an in-process host. A
process-separated host uses the same records but transports the proposal and
disposition across its own queue or API.

The host owns its world state, legal capability calculation, action
revalidation, mechanics, and canonical events. Cortex stores cognition and
proposal lifecycle records only.

```ts
import {
  CORTEX_ACTION_PROPOSAL_SCHEMA_V1,
  CORTEX_PROPOSAL_DISPOSITION_SCHEMA_V1,
  CORTEX_WORLD_PROJECT_SCHEMA_V1,
  asActionId,
  asAgentId,
  asDecisionId,
  asSimTime,
  createRuntimeIdentitySet,
  fingerprintArtifact,
  type ActionProposalV1,
  type ProposalDispositionV1,
  type WorldProjectV1
} from "@cortex/contracts";
import { CORTEX_OPENAI_PROMPT_IDENTITIES_V1 } from "@cortex/openai";
import {
  authoritativeOutcome,
  createCortexRuntime
} from "@cortex/runtime";

const identities = createRuntimeIdentitySet({
  prompts: CORTEX_OPENAI_PROMPT_IDENTITIES_V1,
  compatibility: [{
    kind: "domain",
    id: "example:domain",
    version: "1.0.0",
    fingerprint: fingerprintArtifact({ domain: "example:domain", version: "1.0.0" })
  }]
});

const projectBody = {
  schemaVersion: CORTEX_WORLD_PROJECT_SCHEMA_V1,
  projectId: "example:project" as const,
  revision: 1,
  title: "Example autonomous world",
  domains: [{
    id: "example:domain" as const,
    version: "1.0.0",
    fingerprint: fingerprintArtifact({ domain: "example:domain", version: "1.0.0" })
  }],
  packs: [],
  hostAdapter: {
    id: "example:host" as const,
    version: "1.0.0",
    capabilityIds: ["example:interact" as const]
  },
  actorIds: [asAgentId("actor-1")],
  groupIds: [],
  artifactRefs: [],
  providerProfileIds: [],
  compatibilityFingerprint: identities.fingerprint
};
const project: WorldProjectV1 = {
  ...projectBody,
  contentFingerprint: fingerprintArtifact(projectBody)
};

const runtime = createCortexRuntime({ identities });
const session = await runtime.createSession({
  sessionId: "example:session",
  project,
  seed: 42,
  createdAt: asSimTime(0)
});

// Cortex has already committed this bounded decision. A deterministic skill
// converts only registered capability data into a proposal.
const proposal: ActionProposalV1 = {
  schemaVersion: CORTEX_ACTION_PROPOSAL_SCHEMA_V1,
  proposalId: "example:proposal-1",
  sessionId: session.sessionId,
  agentId: asAgentId("actor-1"),
  decisionId: asDecisionId("decision-1"),
  actionId: asActionId("action-1"),
  capabilityId: "example:interact",
  actionType: "example:interact",
  arguments: { targetId: "target-1" },
  constraints: [{
    definitionId: "example:target-available",
    definitionVersion: 1,
    parameters: { targetId: "target-1" }
  }],
  expectedEffects: [],
  basedOnWorldVersion: 7,
  issuedAt: asSimTime(10),
  expiresAt: asSimTime(15)
};
await runtime.proposalLifecycle.propose(proposal);

// The host pulls the proposal, checks its current canonical state again, and
// either accepts, defers, or rejects it. This check must never be delegated to
// a model.
const hostStillAllowsAction = true; // ordinary host mechanics
const disposition: ProposalDispositionV1 = {
  schemaVersion: CORTEX_PROPOSAL_DISPOSITION_SCHEMA_V1,
  submissionId: "example:submission-1",
  proposalId: proposal.proposalId,
  status: hostStillAllowsAction ? "accepted" : "rejected",
  ...(hostStillAllowsAction ? {} : { reasonCode: "host:not-legal" as const }),
  hostWorldVersion: 8,
  submittedAt: asSimTime(11)
};
await runtime.proposalLifecycle.submit(disposition);

if (disposition.status === "accepted") {
  // The host performs mechanics, updates its own canonical state, and emits a
  // canonical event. Acceptance alone never means that the effect succeeded.
  const canonicalEvent = {
    eventId: "example:event-1" as const,
    worldVersion: 9,
    payload: { applied: true }
  };
  await runtime.proposalLifecycle.resolve(authoritativeOutcome({
    outcomeId: "example:outcome-1",
    proposalId: proposal.proposalId,
    submissionId: disposition.submissionId,
    actionId: proposal.actionId,
    status: "succeeded",
    reasonCode: "host:confirmed",
    canonicalEventIds: [canonicalEvent.eventId],
    hostEvidence: [{
      eventId: canonicalEvent.eventId,
      worldVersion: canonicalEvent.worldVersion,
      evidenceFingerprint: fingerprintArtifact(canonicalEvent)
    }],
    observedAt: asSimTime(12)
  }));
}
```

For an existing direct `CortexWorldPort`, construct
`CortexWorldPortProposalAdapter` with a `RepositoryProposalLifecycle`. The
adapter converts the proposal to the legacy `ActionCommand`, calls the host's
existing `submitAction`, normalizes the host disposition, and records both
artifacts. The host still performs the same final legality check.

At export time, place ordered observer projections, accepted goal/plan/decision
records, proposals, dispositions, authoritative outcomes, provider metadata,
and final cognitive fingerprints in `createWorldRunBundle`. Replay must use the
bundle's recorded cognition and fail on any identity, order, lifecycle,
evidence, or fingerprint mismatch; it must never substitute a model call.

For a sustained simulation, use `runtime.createHeadlessSession(request,
provider)`, then `start`, `ingest` or `notifyWorldRevision`, and `step`.
Retrieve the returned proposals, perform the same host-side legality check,
call `submit`, and later call `recordOutcome` with the authoritative observer
projections. `checkpoint`, `restore`, `runtime.branchSession`, `inspect`, and
`exportRun` all operate on that same recorded authority path.
