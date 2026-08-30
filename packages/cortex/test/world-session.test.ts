import {
  CORTEX_ACTION_PROPOSAL_SCHEMA_V1,
  CORTEX_AUTHORITATIVE_ACTION_OUTCOME_SCHEMA_V1,
  CORTEX_PROPOSAL_DISPOSITION_SCHEMA_V1,
  CORTEX_WORLD_PROJECT_SCHEMA_V1,
  asActionId,
  asAgentId,
  asDecisionId,
  asEntityId,
  asEventId,
  asSimTime,
  createRuntimeIdentitySet,
  fingerprintArtifact,
  type AgentId,
  type PerceptibleWorldEvent,
  type WorldProjectV1
} from "@cortex/contracts";
import { describe, expect, it } from "vitest";
import { createCortexRuntime } from "../src/runtime.js";
import type {
  WorldSessionActivationRequest,
  WorldSessionCognitionProvider
} from "../src/world-session.js";

const identities = createRuntimeIdentitySet({
  prompts: [{ task: "controller", promptVersion: "cortex-controller-v3", responseSchemaVersion: "cortex-controller-output-v1" }]
});

const actorIds = ["agent:a", "agent:b", "agent:c", "agent:d"].map(asAgentId);

const project = (actors: readonly AgentId[] = actorIds): WorldProjectV1 => {
  const body = {
    schemaVersion: CORTEX_WORLD_PROJECT_SCHEMA_V1,
    projectId: "test:sustained-world" as const,
    revision: 1,
    title: "Sustained test world",
    domains: [{ id: "test:domain" as const, version: "1.0.0", fingerprint: fingerprintArtifact("domain") }],
    packs: [],
    hostAdapter: { id: "test:host" as const, version: "1.0.0", capabilityIds: ["test:act" as const] },
    actorIds: actors,
    groupIds: [], artifactRefs: [], providerProfileIds: [],
    compatibilityFingerprint: identities.fingerprint
  };
  return { ...body, contentFingerprint: fingerprintArtifact(body) };
};

const projection = (agentId: AgentId, sequence: number, secret: string): PerceptibleWorldEvent => ({
  observer: agentId,
  channel: "system",
  clarity: 1,
  observedFacts: [{
    subject: { type: "test:agent", id: asEntityId(agentId) },
    predicate: "private-secret",
    object: secret,
    confidence: 1
  }],
  event: {
    id: asEventId(`event:${agentId.replace(":", "-")}-${sequence}`),
    sequence,
    worldVersion: sequence,
    simTime: asSimTime(sequence),
    type: "test:observation",
    targets: [{ type: "test:agent", id: asEntityId(agentId) }],
    payload: { secret }
  }
});

