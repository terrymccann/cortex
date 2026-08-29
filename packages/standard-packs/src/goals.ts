import {
  asGoalId,
  type AgentId,
  type EventId,
  type GoalId,
  type NamespacedId,
  type SimTime
} from "@cortex/contracts";
import {
  DomainRegistry,
  isNamespacedId,
  validateJsonSchema,
  type GoalDefinition
} from "@cortex/domain";
import {
  FrameBuilder,
  type AgentState,
  type AgentStateStore,
  type CognitiveFrameContributor,
  type CognitiveFrameSection,
  type PatchApplyResult,
  type PatchEnvelope,
  type PerceivedObservation,
  type StateSliceReducer
} from "@cortex/runtime";
import type { CortexPack } from "@cortex/sdk";

export const GOALS_SLICE_ID = "cortex-goals:state" as const;
export const GOALS_SLICE_SCHEMA_VERSION = 2 as const;

export type GoalHorizon = "immediate" | "short" | "medium";
export type GoalStatus = "active" | "suspended" | "satisfied" | "abandoned" | "failed";
export type GoalSource = "reasoner" | "deterministic-policy" | "designer-seed";

export interface GoalEvidenceRef {
  readonly eventId: EventId;
}

export interface Goal {
  readonly id: GoalId;
  readonly definitionId: NamespacedId;
  readonly definitionVersion: number;
  readonly parameters: Readonly<Record<string, unknown>>;
  readonly motivationIds: readonly NamespacedId[];
  readonly evidenceRefs: readonly GoalEvidenceRef[];
  readonly priority: number;
  readonly horizon: GoalHorizon;
  readonly status: GoalStatus;
  readonly createdAt: SimTime;
  readonly basedOnVersion: number;
  readonly source: GoalSource;
}

export interface GoalsState {
  readonly goals: readonly Goal[];
}

export interface GoalProposal {
  readonly definitionId: NamespacedId;
  readonly definitionVersion: number;
  readonly parameters: Readonly<Record<string, unknown>>;
  readonly motivationIds: readonly NamespacedId[];
  readonly evidenceRefs: readonly GoalEvidenceRef[];
  readonly proposedPriority: number;
  readonly proposedHorizon: GoalHorizon;
  readonly reasonCode: NamespacedId;
}

export interface GoalTrigger {
  readonly id: string;
  readonly kind:
    | "material-event"
    | "motivation-change"
    | "goal-lifecycle"
    | "no-viable-plan"
    | "reflection-interval"
    | "significance-signal";
  readonly evidenceEventIds: readonly EventId[];
  readonly deterministicallyResolved?: boolean;
}

export interface GoalFormationFrame {
  readonly schemaVersion: "cortex-goal-formation-frame-v1";
  readonly frameId: string;
  readonly agentId: AgentId;
  readonly basedOnVersion: number;
  readonly trigger: GoalTrigger;
  readonly availableDefinitions: readonly GoalDefinition[];
  readonly activeGoals: readonly Goal[];
  readonly visibleEvidence: readonly GoalEvidenceRef[];
  readonly activeObligationIds: readonly string[];
  readonly sections: readonly CognitiveFrameSection[];
  readonly limits: {
    readonly activeGoalCapacity: number;
    readonly allowedHorizons: readonly GoalHorizon[];
    readonly minimumPriority: number;
    readonly maximumPriority: number;
  };
}

export interface GoalReasoner {
  propose(frame: GoalFormationFrame, signal: AbortSignal): Promise<GoalProposal>;
}

export interface GoalConditionMatcher {
  readonly definitionId: NamespacedId;
  readonly definitionVersion: number;
  matches(
    condition: GoalDefinition["successCondition"],
    goal: Readonly<Goal>,
    observation: Readonly<PerceivedObservation>
  ): boolean;
}

export interface GoalFormationDiagnostic {
  readonly triggerId: string;
  readonly basedOnVersion: number;
  readonly outcome: GoalProposalResult["status"];
  readonly reason?: GoalRejectionReason | GoalGateClosedReason;
  readonly definitionId?: NamespacedId;
}

export interface GoalDiagnosticRecorder {
  record(diagnostic: GoalFormationDiagnostic): void | Promise<void>;
}

