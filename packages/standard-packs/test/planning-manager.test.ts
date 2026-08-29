import {
  asAgentId, asEntityId, asEventId, asGoalId, asSimTime,
  type PerceptibleWorldEvent
} from "@cortex/contracts";
import { DomainRegistry, type GameDomain } from "@cortex/domain";
import { CortexKernel, InMemoryAgentStateStore } from "@cortex/runtime";
import { describe, expect, it } from "vitest";
import { GOALS_SLICE_ID, goalsPack, type Goal } from "../src/goals.js";
import {
  PLANNING_SLICE_ID, MemoryPlanDiagnosticRecorder, PlanManager, planningPack,
  type PlanProposal, type PlannerReasoner, type PlanningFrame
} from "../src/planning.js";

const agentId = asAgentId("planner-agent");
const goalId = asGoalId("goal:planner-agent:test:protect-target:v1");
const target = { type: "test:target" as const, id: asEntityId("target-1") };

const domain: GameDomain = {
  id: "test:planning", version: "1.0.0", cortexSdkRange: ">=0.0.0",
  entities: [{ id: "test:target", version: 1, description: "A visible target", propertySchema: { type: "object" }, semanticProperties: [] }],
  perceptions: [{ id: "test:update", version: 1, description: "Target update", payloadSchema: { type: "object" }, semanticProperties: [] }],
  constraints: [], resources: [], relationshipDimensions: [],
  motivations: [{ id: "test:preservation", version: 1, description: "Preserve targets", minimum: 0, maximum: 1 }],
  tags: [
    { id: "test:action", version: 1, description: "Goal action" },
    { id: "test:exclusive", version: 1, description: "Exclusive method" }
  ],
  effects: [
    { id: "test:protected", version: 1, description: "Target protected", subjectTypes: ["test:target"], parameterSchema: { type: "object" } },
    { id: "test:lost", version: 1, description: "Target lost", subjectTypes: ["test:target"], parameterSchema: { type: "object" } },
    { id: "test:observed", version: 1, description: "Target observed", subjectTypes: ["test:target"], parameterSchema: { type: "object" } }
  ],
  actions: ["shield", "inspect", "alternate"].map((name) => ({
    id: `test:${name}-action` as const, version: 1, description: `${name} target`, category: "test:action" as const,
    targetTypes: ["test:target" as const], argumentSchema: { type: "object" }, risks: [], requirements: [],
    potentialEffects: [name === "inspect" ? "test:observed" as const : "test:protected" as const],
    motivationalAffordances: [], skillId: `test:${name}-skill` as const
  })),
  goals: [{
    id: "test:protect-target", version: 1, description: "Protect a target",
    parameterSchema: { type: "object", properties: { targetId: { type: "string" } }, required: ["targetId"], additionalProperties: false },
    entityParameters: { targetId: "test:target" }, admissibleMotivations: ["test:preservation"],
    successCondition: { definitionId: "test:protected", definitionVersion: 1, subjectType: "test:target", parameters: {} },
    failureConditions: [{ definitionId: "test:lost", definitionVersion: 1, subjectType: "test:target", parameters: {} }],
    relevantCapabilities: ["test:shield", "test:inspect", "test:alternate"], defaultHorizon: "short", conflictTags: []
  }],
  capabilities: [{
    id: "test:shield", version: 1, description: "Shield the target",
    parameterSchema: { type: "object", properties: { strength: { type: "number" } }, required: ["strength"], additionalProperties: false },
    targetTypes: ["test:target"], supportedGoals: ["test:protect-target"], requirements: [], risks: [],
    potentialEffects: ["test:protected"], actionIds: ["test:shield-action"], planningCost: { effort: 0.5, risk: 0.1 }, incompatibleWith: ["test:alternate"]
  }, {
    id: "test:inspect", version: 1, description: "Inspect the target",
    parameterSchema: { type: "object", additionalProperties: false }, targetTypes: ["test:target"],
    supportedGoals: ["test:protect-target"], requirements: [], risks: [], potentialEffects: ["test:observed"],
    actionIds: ["test:inspect-action"], planningCost: { effort: 0.2, risk: 0.1 }, incompatibleWith: []
  }, {
    id: "test:alternate", version: 1, description: "Use an exclusive protection method",
    parameterSchema: { type: "object", additionalProperties: false }, targetTypes: ["test:target"],
    supportedGoals: ["test:protect-target"], requirements: [], risks: ["test:exclusive"], potentialEffects: ["test:protected"],
    actionIds: ["test:alternate-action"], planningCost: { effort: 0.7, risk: 0.4 }, incompatibleWith: ["test:shield"]
  }],
  strategies: [{
    id: "test:inspect-then-shield", version: 1, description: "Inspect before choosing protection",
    supportedGoals: ["test:protect-target"],
    stages: [
      { stageId: "inspect", capabilityOptions: ["test:inspect"], dependsOn: [], optional: false },
      { stageId: "protect", capabilityOptions: ["test:shield", "test:alternate"], dependsOn: ["inspect"], optional: false }
    ],
    successConditionRefs: ["test:protected"], failureConditionRefs: ["test:lost"]
  }]
};

