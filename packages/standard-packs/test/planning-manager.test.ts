import {
  asActionId, asAgentId, asEntityId, asEventId, asGoalId, asSimTime,
  type PerceptibleWorldEvent
} from "@cortex/contracts";
import { DomainRegistry, type GameDomain } from "@cortex/domain";
import {
  ActionAwarenessModule, BoundedController, CortexKernel, FakeWorld, FrameBuilder,
  InMemoryAgentStateStore, ReplayMismatchError, ScriptedControllerReasoner
} from "@cortex/runtime";
import { describe, expect, it } from "vitest";
import { GOALS_SLICE_ID, goalsPack, type Goal } from "../src/goals.js";
import { CognitionInspector } from "../src/inspection.js";
import {
  PLANNING_SLICE_ID, MemoryPlanDiagnosticRecorder, PlanCoordinator, PlanLifecycleManager,
  MemoryAcceptedPlanRecorder, PlanManager, PlanRecoveryManager, ReplayPlanReasoner,
  planningPack, readPlanningState,
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

const commitPlan = async (
  runtime: Awaited<ReturnType<typeof setup>>,
  candidate = proposal()
) => {
  const result = await new PlanManager(runtime.store, runtime.domains).propose({
    agentId, goalId, now: asSimTime(10), reasoner: reasoner(candidate)
  });
  if (result.status !== "committed") throw new Error(`Expected committed plan, received ${result.status}`);
  return result.plan;
};

const feasible = (id: string, kind: string) => ({
  id, kind, description: id, allowedTargets: [target], constraints: []
});

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

  it("records and replays an accepted plan with exact offered vocabulary", async () => {
    const originalRuntime = await setup(); const originalRecorder = new MemoryAcceptedPlanRecorder();
    const original = await new PlanManager(originalRuntime.store, originalRuntime.domains, {
      acceptedRecorder: originalRecorder,
      reasonerMetadata: { provider: "scripted", model: "test" }
    }).propose({ agentId, goalId, now: asSimTime(10), reasoner: reasoner(proposal()) });
    expect(original.status).toBe("committed");
    expect(originalRecorder.records()).toMatchObject([{
      schemaVersion: "cortex-accepted-plan-record-v1",
      offeredCapabilities: [{ id: "test:alternate", version: 1 }, { id: "test:inspect", version: 1 }, { id: "test:shield", version: 1 }],
      offeredStrategies: [{ id: "test:inspect-then-shield", version: 1 }],
      resultingStateVersion: 2
    }]);
    expect(new CognitionInspector().inspect({ acceptedPlans: originalRecorder.records() }).plans[0])
      .toMatchObject({
        goalId,
        selectedCapabilities: ["test:inspect", "test:shield"],
        source: "reasoner"
      });

    const replayRuntime = await setup(); const replayRecorder = new MemoryAcceptedPlanRecorder();
    const replayReasoner = new ReplayPlanReasoner(originalRecorder.records());
    const replayed = await new PlanManager(replayRuntime.store, replayRuntime.domains, {
      acceptedRecorder: replayRecorder
    }).propose({ agentId, goalId, now: asSimTime(10), reasoner: replayReasoner });
    expect(replayed).toEqual(original);
    expect(replayRecorder.records()).toEqual(originalRecorder.records());
    expect(replayReasoner.consumedCount()).toBe(1);
    expect(replayReasoner.remainingCount()).toBe(0);
  });

  it("rejects plan replay when offered capability metadata was changed", async () => {
    const originalRuntime = await setup(); const recorder = new MemoryAcceptedPlanRecorder();
    await new PlanManager(originalRuntime.store, originalRuntime.domains, { acceptedRecorder: recorder })
      .propose({ agentId, goalId, now: asSimTime(10), reasoner: reasoner(proposal()) });
    const tampered = [{ ...recorder.records()[0]!, offeredCapabilities: [] }];
    const replayRuntime = await setup();
    await expect(new PlanManager(replayRuntime.store, replayRuntime.domains).propose({
      agentId, goalId, now: asSimTime(10), reasoner: new ReplayPlanReasoner(tampered)
    })).rejects.toBeInstanceOf(ReplayMismatchError);
  });

  it("rejects a changed accepted plan before mutating replay state", async () => {
    const originalRuntime = await setup(); const recorder = new MemoryAcceptedPlanRecorder();
    await new PlanManager(originalRuntime.store, originalRuntime.domains, { acceptedRecorder: recorder })
      .propose({ agentId, goalId, now: asSimTime(10), reasoner: reasoner(proposal()) });
    const record = recorder.records()[0]!;
    const tampered = [{ ...record, plan: { ...record.plan, reasonCode: "test:changed" as const } }];
    const replayRuntime = await setup();
    await expect(new PlanManager(replayRuntime.store, replayRuntime.domains).propose({
      agentId, goalId, now: asSimTime(10), reasoner: new ReplayPlanReasoner(tampered)
    })).rejects.toBeInstanceOf(ReplayMismatchError);
    expect((await replayRuntime.store.snapshot(agentId)).version).toBe(1);
  });
});

