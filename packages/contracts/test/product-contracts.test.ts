import {
  CORTEX_ACTION_PROPOSAL_SCHEMA_V1,
  CORTEX_AUTHORITATIVE_ACTION_OUTCOME_SCHEMA_V1,
  CORTEX_BASELINE_MANIFEST_SCHEMA_V1,
  CORTEX_PROPOSAL_DISPOSITION_SCHEMA_V1,
  CORTEX_WORLD_PROJECT_SCHEMA_V1,
  CORTEX_WORLD_SESSION_SCHEMA_V1,
  ProductContractValidationError,
  asActionId,
  asAgentId,
  asDecisionId,
  asSimTime,
  assertBaselineManifest,
  assertRuntimeIdentitySet,
  assertWorldProject,
  assertWorldRunBundle,
  createBaselineManifest,
  createRuntimeIdentitySet,
  createWorldRunBundle,
  fingerprintArtifact,
  migrateWorldProjectV0,
  type ActionProposalV1,
  type AuthoritativeActionOutcomeV1,
  type ProposalDispositionV1,
  type WorldProjectV1,
  type WorldSessionV1
} from "../src/index.js";
import { describe, expect, it } from "vitest";

const fp = (value: string) => fingerprintArtifact(value);

const identities = () => createRuntimeIdentitySet({
  prompts: [
    { task: "controller", promptVersion: "cortex-controller-v3", responseSchemaVersion: "cortex-controller-output-v1" },
    { task: "planner", promptVersion: "cortex-planner-reasoner-v5", responseSchemaVersion: "cortex-plan-proposal-v1" }
  ],
  compatibility: [{ kind: "domain", id: "test:domain", version: "1.0.0", fingerprint: fp("domain") }]
});

const project = (): WorldProjectV1 => {
  const body = {
    schemaVersion: CORTEX_WORLD_PROJECT_SCHEMA_V1,
    projectId: "test:project" as const,
    revision: 1,
    title: "Contract world",
    domains: [{ id: "test:domain" as const, version: "1.0.0", fingerprint: fp("domain") }],
    packs: [],
    hostAdapter: { id: "test:host", version: "1.0.0", capabilityIds: ["test:act" as const] },
    actorIds: [asAgentId("actor-1")],
    groupIds: [],
    artifactRefs: [],
    providerProfileIds: [],
    compatibilityFingerprint: fp("compatibility")
  };
  return { ...body, contentFingerprint: fingerprintArtifact(body) };
};

const session = (identityFingerprint: ReturnType<typeof fp>, projectFingerprint: ReturnType<typeof fp>): WorldSessionV1 => ({
  schemaVersion: CORTEX_WORLD_SESSION_SCHEMA_V1,
  sessionId: "test:session",
  projectId: "test:project",
  projectFingerprint,
  lifecycle: "completed",
  seed: 42,
  createdAt: asSimTime(0),
  updatedAt: asSimTime(10),
  worldVersion: 2,
  observedThroughSequence: 2,
  agentIds: [asAgentId("actor-1")],
  compatibilityFingerprint: identityFingerprint
});

const proposal: ActionProposalV1 = {
  schemaVersion: CORTEX_ACTION_PROPOSAL_SCHEMA_V1,
  proposalId: "test:proposal",
  sessionId: "test:session",
  agentId: asAgentId("actor-1"),
  decisionId: asDecisionId("decision-1"),
  actionId: asActionId("action-1"),
  capabilityId: "test:act",
  actionType: "test:act",
  arguments: { target: "fixture" },
  constraints: [],
  expectedEffects: [],
  basedOnWorldVersion: 1,
  issuedAt: asSimTime(5)
};

const submission: ProposalDispositionV1 = {
  schemaVersion: CORTEX_PROPOSAL_DISPOSITION_SCHEMA_V1,
  submissionId: "test:submission",
  proposalId: proposal.proposalId,
  status: "accepted",
  hostWorldVersion: 1,
  submittedAt: asSimTime(5)
};

const outcome: AuthoritativeActionOutcomeV1 = {
  schemaVersion: CORTEX_AUTHORITATIVE_ACTION_OUTCOME_SCHEMA_V1,
  outcomeId: "test:outcome",
  proposalId: proposal.proposalId,
  submissionId: submission.submissionId,
  actionId: proposal.actionId,
  status: "succeeded",
  reasonCode: "host:confirmed",
  canonicalEventIds: ["test:event"],
  hostEvidence: [{ eventId: "test:event", worldVersion: 2, evidenceFingerprint: fp("evidence") }],
  observedAt: asSimTime(6)
};