const activeGoal: Goal = {
  id: goalId, definitionId: "test:protect-target", definitionVersion: 1,
  parameters: { targetId: target.id }, motivationIds: ["test:preservation"],
  evidenceRefs: [{ eventId: asEventId("event:visible") }], priority: 0.9, horizon: "short", status: "active",
  createdAt: asSimTime(1), basedOnVersion: 1, source: "reasoner"
};

const observed = (eventId = asEventId("event:visible"), sequence = 1): PerceptibleWorldEvent => ({
  observer: agentId, channel: "seen", clarity: 1,
  observedFacts: [{ subject: target, predicate: "visible", object: true, confidence: 1 }],
  event: { id: eventId, sequence, worldVersion: sequence, simTime: asSimTime(sequence), type: "test:update", targets: [target], payload: {} }
});

const proposal = (overrides: Partial<PlanProposal> = {}): PlanProposal => ({
  goalId, strategyId: "test:inspect-then-shield",
  steps: [{ stepId: "inspect", capabilityId: "test:inspect", capabilityVersion: 1, parameters: {}, target, dependsOn: [], optional: false },
    { stepId: "protect", capabilityId: "test:shield", capabilityVersion: 1, parameters: { strength: 1 }, target, dependsOn: ["inspect"], optional: false }],
  successConditionRefs: ["test:protected"], failureConditionRefs: ["test:lost"],
  acknowledgedObligationIds: [], reasonCode: "test:protect-plan", ...overrides
});
const reasoner = (value: PlanProposal): PlannerReasoner => ({ propose: async (_frame: PlanningFrame) => value });

const setup = async (input: { obligation?: boolean; planning?: boolean } = {}) => {
  const reducers = input.planning === false ? goalsPack.stateSlices : [...goalsPack.stateSlices, ...planningPack.stateSlices];
  const store = new InMemoryAgentStateStore(reducers);
  const kernel = new CortexKernel(store);
  await kernel.registerAgent({
    id: agentId, identity: { name: "Planner" },
    resolution: { tier: 2, reasons: ["test"], budget: { periodEndsAt: asSimTime(100), smallModelCallsRemaining: 0, reasoningCallsRemaining: 1, generatedTokensRemaining: 1000, concurrentJobsRemaining: 1 } },
    ...(input.obligation ? { activeObligations: [{ id: "duty-1", sourceDecisionId: "decision-1" as never, requiredIntentionIds: ["protect"], remainingDecisionCycles: 1, reason: "Protect" }] } : {}),
    slices: {
      [GOALS_SLICE_ID]: { schemaVersion: 2, value: { goals: [activeGoal] } },
      ...(input.planning === false ? {} : { [PLANNING_SLICE_ID]: { schemaVersion: 2, value: {} } })
    }
  }, asSimTime(0));
  await kernel.ingest(observed());
  const domains = new DomainRegistry(); domains.register(domain);
  return { store, kernel, domains };
};