export class MemoryGoalDiagnosticRecorder implements GoalDiagnosticRecorder {
  readonly #diagnostics: GoalFormationDiagnostic[] = [];

  record(diagnostic: GoalFormationDiagnostic): void {
    this.#diagnostics.push(structuredClone(diagnostic));
  }

  diagnostics(): readonly GoalFormationDiagnostic[] {
    return structuredClone(this.#diagnostics);
  }
}

export type GoalRejectionReason =
  | "invalid-output"
  | "unknown-definition"
  | "definition-version-mismatch"
  | "invalid-parameters"
  | "ungrounded-entity"
  | "ungrounded-evidence"
  | "motivation-not-admissible"
  | "capability-unreachable"
  | "policy-conflict"
  | "goal-conflict"
  | "obligation-conflict"
  | "capacity-exceeded"
  | "reasoner-error";

export type GoalProposalResult =
  | { readonly status: "activated"; readonly goal: Goal }
  | { readonly status: "merged"; readonly goal: Goal }
  | { readonly status: "rejected"; readonly reason: GoalRejectionReason }
  | { readonly status: "deferred"; readonly reason: GoalGateClosedReason }
  | { readonly status: "stale" }
  | { readonly status: "cancelled" };

export type GoalGateClosedReason =
  | "tier-zero"
  | "pack-not-installed"
  | "budget-exhausted"
  | "cooldown-active"
  | "capacity-full"
  | "obligation-pending"
  | "trigger-ungrounded"
  | "deterministically-resolved"
  | "already-considered";

export interface GoalPolicy {
  readonly maxActiveGoals: number;
  readonly minimumPriority: number;
  readonly maximumPriority: number;
  readonly allowedHorizons: readonly GoalHorizon[];
  readonly cooldown: number;
  readonly reasoningTimeoutMs: number;
  readonly deferWhileObligated: boolean;
  readonly protectedConflictTags: readonly NamespacedId[];
  readonly blockedGoalDefinitionsWhileObligated: readonly NamespacedId[];
  readonly allowedGoalDefinitions?: readonly NamespacedId[];
}

const defaultPolicy: GoalPolicy = {
  maxActiveGoals: 3,
  minimumPriority: 0.1,
  maximumPriority: 1,
  allowedHorizons: ["immediate", "short", "medium"],
  cooldown: 0,
  reasoningTimeoutMs: 10_000,
  deferWhileObligated: false,
  protectedConflictTags: [],
  blockedGoalDefinitionsWhileObligated: []
};

export interface GoalManagerOptions {
  readonly policy?: Partial<GoalPolicy>;
  readonly conditionMatchers?: readonly GoalConditionMatcher[];
  readonly frameContributors?: readonly CognitiveFrameContributor[];
  readonly diagnosticRecorder?: GoalDiagnosticRecorder;
}

export class GoalOpportunityGate {
  evaluate(input: {
    readonly state: Readonly<AgentState>;
    readonly goals: Readonly<GoalsState> | undefined;
    readonly trigger: GoalTrigger;
    readonly now: SimTime;
    readonly alreadyConsidered: boolean;
    readonly policy: GoalPolicy;
  }): { readonly opened: true } | { readonly opened: false; readonly reason: GoalGateClosedReason } {
    if (input.state.resolution.tier === 0) return { opened: false, reason: "tier-zero" };
    if (input.goals === undefined) return { opened: false, reason: "pack-not-installed" };
    if (input.trigger.deterministicallyResolved === true) {
      return { opened: false, reason: "deterministically-resolved" };
    }
    if (
      (input.trigger.kind === "material-event" || input.trigger.kind === "significance-signal") &&
      (input.trigger.evidenceEventIds.length === 0 || input.trigger.evidenceEventIds.some(
        (eventId) => !input.state.perception.some((observation) => observation.eventId === eventId)
      ))
    ) {
      return { opened: false, reason: "trigger-ungrounded" };
    }
    const budget = input.state.resolution.budget;
    if (
      budget.reasoningCallsRemaining < 1 ||
      budget.generatedTokensRemaining < 1 ||
      budget.concurrentJobsRemaining < 1 ||
      budget.periodEndsAt < input.now
    ) {
      return { opened: false, reason: "budget-exhausted" };
    }
    if (input.alreadyConsidered) return { opened: false, reason: "already-considered" };
    const active = input.goals.goals.filter((goal) => goal.status === "active");
    if (active.length >= input.policy.maxActiveGoals) return { opened: false, reason: "capacity-full" };
    const newest = active.reduce<number | undefined>(
      (latest, goal) => latest === undefined ? Number(goal.createdAt) : Math.max(latest, Number(goal.createdAt)),
      undefined
    );
    if (newest !== undefined && Number(input.now) - newest < input.policy.cooldown) {
      return { opened: false, reason: "cooldown-active" };
    }
    if (input.policy.deferWhileObligated && input.state.activeObligations.length > 0) {
      return { opened: false, reason: "obligation-pending" };
    }
    return { opened: true };
  }
}

type GoalOperation =
  | { readonly kind: "activate"; readonly goal: Goal }
  | { readonly kind: "merge"; readonly goal: Goal }
  | { readonly kind: "transition"; readonly goalId: GoalId; readonly status: GoalStatus };

export const goalsReducer: StateSliceReducer = {
  sliceId: GOALS_SLICE_ID,
  schemaVersion: GOALS_SLICE_SCHEMA_VERSION,
  writerModules: ["cortex-goals:manager"],
  initialState: (): GoalsState => ({ goals: [] }),
  validate: isGoalsState,
  reduce: (current, operation): GoalsState => reduceGoals(current as GoalsState, operation as GoalOperation)
};

export const goalsPack: CortexPack = {
  id: "cortex:goals",
  version: "2.0.0",
  cortexSdkRange: ">=0.0.0",
  dependencies: [],
  stateSlices: [goalsReducer],
  modules: [{
    id: "cortex-goals:manager",
    cost: "reasoning-model",
    description: "Validates and owns bounded goal formation and lifecycle",
    readsSlices: [GOALS_SLICE_ID],
    writesSlices: [GOALS_SLICE_ID]
  }],
  frameContributors: [{
    id: "cortex-goals:active",
    ownerPackId: "cortex:goals",
    schemaVersion: 2,
    maxBytes: 8192,
    maxItems: 5,
    readsSlices: [GOALS_SLICE_ID],
    validate: (value) => Array.isArray(value) && value.every(isGoal),
    contribute: (state) => goalsState(state).goals.filter((goal) => goal.status === "active").slice(0, 5)
  }]
};

export class GoalManager {
  readonly #policy: GoalPolicy;
  readonly #gate = new GoalOpportunityGate();
  readonly #considered = new Set<string>();
  readonly #conditionMatchers = new Map<string, GoalConditionMatcher>();

