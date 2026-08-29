import {
  type ActionId,
  type ActionSubmission,
  type AgentId,
  type DecisionId,
  type EntityRef,
  type EventId,
  type FeasibleIntention,
  type GoalId,
  type NamespacedId,
  type SimTime
} from "@cortex/contracts";
import {
  fingerprintManifest,
  isNamespacedId,
  validateJsonSchema,
  type CapabilityDefinition,
  type DomainRegistry,
  type StrategyTemplateDefinition
} from "@cortex/domain";
import {
  EMPTY_FRAME_MANIFEST_FINGERPRINT,
  FrameBuilder,
  ReplayMismatchError,
  type AgentState,
  type AgentStateStore,
  type CognitiveFrameContributor,
  type CognitiveFrameSection,
  type DecisionObligation,
  type IntentionCoordinator,
  type IntentionCoordinationInput,
  type IntentionCoordinationResult,
  type PatchEnvelope,
  type RuntimeCompatibilityComponent,
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
  readonly attempts?: number;
  readonly committedDecisionId?: DecisionId;
  readonly actionId?: ActionId;
  readonly outcomeEventIds?: readonly EventId[];
  readonly statusReason?: NamespacedId;
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
  readonly updatedAt?: SimTime;
  readonly statusReason?: NamespacedId;
}

export interface PlanningState {
  readonly activePlan?: Plan;
  readonly recentPlans?: readonly Plan[];
  readonly replacementPlanCounts?: Readonly<Record<string, number>>;
  readonly escalations?: readonly PlanEscalation[];
}

export interface PlanEscalation {
  readonly id: string;
  readonly goalId: GoalId;
  readonly planId?: string;
  readonly reason: PlanEscalationReason;
  readonly obligationIds: readonly string[];
  readonly createdAt: SimTime;
}

export type PlanEscalationReason =
  | "replacement-limit-reached"
  | "obligation-unfulfillable"
  | "plan-policy-conflict";