describe("PlanManager", () => {
  it("commits a bounded plan and exposes only dependency-ready steps", async () => {
    const { store, domains } = await setup();
    const result = await new PlanManager(store, domains).propose({ agentId, goalId, now: asSimTime(10), reasoner: reasoner(proposal()) });
    expect(result.status).toBe("committed");
    if (result.status !== "committed") return;
    expect(result.plan.steps.map((step) => step.status)).toEqual(["available", "pending"]);
    expect((await store.snapshot(agentId)).currentDecision).toBeUndefined();
    expect(result.plan.source).toBe("reasoner");
  });

  it.each([
    ["unknown-capability", proposal({ steps: [{ ...proposal().steps[0]!, capabilityId: "test:invented" }] })],
    ["capability-version-mismatch", proposal({ steps: [{ ...proposal().steps[0]!, capabilityVersion: 2 }] })],
    ["invalid-parameters", proposal({ steps: [proposal().steps[0]!, { ...proposal().steps[1]!, parameters: {} }] })],
    ["ungrounded-target", proposal({ steps: [proposal().steps[0]!, { ...proposal().steps[1]!, target: { ...target, id: asEntityId("hidden") } }] })],
    ["unknown-strategy", proposal({ strategyId: "test:invented-strategy" })],
    ["invalid-condition", proposal({ successConditionRefs: ["test:observed"] })]
  ] as const)("rejects %s proposals", async (expected, candidate) => {
    const { store, domains } = await setup();
    await expect(new PlanManager(store, domains).propose({ agentId, goalId, now: asSimTime(10), reasoner: reasoner(candidate) }))
      .resolves.toMatchObject({ status: "rejected", reason: expected });
  });

  it("rejects cycles, excessive parallelism, and semantically unreachable plans", async () => {
    const cyclic = proposal({ steps: [
      { ...proposal().steps[0]!, dependsOn: ["protect"] }, { ...proposal().steps[1]!, dependsOn: ["inspect"] }
    ] });
    const first = await setup();
    await expect(new PlanManager(first.store, first.domains).propose({ agentId, goalId, now: asSimTime(10), reasoner: reasoner(cyclic) }))
      .resolves.toMatchObject({ status: "rejected", reason: "invalid-graph" });
    const second = await setup();
    await expect(new PlanManager(second.store, second.domains, { policy: { maxParallelSteps: 1 } }).propose({
      agentId, goalId, now: asSimTime(10), reasoner: reasoner(proposal({ strategyId: undefined, steps: [proposal().steps[0]!, { ...proposal().steps[0]!, stepId: "inspect-2" }] }))
    })).resolves.toMatchObject({ status: "rejected", reason: "bounds-exceeded" });
    const third = await setup();
    await expect(new PlanManager(third.store, third.domains).propose({ agentId, goalId, now: asSimTime(10), reasoner: reasoner(proposal({ strategyId: undefined, steps: [proposal().steps[0]!] })) }))
      .resolves.toMatchObject({ status: "rejected", reason: "goal-unreachable" });
  });

  it("enforces incompatibilities, obligations, protected capabilities, and one active plan", async () => {
    const incompatible = proposal({ strategyId: undefined, steps: [{ ...proposal().steps[1]!, dependsOn: [] }, { ...proposal().steps[1]!, stepId: "alternate", capabilityId: "test:alternate", parameters: {}, dependsOn: [] }] });
    const first = await setup();
    await expect(new PlanManager(first.store, first.domains).propose({ agentId, goalId, now: asSimTime(10), reasoner: reasoner(incompatible) }))
      .resolves.toMatchObject({ status: "rejected", reason: "incompatible-capabilities" });
    const obligated = await setup({ obligation: true });
    await expect(new PlanManager(obligated.store, obligated.domains).propose({ agentId, goalId, now: asSimTime(10), reasoner: reasoner(proposal()) }))
      .resolves.toMatchObject({ status: "rejected", reason: "obligation-conflict" });
    const protectedRuntime = await setup();
    await expect(new PlanManager(protectedRuntime.store, protectedRuntime.domains, { policy: { protectedCapabilities: ["test:shield"] } }).propose({ agentId, goalId, now: asSimTime(10), reasoner: reasoner(proposal()) }))
      .resolves.toMatchObject({ status: "rejected", reason: "policy-conflict" });
    const committed = await setup(); const manager = new PlanManager(committed.store, committed.domains);
    await manager.propose({ agentId, goalId, now: asSimTime(10), reasoner: reasoner(proposal()) });
    await expect(manager.propose({ agentId, goalId, now: asSimTime(11), reasoner: reasoner(proposal()) }))
      .resolves.toMatchObject({ status: "rejected", reason: "active-plan-exists" });
  });

  it("discards stale or cancelled reasoning without committing", async () => {
    const stale = await setup();
    const changing: PlannerReasoner = { propose: async () => { await stale.kernel.ingest(observed(asEventId("event:changed"), 2)); return proposal(); } };
    await expect(new PlanManager(stale.store, stale.domains).propose({ agentId, goalId, now: asSimTime(10), reasoner: changing }))
      .resolves.toEqual({ status: "stale" });
    const cancelled = await setup(); const controller = new AbortController();
    const waiting: PlannerReasoner = { propose: async (_frame, signal) => new Promise((_resolve, reject) => signal.addEventListener("abort", () => reject(new Error("cancelled")), { once: true })) };
    const pending = new PlanManager(cancelled.store, cancelled.domains).propose({ agentId, goalId, now: asSimTime(10), reasoner: waiting, signal: controller.signal });
    controller.abort();
    await expect(pending).resolves.toEqual({ status: "cancelled" });
  });

  it("uses a declared deterministic fallback only for provider failure", async () => {
    const { store, domains } = await setup(); const diagnostics = new MemoryPlanDiagnosticRecorder();
    const result = await new PlanManager(store, domains, { deterministicFallback: () => proposal(), diagnosticRecorder: diagnostics }).propose({
      agentId, goalId, now: asSimTime(10), reasoner: { propose: async () => { throw new Error("provider down"); } }
    });
    expect(result).toMatchObject({ status: "committed", plan: { source: "deterministic-policy" } });
    expect(diagnostics.diagnostics()).toMatchObject([{ outcome: "committed" }]);
  });

  it("reports missing optional state as a pack boundary", async () => {
    const { store, domains } = await setup({ planning: false });
    await expect(new PlanManager(store, domains).propose({ agentId, goalId, now: asSimTime(10), reasoner: reasoner(proposal()) }))
      .resolves.toMatchObject({ status: "rejected", reason: "pack-not-installed" });
  });
});