  constructor(
    private readonly stateStore: AgentStateStore,
    private readonly domains: DomainRegistry,
    private readonly options: GoalManagerOptions = {}
  ) {
    this.#policy = { ...defaultPolicy, ...options.policy };
    if (!Number.isInteger(this.#policy.maxActiveGoals) || this.#policy.maxActiveGoals < 1) {
      throw new Error("Goal capacity must be a positive integer");
    }
    if (
      !Number.isFinite(this.#policy.minimumPriority) ||
      !Number.isFinite(this.#policy.maximumPriority) ||
      this.#policy.minimumPriority < 0 ||
      this.#policy.minimumPriority > this.#policy.maximumPriority ||
      this.#policy.maximumPriority > 1
    ) {
      throw new Error("Invalid goal priority policy");
    }
    for (const matcher of options.conditionMatchers ?? []) {
      const key = `${matcher.definitionId}@${matcher.definitionVersion}`;
      if (this.#conditionMatchers.has(key)) throw new Error(`Duplicate goal condition matcher: ${key}`);
      this.#conditionMatchers.set(key, matcher);
    }
  }

  async form(input: {
    readonly agentId: AgentId;
    readonly trigger: GoalTrigger;
    readonly now: SimTime;
    readonly reasoner: GoalReasoner;
    readonly signal?: AbortSignal;
  }): Promise<GoalProposalResult> {
    const state = await this.stateStore.snapshot(input.agentId);
    const stateGoals = optionalGoalsState(state);
    const considerationKey = `${input.agentId}:${input.trigger.id}:v${state.version}`;
    const gate = this.#gate.evaluate({
      state,
      goals: stateGoals,
      trigger: input.trigger,
      now: input.now,
      alreadyConsidered: this.#considered.has(considerationKey),
      policy: this.#policy
    });
    if (!gate.opened) {
      const result = { status: "deferred" as const, reason: gate.reason };
      await this.recordDiagnostic(input.trigger.id, state.version, result);
      return result;
    }
    this.#considered.add(considerationKey);

    const availableDefinitions = this.domains.goals().filter((definition) =>
      this.#policy.allowedGoalDefinitions?.includes(definition.id) ?? true
    );
    const frame: GoalFormationFrame = {
      schemaVersion: "cortex-goal-formation-frame-v1",
      frameId: `${input.agentId}:goal:${input.trigger.id}:v${state.version}`,
      agentId: input.agentId,
      basedOnVersion: state.version,
      trigger: structuredClone(input.trigger),
      availableDefinitions,
      activeGoals: stateGoals!.goals.filter((goal) => goal.status === "active"),
      visibleEvidence: state.perception.map((observation) => ({ eventId: observation.eventId })),
      activeObligationIds: state.activeObligations.map((obligation) => obligation.id),
      sections: new FrameBuilder(this.options.frameContributors ?? []).build({
        state,
        situationId: `goal:${input.trigger.id}`,
        situation: `Goal formation triggered by ${input.trigger.kind}`,
        feasibleIntentions: []
      }).sections,
      limits: {
        activeGoalCapacity: this.#policy.maxActiveGoals,
        allowedHorizons: [...this.#policy.allowedHorizons],
        minimumPriority: this.#policy.minimumPriority,
        maximumPriority: this.#policy.maximumPriority
      }
    };
    const externalSignal = input.signal ?? new AbortController().signal;
    const combinedSignal = AbortSignal.any([
      externalSignal,
      AbortSignal.timeout(this.#policy.reasoningTimeoutMs)
    ]);
    let proposal: GoalProposal;
    try {
      proposal = await abortable(input.reasoner.propose(frame, combinedSignal), combinedSignal);
    } catch {
      const result: GoalProposalResult = externalSignal.aborted
        ? { status: "cancelled" }
        : { status: "rejected", reason: "reasoner-error" };
      await this.recordDiagnostic(input.trigger.id, state.version, result);
      return result;
    }
    if (externalSignal.aborted) {
      const result = { status: "cancelled" as const };
      await this.recordDiagnostic(input.trigger.id, state.version, result, proposal.definitionId);
      return result;
    }
    const latest = await this.stateStore.snapshot(input.agentId);
    if (latest.version !== state.version) {
      const result = { status: "stale" as const };
      await this.recordDiagnostic(input.trigger.id, state.version, result, proposal.definitionId);
      return result;
    }
    const result = await this.validateAndCommit(state, stateGoals!, proposal, input.now);
    await this.recordDiagnostic(input.trigger.id, state.version, result, proposal.definitionId);
    return result;
  }

  async transition(input: {
    readonly agentId: AgentId;
    readonly goalId: GoalId;
    readonly status: Exclude<GoalStatus, "active"> | "active";
    readonly evidenceRefs?: readonly GoalEvidenceRef[];
    readonly now: SimTime;
  }): Promise<PatchApplyResult> {
    const state = await this.stateStore.snapshot(input.agentId);
    const stateGoals = goalsState(state);
    const goal = stateGoals.goals.find((candidate) => candidate.id === input.goalId);
    if (!goal) return { status: "rejected", reason: "invalid-value" };
    if (input.status === "satisfied" || input.status === "failed") {
      const evidence = input.evidenceRefs ?? [];
      if (!this.evidenceGrounded(state, evidence) ||
        !this.lifecycleConditionMatched(state, goal, input.status, evidence)) {
        return { status: "rejected", reason: "invalid-value" };
      }
    }
    if (input.status === "abandoned" && state.activeObligations.length > 0) {
      return { status: "rejected", reason: "invalid-value" };
    }
    return this.apply(state, {
      kind: "transition",
      goalId: input.goalId,
      status: input.status
    }, input.now, input.evidenceRefs?.map((reference) => reference.eventId) ?? []);
  }

  private async validateAndCommit(
    state: Readonly<AgentState>,
    stateGoals: Readonly<GoalsState>,
    proposal: GoalProposal,
    now: SimTime
  ): Promise<GoalProposalResult> {
    if (!isGoalProposal(proposal)) return { status: "rejected", reason: "invalid-output" };
    const definition = this.domains.goal(proposal.definitionId);
    if (!definition) return { status: "rejected", reason: "unknown-definition" };
    if (definition.version !== proposal.definitionVersion) {
      return { status: "rejected", reason: "definition-version-mismatch" };
    }
    if (!validateJsonSchema(definition.parameterSchema, proposal.parameters)) {
      return { status: "rejected", reason: "invalid-parameters" };
    }
    if (!this.entityParametersGrounded(state, definition, proposal.parameters)) {
      return { status: "rejected", reason: "ungrounded-entity" };
    }
    if (!this.evidenceGrounded(state, proposal.evidenceRefs) || proposal.evidenceRefs.length === 0) {
      return { status: "rejected", reason: "ungrounded-evidence" };
    }
    if (proposal.motivationIds.length === 0 || proposal.motivationIds.some(
      (id) => !definition.admissibleMotivations.includes(id)
    )) {
      return { status: "rejected", reason: "motivation-not-admissible" };
    }
    if (!this.#policy.allowedHorizons.includes(proposal.proposedHorizon)) {
      return { status: "rejected", reason: "policy-conflict" };
    }
    if (definition.relevantCapabilities.length === 0) {
      return { status: "rejected", reason: "capability-unreachable" };
    }
    if (definition.conflictTags.some((tag) => this.#policy.protectedConflictTags.includes(tag))) {
      return { status: "rejected", reason: "policy-conflict" };
    }
    if (state.activeObligations.length > 0 &&
      this.#policy.blockedGoalDefinitionsWhileObligated.includes(definition.id)) {
      return { status: "rejected", reason: "obligation-conflict" };
    }
    const duplicate = stateGoals.goals.find((goal) =>
      goal.status === "active" &&
      goal.definitionId === definition.id &&
      canonical(goal.parameters) === canonical(proposal.parameters)
    );
    const priority = Math.max(
      this.#policy.minimumPriority,
      Math.min(this.#policy.maximumPriority, proposal.proposedPriority)
    );
    if (duplicate) {
      const merged: Goal = {
        ...duplicate,
        priority: Math.max(duplicate.priority, priority),
        evidenceRefs: uniqueEvidence([...duplicate.evidenceRefs, ...proposal.evidenceRefs])
      };
      const applied = await this.apply(state, { kind: "merge", goal: merged }, now, proposal.evidenceRefs.map((ref) => ref.eventId));
      return applied.status === "applied" ? { status: "merged", goal: merged } : { status: "stale" };
    }
    const activeGoals = stateGoals.goals.filter((goal) => goal.status === "active");
    if (activeGoals.length >= this.#policy.maxActiveGoals) {
      return { status: "rejected", reason: "capacity-exceeded" };
    }
    if (activeGoals.some((goal) => {
      const activeDefinition = this.domains.goal(goal.definitionId);
      return activeDefinition?.conflictTags.some((tag) => definition.conflictTags.includes(tag)) ?? false;
    })) {
      return { status: "rejected", reason: "goal-conflict" };
    }
    const goal: Goal = {
      id: asGoalId(`goal:${state.id}:${definition.id}:v${state.version}`),
      definitionId: definition.id,
      definitionVersion: definition.version,
      parameters: structuredClone(proposal.parameters),
      motivationIds: [...proposal.motivationIds],
      evidenceRefs: uniqueEvidence(proposal.evidenceRefs),
      priority,
      horizon: proposal.proposedHorizon,
      status: "active",
      createdAt: now,
      basedOnVersion: state.version,
      source: "reasoner"
    };
    const applied = await this.apply(state, { kind: "activate", goal }, now, proposal.evidenceRefs.map((ref) => ref.eventId));
    return applied.status === "applied" ? { status: "activated", goal } : { status: "stale" };
  }

  private evidenceGrounded(state: Readonly<AgentState>, evidence: readonly GoalEvidenceRef[]): boolean {
    const visible = new Set(state.perception.map((observation) => observation.eventId));
    return evidence.every((reference) => visible.has(reference.eventId));
  }

  private entityParametersGrounded(
    state: Readonly<AgentState>,
    definition: Readonly<GoalDefinition>,
    parameters: Readonly<Record<string, unknown>>
  ): boolean {
    const facts = state.perception.flatMap((observation) => observation.facts);
    return Object.entries(definition.entityParameters).every(([parameter, type]) => {
      const id = parameters[parameter];
      return typeof id === "string" && facts.some((fact) => fact.subject.type === type && fact.subject.id === id);
    });
  }

  private lifecycleConditionMatched(
    state: Readonly<AgentState>,
    goal: Readonly<Goal>,
    status: "satisfied" | "failed",
    evidence: readonly GoalEvidenceRef[]
  ): boolean {
    const definition = this.domains.goal(goal.definitionId);
    if (!definition || definition.version !== goal.definitionVersion) return false;
    const conditions = status === "satisfied"
      ? [definition.successCondition]
      : definition.failureConditions;
    const evidenceIds = new Set(evidence.map((reference) => reference.eventId));
    const observations = state.perception.filter((observation) => evidenceIds.has(observation.eventId));
    return conditions.some((condition) => {
      const matcher = this.#conditionMatchers.get(
        `${condition.definitionId}@${condition.definitionVersion}`
      );
      return matcher !== undefined && observations.some((observation) =>
        matcher.matches(condition, goal, observation)
      );
    });
  }

  private apply(
    state: Readonly<AgentState>,
    operation: GoalOperation,
    now: SimTime,
    triggeredBy: readonly EventId[]
  ): Promise<PatchApplyResult> {
    const key = `goal:${state.id}:${operation.kind}:${operation.kind === "transition" ? operation.goalId : operation.goal.id}:v${state.version}`;
    const patch: PatchEnvelope = {
      patchId: key,
      agentId: state.id,
      module: "cortex-goals:manager",
      basedOnVersion: state.version,
      worldVersion: 0,
      observedThroughSequence: 0,
      triggeredBy,
      idempotencyKey: key,
      rebasePolicy: "never",
      createdAt: now,
      patch: { kind: "state-slice", sliceId: GOALS_SLICE_ID, operation }
    };
    return this.stateStore.apply(patch);
  }

  private async recordDiagnostic(
    triggerId: string,
    basedOnVersion: number,
    result: GoalProposalResult,
    definitionId?: NamespacedId
  ): Promise<void> {
    await this.options.diagnosticRecorder?.record({
      triggerId,
      basedOnVersion,
      outcome: result.status,
      ...(result.status === "rejected" || result.status === "deferred"
        ? { reason: result.reason }
        : {}),
      ...(definitionId === undefined ? {} : { definitionId })
    });
  }
}

const reduceGoals = (current: GoalsState, operation: GoalOperation): GoalsState => {
  if (operation.kind === "activate") {
    if (current.goals.some((goal) => goal.id === operation.goal.id)) throw new Error("Duplicate goal");
    return { goals: [...current.goals, operation.goal] };
  }
  if (operation.kind === "merge") {
    const existing = current.goals.find((goal) => goal.id === operation.goal.id);
    if (!existing || existing.status !== "active" || operation.goal.status !== "active") {
      throw new Error("Invalid goal merge");
    }
    return { goals: current.goals.map((goal) => goal.id === operation.goal.id ? operation.goal : goal) };
  }
  const existing = current.goals.find((goal) => goal.id === operation.goalId);
  if (!existing || !allowedTransition(existing.status, operation.status)) throw new Error("Invalid goal transition");
  return {
    goals: current.goals.map((goal) => goal.id === operation.goalId ? { ...goal, status: operation.status } : goal)
  };
};

const allowedTransition = (from: GoalStatus, to: GoalStatus): boolean =>
  (from === "active" && ["suspended", "satisfied", "abandoned", "failed"].includes(to)) ||
  (from === "suspended" && ["active", "abandoned", "failed"].includes(to));

const optionalGoalsState = (state: Readonly<AgentState>): Readonly<GoalsState> | undefined => {
  const slice = state.slices[GOALS_SLICE_ID];
  return slice?.schemaVersion === GOALS_SLICE_SCHEMA_VERSION && isGoalsState(slice.value)
    ? slice.value
    : undefined;
};

export const readGoalsState = (
  state: Readonly<AgentState>
): Readonly<GoalsState> | undefined => optionalGoalsState(state);

const goalsState = (state: Readonly<AgentState>): Readonly<GoalsState> => {
  const value = optionalGoalsState(state);
  if (!value) throw new Error("Missing compatible goals state slice");
  return value;
};

const isGoalProposal = (value: unknown): value is GoalProposal => {
  if (!isRecord(value)) return false;
  const allowed = new Set([
    "definitionId", "definitionVersion", "parameters", "motivationIds", "evidenceRefs",
    "proposedPriority", "proposedHorizon", "reasonCode"
  ]);
  return Object.keys(value).every((key) => allowed.has(key)) &&
    typeof value["definitionId"] === "string" && isNamespacedId(value["definitionId"]) &&
    Number.isInteger(value["definitionVersion"]) && isRecord(value["parameters"]) &&
    Array.isArray(value["motivationIds"]) && value["motivationIds"].every((id) => typeof id === "string" && isNamespacedId(id)) &&
    Array.isArray(value["evidenceRefs"]) && value["evidenceRefs"].every(isEvidenceRef) &&
    typeof value["proposedPriority"] === "number" && Number.isFinite(value["proposedPriority"]) &&
    ["immediate", "short", "medium"].includes(String(value["proposedHorizon"])) &&
    typeof value["reasonCode"] === "string" && isNamespacedId(value["reasonCode"]);
};

const isEvidenceRef = (value: unknown): value is GoalEvidenceRef =>
  isRecord(value) && Object.keys(value).length === 1 && typeof value["eventId"] === "string";

function isGoal(value: unknown): value is Goal {
  return isRecord(value) &&
    typeof value["id"] === "string" &&
    typeof value["definitionId"] === "string" && isNamespacedId(value["definitionId"]) &&
    Number.isInteger(value["definitionVersion"]) &&
    isRecord(value["parameters"]) &&
    Array.isArray(value["motivationIds"]) &&
    Array.isArray(value["evidenceRefs"]) && value["evidenceRefs"].every(isEvidenceRef) &&
    typeof value["priority"] === "number" && Number.isFinite(value["priority"]) &&
    ["immediate", "short", "medium"].includes(String(value["horizon"])) &&
    ["active", "suspended", "satisfied", "abandoned", "failed"].includes(String(value["status"])) &&
    typeof value["createdAt"] === "number" &&
    Number.isInteger(value["basedOnVersion"]) &&
    ["reasoner", "deterministic-policy", "designer-seed"].includes(String(value["source"]));
}

function isGoalsState(value: unknown): value is GoalsState {
  return isRecord(value) && Array.isArray(value["goals"]) && value["goals"].every(isGoal);
}

const uniqueEvidence = (evidence: readonly GoalEvidenceRef[]): readonly GoalEvidenceRef[] =>
  [...new Map(evidence.map((reference) => [reference.eventId, { ...reference }])).values()];

const canonical = (value: unknown): string => {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  return `{${Object.entries(value as Readonly<Record<string, unknown>>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`)
    .join(",")}}`;
};

const abortable = <T>(promise: Promise<T>, signal: AbortSignal): Promise<T> =>
  new Promise<T>((resolve, reject) => {
    const abort = (): void => reject(signal.reason ?? new Error("Goal reasoning aborted"));
    if (signal.aborted) return abort();
    signal.addEventListener("abort", abort, { once: true });
    promise.then(
      (value) => {
        signal.removeEventListener("abort", abort);
        resolve(value);
      },
      (error: unknown) => {
        signal.removeEventListener("abort", abort);
        reject(error);
      }
    );
  });

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