describe("Phase 4 product contracts", () => {
  it("round-trips frozen runtime identities and rejects a tampered identity set", () => {
    const value = identities();
    const parsed = JSON.parse(JSON.stringify(value));
    expect(() => assertRuntimeIdentitySet(parsed)).not.toThrow();
    expect(() => assertRuntimeIdentitySet({ ...parsed, prompts: [{ ...parsed.prompts[0], promptVersion: "changed" }, ...parsed.prompts.slice(1)] })).toThrow(ProductContractValidationError);
  });

  it("migrates a legacy project into a separate fingerprinted v1 artifact", () => {
    const legacy = {
      schemaVersion: "cortex-world-project-v0" as const,
      id: "test:project" as const,
      title: "Contract world",
      domain: { id: "test:domain" as const, version: "1.0.0", fingerprint: fp("domain") },
      hostAdapterId: "test:host" as const,
      hostAdapterVersion: "1.0.0",
      compatibilityFingerprint: fp("compatibility")
    };
    const migrated = migrateWorldProjectV0(legacy);
    expect(migrated.schemaVersion).toBe(CORTEX_WORLD_PROJECT_SCHEMA_V1);
    expect(legacy.schemaVersion).toBe("cortex-world-project-v0");
    expect(() => assertWorldProject(JSON.parse(JSON.stringify(migrated)))).not.toThrow();
  });

  it("rejects oversized public identifiers and tampered projects", () => {
    const valid = project();
    expect(() => assertWorldProject({ ...valid, projectId: `test:${"x".repeat(100)}` as "test:project" })).toThrow(ProductContractValidationError);
    expect(() => assertWorldProject({ ...valid, title: "changed" })).toThrow(/content fingerprint/);
  });

  it("validates a complete proposal lifecycle and fails closed on tampering or incompatibility", () => {
    const identitySet = identities();
    const worldProject = project();
    const bundle = createWorldRunBundle({
      runId: "test:run",
      createdAt: "2026-08-30T00:00:00.000Z",
      identities: identitySet,
      project: { projectId: worldProject.projectId, contentFingerprint: worldProject.contentFingerprint },
      session: session(identitySet.fingerprint, worldProject.contentFingerprint),
      observerProjections: [],
      acceptedCognition: { goals: [{ id: "goal-1" }], plans: [{ id: "plan-1" }], decisions: [{ id: "decision-1" }] },
      proposals: [proposal],
      submissions: [submission],
      outcomes: [outcome],
      checkpoints: [],
      providerInvocations: [],
      scenarioArtifacts: { scenarioVersion: "test-scenario-v1" },
      finalAgentStateFingerprints: { "actor-1": fp("agent-final") },
      finalStateFingerprint: fp("final")
    });

    expect(() => assertWorldRunBundle(JSON.parse(JSON.stringify(bundle)), identitySet)).not.toThrow();
    expect(() => assertWorldRunBundle({ ...bundle, finalStateFingerprint: fp("tampered") }, identitySet)).toThrow(/bundle fingerprint/);
    const incompatible = createRuntimeIdentitySet({ prompts: [{ task: "planner", promptVersion: "cortex-planner-reasoner-v4", responseSchemaVersion: "cortex-plan-proposal-v1" }] });
    expect(() => assertWorldRunBundle(bundle, incompatible)).toThrow(/compatibility/);
  });

  it("requires accepted submissions and host evidence for canonical outcomes", () => {
    const identitySet = identities();
    const worldProject = project();
    const base = {
      runId: "test:run" as const,
      createdAt: "2026-08-30T00:00:00.000Z",
      identities: identitySet,
      project: { projectId: worldProject.projectId, contentFingerprint: worldProject.contentFingerprint },
      session: session(identitySet.fingerprint, worldProject.contentFingerprint),
      observerProjections: [], acceptedCognition: { goals: [], plans: [], decisions: [] },
      proposals: [proposal], submissions: [submission], checkpoints: [], providerInvocations: [], scenarioArtifacts: {},
      finalAgentStateFingerprints: {}, finalStateFingerprint: fp("final")
    };
    expect(() => createWorldRunBundle({ ...base, outcomes: [{ ...outcome, hostEvidence: [] }] })).toThrow(/evidence/);
    expect(() => createWorldRunBundle({ ...base, submissions: [{ ...submission, status: "rejected" as const, reasonCode: "host:illegal" as const }], outcomes: [outcome] })).toThrow(/outcome lifecycle/);
  });

  it("fingerprints candidate and frozen baseline manifests and rejects mutation", () => {
    const identitySet = identities();
    const manifest = createBaselineManifest({
      baselineId: "test:baseline",
      status: "candidate",
      createdAt: "2026-08-30T00:00:00.000Z",
      identitiesFingerprint: identitySet.fingerprint,
      compatibilityFingerprint: identitySet.fingerprint,
      sourceRunBundleFingerprint: fp("run"),
      policy: { mutable: false, requiredInvariants: { authority: true, invalid: 0 } }
    });
    expect(manifest.schemaVersion).toBe(CORTEX_BASELINE_MANIFEST_SCHEMA_V1);
    expect(() => assertBaselineManifest(JSON.parse(JSON.stringify(manifest)))).not.toThrow();
    expect(() => assertBaselineManifest({ ...manifest, status: "frozen" })).toThrow(/fingerprint/);
  });
});
