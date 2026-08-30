import {
  CORTEX_ACTION_PROPOSAL_SCHEMA_V1,
  CORTEX_WORLD_PROJECT_SCHEMA_V1,
  asActionId,
  asAgentId,
  asDecisionId,
  asJobId,
  asSimTime,
  createRuntimeIdentitySet,
  createWorldRunBundle,
  fingerprintArtifact,
  type ActionCommand,
  type WorldProjectV1
} from "@cortex/contracts";
import { describe, expect, it } from "vitest";
import { FakeWorld } from "../src/fake-world.js";
import {
  InMemoryArtifactRepository,
  InMemoryCognitiveJobRepository,
  ManualLeaseClock
} from "../src/repositories.js";
import { CortexWorldPortProposalAdapter, RepositoryProposalLifecycle } from "../src/proposals.js";
import { createCortexRuntime } from "../src/runtime.js";
import { ControllerOutputValidator } from "../src/decision.js";

const identities = createRuntimeIdentitySet({
  prompts: [{ task: "controller", promptVersion: "cortex-controller-v3", responseSchemaVersion: "cortex-controller-output-v1" }]
});

const project = (): WorldProjectV1 => {
  const body = {
    schemaVersion: CORTEX_WORLD_PROJECT_SCHEMA_V1,
    projectId: "test:project" as const,
    revision: 1,
    title: "Runtime world",
    domains: [{ id: "test:domain" as const, version: "1.0.0", fingerprint: fingerprintArtifact("domain") }],
    packs: [],
    hostAdapter: { id: "test:host" as const, version: "1.0.0", capabilityIds: ["test:act" as const] },
    actorIds: [asAgentId("actor-1")],
    groupIds: [], artifactRefs: [], providerProfileIds: [],
    compatibilityFingerprint: identities.fingerprint
  };
  return { ...body, contentFingerprint: fingerprintArtifact(body) };
};

describe("Phase 4 runtime composition", () => {
  it("rejects oversized provider-controlled controller fields", () => {
    const validator = new ControllerOutputValidator();
    const feasible = [{ id: "test-intention", kind: "test", description: "Test", allowedTargets: [], constraints: [] }];
    expect(validator.validate({ intentionId: "test-intention", objective: "x".repeat(401), commitment: 1, reasonCode: "test" }, feasible)).toEqual({ valid: false, issue: "invalid-objective" });
    expect(validator.validate({ intentionId: "test-intention", objective: "Test", commitment: 1, reasonCode: "x".repeat(101) }, feasible)).toEqual({ valid: false, issue: "invalid-reason-code" });
    const oversizedId = `test-${"x".repeat(100)}`;
    expect(validator.validate({ intentionId: oversizedId, objective: "Test", commitment: 1, reasonCode: "test" }, [{ ...feasible[0]!, id: oversizedId }])).toEqual({ valid: false, issue: "invalid-intention" });
  });

  it("creates and inspects a session through repository interfaces", async () => {
    const runtime = createCortexRuntime({ identities, leaseClock: new ManualLeaseClock(100) });
    const session = await runtime.createSession({
      sessionId: "test:session",
      project: project(),
      seed: 7,
      createdAt: asSimTime(0)
    });
    expect(session.compatibilityFingerprint).toBe(identities.fingerprint);
    expect(await runtime.inspectSession(session.sessionId)).toMatchObject({ proposalCount: 0, submissionCount: 0, outcomeCount: 0 });
  });

  it("leases jobs deterministically and recovers expired leases", async () => {
    const jobs = new InMemoryCognitiveJobRepository();
    const job = {
      id: asJobId("job-1"), agentId: asAgentId("actor-1"), module: "controller",
      basedOnVersion: 0, triggerEvents: [], notBefore: asSimTime(0), priority: 1,
      idempotencyKey: "job-1"
    };
    expect(await jobs.enqueue(job)).toBe(true);
    expect(await jobs.enqueue(job)).toBe(false);
    expect(await jobs.claim(0, "worker-a", 5, 1)).toEqual([job]);
    expect(await jobs.claim(4, "worker-b", 5, 1)).toEqual([]);
    expect(await jobs.claim(5, "worker-b", 5, 1)).toEqual([job]);
    await expect(jobs.complete(job.id, "worker-a")).rejects.toThrow(/not owned/);
    await jobs.complete(job.id, "worker-b");
  });

  it("adapts the direct world port over the same proposal lifecycle", async () => {
    const world = new FakeWorld();
    world.allowActionType("test:act");
    const lifecycle = new RepositoryProposalLifecycle(new InMemoryArtifactRepository());
    const adapter = new CortexWorldPortProposalAdapter(world, lifecycle, {
      sessionId: "test:session",
      capabilityIdForAction: () => "test:act",
      actionTypeForCommand: () => "test:act",
      worldVersion: () => 3
    });
    const command: ActionCommand = {
      id: asActionId("action-1"), agentId: asAgentId("actor-1"), decisionId: asDecisionId("decision-1"),
      actionType: "test:act", arguments: {}, preconditions: [], expectedEffects: [], issuedAt: asSimTime(4)
    };
    const proposal = adapter.proposalFromCommand(command);
    expect(proposal.schemaVersion).toBe(CORTEX_ACTION_PROPOSAL_SCHEMA_V1);
    expect((await adapter.submit(proposal)).status).toBe("accepted");
    expect(world.submittedActions()).toEqual([command]);
    expect(await lifecycle.proposals()).toEqual([proposal]);
    expect(await lifecycle.submissions()).toHaveLength(1);
  });

  it("replays a compatible generic bundle without a model", async () => {
    const runtime = createCortexRuntime({ identities });
    const worldProject = project();
    const session = await runtime.createSession({ sessionId: "test:session", project: worldProject, seed: 1, createdAt: asSimTime(0) });
    const bundle = createWorldRunBundle({
      runId: "test:run", createdAt: "2026-08-30T00:00:00.000Z", identities,
      project: { projectId: worldProject.projectId, contentFingerprint: worldProject.contentFingerprint },
      session: { ...session, lifecycle: "completed", updatedAt: asSimTime(2), worldVersion: 1, observedThroughSequence: 1 },
      observerProjections: [], acceptedCognition: { goals: [{ id: "goal" }], plans: [{ id: "plan" }], decisions: [{ id: "decision" }] },
      proposals: [], submissions: [], outcomes: [], checkpoints: [], providerInvocations: [], scenarioArtifacts: {},
      finalAgentStateFingerprints: { "actor-1": fingerprintArtifact("agent") }, finalStateFingerprint: fingerprintArtifact("final")
    });
    await expect(runtime.replay(bundle)).resolves.toMatchObject({ matched: true, modelCalls: 0, acceptedCognition: bundle.acceptedCognition, finalStateFingerprint: bundle.finalStateFingerprint });
  });
});
