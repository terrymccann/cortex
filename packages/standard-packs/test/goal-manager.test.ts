import {
  asAgentId,
  asDecisionId,
  asEntityId,
  asEventId,
  asSimTime,
  type PerceptibleWorldEvent
} from "@cortex/contracts";
import { DomainRegistry, type GameDomain } from "@cortex/domain";
import {
  CortexKernel,
  InMemoryAgentStateStore,
  createAgentState
} from "@cortex/runtime";
import { describe, expect, it } from "vitest";
import {
  GOALS_SLICE_ID,
  GoalManager,
  GoalOpportunityGate,
  MemoryGoalDiagnosticRecorder,
  goalsPack,
  type GoalFormationFrame,
  type GoalConditionMatcher,
  type GoalProposal,
  type GoalReasoner,
  type GoalsState
} from "../src/goals.js";

const agentId = asAgentId("goal-agent");
const targetRef = { type: "test:target" as const, id: asEntityId("target-1") };
const observedEventId = asEventId("event:target-damaged");

const domain: GameDomain = {
  id: "test:autonomy",
  version: "1.0.0",
  cortexSdkRange: ">=0.0.0",
  actions: [{
    id: "test:protect-action",
    version: 1,
    description: "Protect a target",
    category: "test:goal-action",
    targetTypes: ["test:target"],
    argumentSchema: { type: "object", additionalProperties: false },
    risks: [], requirements: [], potentialEffects: ["test:target-protected"],
    motivationalAffordances: [],
    skillId: "test:protect-skill"
  }, {
    id: "test:inspect-action",
    version: 1,
    description: "Inspect a target",
    category: "test:goal-action",
    targetTypes: ["test:target"],
    argumentSchema: { type: "object", additionalProperties: false },
    risks: [], requirements: [], potentialEffects: ["test:target-protected"],
    motivationalAffordances: [],
    skillId: "test:inspect-skill"
  }],
  entities: [{
    id: "test:target",
    version: 1,
    description: "A grounded test target",
    propertySchema: { type: "object" },
    semanticProperties: []
  }],
  perceptions: [{
    id: "test:target-update",
    version: 1,
    description: "An observed target update",
    payloadSchema: { type: "object" },
    semanticProperties: []
  }],
  constraints: [],
  effects: [{
    id: "test:target-protected",
    version: 1,
    description: "The target is authoritatively protected",
    subjectTypes: ["test:target"],
    parameterSchema: { type: "object" }
  }],
  resources: [],
  relationshipDimensions: [],
  motivations: [{
    id: "test:preservation",
    version: 1,
    description: "Preserve valuable targets",
    minimum: 0,
    maximum: 1
  }],
  goals: [{
    id: "test:protect-target",
    version: 1,
    description: "Protect an observed target",
    parameterSchema: {
      type: "object",
      properties: { targetId: { type: "string" } },
      required: ["targetId"],
      additionalProperties: false
    },
    entityParameters: { targetId: "test:target" },
    admissibleMotivations: ["test:preservation"],
    successCondition: {
      definitionId: "test:target-protected",
      definitionVersion: 1,
      subjectType: "test:target",
      parameters: {}
    },
    failureConditions: [],
    relevantCapabilities: ["test:protect"],
    defaultHorizon: "short",
    conflictTags: ["test:exclusive-duty"]
  }, {
    id: "test:inspect-target",
    version: 1,
    description: "Inspect the same target before protecting it",
    parameterSchema: {
      type: "object",
      properties: { targetId: { type: "string" } },
      required: ["targetId"],
      additionalProperties: false
    },
    entityParameters: { targetId: "test:target" },
    admissibleMotivations: ["test:preservation"],
    successCondition: {
      definitionId: "test:target-protected",
      definitionVersion: 1,
      subjectType: "test:target",
      parameters: {}
    },
    failureConditions: [],
    relevantCapabilities: ["test:inspect"],
    defaultHorizon: "short",
    conflictTags: ["test:exclusive-duty"]
  }],
  capabilities: [{
    id: "test:protect", version: 1, description: "Protect a grounded target",
    parameterSchema: { type: "object", additionalProperties: false },
    targetTypes: ["test:target"], supportedGoals: ["test:protect-target"],
    requirements: [], risks: [], potentialEffects: ["test:target-protected"],
    actionIds: ["test:protect-action"], planningCost: { effort: 0.4, risk: 0.1 }, incompatibleWith: []
  }, {
    id: "test:inspect", version: 1, description: "Inspect a grounded target",
    parameterSchema: { type: "object", additionalProperties: false },
    targetTypes: ["test:target"], supportedGoals: ["test:inspect-target"],
    requirements: [], risks: [], potentialEffects: ["test:target-protected"],
    actionIds: ["test:inspect-action"], planningCost: { effort: 0.2, risk: 0.1 }, incompatibleWith: []
  }],
  strategies: [],
  tags: [
    { id: "test:exclusive-duty", version: 1, description: "An exclusive duty" },
    { id: "test:goal-action", version: 1, description: "An action serving a goal" }
  ]
};