export interface PlanningFrame {
  readonly schemaVersion: "cortex-planning-frame-v1";
  readonly frameId: string;
  readonly agentId: AgentId;
  readonly basedOnVersion: number;
  readonly manifestFingerprint: string;
  readonly compatibilityComponents: readonly RuntimeCompatibilityComponent[];
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

export const CORTEX_ACCEPTED_PLAN_RECORD_SCHEMA_VERSION = "cortex-accepted-plan-record-v1" as const;

export interface AcceptedPlanRecord {
  readonly schemaVersion: typeof CORTEX_ACCEPTED_PLAN_RECORD_SCHEMA_VERSION;
  readonly frameSchemaVersion: PlanningFrame["schemaVersion"];
  readonly frameId: string;
  readonly frameHash: string;
  readonly manifestFingerprint: string;
  readonly compatibilityComponents: readonly RuntimeCompatibilityComponent[];
  readonly frameSections: readonly { readonly id: NamespacedId; readonly schemaVersion: number }[];
  readonly basedOnVersion: number;
  readonly offeredCapabilities: readonly { readonly id: NamespacedId; readonly version: number }[];
  readonly offeredStrategies: readonly { readonly id: NamespacedId; readonly version: number }[];
  readonly activeObligationIds: readonly string[];
  readonly proposal: PlanProposal;
  readonly plan: Plan;
  readonly resultingStateVersion: number;
  readonly reasonerMetadata?: Readonly<Record<string, string | number | boolean>>;
}

export interface AcceptedPlanRecorder { record(record: AcceptedPlanRecord): void | Promise<void>; }

export class MemoryAcceptedPlanRecorder implements AcceptedPlanRecorder {
  readonly #records: AcceptedPlanRecord[] = [];
  record(record: AcceptedPlanRecord): void { this.#records.push(structuredClone(record)); }
  records(): readonly AcceptedPlanRecord[] { return structuredClone(this.#records); }
}

export interface AcceptedPlanReplayReasoner extends PlannerReasoner {
  lastAcceptedRecord(frameId: string): AcceptedPlanRecord | undefined;
}

export class ReplayPlanReasoner implements AcceptedPlanReplayReasoner {
  #index = 0;
  #last: AcceptedPlanRecord | undefined;
  readonly #records: readonly AcceptedPlanRecord[];
  constructor(records: readonly AcceptedPlanRecord[]) { this.#records = structuredClone(records); }
  async propose(frame: PlanningFrame, signal: AbortSignal): Promise<PlanProposal> {
    if (signal.aborted) throw signal.reason;
    const record = this.#records[this.#index];
    if (!record) throw new ReplayMismatchError(`Replay has no plan record for ${frame.frameId}`, "replay-plan-record-missing");
    assertAcceptedPlanFrame(record, frame);
    this.#index += 1; this.#last = record;
    return structuredClone(record.proposal);
  }
  lastAcceptedRecord(frameId: string): AcceptedPlanRecord | undefined {
    return this.#last?.frameId === frameId ? structuredClone(this.#last) : undefined;
  }
  consumedCount(): number { return this.#index; }
  remainingCount(): number { return this.#records.length - this.#index; }
}

export const hashPlanningFrame = (frame: PlanningFrame): string => fingerprintManifest(frame);

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
  readonly acceptedRecorder?: AcceptedPlanRecorder;
  readonly manifestFingerprint?: string;
  readonly compatibilityComponents?: readonly RuntimeCompatibilityComponent[];
  readonly reasonerMetadata?: Readonly<Record<string, string | number | boolean>>;
}

const defaultPolicy: PlanningPolicy = {
  maxSteps: 8,
  maxDepth: 5,
  maxParallelSteps: 3,
  reasoningTimeoutMs: 10_000,
  protectedCapabilities: []
};

type PlanningOperation =
  | { readonly kind: "commit"; readonly plan: Plan }
  | { readonly kind: "commit-step"; readonly planId: string; readonly stepId: string; readonly decisionId: DecisionId; readonly now: SimTime }
  | { readonly kind: "action-submitted"; readonly planId: string; readonly stepId: string; readonly actionId: ActionId; readonly now: SimTime }
  | { readonly kind: "resolve-step"; readonly planId: string; readonly stepId: string; readonly outcome: "succeeded" | "failed"; readonly eventIds: readonly EventId[]; readonly reason: NamespacedId; readonly now: SimTime }
  | { readonly kind: "block-plan"; readonly planId: string; readonly reason: NamespacedId; readonly now: SimTime }
  | { readonly kind: "retry-step"; readonly planId: string; readonly stepId: string; readonly now: SimTime }
  | { readonly kind: "archive-for-replan"; readonly planId: string; readonly now: SimTime }
  | { readonly kind: "escalate"; readonly escalation: PlanEscalation };

export const planningReducer: StateSliceReducer = {
  sliceId: PLANNING_SLICE_ID,
  schemaVersion: PLANNING_SLICE_SCHEMA_VERSION,
  writerModules: ["cortex-planning:manager"],
  initialState: (): PlanningState => ({}),
  validate: isPlanningState,
  reduce: (current, operation): PlanningState => {
    const state = current as PlanningState;
    const command = operation as PlanningOperation;
    if (command.kind === "commit") {
      if ((state.activePlan?.status === "active" || state.activePlan?.status === "blocked") ||
        !isPlan(command.plan) || command.plan.status !== "active") {
        throw new Error("Invalid plan commitment");
      }
      return {
        ...state,
        activePlan: command.plan,
        ...(state.activePlan === undefined ? {} : {
          recentPlans: [...(state.recentPlans ?? []), state.activePlan].slice(-8)
        })
      };
    }
    if (command.kind === "escalate") {
      return { ...state, escalations: [...(state.escalations ?? []), command.escalation].slice(-16) };
    }
    const plan = state.activePlan;
    if (!plan || plan.id !== command.planId) throw new Error("Unknown active plan");
    if (command.kind === "commit-step") {
      const step = plan.steps.find((candidate) => candidate.stepId === command.stepId);
      if (plan.status !== "active" || step?.status !== "available") throw new Error("Step is not available");
      return withPlan(state, { ...updateStep(plan, command.stepId, {
        status: "committed", attempts: (step.attempts ?? 0) + 1,
        committedDecisionId: command.decisionId, outcomeEventIds: []
      }), updatedAt: command.now });
    }
    if (command.kind === "action-submitted") {
      const step = plan.steps.find((candidate) => candidate.stepId === command.stepId);
      if (step?.status !== "committed" || step.committedDecisionId === undefined) throw new Error("Step has no committed decision");
      return withPlan(state, { ...updateStep(plan, command.stepId, { actionId: command.actionId }), updatedAt: command.now });
    }
    if (command.kind === "resolve-step") {
      const step = plan.steps.find((candidate) => candidate.stepId === command.stepId);
      if (step?.status !== "committed") throw new Error("Step is not committed");
      return withPlan(state, resolveStep(plan, command));
    }
    if (command.kind === "block-plan") {
      if (plan.status !== "active") throw new Error("Plan is not active");
      return withPlan(state, { ...plan, status: "blocked", statusReason: command.reason, updatedAt: command.now });
    }
    if (command.kind === "retry-step") {
      const step = plan.steps.find((candidate) => candidate.stepId === command.stepId);
      if (plan.status !== "blocked" || step?.status !== "failed") throw new Error("Step cannot be retried");
      const { statusReason: _planReason, ...planWithoutReason } = plan;
      const retried = updateStep({ ...planWithoutReason, status: "active" }, command.stepId, {
        status: "available", outcomeEventIds: []
      });
      return withPlan(state, { ...retried, steps: retried.steps.map((candidate) => {
        if (candidate.stepId !== command.stepId) return candidate;
        const { committedDecisionId: _decision, actionId: _action, statusReason: _reason, ...clean } = candidate;
        return clean;
      }), updatedAt: command.now });
    }
    if (command.kind === "archive-for-replan") {
      if (plan.status !== "blocked" && plan.status !== "invalidated") throw new Error("Plan cannot be replaced");
      const archived = { ...plan, status: "invalidated" as const, updatedAt: command.now };
      const { activePlan: _activePlan, ...stateWithoutActivePlan } = state;
      return {
        ...stateWithoutActivePlan,
        recentPlans: [...(state.recentPlans ?? []), archived].slice(-8),
        replacementPlanCounts: {
          ...(state.replacementPlanCounts ?? {}),
          [plan.goalId]: (state.replacementPlanCounts?.[plan.goalId] ?? 0) + 1
        }
      };
    }
    throw new Error("Unknown planning operation");
  }
};

export const planningPack: CortexPack = {
  id: "cortex:planning",
  version: "2.2.0",
  cortexSdkRange: ">=0.0.0",
  dependencies: [{ packId: "cortex:goals", versionRange: "2.1.0" }],
  stateSlices: [planningReducer],
  modules: [{
    id: "cortex-planning:manager",
    cost: "reasoning-model",
    description: "Validates, coordinates, and owns bounded capability-plan lifecycle",
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

export type PlanCoordinationMode = "strict" | "adaptive" | "advisory";

export interface PlanCoordinatorOptions {
  readonly mode: PlanCoordinationMode;
  readonly urgentIntentionKinds?: readonly string[];
}

export class PlanCoordinator implements IntentionCoordinator {
  constructor(
    private readonly domains: DomainRegistry,
    private readonly lifecycle: PlanLifecycleManager,
    private readonly options: PlanCoordinatorOptions
  ) {}

  async coordinate(input: IntentionCoordinationInput): Promise<IntentionCoordinationResult> {
    const plan = readPlanningState(input.state)?.activePlan;
    if (!plan) return { status: "eligible", intentions: input.feasibleIntentions };
    if (input.dueObligations.length > 0) {
      return { status: "eligible", intentions: input.feasibleIntentions };
    }
    if (plan.status === "blocked") return { status: "blocked", reason: "plan-blocked" };
    if (plan.status !== "active") return { status: "eligible", intentions: input.feasibleIntentions };
    const available = plan.steps.filter((step) => step.status === "available");
    if (available.length === 0) {
      return { status: "blocked", reason: plan.steps.some((step) => step.status === "committed")
        ? "plan-awaiting-outcome"
        : "plan-has-no-available-step" };
    }
    const compatible = input.feasibleIntentions.filter((intention) =>
      available.some((step) => intentionMatchesStep(this.domains, intention, step))
    );
    const eligible = this.options.mode === "strict"
      ? compatible
      : this.options.mode === "adaptive"
        ? uniqueIntentions([
            ...compatible,
            ...input.feasibleIntentions.filter((intention) => this.options.urgentIntentionKinds?.includes(intention.kind) ?? false)
          ])
        : input.feasibleIntentions;
    if (eligible.length > 0) return { status: "eligible", intentions: eligible };
    await this.lifecycle.blockPlan({
      agentId: input.state.id,
      reason: "cortex-planning:no-feasible-step",
      now: input.now
    });
    return { status: "blocked", reason: "plan-no-feasible-step" };
  }
}

export type PlanLifecycleResult =
  | { readonly status: "applied"; readonly plan: Plan }
  | { readonly status: "no-match" }
  | { readonly status: "no-change" }
  | { readonly status: "stale" }
  | { readonly status: "rejected"; readonly reason: string };

export class PlanLifecycleManager {
  constructor(
    private readonly stateStore: AgentStateStore,
    private readonly domains: DomainRegistry
  ) {}

  async commitDecision(input: {
    readonly agentId: AgentId;
    readonly decisionId: DecisionId;
    readonly intention: FeasibleIntention;
    readonly now: SimTime;
  }): Promise<PlanLifecycleResult> {
    const state = await this.stateStore.snapshot(input.agentId);
    if (state.currentDecision?.id !== input.decisionId) return { status: "rejected", reason: "decision-not-current" };
    const plan = readPlanningState(state)?.activePlan;
    if (!plan || plan.status !== "active") return { status: "no-match" };
    const step = [...plan.steps]
      .filter((candidate) => candidate.status === "available" && intentionMatchesStep(this.domains, input.intention, candidate))
      .sort((left, right) => left.stepId.localeCompare(right.stepId))[0];
    if (!step) return { status: "no-match" };
    return this.apply(state, {
      kind: "commit-step", planId: plan.id, stepId: step.stepId,
      decisionId: input.decisionId, now: input.now
    });
  }

  async observeSubmission(input: {
    readonly agentId: AgentId;
    readonly decisionId: DecisionId;
    readonly submission: ActionSubmission;
    readonly now: SimTime;
  }): Promise<PlanLifecycleResult> {
    const state = await this.stateStore.snapshot(input.agentId);
    const plan = readPlanningState(state)?.activePlan;
    const step = plan?.steps.find((candidate) =>
      candidate.status === "committed" && candidate.committedDecisionId === input.decisionId
    );
    if (!plan || !step) return { status: "no-match" };
    if (input.submission.status === "accepted") {
      return this.apply(state, {
        kind: "action-submitted", planId: plan.id, stepId: step.stepId,
        actionId: input.submission.actionId, now: input.now
      });
    }
    return this.apply(state, {
      kind: "resolve-step", planId: plan.id, stepId: step.stepId, outcome: "failed",
      eventIds: [], reason: input.submission.status === "deferred"
        ? "cortex-planning:action-deferred"
        : "cortex-planning:action-rejected",
      now: input.now
    });
  }

  async reconcile(input: {
    readonly agentId: AgentId;
    readonly now: SimTime;
  }): Promise<PlanLifecycleResult> {
    const state = await this.stateStore.snapshot(input.agentId);
    const plan = readPlanningState(state)?.activePlan;
    if (!plan) return { status: "no-change" };
    const resolved = plan.steps
      .filter((step) => step.status === "committed" && step.actionId !== undefined)
      .map((step) => ({ step, expectation: state.expectations.find((item) => item.actionId === step.actionId) }))
      .find((item) => item.expectation?.status === "succeeded" || item.expectation?.status === "failed" ||
        (item.expectation?.status === "partially-succeeded" && item.expectation.expectedEffects.every((effect) => effect.deadline < input.now)));
    if (!resolved?.expectation) return { status: "no-change" };
    if (!resolved.expectation.resolutionEventIds.every((eventId) =>
      state.perception.some((observation) => observation.eventId === eventId)
    )) return { status: "rejected", reason: "outcome-not-grounded" };
    return this.apply(state, {
      kind: "resolve-step", planId: plan.id, stepId: resolved.step.stepId,
      outcome: resolved.expectation.status === "succeeded" ? "succeeded" : "failed",
      eventIds: resolved.expectation.resolutionEventIds,
      reason: resolved.expectation.status === "succeeded"
        ? "cortex-planning:effect-observed"
        : "cortex-planning:expectation-expired",
      now: input.now
    }, resolved.expectation.resolutionEventIds);
  }

  async blockPlan(input: {
    readonly agentId: AgentId;
    readonly reason: NamespacedId;
    readonly now: SimTime;
  }): Promise<PlanLifecycleResult> {
    const state = await this.stateStore.snapshot(input.agentId);
    const plan = readPlanningState(state)?.activePlan;
    if (!plan || plan.status !== "active") return { status: "no-change" };
    return this.apply(state, { kind: "block-plan", planId: plan.id, reason: input.reason, now: input.now });
  }

  private async apply(
    state: Readonly<AgentState>,
    operation: PlanningOperation,
    triggeredBy: readonly EventId[] = []
  ): Promise<PlanLifecycleResult> {
    const now = operationTime(operation);
    const key = `planning:${state.id}:${operation.kind}:v${state.version}`;
    const applied = await this.stateStore.apply({
      patchId: key, agentId: state.id, module: "cortex-planning:manager",
      basedOnVersion: state.version, worldVersion: 0, observedThroughSequence: 0,
      triggeredBy, idempotencyKey: key, rebasePolicy: "never", createdAt: now,
      patch: { kind: "state-slice", sliceId: PLANNING_SLICE_ID, operation }
    });
    if (applied.status !== "applied") return { status: "stale" };
    const plan = readPlanningState(await this.stateStore.snapshot(state.id))?.activePlan;
    return plan ? { status: "applied", plan } : { status: "no-change" };
  }
}

export interface PlanRecoveryPolicy {
  readonly maxRetriesPerStep: number;
  readonly maxReplacementPlans: number;
  readonly maxPlanAge: number;
}

const defaultRecoveryPolicy: PlanRecoveryPolicy = {
  maxRetriesPerStep: 1,
  maxReplacementPlans: 2,
  maxPlanAge: 100
};

export type PlanRecoveryResult =
  | { readonly status: "retry-ready"; readonly plan: Plan }
  | { readonly status: "replacement-ready"; readonly goalId: GoalId }
  | { readonly status: "escalated"; readonly escalation: PlanEscalation }
  | { readonly status: "blocked"; readonly plan: Plan }
  | { readonly status: "not-needed" }
  | { readonly status: "rejected"; readonly reason: string }
  | { readonly status: "stale" };

export class PlanRecoveryManager {
  readonly #policy: PlanRecoveryPolicy;
  constructor(
    private readonly stateStore: AgentStateStore,
    options: Partial<PlanRecoveryPolicy> = {}
  ) {
    this.#policy = { ...defaultRecoveryPolicy, ...options };
    if (![this.#policy.maxRetriesPerStep, this.#policy.maxReplacementPlans].every(Number.isInteger) ||
      this.#policy.maxRetriesPerStep < 0 || this.#policy.maxReplacementPlans < 0 ||
      !Number.isFinite(this.#policy.maxPlanAge) || this.#policy.maxPlanAge < 0) {
      throw new Error("Invalid plan recovery policy");
    }
  }

  async retry(input: { readonly agentId: AgentId; readonly stepId: string; readonly now: SimTime }): Promise<PlanRecoveryResult> {
    const state = await this.stateStore.snapshot(input.agentId);
    const plan = readPlanningState(state)?.activePlan;
    const step = plan?.steps.find((candidate) => candidate.stepId === input.stepId);
    if (!plan || plan.status !== "blocked" || step?.status !== "failed") return { status: "not-needed" };
    if ((step.attempts ?? 0) > this.#policy.maxRetriesPerStep) return { status: "rejected", reason: "retry-limit-reached" };
    const applied = await applyPlanningOperation(this.stateStore, state, {
      kind: "retry-step", planId: plan.id, stepId: step.stepId, now: input.now
    });
    if (!applied) return { status: "stale" };
    return { status: "retry-ready", plan: readPlanningState(await this.stateStore.snapshot(input.agentId))!.activePlan! };
  }

  async prepareReplacement(input: { readonly agentId: AgentId; readonly now: SimTime }): Promise<PlanRecoveryResult> {
    const state = await this.stateStore.snapshot(input.agentId);
    const planning = readPlanningState(state);
    const plan = planning?.activePlan;
    if (!plan || plan.status !== "blocked") return { status: "not-needed" };
    const replacements = planning?.replacementPlanCounts?.[plan.goalId] ?? 0;
    if (replacements >= this.#policy.maxReplacementPlans) {
      return this.escalate(state, plan, "replacement-limit-reached", [], input.now);
    }
    const applied = await applyPlanningOperation(this.stateStore, state, {
      kind: "archive-for-replan", planId: plan.id, now: input.now
    });
    return applied ? { status: "replacement-ready", goalId: plan.goalId } : { status: "stale" };
  }

  async enforceHorizon(input: { readonly agentId: AgentId; readonly now: SimTime }): Promise<PlanRecoveryResult> {
    const state = await this.stateStore.snapshot(input.agentId);
    const plan = readPlanningState(state)?.activePlan;
    if (!plan || plan.status !== "active" || Number(input.now) - Number(plan.createdAt) <= this.#policy.maxPlanAge) return { status: "not-needed" };
    const applied = await applyPlanningOperation(this.stateStore, state, {
      kind: "block-plan", planId: plan.id, reason: "cortex-planning:horizon-exceeded", now: input.now
    });
    if (!applied) return { status: "stale" };
    return { status: "blocked", plan: readPlanningState(await this.stateStore.snapshot(input.agentId))!.activePlan! };
  }

  async escalateObligations(input: {
    readonly agentId: AgentId;
    readonly obligations: readonly DecisionObligation[];
    readonly now: SimTime;
  }): Promise<PlanRecoveryResult> {
    const state = await this.stateStore.snapshot(input.agentId);
    return this.escalate(
      state, readPlanningState(state)?.activePlan,
      "obligation-unfulfillable", input.obligations.map((obligation) => obligation.id), input.now
    );
  }

  private async escalate(
    state: Readonly<AgentState>,
    plan: Readonly<Plan> | undefined,
    reason: PlanEscalationReason,
    obligationIds: readonly string[],
    now: SimTime
  ): Promise<PlanRecoveryResult> {
    const goalId = plan?.goalId ?? readGoalsState(state)?.goals.find((goal) => goal.status === "active")?.id;
    if (!goalId) return { status: "rejected", reason: "no-active-goal" };
    const duplicate = state.slices[PLANNING_SLICE_ID] === undefined ? undefined
      : readPlanningState(state)?.escalations?.find((candidate) =>
          candidate.goalId === goalId && candidate.planId === plan?.id && candidate.reason === reason &&
          sameSet(candidate.obligationIds, obligationIds)
        );
    if (duplicate) return { status: "not-needed" };
    const escalation: PlanEscalation = {
      id: `escalation:${state.id}:${goalId}:v${state.version}`,
      goalId, ...(plan ? { planId: plan.id } : {}), reason,
      obligationIds: [...obligationIds], createdAt: now
    };
    const applied = await applyPlanningOperation(this.stateStore, state, { kind: "escalate", escalation });
    return applied ? { status: "escalated", escalation } : { status: "stale" };
  }
}

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
    if (planning.activePlan?.status === "active" || planning.activePlan?.status === "blocked") {
      return this.finish(input.goalId, state.version, { status: "rejected", reason: "active-plan-exists" });
    }
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
    } catch (error) {
      if (error instanceof ReplayMismatchError) throw error;
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
    const replay = isAcceptedPlanReplayReasoner(input.reasoner)
      ? input.reasoner.lastAcceptedRecord(frame.frameId)
      : undefined;
    if (replay) source = replay.plan.source;
    const plan: Plan = {
      id: `plan:${state.id}:${goal.id}:v${state.version}`,
      goalId: goal.id,
      ...(proposal.strategyId === undefined ? {} : { strategyId: proposal.strategyId }),
      steps: proposal.steps.map((step) => ({
        ...structuredClone(step), status: step.dependsOn.length === 0 ? "available" : "pending",
        attempts: 0, outcomeEventIds: []
      })),
      successConditionRefs: [...proposal.successConditionRefs],
      failureConditionRefs: [...proposal.failureConditionRefs],
      acknowledgedObligationIds: [...proposal.acknowledgedObligationIds],
      reasonCode: proposal.reasonCode,
      status: "active",
      createdAt: input.now,
      basedOnVersion: state.version,
      source
    };
    if (replay && (replay.resultingStateVersion !== state.version + 1 ||
      canonicalPlanning(replay.plan) !== canonicalPlanning(plan))) {
      throw new ReplayMismatchError(
        `Plan replay result mismatch for ${frame.frameId}`,
        "replay-plan-result-mismatch"
      );
    }
    const patch: PatchEnvelope = {
      patchId: plan.id, agentId: state.id, module: "cortex-planning:manager",
      basedOnVersion: state.version, worldVersion: 0, observedThroughSequence: 0,
      triggeredBy: [], idempotencyKey: plan.id, rebasePolicy: "never", createdAt: input.now,
      patch: { kind: "state-slice", sliceId: PLANNING_SLICE_ID, operation: { kind: "commit", plan } }
    };
    const applied = await this.stateStore.apply(patch);
    const result: PlanProposalResult = applied.status === "applied"
      ? { status: "committed", plan }
      : { status: "stale" };
    if (result.status === "committed") await this.acceptOrVerify(frame, proposal, result.plan, input.reasoner);
    return this.finish(input.goalId, state.version, result);
  }

  private frame(state: Readonly<AgentState>, goal: Goal, capabilities: readonly CapabilityDefinition[], strategies: readonly StrategyTemplateDefinition[]): PlanningFrame {
    const visibleEntities = uniqueEntities(state.perception.flatMap((observation) => observation.facts.map((fact) => fact.subject)));
    return {
      schemaVersion: "cortex-planning-frame-v1",
      frameId: `${state.id}:planning:${goal.id}:v${state.version}`,
      agentId: state.id,
      basedOnVersion: state.version,
      manifestFingerprint: this.options.manifestFingerprint ?? EMPTY_FRAME_MANIFEST_FINGERPRINT,
      compatibilityComponents: structuredClone(this.options.compatibilityComponents ?? []),
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

  private async acceptOrVerify(
    frame: PlanningFrame,
    proposal: PlanProposal,
    plan: Plan,
    reasoner: PlannerReasoner
  ): Promise<void> {
    const replay = isAcceptedPlanReplayReasoner(reasoner) ? reasoner.lastAcceptedRecord(frame.frameId) : undefined;
    const reasonerMetadata = replay?.reasonerMetadata ?? this.options.reasonerMetadata;
    const record: AcceptedPlanRecord = {
      schemaVersion: CORTEX_ACCEPTED_PLAN_RECORD_SCHEMA_VERSION,
      frameSchemaVersion: frame.schemaVersion,
      frameId: frame.frameId,
      frameHash: hashPlanningFrame(frame),
      manifestFingerprint: frame.manifestFingerprint,
      compatibilityComponents: structuredClone(frame.compatibilityComponents),
      frameSections: frame.sections.map(({ id, schemaVersion }) => ({ id, schemaVersion })),
      basedOnVersion: frame.basedOnVersion,
      offeredCapabilities: frame.capabilities.map(({ id, version }) => ({ id, version })),
      offeredStrategies: frame.strategies.map(({ id, version }) => ({ id, version })),
      activeObligationIds: [...frame.activeObligationIds],
      proposal: structuredClone(proposal),
      plan: structuredClone(plan),
      resultingStateVersion: (await this.stateStore.snapshot(frame.agentId)).version,
      ...(reasonerMetadata === undefined ? {} : { reasonerMetadata: structuredClone(reasonerMetadata) })
    };
    if (replay && canonicalPlanning(replay) !== canonicalPlanning(record)) {
      throw new ReplayMismatchError(`Plan replay result mismatch for ${frame.frameId}`, "replay-plan-result-mismatch");
    }
    await this.options.acceptedRecorder?.record(record);
  }
}

export const readPlanningState = (state: Readonly<AgentState>): Readonly<PlanningState> | undefined => {
  const slice = state.slices[PLANNING_SLICE_ID];
  return slice?.schemaVersion === PLANNING_SLICE_SCHEMA_VERSION && isPlanningState(slice.value) ? slice.value : undefined;
};

const withPlan = (state: Readonly<PlanningState>, plan: Plan): PlanningState => ({ ...state, activePlan: plan });

const updateStep = (
  plan: Readonly<Plan>,
  stepId: string,
  patch: Partial<PlanStep>
): Plan => ({
  ...plan,
  steps: plan.steps.map((step) => step.stepId === stepId ? { ...step, ...patch } : step)
});

const resolveStep = (
  plan: Readonly<Plan>,
  command: Extract<PlanningOperation, { readonly kind: "resolve-step" }>
): Plan => {
  let steps = plan.steps.map((step): PlanStep => step.stepId === command.stepId
    ? { ...step, status: command.outcome, outcomeEventIds: [...command.eventIds], statusReason: command.reason }
    : step
  );
  const resolved = steps.find((step) => step.stepId === command.stepId)!;
  if (command.outcome === "failed" && !resolved.optional) {
    return {
      ...plan, steps, status: "blocked", statusReason: command.reason, updatedAt: command.now
    };
  }
  const dependencySatisfied = (dependencyId: string): boolean => {
    const dependency = steps.find((step) => step.stepId === dependencyId)!;
    return dependency.status === "succeeded" || dependency.status === "skipped" ||
      (dependency.optional && dependency.status === "failed");
  };
  steps = steps.map((step) => step.status === "pending" && step.dependsOn.every(dependencySatisfied)
    ? { ...step, status: "available" }
    : step
  );
  const completed = steps.filter((step) => !step.optional).every((step) => step.status === "succeeded");
  if (completed) {
    steps = steps.map((step) => step.optional && ["pending", "available"].includes(step.status)
      ? { ...step, status: "skipped", statusReason: "cortex-planning:required-steps-complete" }
      : step
    );
  }
  return {
    ...plan, steps, status: completed ? "completed" : "active",
    ...(completed ? { statusReason: "cortex-planning:required-steps-complete" } : {}),
    updatedAt: command.now
  };
};

const intentionMatchesStep = (
  domains: DomainRegistry,
  intention: Readonly<FeasibleIntention>,
  step: Readonly<PlanStep>
): boolean => {
  const capability = domains.capability(step.capabilityId);
  if (!capability || capability.version !== step.capabilityVersion || !capability.actionIds.includes(intention.kind as NamespacedId)) {
    return false;
  }
  return step.target === undefined || intention.allowedTargets.some((target) =>
    target.type === step.target!.type && target.id === step.target!.id
  );
};

const uniqueIntentions = (intentions: readonly FeasibleIntention[]): readonly FeasibleIntention[] =>
  [...new Map(intentions.map((intention) => [intention.id, intention])).values()];

const applyPlanningOperation = async (
  stateStore: AgentStateStore,
  state: Readonly<AgentState>,
  operation: PlanningOperation,
  triggeredBy: readonly EventId[] = []
): Promise<boolean> => {
  const now = operationTime(operation);
  const key = `planning:${state.id}:${operation.kind}:v${state.version}`;
  const result = await stateStore.apply({
    patchId: key, agentId: state.id, module: "cortex-planning:manager",
    basedOnVersion: state.version, worldVersion: 0, observedThroughSequence: 0,
    triggeredBy, idempotencyKey: key, rebasePolicy: "never", createdAt: now,
    patch: { kind: "state-slice", sliceId: PLANNING_SLICE_ID, operation }
  });
  return result.status === "applied";
};

const operationTime = (operation: PlanningOperation): SimTime =>
  operation.kind === "commit" ? operation.plan.createdAt
    : operation.kind === "escalate" ? operation.escalation.createdAt
      : operation.now;

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
    ? value["steps"].map((step) => isRecord(step) ? Object.fromEntries(Object.entries(step).filter(([key]) =>
      !["status", "attempts", "committedDecisionId", "actionId", "outcomeEventIds", "statusReason"].includes(key)
    )) : step) : value["steps"],
  successConditionRefs: value["successConditionRefs"], failureConditionRefs: value["failureConditionRefs"],
  acknowledgedObligationIds: value["acknowledgedObligationIds"], reasonCode: value["reasonCode"]
}) && typeof value["id"] === "string" && ["active", "completed", "blocked", "invalidated", "abandoned"].includes(String(value["status"])) && typeof value["createdAt"] === "number" &&
  Number.isInteger(value["basedOnVersion"]) && ["reasoner", "deterministic-policy"].includes(String(value["source"])) &&
  (value["updatedAt"] === undefined || typeof value["updatedAt"] === "number") &&
  (value["statusReason"] === undefined || (typeof value["statusReason"] === "string" && isNamespacedId(value["statusReason"]))) &&
  Array.isArray(value["steps"]) && value["steps"].every((step) => isRecord(step) &&
    ["pending", "available", "committed", "succeeded", "failed", "skipped", "blocked"].includes(String(step["status"])) &&
    (step["attempts"] === undefined || (Number.isInteger(step["attempts"]) && Number(step["attempts"]) >= 0)) &&
    (step["committedDecisionId"] === undefined || typeof step["committedDecisionId"] === "string") &&
    (step["actionId"] === undefined || typeof step["actionId"] === "string") &&
    (step["outcomeEventIds"] === undefined || (Array.isArray(step["outcomeEventIds"]) && step["outcomeEventIds"].every((id) => typeof id === "string"))) &&
    (step["statusReason"] === undefined || (typeof step["statusReason"] === "string" && isNamespacedId(step["statusReason"]))));

function isPlanningState(value: unknown): value is PlanningState {
  return isRecord(value) && Object.keys(value).every((key) =>
    ["activePlan", "recentPlans", "replacementPlanCounts", "escalations"].includes(key)
  ) && (value["activePlan"] === undefined || isPlan(value["activePlan"])) &&
    (value["recentPlans"] === undefined || (Array.isArray(value["recentPlans"]) && value["recentPlans"].every(isPlan))) &&
    (value["replacementPlanCounts"] === undefined || (isRecord(value["replacementPlanCounts"]) && Object.values(value["replacementPlanCounts"]).every((count) => Number.isInteger(count) && Number(count) >= 0))) &&
    (value["escalations"] === undefined || (Array.isArray(value["escalations"]) && value["escalations"].every(isEscalation)));
}

const isEscalation = (value: unknown): value is PlanEscalation => isRecord(value) &&
  typeof value["id"] === "string" && typeof value["goalId"] === "string" &&
  (value["planId"] === undefined || typeof value["planId"] === "string") &&
  ["replacement-limit-reached", "obligation-unfulfillable", "plan-policy-conflict"].includes(String(value["reason"])) &&
  Array.isArray(value["obligationIds"]) && value["obligationIds"].every((id) => typeof id === "string") &&
  typeof value["createdAt"] === "number";
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

const isAcceptedPlanReplayReasoner = (value: PlannerReasoner): value is AcceptedPlanReplayReasoner =>
  "lastAcceptedRecord" in value && typeof value.lastAcceptedRecord === "function";

const assertAcceptedPlanFrame = (record: AcceptedPlanRecord, frame: PlanningFrame): void => {
  if (record.schemaVersion !== CORTEX_ACCEPTED_PLAN_RECORD_SCHEMA_VERSION) {
    throw new ReplayMismatchError(`Unsupported plan record schema for ${frame.frameId}`, "replay-plan-schema-mismatch");
  }
  if (record.frameSchemaVersion !== frame.schemaVersion || record.frameId !== frame.frameId ||
    record.basedOnVersion !== frame.basedOnVersion || record.manifestFingerprint !== frame.manifestFingerprint) {
    throw new ReplayMismatchError(`Plan replay frame metadata mismatch for ${frame.frameId}`, "replay-plan-frame-mismatch");
  }
  if (record.frameHash !== hashPlanningFrame(frame)) {
    throw new ReplayMismatchError(`Plan replay frame hash mismatch for ${frame.frameId}`, "replay-plan-frame-hash-mismatch");
  }
  if (canonicalPlanning(record.compatibilityComponents) !== canonicalPlanning(frame.compatibilityComponents) ||
    canonicalPlanning(record.frameSections) !== canonicalPlanning(frame.sections.map(({ id, schemaVersion }) => ({ id, schemaVersion }))) ||
    canonicalPlanning(record.offeredCapabilities) !== canonicalPlanning(frame.capabilities.map(({ id, version }) => ({ id, version }))) ||
    canonicalPlanning(record.offeredStrategies) !== canonicalPlanning(frame.strategies.map(({ id, version }) => ({ id, version })))) {
    throw new ReplayMismatchError(`Plan replay compatibility mismatch for ${frame.frameId}`, "replay-plan-compatibility-mismatch");
  }
};

const canonicalPlanning = (value: unknown): string => {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalPlanning).join(",")}]`;
  return `{${Object.entries(value as Readonly<Record<string, unknown>>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, item]) => `${JSON.stringify(key)}:${canonicalPlanning(item)}`)
    .join(",")}}`;
};