describe("headless world sessions", () => {
  it("stays event-driven and cancels in-flight cognition when paused", async () => {
    const agentId = actorIds[0]!;
    let calls = 0;
    let releaseStarted!: () => void;
    const started = new Promise<void>((resolve) => { releaseStarted = resolve; });
    const provider: WorldSessionCognitionProvider = {
      mode: "live",
      async activate(_request, signal) {
        calls += 1;
        releaseStarted();
        await new Promise<void>((_resolve, reject) => {
          signal.addEventListener("abort", () => reject(signal.reason), { once: true });
        });
        return { disposition: "no-change" };
      }
    };
    const runtime = createCortexRuntime({ identities });
    const session = await runtime.createHeadlessSession({
      sessionId: "test:pause-session", project: project([agentId]), seed: 1, createdAt: asSimTime(0)
    }, provider);
    await session.start();
    expect((await session.step(asSimTime(0))).disposition).toBe("idle");
    expect(calls).toBe(0);
    await session.ingest([projection(agentId, 1, "interrupt")]);
    const pendingStep = session.step(asSimTime(1));
    await started;
    await session.pause();
    expect((await pendingStep).disposition).toBe("stale");
    const inspection = await session.inspect();
    expect(inspection.session.lifecycle).toBe("paused");
    expect(inspection.state.activationRecords.at(-1)?.disposition).toBe("discarded");
    expect(inspection.state.usage.providerCalls).toBe(1);
  });

  it("activates four agents concurrently without crossing observer boundaries", async () => {
    let active = 0;
    let maximumActive = 0;
    const requests: WorldSessionActivationRequest[] = [];
    const provider: WorldSessionCognitionProvider = {
      mode: "deterministic",
      async activate(request) {
        active += 1;
        maximumActive = Math.max(maximumActive, active);
        requests.push(request);
        await Promise.resolve();
        active -= 1;
        return { disposition: "state-transition", acceptedCognition: { decisions: [{ agentId: request.agentId }] } };
      }
    };
    const runtime = createCortexRuntime({ identities });
    const session = await runtime.createHeadlessSession({
      sessionId: "test:concurrent-session", project: project(), seed: 41, createdAt: asSimTime(0)
    }, provider);
    await session.start();
    await session.ingest(actorIds.map((agentId, index) => projection(agentId, 1, `secret-${index}`)));

    const result = await session.step(asSimTime(1));

    expect(result.activations).toHaveLength(4);
    expect(maximumActive).toBe(4);
    expect(requests).toHaveLength(4);
    for (const request of requests) {
      expect(request.observerProjections.every((event) => event.observer === request.agentId)).toBe(true);
      expect(request.observerProjections).toHaveLength(1);
    }
    const inspection = await session.inspect();
    expect(inspection.observerProjectionCountByAgent).toEqual(Object.fromEntries(actorIds.map((id) => [id, 1])));
    expect(inspection.state.usage).toMatchObject({ activations: 4, meaningfulTransitions: 4, providerCalls: 0 });
  });

  it("enforces session activation budgets before scheduling additional actors", async () => {
    const runtime = createCortexRuntime({ identities });
    const session = await runtime.createHeadlessSession({
      sessionId: "test:budget-session",
      project: project(actorIds.slice(0, 2)),
      seed: 12,
      createdAt: asSimTime(0),
      budgets: {
        maximumActivations: 1,
        maximumProposals: 10,
        maximumProviderCalls: 0,
        maximumNoProgressSteps: 10,
        maximumActivationsPerStep: 2,
        activationCooldown: 0
      }
    }, { mode: "deterministic", activate: async () => ({ disposition: "state-transition" }) });
    await session.start();
    await session.ingest(actorIds.slice(0, 2).map((agentId, index) => projection(agentId, 1, `budget-${index}`)));
    expect((await session.step(asSimTime(1))).activations).toHaveLength(1);
    expect((await session.step(asSimTime(1))).disposition).toBe("terminal");
    expect((await session.inspect()).session.lifecycle).toBe("budget-exhausted");
  });

  it("keeps actions proposal-first and records authoritative host outcomes", async () => {
    const agentId = actorIds[0]!;
    const provider: WorldSessionCognitionProvider = {
      mode: "deterministic",
      async activate(request) {
        return {
          disposition: "proposal",
          proposal: {
            schemaVersion: CORTEX_ACTION_PROPOSAL_SCHEMA_V1,
            proposalId: "proposal:one",
            sessionId: request.session.sessionId,
            agentId: request.agentId,
            decisionId: asDecisionId("decision-one"),
            actionId: asActionId("action-one"),
            capabilityId: "test:act",
            actionType: "test:act",
            arguments: { intent: "advance" },
            constraints: [], expectedEffects: [],
            basedOnWorldVersion: request.worldVersion,
            issuedAt: request.simTime
          }
        };
      }
    };
    const runtime = createCortexRuntime({ identities });
    const session = await runtime.createHeadlessSession({
      sessionId: "test:proposal-session", project: project([agentId]), seed: 5, createdAt: asSimTime(0)
    }, provider);
    await session.start();
    await session.ingest([projection(agentId, 1, "move")]);
    expect((await session.step(asSimTime(1))).proposals).toHaveLength(1);
    await session.submit({
      schemaVersion: CORTEX_PROPOSAL_DISPOSITION_SCHEMA_V1,
      submissionId: "submission:one", proposalId: "proposal:one", status: "accepted",
      hostWorldVersion: 1, submittedAt: asSimTime(1)
    });
    const evidence = projection(agentId, 2, "completed");
    await session.recordOutcome({
      schemaVersion: CORTEX_AUTHORITATIVE_ACTION_OUTCOME_SCHEMA_V1,
      outcomeId: "outcome:one", proposalId: "proposal:one", submissionId: "submission:one",
      actionId: asActionId("action-one"), status: "succeeded", reasonCode: "test:completed",
      canonicalEventIds: [evidence.event.id],
      hostEvidence: [{ eventId: "event:agent-a-2", worldVersion: 2, evidenceFingerprint: fingerprintArtifact(evidence.event) }],
      observedAt: asSimTime(2)
    }, [evidence]);

    const inspection = await session.inspect();
    expect(inspection.proposals).toHaveLength(1);
    expect(inspection.submissions).toHaveLength(1);
    expect(inspection.outcomes).toHaveLength(1);
    expect(inspection.state.usage).toMatchObject({ proposals: 1, acceptedSubmissions: 1, authoritativeOutcomes: 1 });
  });

  it("preserves lifecycle order when repository artifact order differs", async () => {
    const agentId = actorIds[0]!;
    let call = 0;
    const runtime = createCortexRuntime({ identities });
    const session = await runtime.createHeadlessSession({
      sessionId: "test:ordered-ledger-session", project: project([agentId]), seed: 2, createdAt: asSimTime(0)
    }, {
      mode: "deterministic",
      async activate(request) {
        call += 1;
        const suffix = call === 1 ? "z" : "a";
        return {
          disposition: "proposal",
          proposal: {
            schemaVersion: CORTEX_ACTION_PROPOSAL_SCHEMA_V1,
            proposalId: `proposal:${suffix}`,
            sessionId: request.session.sessionId,
            agentId: request.agentId,
            decisionId: asDecisionId(`decision-${suffix}`), actionId: asActionId(`action-${suffix}`),
            capabilityId: "test:act", actionType: "test:act", arguments: {}, constraints: [], expectedEffects: [],
            basedOnWorldVersion: request.worldVersion, issuedAt: request.simTime
          }
        };
      }
    });
    await session.start();
    await session.notifyWorldRevision({ worldVersion: 1, simTime: asSimTime(1), materialStateFingerprint: fingerprintArtifact("first") });
    await session.step(asSimTime(1));
    await session.notifyWorldRevision({ worldVersion: 2, simTime: asSimTime(2), materialStateFingerprint: fingerprintArtifact("second") });
    await session.step(asSimTime(2));
    expect((await session.inspect()).proposals.map((item) => item.proposalId)).toEqual(["proposal:z", "proposal:a"]);
  });

  it("restores checkpoints deterministically, branches lineage, and replays with zero model calls", async () => {
    const agentId = actorIds[0]!;
    const provider: WorldSessionCognitionProvider = {
      mode: "recorded",
      async activate(request) {
        return {
          disposition: "state-transition",
          acceptedCognition: { decisions: [{ eventIds: request.sourceEventIds }] },
          providerInvocation: { eventIds: request.sourceEventIds, response: "recorded" }
        };
      }
    };
    const runtime = createCortexRuntime({ identities });
    const session = await runtime.createHeadlessSession({
      sessionId: "test:resume-session", project: project([agentId]), seed: 9, createdAt: asSimTime(0)
    }, provider);
    await session.start();
    await session.ingest([projection(agentId, 1, "first")]);
    await session.step(asSimTime(1));
    const checkpoint = await session.checkpoint("checkpoint:one");

    await session.ingest([projection(agentId, 2, "second")]);
    await session.step(asSimTime(2));
    const firstCompletion = await session.inspect();

    await session.restore(checkpoint);
    await session.ingest([projection(agentId, 2, "second")]);
    await session.step(asSimTime(2));
    const resumedCompletion = await session.inspect();
    expect(resumedCompletion.stateFingerprint).toBe(firstCompletion.stateFingerprint);

    const branch = await runtime.branchSession(checkpoint, "test:branch-session", provider);
    const branchInspection = await branch.inspect();
    expect(branchInspection.session.parentSessionId).toBe("test:resume-session");
    expect(branchInspection.state.lineage).toEqual({ parentSessionId: "test:resume-session", parentCheckpointId: "checkpoint:one" });

    await session.complete(asSimTime(2));
    const bundle = await session.exportRun({ runId: "test:recorded-run", createdAt: "2026-08-30T00:00:00.000Z" });
    await expect(runtime.replay(bundle)).resolves.toMatchObject({
      matched: true,
      modelCalls: 0,
      finalStateFingerprint: bundle.finalStateFingerprint,
      restoredState: bundle.runtimeState
    });
  });
});