const proposal = (overrides: Partial<GoalProposal> = {}): GoalProposal => ({
  definitionId: "test:protect-target",
  definitionVersion: 1,
  parameters: { targetId: targetRef.id },
  motivationIds: ["test:preservation"],
  evidenceRefs: [{ eventId: observedEventId }],
  proposedPriority: 1.4,
  proposedHorizon: "short",
  reasonCode: "test:material-risk",
  ...overrides
});

const reasoner = (output: GoalProposal): GoalReasoner => ({
  propose: async (_frame: GoalFormationFrame) => output
});

const observation = (
  eventId = observedEventId,
  sequence = 1,
  predicate = "damaged",
  object: unknown = true
): PerceptibleWorldEvent => ({
  observer: agentId,
  channel: "system",
  clarity: 1,
  observedFacts: [{ subject: targetRef, predicate, object, confidence: 1 }],
  event: {
    id: eventId,
    sequence,
    worldVersion: sequence,
    simTime: asSimTime(sequence),
    type: "test:target-update",
    targets: [targetRef],
    payload: {}
  }
});

const setup = async (input: {
  readonly tier?: 0 | 1 | 2 | 3;
  readonly installPack?: boolean;
  readonly withObservation?: boolean;
  readonly withObligation?: boolean;
} = {}) => {
  const store = new InMemoryAgentStateStore(input.installPack === false ? [] : goalsPack.stateSlices);
  const kernel = new CortexKernel(store);
  await kernel.registerAgent({
    id: agentId,
    identity: { name: "Goal Agent" },
    resolution: {
      tier: input.tier ?? 2,
      reasons: ["goal-test"],
      budget: {
        periodEndsAt: asSimTime(100),
        smallModelCallsRemaining: 0,
        reasoningCallsRemaining: 1,
        generatedTokensRemaining: 1024,
        concurrentJobsRemaining: 1
      }
    },
    ...(input.withObligation === true ? {
      activeObligations: [{
        id: "obligation-1",
        sourceDecisionId: asDecisionId("decision-1"),
        requiredIntentionIds: ["withdraw"],
        remainingDecisionCycles: 1,
        reason: "Honor withdrawal"
      }]
    } : {}),
    ...(input.installPack === false ? {} : {
      slices: { [GOALS_SLICE_ID]: { schemaVersion: 2, value: { goals: [] } } }
    })
  }, asSimTime(0));
  if (input.withObservation !== false) await kernel.ingest(observation());
  const domains = new DomainRegistry();
  domains.register(domain);
  return { store, kernel, domains };
};

const form = (manager: GoalManager, output = proposal(), triggerId = "risk") =>
  manager.form({
    agentId,
    trigger: { id: triggerId, kind: "material-event", evidenceEventIds: [observedEventId] },
    now: asSimTime(10),
    reasoner: reasoner(output)
  });

