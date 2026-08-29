import {
  type AgentId,
  type EntityRef,
  type EventId,
  type GoalId,
  type NamespacedId,
  type SimTime
} from "@cortex/contracts";
import {
  isNamespacedId,
  validateJsonSchema,
  type CapabilityDefinition,
  type DomainRegistry,
  type StrategyTemplateDefinition
} from "@cortex/domain";
import {
  FrameBuilder,
  type AgentState,
  type AgentStateStore,
  type CognitiveFrameContributor,
  type CognitiveFrameSection,
  type PatchEnvelope,
  type StateSliceReducer
} from "@cortex/runtime";
import type { CortexPack } from "@cortex/sdk";
import { GOALS_SLICE_ID, readGoalsState, type Goal } from "./goals.js";

export const PLANNING_SLICE_ID = "cortex-planning:state" as const;
export const PLANNING_SLICE_SCHEMA_VERSION = 2 as const;

export type PlanStatus = "active" | "completed" | "blocked" | "invalidated" | "abandoned";
export type PlanStepStatus = "pending" | "available" | "committed" | "succeeded" | "failed" | "skipped" | "blocked";
export type PlanSource = "reasoner" | "deterministic-policy";

export interface PlanProposalStep {
  readonly stepId: string;
  readonly capabilityId: NamespacedId;
  readonly capabilityVersion: number;
  readonly parameters: Readonly<Record<string, unknown>>;
  readonly target?: EntityRef;
  readonly dependsOn: readonly string[];
  readonly optional: boolean;
}

export interface PlanProposal {
  readonly goalId: GoalId;
  readonly strategyId?: NamespacedId;
  readonly steps: readonly PlanProposalStep[];
  readonly successConditionRefs: readonly NamespacedId[];
  readonly failureConditionRefs: readonly NamespacedId[];
  readonly acknowledgedObligationIds: readonly string[];
  readonly reasonCode: NamespacedId;
}

export interface PlanStep extends PlanProposalStep {
  readonly status: PlanStepStatus;
}

export interface Plan {
  readonly id: string;
  readonly goalId: GoalId;
  readonly strategyId?: NamespacedId;
  readonly steps: readonly PlanStep[];
  readonly successConditionRefs: readonly NamespacedId[];
  readonly failureConditionRefs: readonly NamespacedId[];
  readonly acknowledgedObligationIds: readonly string[];
  readonly reasonCode: NamespacedId;
  readonly status: PlanStatus;
  readonly createdAt: SimTime;
  readonly basedOnVersion: number;
  readonly source: PlanSource;
}

export interface PlanningState {
  readonly activePlan?: Plan;
}

export interface PlanningFrame {
  readonly schemaVersion: "cortex-planning-frame-v1";
  readonly frameId: string;
  readonly agentId: AgentId;
  readonly basedOnVersion: number;
  readonly activeGoal: Goal;
  readonly capabilities: readonly CapabilityDefinition[];
  readonly strategies: readonly StrategyTemplateDefinition[];
  readonly visibleEntities: readonly EntityRef[];
  readonly activeObligationIds: readonly string[];
  readonly sections: readonly CognitiveFrameSection[];
  readonly limits: {
    readonly maxSteps: number;
    readonly maxDepth: number;
    readonly maxParallelSteps: number;
  };
}

export interface PlannerReasoner {
  propose(frame: PlanningFrame, signal: AbortSignal): Promise<PlanProposal>;
}

export type PlanRejectionReason =
  | "pack-not-installed"
  | "goal-not-active"
  | "active-plan-exists"
  | "invalid-output"
  | "unknown-capability"
  | "capability-version-mismatch"
  | "capability-not-relevant"
  | "invalid-parameters"
  | "ungrounded-target"
  | "unknown-strategy"
  | "strategy-not-relevant"
  | "strategy-mismatch"
  | "invalid-graph"
  | "bounds-exceeded"
  | "invalid-condition"
  | "goal-unreachable"
  | "incompatible-capabilities"
  | "obligation-conflict"
  | "policy-conflict";