describe("Slice C plan coordination and lifecycle", () => {
  it("applies strict, adaptive, and advisory eligibility without changing world feasibility", async () => {
    const runtime = await setup(); await commitPlan(runtime);
    const state = await runtime.store.snapshot(agentId);
    const intentions = [
      feasible("inspect-now", "test:inspect-action"),
      feasible("escape-now", "test:escape-action"),
      feasible("wait-now", "test:wait-action")
    ];
    const lifecycle = new PlanLifecycleManager(runtime.store, runtime.domains);
    await expect(new PlanCoordinator(runtime.domains, lifecycle, { mode: "strict" }).coordinate({
      state, situationId: "risk", now: asSimTime(11), feasibleIntentions: intentions, dueObligations: []
    })).resolves.toMatchObject({ status: "eligible", intentions: [{ id: "inspect-now" }] });
    await expect(new PlanCoordinator(runtime.domains, lifecycle, { mode: "adaptive", urgentIntentionKinds: ["test:escape-action"] }).coordinate({
      state, situationId: "risk", now: asSimTime(11), feasibleIntentions: intentions, dueObligations: []
    })).resolves.toMatchObject({ status: "eligible", intentions: [{ id: "inspect-now" }, { id: "escape-now" }] });
    await expect(new PlanCoordinator(runtime.domains, lifecycle, { mode: "advisory" }).coordinate({
      state, situationId: "risk", now: asSimTime(11), feasibleIntentions: intentions, dueObligations: []
    })).resolves.toMatchObject({ status: "eligible", intentions });
  });

  it("integrates strict coordination after obligations and commits the matched step", async () => {
    const runtime = await setup(); await commitPlan(runtime);
    const world = new FakeWorld();
    world.setFeasibleIntentions(agentId, [feasible("inspect-now", "test:inspect-action"), feasible("escape-now", "test:escape-action")]);
    const lifecycle = new PlanLifecycleManager(runtime.store, runtime.domains);
    const controller = new BoundedController(
      runtime.store, world,
      new ScriptedControllerReasoner((frame) => ({
        intentionId: frame.feasibleIntentions[0]!.id, objective: "Follow the available plan step", commitment: 0.8, reasonCode: "test:follow-plan"
      })), new FrameBuilder(), undefined,
      { intentionCoordinator: new PlanCoordinator(runtime.domains, lifecycle, { mode: "strict" }) }
    );
    const decision = await controller.decide({ agentId, situationId: "risk", situation: "Protect target", now: asSimTime(11) });
    expect(decision).toMatchObject({ status: "committed", intention: { id: "inspect-now" } });
    if (decision.status !== "committed") return;
    const committed = await lifecycle.commitDecision({ agentId, decisionId: decision.decision.id, intention: decision.intention, now: asSimTime(11) });
    expect(committed.status).toBe("applied");
    if (committed.status === "applied") {
      expect(committed.plan.steps.find((step) => step.stepId === "inspect")?.status).toBe("committed");
    }
  });

  it("lets a due obligation override strict plan filtering", async () => {
    const runtime = await setup({ obligation: true });
    await commitPlan(runtime, proposal({ acknowledgedObligationIds: ["duty-1"] }));
    const world = new FakeWorld();
    world.setFeasibleIntentions(agentId, [feasible("protect", "test:escape-action"), feasible("inspect-now", "test:inspect-action")]);
    const lifecycle = new PlanLifecycleManager(runtime.store, runtime.domains);
    const result = await new BoundedController(
      runtime.store, world,
      new ScriptedControllerReasoner((frame) => ({ intentionId: frame.feasibleIntentions[0]!.id, objective: "Honor due duty", commitment: 1, reasonCode: "test:due-duty" })),
      new FrameBuilder(), undefined,
      { intentionCoordinator: new PlanCoordinator(runtime.domains, lifecycle, { mode: "strict" }) }
    ).decide({ agentId, situationId: "duty", situation: "Duty is due", now: asSimTime(11) });
    expect(result).toMatchObject({ status: "committed", intention: { id: "protect" }, enforcedObligationIds: ["duty-1"] });
    if (result.status === "committed") {
      await expect(lifecycle.commitDecision({ agentId, decisionId: result.decision.id, intention: result.intention, now: asSimTime(11) }))
        .resolves.toEqual({ status: "no-match" });
    }
  });

  it("blocks explicitly when no plan capability is currently feasible", async () => {
    const runtime = await setup(); await commitPlan(runtime);
    const world = new FakeWorld(); world.setFeasibleIntentions(agentId, [feasible("wait", "test:wait-action")]);
    const lifecycle = new PlanLifecycleManager(runtime.store, runtime.domains);
    const result = await new BoundedController(
      runtime.store, world,
      new ScriptedControllerReasoner(() => ({ intentionId: "wait", objective: "Wait", commitment: 1, reasonCode: "test:wait" })),
      new FrameBuilder(), undefined,
      { intentionCoordinator: new PlanCoordinator(runtime.domains, lifecycle, { mode: "strict" }) }
    ).decide({ agentId, situationId: "blocked", situation: "No planned option", now: asSimTime(11) });
    expect(result).toEqual({ status: "coordination-blocked", reason: "plan-no-feasible-step" });
    expect(readPlanningState(await runtime.store.snapshot(agentId))?.activePlan?.status).toBe("blocked");
  });

  it("advances and completes a plan only after a grounded authoritative expectation succeeds", async () => {
    const runtime = await setup();
    await commitPlan(runtime, proposal({ strategyId: undefined, steps: [{
      stepId: "protect", capabilityId: "test:shield", capabilityVersion: 1,
      parameters: { strength: 1 }, target, dependsOn: [], optional: false
    }] }));
    const world = new FakeWorld(); world.setFeasibleIntentions(agentId, [feasible("shield-now", "test:shield-action")]);
    const lifecycle = new PlanLifecycleManager(runtime.store, runtime.domains);
    const decision = await new BoundedController(
      runtime.store, world,
      new ScriptedControllerReasoner(() => ({ intentionId: "shield-now", objective: "Shield target", commitment: 1, reasonCode: "test:shield" })),
      new FrameBuilder(), undefined,
      { intentionCoordinator: new PlanCoordinator(runtime.domains, lifecycle, { mode: "strict" }) }
    ).decide({ agentId, situationId: "protect", situation: "Protect", now: asSimTime(11) });
    if (decision.status !== "committed") throw new Error("Expected decision");
    await lifecycle.commitDecision({ agentId, decisionId: decision.decision.id, intention: decision.intention, now: asSimTime(11) });
    const actionId = asActionId(`action:${decision.decision.id}`);
    await lifecycle.observeSubmission({ agentId, decisionId: decision.decision.id, submission: { status: "accepted", actionId }, now: asSimTime(12) });
    const awareness = new ActionAwarenessModule(runtime.store, [{
      definitionId: "test:protected", definitionVersion: 1,
      matches: (_effect, event) => event.observedFacts.some((fact) => fact.subject.id === target.id && fact.predicate === "protected" && fact.object === true)
    }]);
    await awareness.expect(agentId, {
      actionId, expectedEffects: [{ definitionId: "test:protected", definitionVersion: 1, subject: target, parameters: {}, deadline: asSimTime(20) }],
      status: "pending", resolutionEventIds: []
    }, asSimTime(12));
    expect(readPlanningState(await runtime.store.snapshot(agentId))?.activePlan?.steps[0]?.status).toBe("committed");
    const outcome: PerceptibleWorldEvent = {
      observer: agentId, channel: "system", clarity: 1,
      observedFacts: [{ subject: target, predicate: "protected", object: true, confidence: 1 }],
      event: { id: asEventId("event:protected"), sequence: 2, worldVersion: 2, simTime: asSimTime(13), type: "test:update", targets: [target], payload: {}, causedBy: actionId }
    };
    await runtime.kernel.ingest(outcome); await awareness.observe(agentId, outcome);
    await expect(lifecycle.reconcile({ agentId, now: asSimTime(13) })).resolves.toMatchObject({
      status: "applied", plan: { status: "completed", steps: [{ status: "succeeded", outcomeEventIds: ["event:protected"] }] }
    });
  });

  it("blocks rejected actions, permits only bounded retry, and never fabricates an outcome", async () => {
    const runtime = await setup();
    await commitPlan(runtime, proposal({ strategyId: undefined, steps: [{
      stepId: "protect", capabilityId: "test:shield", capabilityVersion: 1,
      parameters: { strength: 1 }, target, dependsOn: [], optional: false
    }] }));
    const lifecycle = new PlanLifecycleManager(runtime.store, runtime.domains);
    const world = new FakeWorld(); world.setFeasibleIntentions(agentId, [feasible("shield-now", "test:shield-action")]);
    let cycle = 0;
    const decide = () => new BoundedController(runtime.store, world,
      new ScriptedControllerReasoner(() => ({ intentionId: "shield-now", objective: "Try shield", commitment: 1, reasonCode: "test:shield" })),
      new FrameBuilder(), undefined, { intentionCoordinator: new PlanCoordinator(runtime.domains, lifecycle, { mode: "strict" }) }
    ).decide({ agentId, situationId: `protect-${++cycle}`, situation: "Protect", now: asSimTime(11 + cycle) });
    const first = await decide(); if (first.status !== "committed") throw new Error("Expected decision");
    await lifecycle.commitDecision({ agentId, decisionId: first.decision.id, intention: first.intention, now: asSimTime(11) });
    await lifecycle.observeSubmission({ agentId, decisionId: first.decision.id, submission: { status: "rejected", actionId: asActionId("action:rejected"), reason: "precondition-failed" }, now: asSimTime(12) });
    expect(readPlanningState(await runtime.store.snapshot(agentId))?.activePlan).toMatchObject({ status: "blocked", steps: [{ status: "failed", outcomeEventIds: [] }] });
    const recovery = new PlanRecoveryManager(runtime.store, { maxRetriesPerStep: 1 });
    expect(await recovery.retry({ agentId, stepId: "protect", now: asSimTime(13) })).toMatchObject({ status: "retry-ready" });
    const second = await decide(); if (second.status !== "committed") throw new Error("Expected retry decision");
    await lifecycle.commitDecision({ agentId, decisionId: second.decision.id, intention: second.intention, now: asSimTime(14) });
    await lifecycle.observeSubmission({ agentId, decisionId: second.decision.id, submission: { status: "rejected", actionId: asActionId("action:rejected-again"), reason: "precondition-failed" }, now: asSimTime(15) });
    await expect(recovery.retry({ agentId, stepId: "protect", now: asSimTime(16) })).resolves.toEqual({ status: "rejected", reason: "retry-limit-reached" });
  });

  it("bounds replacement plans, records escalation, and enforces simulation-time horizon", async () => {
    const runtime = await setup(); await commitPlan(runtime);
    const lifecycle = new PlanLifecycleManager(runtime.store, runtime.domains);
    const recovery = new PlanRecoveryManager(runtime.store, { maxReplacementPlans: 1, maxPlanAge: 5 });
    expect(await recovery.enforceHorizon({ agentId, now: asSimTime(20) })).toMatchObject({ status: "blocked", plan: { status: "blocked" } });
    expect(await recovery.prepareReplacement({ agentId, now: asSimTime(21) })).toMatchObject({ status: "replacement-ready", goalId });
    await commitPlan(runtime);
    await lifecycle.blockPlan({ agentId, reason: "cortex-planning:no-feasible-step", now: asSimTime(22) });
    const result = await recovery.prepareReplacement({ agentId, now: asSimTime(23) });
    expect(result).toMatchObject({ status: "escalated", escalation: { reason: "replacement-limit-reached", goalId } });
    expect(readPlanningState(await runtime.store.snapshot(agentId))?.escalations).toHaveLength(1);
  });

  it("records an impossible obligation as escalation instead of satisfaction", async () => {
    const runtime = await setup({ obligation: true });
    const recovery = new PlanRecoveryManager(runtime.store);
    const result = await recovery.escalateObligations({
      agentId, obligations: (await runtime.store.snapshot(agentId)).activeObligations, now: asSimTime(20)
    });
    expect(result).toMatchObject({ status: "escalated", escalation: { reason: "obligation-unfulfillable", obligationIds: ["duty-1"] } });
    expect((await runtime.store.snapshot(agentId)).activeObligations).toHaveLength(1);
  });
});