const protectedMatcher: GoalConditionMatcher = {
  definitionId: "test:target-protected",
  definitionVersion: 1,
  matches: (_condition, goal, observed) => observed.facts.some((fact) =>
    fact.subject.type === "test:target" &&
    fact.subject.id === goal.parameters["targetId"] &&
    fact.predicate === "protected" &&
    fact.object === true
  )
};

describe("GoalManager", () => {
  it("activates a grounded registered proposal and clamps policy-owned priority", async () => {
    const { store, domains } = await setup();
    const result = await form(new GoalManager(store, domains, {
      policy: { maximumPriority: 0.9 }
    }));

    expect(result.status).toBe("activated");
    if (result.status !== "activated") throw new Error("Expected activation");
    expect(result.goal.priority).toBe(0.9);
    expect(result.goal.definitionId).toBe("test:protect-target");
    expect(result.goal.source).toBe("reasoner");
    const state = (await store.snapshot(agentId)).slices[GOALS_SLICE_ID]?.value as GoalsState;
    expect(state.goals).toEqual([result.goal]);
  });

  it.each([
    ["unknown-definition", proposal({ definitionId: "test:invented-goal" })],
    ["definition-version-mismatch", proposal({ definitionVersion: 2 })],
    ["invalid-parameters", proposal({ parameters: { wrong: true } })],
    ["ungrounded-evidence", proposal({ evidenceRefs: [{ eventId: asEventId("event:unseen") }] })],
    ["motivation-not-admissible", proposal({ motivationIds: ["test:invented-motivation"] })]
  ])("rejects %s proposals without mutating goal state", async (expected, candidate) => {
    const { store, domains } = await setup();
    const result = await form(new GoalManager(store, domains), candidate);
    expect(result).toEqual({ status: "rejected", reason: expected });
    expect(((await store.snapshot(agentId)).slices[GOALS_SLICE_ID]?.value as GoalsState).goals).toEqual([]);
  });

  it("rejects entity parameters that are validly shaped but not grounded in visible evidence", async () => {
    const { store, domains } = await setup();
    expect(await form(new GoalManager(store, domains), proposal({ parameters: { targetId: "unseen-target" } })))
      .toEqual({ status: "rejected", reason: "ungrounded-entity" });
  });

  it("merges an equivalent active goal instead of creating a duplicate", async () => {
    const { store, kernel, domains } = await setup();
    const manager = new GoalManager(store, domains);
    const first = await form(manager, proposal({ proposedPriority: 0.4 }), "risk-1");
    expect(first.status).toBe("activated");
    const secondEventId = asEventId("event:target-still-damaged");
    await kernel.ingest(observation(secondEventId, 2));
    const second = await form(manager, proposal({
      proposedPriority: 0.8,
      evidenceRefs: [{ eventId: secondEventId }]
    }), "risk-2");
    expect(second.status).toBe("merged");
    if (second.status !== "merged") throw new Error("Expected merge");
    expect(second.goal.priority).toBe(0.8);
    expect(second.goal.evidenceRefs).toHaveLength(2);
    expect(((await store.snapshot(agentId)).slices[GOALS_SLICE_ID]?.value as GoalsState).goals).toHaveLength(1);
  });

  it("discards stale and cancelled proposals", async () => {
    const staleRuntime = await setup();
    const stale = await new GoalManager(staleRuntime.store, staleRuntime.domains).form({
      agentId,
      trigger: { id: "stale", kind: "material-event", evidenceEventIds: [observedEventId] },
      now: asSimTime(10),
      reasoner: {
        propose: async () => {
          await staleRuntime.kernel.ingest(observation(asEventId("event:world-changed"), 2));
          return proposal();
        }
      }
    });
    expect(stale).toEqual({ status: "stale" });

    const cancelledRuntime = await setup();
    const controller = new AbortController();
    controller.abort("cancelled-by-scheduler");
    const cancelled = await new GoalManager(cancelledRuntime.store, cancelledRuntime.domains).form({
      agentId,
      trigger: { id: "cancelled", kind: "material-event", evidenceEventIds: [observedEventId] },
      now: asSimTime(10),
      reasoner: reasoner(proposal()),
      signal: controller.signal
    });
    expect(cancelled).toEqual({ status: "cancelled" });
  });

  it("does not invoke reasoning for ungrounded, resolved, or already-considered triggers", async () => {
    let calls = 0;
    const countingReasoner: GoalReasoner = {
      propose: async () => {
        calls += 1;
        return proposal({ definitionId: "test:invented-goal" });
      }
    };
    const ungrounded = await setup({ withObservation: false });
    expect(await new GoalManager(ungrounded.store, ungrounded.domains).form({
      agentId,
      trigger: { id: "unseen", kind: "material-event", evidenceEventIds: [observedEventId] },
      now: asSimTime(10),
      reasoner: countingReasoner
    })).toEqual({ status: "deferred", reason: "trigger-ungrounded" });

    const resolved = await setup();
    expect(await new GoalManager(resolved.store, resolved.domains).form({
      agentId,
      trigger: {
        id: "resolved",
        kind: "material-event",
        evidenceEventIds: [observedEventId],
        deterministicallyResolved: true
      },
      now: asSimTime(10),
      reasoner: countingReasoner
    })).toEqual({ status: "deferred", reason: "deterministically-resolved" });

    const repeated = await setup();
    const manager = new GoalManager(repeated.store, repeated.domains);
    const input = {
      agentId,
      trigger: { id: "repeat", kind: "material-event" as const, evidenceEventIds: [observedEventId] },
      now: asSimTime(10),
      reasoner: countingReasoner
    };
    expect(await manager.form(input)).toEqual({ status: "rejected", reason: "unknown-definition" });
    expect(await manager.form(input)).toEqual({ status: "deferred", reason: "already-considered" });
    expect(calls).toBe(1);
  });

  it("enforces obligation and protected-goal policy before activation", async () => {
    const obligated = await setup({ withObligation: true });
    expect(await form(new GoalManager(obligated.store, obligated.domains, {
      policy: { blockedGoalDefinitionsWhileObligated: ["test:protect-target"] }
    }))).toEqual({ status: "rejected", reason: "obligation-conflict" });

    const protectedRuntime = await setup();
    expect(await form(new GoalManager(protectedRuntime.store, protectedRuntime.domains, {
      policy: { protectedConflictTags: ["test:exclusive-duty"] }
    }))).toEqual({ status: "rejected", reason: "policy-conflict" });
  });

  it("rejects a new goal that conflicts with an active registered goal", async () => {
    const { store, kernel, domains } = await setup();
    const manager = new GoalManager(store, domains);
    expect((await form(manager, proposal(), "protect")).status).toBe("activated");
    const secondEventId = asEventId("event:conflicting-opportunity");
    await kernel.ingest(observation(secondEventId, 2));
    expect(await form(manager, proposal({
      definitionId: "test:inspect-target",
      evidenceRefs: [{ eventId: secondEventId }]
    }), "inspect")).toEqual({ status: "rejected", reason: "goal-conflict" });
  });

  it("allows only reducer-approved lifecycle transitions grounded by authoritative evidence", async () => {
    const { store, kernel, domains } = await setup();
    const manager = new GoalManager(store, domains, {
      conditionMatchers: [protectedMatcher]
    });
    const activated = await form(manager);
    if (activated.status !== "activated") throw new Error("Expected activation");

    expect((await manager.transition({
      agentId,
      goalId: activated.goal.id,
      status: "suspended",
      now: asSimTime(10)
    })).status).toBe("applied");
    expect((await manager.transition({
      agentId,
      goalId: activated.goal.id,
      status: "active",
      now: asSimTime(10)
    })).status).toBe("applied");

    expect(await manager.transition({
      agentId,
      goalId: activated.goal.id,
      status: "satisfied",
      evidenceRefs: [{ eventId: asEventId("event:unseen") }],
      now: asSimTime(11)
    })).toEqual({ status: "rejected", reason: "invalid-value" });
    expect(await manager.transition({
      agentId,
      goalId: activated.goal.id,
      status: "satisfied",
      evidenceRefs: [{ eventId: observedEventId }],
      now: asSimTime(11)
    })).toEqual({ status: "rejected", reason: "invalid-value" });
    const successEventId = asEventId("event:target-protected");
    await kernel.ingest(observation(successEventId, 2, "protected", true));
    expect((await manager.transition({
      agentId,
      goalId: activated.goal.id,
      status: "satisfied",
      evidenceRefs: [{ eventId: successEventId }],
      now: asSimTime(12)
    })).status).toBe("applied");
    expect(await manager.transition({
      agentId,
      goalId: activated.goal.id,
      status: "active",
      now: asSimTime(13)
    })).toEqual({ status: "rejected", reason: "invalid-value" });
  });

  it("records structured diagnostics for rejected proposals without storing hidden reasoning", async () => {
    const { store, domains } = await setup();
    const diagnostics = new MemoryGoalDiagnosticRecorder();
    const result = await form(new GoalManager(store, domains, {
      diagnosticRecorder: diagnostics
    }), proposal({ definitionId: "test:invented-goal" }), "audit-rejection");

    expect(result).toEqual({ status: "rejected", reason: "unknown-definition" });
    expect(diagnostics.diagnostics()).toEqual([{
      triggerId: "audit-rejection",
      basedOnVersion: 1,
      outcome: "rejected",
      reason: "unknown-definition",
      definitionId: "test:invented-goal"
    }]);
  });
});