export type NoPlanReason = "no-relevant-capabilities" | "reasoner-error" | "fallback-unavailable";

export type PlanProposalResult =
  | { readonly status: "committed"; readonly plan: Plan }
  | { readonly status: "rejected"; readonly reason: PlanRejectionReason }
  | { readonly status: "no-plan"; readonly reason: NoPlanReason }
  | { readonly status: "stale" }
  | { readonly status: "cancelled" };

export interface PlanningPolicy {
  readonly maxSteps: number;
  readonly maxDepth: number;
  readonly maxParallelSteps: number;
  readonly reasoningTimeoutMs: number;
  readonly protectedCapabilities: readonly NamespacedId[];
  readonly allowedStrategies?: readonly NamespacedId[];
}

export interface PlanDiagnostic {
  readonly goalId: GoalId;
  readonly basedOnVersion: number;
  readonly outcome: PlanProposalResult["status"];
  readonly reason?: PlanRejectionReason | NoPlanReason;
}

export interface PlanDiagnosticRecorder {
  record(diagnostic: PlanDiagnostic): void | Promise<void>;
}

export class MemoryPlanDiagnosticRecorder implements PlanDiagnosticRecorder {
  readonly #diagnostics: PlanDiagnostic[] = [];
  record(diagnostic: PlanDiagnostic): void { this.#diagnostics.push(structuredClone(diagnostic)); }
  diagnostics(): readonly PlanDiagnostic[] { return structuredClone(this.#diagnostics); }
}

export interface PlanManagerOptions {
  readonly policy?: Partial<PlanningPolicy>;
  readonly frameContributors?: readonly CognitiveFrameContributor[];
  readonly deterministicFallback?: (frame: PlanningFrame) => PlanProposal | undefined;
  readonly diagnosticRecorder?: PlanDiagnosticRecorder;
}

const defaultPolicy: PlanningPolicy = {
  maxSteps: 8,
  maxDepth: 5,
  maxParallelSteps: 3,
  reasoningTimeoutMs: 10_000,
  protectedCapabilities: []
};

type PlanningOperation = { readonly kind: "commit"; readonly plan: Plan };

export const planningReducer: StateSliceReducer = {
  sliceId: PLANNING_SLICE_ID,
  schemaVersion: PLANNING_SLICE_SCHEMA_VERSION,
  writerModules: ["cortex-planning:manager"],
  initialState: (): PlanningState => ({}),
  validate: isPlanningState,
  reduce: (current, operation): PlanningState => {
    const state = current as PlanningState;
    const command = operation as PlanningOperation;
    if (command.kind !== "commit" || state.activePlan || !isPlan(command.plan)) {
      throw new Error("Invalid plan commitment");
    }
    return { activePlan: command.plan };
  }
};

export const planningPack: CortexPack = {
  id: "cortex:planning",
  version: "2.0.0",
  cortexSdkRange: ">=0.0.0",
  dependencies: [{ packId: "cortex:goals", versionRange: "2.0.0" }],
  stateSlices: [planningReducer],
  modules: [{
    id: "cortex-planning:manager",
    cost: "reasoning-model",
    description: "Validates and owns bounded, non-executing plans",
    readsSlices: [GOALS_SLICE_ID, PLANNING_SLICE_ID],
    writesSlices: [PLANNING_SLICE_ID]
  }],
  frameContributors: [{
    id: "cortex-planning:active",
    ownerPackId: "cortex:planning",
    schemaVersion: 2,
    maxBytes: 16384,
    maxItems: 1,
    readsSlices: [PLANNING_SLICE_ID],
    validate: (value) => isPlanningState(value),
    contribute: (state) => readPlanningState(state) ?? {}
  }]
};

export class PlanManager {
  readonly #policy: PlanningPolicy;

  constructor(
    private readonly stateStore: AgentStateStore,
    private readonly domains: DomainRegistry,
    private readonly options: PlanManagerOptions = {}
  ) {
    this.#policy = { ...defaultPolicy, ...options.policy };
    for (const value of [this.#policy.maxSteps, this.#policy.maxDepth, this.#policy.maxParallelSteps]) {
      if (!Number.isInteger(value) || value < 1) throw new Error("Planning bounds must be positive integers");
    }
  }

  async propose(input: {
    readonly agentId: AgentId;
    readonly goalId: GoalId;
    readonly now: SimTime;
    readonly reasoner: PlannerReasoner;
    readonly signal?: AbortSignal;
  }): Promise<PlanProposalResult> {
    const state = await this.stateStore.snapshot(input.agentId);
    const planning = readPlanningState(state);
    if (!planning) return this.finish(input.goalId, state.version, { status: "rejected", reason: "pack-not-installed" });
    const goal = readGoalsState(state)?.goals.find((candidate) => candidate.id === input.goalId && candidate.status === "active");
    if (!goal) return this.finish(input.goalId, state.version, { status: "rejected", reason: "goal-not-active" });
    if (planning.activePlan) return this.finish(input.goalId, state.version, { status: "rejected", reason: "active-plan-exists" });
    const goalDefinition = this.domains.goal(goal.definitionId);
    const capabilities = this.domains.capabilities().filter((capability) =>
      capability.supportedGoals.includes(goal.definitionId) &&
      (goalDefinition?.relevantCapabilities.includes(capability.id) ?? false)
    );
    if (capabilities.length === 0) return this.finish(input.goalId, state.version, { status: "no-plan", reason: "no-relevant-capabilities" });
    const strategies = this.domains.strategies().filter((strategy) =>
      strategy.supportedGoals.includes(goal.definitionId) &&
      (this.#policy.allowedStrategies?.includes(strategy.id) ?? true)
    );
    const frame = this.frame(state, goal, capabilities, strategies);
    const externalSignal = input.signal ?? new AbortController().signal;
    const signal = AbortSignal.any([externalSignal, AbortSignal.timeout(this.#policy.reasoningTimeoutMs)]);
    let proposal: PlanProposal | undefined;
    let source: PlanSource = "reasoner";
    try {
      proposal = await abortable(input.reasoner.propose(frame, signal), signal);
    } catch {
      if (externalSignal.aborted) return this.finish(input.goalId, state.version, { status: "cancelled" });
      proposal = this.options.deterministicFallback?.(frame);
      source = "deterministic-policy";
      if (!proposal) return this.finish(input.goalId, state.version, {
        status: "no-plan", reason: this.options.deterministicFallback ? "fallback-unavailable" : "reasoner-error"
      });
    }
    if (externalSignal.aborted) return this.finish(input.goalId, state.version, { status: "cancelled" });
    if ((await this.stateStore.snapshot(input.agentId)).version !== state.version) {
      return this.finish(input.goalId, state.version, { status: "stale" });
    }
    const rejected = this.validate(state, goal, proposal, strategies);
    if (rejected) return this.finish(input.goalId, state.version, { status: "rejected", reason: rejected });
    const plan: Plan = {
      id: `plan:${state.id}:${goal.id}:v${state.version}`,
      goalId: goal.id,
      ...(proposal.strategyId === undefined ? {} : { strategyId: proposal.strategyId }),
      steps: proposal.steps.map((step) => ({ ...structuredClone(step), status: step.dependsOn.length === 0 ? "available" : "pending" })),
      successConditionRefs: [...proposal.successConditionRefs],
      failureConditionRefs: [...proposal.failureConditionRefs],
      acknowledgedObligationIds: [...proposal.acknowledgedObligationIds],
      reasonCode: proposal.reasonCode,
      status: "active",
      createdAt: input.now,
      basedOnVersion: state.version,
      source
    };
    const patch: PatchEnvelope = {
      patchId: plan.id, agentId: state.id, module: "cortex-planning:manager",
      basedOnVersion: state.version, worldVersion: 0, observedThroughSequence: 0,
      triggeredBy: [], idempotencyKey: plan.id, rebasePolicy: "never", createdAt: input.now,
      patch: { kind: "state-slice", sliceId: PLANNING_SLICE_ID, operation: { kind: "commit", plan } }
    };
    const applied = await this.stateStore.apply(patch);
    return this.finish(input.goalId, state.version, applied.status === "applied"
      ? { status: "committed", plan }
      : { status: "stale" });
  }

  private frame(state: Readonly<AgentState>, goal: Goal, capabilities: readonly CapabilityDefinition[], strategies: readonly StrategyTemplateDefinition[]): PlanningFrame {
    const visibleEntities = uniqueEntities(state.perception.flatMap((observation) => observation.facts.map((fact) => fact.subject)));
    return {
      schemaVersion: "cortex-planning-frame-v1",
      frameId: `${state.id}:planning:${goal.id}:v${state.version}`,
      agentId: state.id,
      basedOnVersion: state.version,
      activeGoal: structuredClone(goal),
      capabilities: structuredClone(capabilities),
      strategies: structuredClone(strategies),
      visibleEntities,
      activeObligationIds: state.activeObligations.map((obligation) => obligation.id),
      sections: new FrameBuilder(this.options.frameContributors ?? []).build({
        state, situationId: `planning:${goal.id}`, situation: `Plan for active goal ${goal.definitionId}`, feasibleIntentions: []
      }).sections,
      limits: { maxSteps: this.#policy.maxSteps, maxDepth: this.#policy.maxDepth, maxParallelSteps: this.#policy.maxParallelSteps }
    };
  }

  private validate(state: Readonly<AgentState>, goal: Goal, proposal: unknown, strategies: readonly StrategyTemplateDefinition[]): PlanRejectionReason | undefined {
    if (!isPlanProposal(proposal) || proposal.goalId !== goal.id) return "invalid-output";
    if (proposal.steps.length < 1) return "invalid-graph";
    if (proposal.steps.length > this.#policy.maxSteps) return "bounds-exceeded";
    const ids = new Set(proposal.steps.map((step) => step.stepId));
    if (ids.size !== proposal.steps.length || [...ids].some((id) => id.trim().length === 0)) return "invalid-graph";
    if (proposal.steps.some((step) => step.dependsOn.some((id) => !ids.has(id) || id === step.stepId))) return "invalid-graph";
    const depths = graphDepths(proposal.steps);
    if (!depths) return "invalid-graph";
    if (Math.max(...depths.values()) > this.#policy.maxDepth || [...counts(depths.values()).values()].some((value) => value > this.#policy.maxParallelSteps)) return "bounds-exceeded";
    const strategy = proposal.strategyId === undefined ? undefined : strategies.find((candidate) => candidate.id === proposal.strategyId);
    if (proposal.strategyId !== undefined && !this.domains.strategy(proposal.strategyId)) return "unknown-strategy";
    if (proposal.strategyId !== undefined && !strategy) return "strategy-not-relevant";
    const capabilities: CapabilityDefinition[] = [];
    const visible = new Set(state.perception.flatMap((observation) => observation.facts.map((fact) => `${fact.subject.type}:${fact.subject.id}`)));
    for (const step of proposal.steps) {
      const capability = this.domains.capability(step.capabilityId);
      if (!capability) return "unknown-capability";
      if (capability.version !== step.capabilityVersion) return "capability-version-mismatch";
      if (!capability.supportedGoals.includes(goal.definitionId)) return "capability-not-relevant";
      if (!validateJsonSchema(capability.parameterSchema, step.parameters)) return "invalid-parameters";
      if (capability.targetTypes.length > 0 && (!step.target || !capability.targetTypes.includes(step.target.type) || !visible.has(`${step.target.type}:${step.target.id}`))) return "ungrounded-target";
      if (capability.targetTypes.length === 0 && step.target !== undefined) return "ungrounded-target";
      if (this.#policy.protectedCapabilities.includes(capability.id)) return "policy-conflict";
      capabilities.push(capability);
    }
    if (strategy) {
      const stages = new Map(strategy.stages.map((stage) => [stage.stageId, stage]));
      if (proposal.steps.some((step) => {
        const stage = stages.get(step.stepId);
        return !stage || !stage.capabilityOptions.includes(step.capabilityId) ||
          stage.dependsOn.some((dependency) => !step.dependsOn.includes(dependency));
      }) || strategy.stages.some((stage) => !stage.optional && !proposal.steps.some((step) => step.stepId === stage.stageId))) {
        return "strategy-mismatch";
      }
    }
    if (capabilities.some((left) => capabilities.some((right) => left.incompatibleWith.includes(right.id)))) return "incompatible-capabilities";
    const definition = this.domains.goal(goal.definitionId)!;
    const successId = definition.successCondition.definitionId;
    const allowedFailure = new Set(definition.failureConditions.map((condition) => condition.definitionId));
    if (!sameSet(proposal.successConditionRefs, [successId]) || proposal.failureConditionRefs.some((id) => !allowedFailure.has(id)) || new Set(proposal.failureConditionRefs).size !== proposal.failureConditionRefs.length) return "invalid-condition";
    if (strategy && (!sameSet(proposal.successConditionRefs, strategy.successConditionRefs) ||
      !sameSet(proposal.failureConditionRefs, strategy.failureConditionRefs))) return "strategy-mismatch";
    if (!capabilities.some((capability) => capability.potentialEffects.includes(successId))) return "goal-unreachable";
    if (!sameSet(proposal.acknowledgedObligationIds, state.activeObligations.map((obligation) => obligation.id))) return "obligation-conflict";
    return undefined;
  }

  private async finish(goalId: GoalId, basedOnVersion: number, result: PlanProposalResult): Promise<PlanProposalResult> {
    await this.options.diagnosticRecorder?.record({
      goalId, basedOnVersion, outcome: result.status,
      ...(result.status === "rejected" || result.status === "no-plan" ? { reason: result.reason } : {})
    });
    return result;
  }
}

export const readPlanningState = (state: Readonly<AgentState>): Readonly<PlanningState> | undefined => {
  const slice = state.slices[PLANNING_SLICE_ID];
  return slice?.schemaVersion === PLANNING_SLICE_SCHEMA_VERSION && isPlanningState(slice.value) ? slice.value : undefined;
};

const isPlanProposal = (value: unknown): value is PlanProposal => {
  if (!isRecord(value)) return false;
  const allowed = new Set(["goalId", "strategyId", "steps", "successConditionRefs", "failureConditionRefs", "acknowledgedObligationIds", "reasonCode"]);
  return Object.keys(value).every((key) => allowed.has(key)) && typeof value["goalId"] === "string" &&
    (value["strategyId"] === undefined || typeof value["strategyId"] === "string") &&
    Array.isArray(value["steps"]) && value["steps"].every(isProposalStep) &&
    isIdArray(value["successConditionRefs"]) && isIdArray(value["failureConditionRefs"]) &&
    Array.isArray(value["acknowledgedObligationIds"]) && value["acknowledgedObligationIds"].every((id) => typeof id === "string") &&
    typeof value["reasonCode"] === "string" && isNamespacedId(value["reasonCode"]);
};

const isProposalStep = (value: unknown): value is PlanProposalStep => isRecord(value) &&
  Object.keys(value).every((key) => ["stepId", "capabilityId", "capabilityVersion", "parameters", "target", "dependsOn", "optional"].includes(key)) &&
  typeof value["stepId"] === "string" && typeof value["capabilityId"] === "string" && isNamespacedId(value["capabilityId"]) &&
  Number.isInteger(value["capabilityVersion"]) && isRecord(value["parameters"]) &&
  (value["target"] === undefined || isEntityRef(value["target"])) &&
  Array.isArray(value["dependsOn"]) && value["dependsOn"].every((id) => typeof id === "string") && typeof value["optional"] === "boolean";

const isPlan = (value: unknown): value is Plan => isRecord(value) && isPlanProposal({
  goalId: value["goalId"], strategyId: value["strategyId"], steps: Array.isArray(value["steps"])
    ? value["steps"].map((step) => isRecord(step) ? Object.fromEntries(Object.entries(step).filter(([key]) => key !== "status")) : step) : value["steps"],
  successConditionRefs: value["successConditionRefs"], failureConditionRefs: value["failureConditionRefs"],
  acknowledgedObligationIds: value["acknowledgedObligationIds"], reasonCode: value["reasonCode"]
}) && typeof value["id"] === "string" && value["status"] === "active" && typeof value["createdAt"] === "number" &&
  Number.isInteger(value["basedOnVersion"]) && ["reasoner", "deterministic-policy"].includes(String(value["source"])) &&
  Array.isArray(value["steps"]) && value["steps"].every((step) => isRecord(step) && ["pending", "available", "committed", "succeeded", "failed", "skipped", "blocked"].includes(String(step["status"])));

function isPlanningState(value: unknown): value is PlanningState {
  return isRecord(value) && Object.keys(value).every((key) => key === "activePlan") &&
    (value["activePlan"] === undefined || isPlan(value["activePlan"]));
}
const isIdArray = (value: unknown): value is NamespacedId[] => Array.isArray(value) && value.every((id) => typeof id === "string" && isNamespacedId(id));
const isEntityRef = (value: unknown): value is EntityRef => isRecord(value) && typeof value["type"] === "string" && isNamespacedId(value["type"]) && typeof value["id"] === "string";
const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> => typeof value === "object" && value !== null && !Array.isArray(value);
const uniqueEntities = (values: readonly EntityRef[]): readonly EntityRef[] => [...new Map(values.map((value) => [`${value.type}:${value.id}`, value])).values()];
const sameSet = (left: readonly string[], right: readonly string[]): boolean => left.length === new Set(left).size && right.length === new Set(right).size && left.length === right.length && left.every((item) => right.includes(item));
const counts = <T>(values: Iterable<T>): Map<T, number> => { const result = new Map<T, number>(); for (const value of values) result.set(value, (result.get(value) ?? 0) + 1); return result; };
const graphDepths = (steps: readonly PlanProposalStep[]): Map<string, number> | undefined => {
  const byId = new Map(steps.map((step) => [step.stepId, step]));
  const depths = new Map<string, number>();
  const visiting = new Set<string>();
  const visit = (id: string): number | undefined => {
    const known = depths.get(id); if (known !== undefined) return known;
    if (visiting.has(id)) return undefined; visiting.add(id);
    const dependencies = byId.get(id)!.dependsOn.map(visit);
    if (dependencies.some((value) => value === undefined)) return undefined;
    const depth = dependencies.length === 0 ? 1 : Math.max(...dependencies as number[]) + 1;
    visiting.delete(id); depths.set(id, depth); return depth;
  };
  return steps.every((step) => visit(step.stepId) !== undefined) ? depths : undefined;
};
const abortable = <T>(promise: Promise<T>, signal: AbortSignal): Promise<T> => new Promise<T>((resolve, reject) => {
  const abort = (): void => reject(signal.reason ?? new Error("Planning aborted"));
  if (signal.aborted) return abort(); signal.addEventListener("abort", abort, { once: true });
  promise.then((value) => { signal.removeEventListener("abort", abort); resolve(value); }, (error: unknown) => { signal.removeEventListener("abort", abort); reject(error); });
});