describe("GoalOpportunityGate", () => {
  it("keeps tier-zero and packless agents out of goal reasoning", async () => {
    const gate = new GoalOpportunityGate();
    const tierZero = await setup({ tier: 0 });
    expect(gate.evaluate({
      state: await tierZero.store.snapshot(agentId),
      goals: { goals: [] },
      trigger: { id: "tier-zero", kind: "reflection-interval", evidenceEventIds: [] },
      now: asSimTime(2),
      alreadyConsidered: false,
      policy: {
        maxActiveGoals: 1,
        minimumPriority: 0,
        maximumPriority: 1,
        allowedHorizons: ["short"],
        cooldown: 0,
        reasoningTimeoutMs: 100,
        deferWhileObligated: false,
        protectedConflictTags: [],
        blockedGoalDefinitionsWhileObligated: []
      }
    })).toEqual({ opened: false, reason: "tier-zero" });

    const packless = createAgentState({
      id: agentId,
      identity: { name: "Packless" },
      resolution: {
        tier: 1,
        reasons: [],
        budget: {
          periodEndsAt: asSimTime(10),
          smallModelCallsRemaining: 0,
          reasoningCallsRemaining: 1,
          generatedTokensRemaining: 100,
          concurrentJobsRemaining: 1
        }
      }
    }, asSimTime(0));
    expect(gate.evaluate({
      state: packless,
      goals: undefined,
      trigger: { id: "packless", kind: "reflection-interval", evidenceEventIds: [] },
      now: asSimTime(0),
      alreadyConsidered: false,
      policy: {
        maxActiveGoals: 1,
        minimumPriority: 0,
        maximumPriority: 1,
        allowedHorizons: ["short"],
        cooldown: 0,
        reasoningTimeoutMs: 100,
        deferWhileObligated: false,
        protectedConflictTags: [],
        blockedGoalDefinitionsWhileObligated: []
      }
    })).toEqual({ opened: false, reason: "pack-not-installed" });
  });
});
