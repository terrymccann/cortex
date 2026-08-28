import { createHash } from "node:crypto";
import {
  asDecisionId,
  type AgentId,
  type CortexWorldPort,
  type EntityRef,
  type FeasibleIntention,
  type FollowUpObligationSpec,
  type SimTime
} from "@cortex/contracts";
import type { PatchEnvelope } from "./patches.js";
import type { AgentState, CommittedDecision, DecisionObligation } from "./state.js";
import type { AgentStateStore, PatchApplyResult } from "./state-store.js";

export interface DecisionGateInput {
  readonly consequence: number;
  readonly uncertainty: number;
  readonly novelty: number;
  readonly socialWeight: number;
  readonly conflict: number;
  readonly planFailure: number;
  readonly narrativeSignificance: number;
}

export interface DecisionGateWeights extends DecisionGateInput {
  readonly threshold: number;
}

export interface DecisionGateScore extends DecisionGateInput {
  readonly total: number;
  readonly opened: boolean;
}

const defaultGateWeights: DecisionGateWeights = {
  consequence: 0.25,
  uncertainty: 0.15,
  novelty: 0.1,
  socialWeight: 0.15,
  conflict: 0.15,
  planFailure: 0.1,
  narrativeSignificance: 0.1,
  threshold: 0.55
};

export class DecisionGate {
  constructor(private readonly weights: DecisionGateWeights = defaultGateWeights) {}

  score(input: DecisionGateInput): DecisionGateScore {
    const clamp = (value: number): number => Math.max(0, Math.min(1, value));
    const normalized = {
      consequence: clamp(input.consequence),
      uncertainty: clamp(input.uncertainty),
      novelty: clamp(input.novelty),
      socialWeight: clamp(input.socialWeight),
      conflict: clamp(input.conflict),
      planFailure: clamp(input.planFailure),
      narrativeSignificance: clamp(input.narrativeSignificance)
    };
    const total =
      normalized.consequence * this.weights.consequence +
      normalized.uncertainty * this.weights.uncertainty +
      normalized.novelty * this.weights.novelty +
      normalized.socialWeight * this.weights.socialWeight +
      normalized.conflict * this.weights.conflict +
      normalized.planFailure * this.weights.planFailure +
      normalized.narrativeSignificance * this.weights.narrativeSignificance;

    return { ...normalized, total, opened: total >= this.weights.threshold };
  }
}

export interface CognitiveFrame {
  readonly frameId: string;
  readonly agentId: AgentId;
  readonly basedOnVersion: number;
  readonly situationId: string;
  readonly situation: string;
  readonly activeGoals: AgentState["goals"];
  readonly relevantBeliefs: AgentState["beliefs"];
  readonly relevantMemories: AgentState["memories"];
  readonly importantRelationships: AgentState["relationships"];
  readonly socialSignals: readonly string[];
  readonly activeObligations: readonly DecisionObligation[];
  readonly feasibleIntentions: readonly FeasibleIntention[];
  readonly extensions: Readonly<Record<string, unknown>>;
}

export interface CognitiveFrameContributor {
  readonly id: string;
  contribute(state: Readonly<AgentState>): unknown;
}

export interface FrameBuildInput {
  readonly state: Readonly<AgentState>;
  readonly situationId: string;
  readonly situation: string;
  readonly socialSignals?: readonly string[];
  readonly feasibleIntentions: readonly FeasibleIntention[];
}

export class FrameBuilder {
  constructor(private readonly contributors: readonly CognitiveFrameContributor[] = []) {}

  build(input: FrameBuildInput): CognitiveFrame {
    return {
      frameId: `${input.state.id}:${input.situationId}:v${input.state.version}`,
      agentId: input.state.id,
      basedOnVersion: input.state.version,
      situationId: input.situationId,
      situation: input.situation,
      activeGoals: input.state.goals.filter((goal) => goal.status === "active").slice(0, 5),
      relevantBeliefs: [...input.state.beliefs]
        .sort((left, right) => right.confidence - left.confidence)
        .slice(0, 8),
      relevantMemories: [...input.state.memories]
        .sort((left, right) => right.importance - left.importance)
        .slice(0, 8),
      importantRelationships: [...input.state.relationships]
        .sort(
          (left, right) =>
            Math.max(Math.abs(right.trust), Math.abs(right.resentment), Math.abs(right.fear)) -
            Math.max(Math.abs(left.trust), Math.abs(left.resentment), Math.abs(left.fear))
        )
        .slice(0, 6),
      socialSignals: input.socialSignals?.slice(0, 8) ?? [],
      activeObligations: input.state.activeObligations,
      feasibleIntentions: input.feasibleIntentions,
      extensions: Object.fromEntries(
        this.contributors.map((contributor) => [contributor.id, contributor.contribute(input.state)])
      )
    };
  }
}

export interface ControllerOutput {
  readonly intentionId: string;
  readonly objective: string;
  readonly commitment: number;
  readonly reasonCode: string;
  readonly target?: EntityRef;
}

export type ControllerOutputValidationIssue =
  | "not-an-object"
  | "unknown-field"
  | "invalid-intention"
  | "invalid-objective"
  | "invalid-commitment"
  | "invalid-reason-code"
  | "invalid-target";

export type ControllerOutputValidationResult =
  | { readonly valid: true; readonly output: ControllerOutput }
  | { readonly valid: false; readonly issue: ControllerOutputValidationIssue };

export class ControllerOutputValidator {
  validate(
    value: unknown,
    feasibleIntentions: readonly FeasibleIntention[]
  ): ControllerOutputValidationResult {
    if (!isRecord(value)) return { valid: false, issue: "not-an-object" };
    const allowedKeys = new Set(["intentionId", "objective", "commitment", "reasonCode", "target"]);
    if (Object.keys(value).some((key) => !allowedKeys.has(key))) {
      return { valid: false, issue: "unknown-field" };
    }
    const intentionId = value["intentionId"];
    const objective = value["objective"];
    const commitment = value["commitment"];
    const reasonCode = value["reasonCode"];
    const target = value["target"];

    if (typeof intentionId !== "string") return { valid: false, issue: "invalid-intention" };
    const intention = feasibleIntentions.find((candidate) => candidate.id === intentionId);
    if (!intention) return { valid: false, issue: "invalid-intention" };
    if (typeof objective !== "string" || objective.trim().length === 0) {
      return { valid: false, issue: "invalid-objective" };
    }
    if (typeof commitment !== "number" || !Number.isFinite(commitment) || commitment < 0 || commitment > 1) {
      return { valid: false, issue: "invalid-commitment" };
    }
    if (typeof reasonCode !== "string" || reasonCode.trim().length === 0) {
      return { valid: false, issue: "invalid-reason-code" };
    }
    if (target !== undefined && (!isEntityRef(target) || !intention.allowedTargets.some((candidate) => sameEntity(candidate, target)))) {
      return { valid: false, issue: "invalid-target" };
    }

    return {
      valid: true,
      output: {
        intentionId,
        objective,
        commitment,
        reasonCode,
        ...(target === undefined ? {} : { target })
      }
    };
  }
}

export interface ControllerReasoner {
  decide(frame: CognitiveFrame, signal: AbortSignal): Promise<ControllerOutput>;
}

export interface AcceptedDecisionReplayReasoner extends ControllerReasoner {
  lastAcceptedRecord(frameId: string): AcceptedDecisionRecord | undefined;
}

export class ControllerReasonerError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly retryable: boolean,
    options?: ErrorOptions,
    readonly fallbackAllowed = true
  ) {
    super(message, options);
    this.name = "ControllerReasonerError";
  }
}

export const CORTEX_ACCEPTED_DECISION_RECORD_SCHEMA_V1 =
  "cortex-accepted-decision-record-v1" as const;
export const CORTEX_ACCEPTED_DECISION_RECORD_SCHEMA_V2 =
  "cortex-accepted-decision-record-v2" as const;
export const CORTEX_ACCEPTED_DECISION_RECORD_SCHEMA_VERSION =
  CORTEX_ACCEPTED_DECISION_RECORD_SCHEMA_V2;

export interface AcceptedDecisionRecord {
  readonly schemaVersion: typeof CORTEX_ACCEPTED_DECISION_RECORD_SCHEMA_VERSION;
  readonly frameId: string;
  readonly frameHash: string;
  readonly basedOnVersion: number;
  readonly eligibleIntentionIds: readonly string[];
  readonly output: ControllerOutput;
  readonly decisionId: string;
  readonly usedFallback: boolean;
  readonly reasonerAttempts: number;
  readonly enforcedObligationIds: readonly string[];
  readonly fallbackReason?: ControllerFallbackReason;
}

export interface AcceptedDecisionRecorder {
  record(record: AcceptedDecisionRecord): void | Promise<void>;
}

export class MemoryAcceptedDecisionRecorder implements AcceptedDecisionRecorder {
  readonly #records: AcceptedDecisionRecord[] = [];

  record(record: AcceptedDecisionRecord): void {
    this.#records.push(cloneDecisionRecord(record));
  }

  records(): readonly AcceptedDecisionRecord[] {
    return this.#records.map(cloneDecisionRecord);
  }
}

export const hashCognitiveFrame = (frame: CognitiveFrame): string =>
  createHash("sha256").update(canonicalJson(frame)).digest("hex");

export class ReplayMismatchError extends ControllerReasonerError {
  constructor(message: string, code: string) {
    super(message, code, false, undefined, false);
    this.name = "ReplayMismatchError";
  }
}

export class ReplayControllerReasoner implements AcceptedDecisionReplayReasoner {
  #index = 0;
  #lastRecord: AcceptedDecisionRecord | undefined;
  readonly #records: readonly AcceptedDecisionRecord[];
  readonly #validator = new ControllerOutputValidator();

  constructor(records: readonly AcceptedDecisionRecord[]) {
    this.#records = records.map(cloneDecisionRecord);
  }

  async decide(frame: CognitiveFrame, signal: AbortSignal): Promise<ControllerOutput> {
    if (signal.aborted) throw signal.reason;
    const record = this.#records[this.#index];
    if (!record) {
      throw new ReplayMismatchError(
        `Replay has no decision record for frame ${frame.frameId}`,
        "replay-record-missing"
      );
    }
    if (record.schemaVersion !== CORTEX_ACCEPTED_DECISION_RECORD_SCHEMA_VERSION) {
      throw new ReplayMismatchError(
        `Unsupported decision record schema: ${String(record.schemaVersion)}`,
        "replay-schema-mismatch"
      );
    }
    if (record.frameId !== frame.frameId) {
      throw new ReplayMismatchError(
        `Replay frame mismatch: expected ${record.frameId}, received ${frame.frameId}`,
        "replay-frame-id-mismatch"
      );
    }
    if (record.basedOnVersion !== frame.basedOnVersion) {
      throw new ReplayMismatchError(
        `Replay state version mismatch for ${frame.frameId}`,
        "replay-state-version-mismatch"
      );
    }
    const frameHash = hashCognitiveFrame(frame);
    if (record.frameHash !== frameHash) {
      throw new ReplayMismatchError(
        `Replay frame hash mismatch for ${frame.frameId}`,
        "replay-frame-hash-mismatch"
      );
    }
    const eligibleIntentionIds = frame.feasibleIntentions.map((intention) => intention.id);
    if (!sameStrings(record.eligibleIntentionIds, eligibleIntentionIds)) {
      throw new ReplayMismatchError(
        `Replay feasible intentions mismatch for ${frame.frameId}`,
        "replay-intentions-mismatch"
      );
    }
    if (!Number.isInteger(record.reasonerAttempts) || record.reasonerAttempts < 1) {
      throw new ReplayMismatchError(
        `Replay reasoner-attempt metadata is invalid for ${frame.frameId}`,
        "replay-metadata-invalid"
      );
    }
    if (
      typeof record.usedFallback !== "boolean" ||
      (record.usedFallback && record.fallbackReason === undefined) ||
      (!record.usedFallback && record.fallbackReason !== undefined) ||
      (record.fallbackReason !== undefined && !isControllerFallbackReason(record.fallbackReason))
    ) {
      throw new ReplayMismatchError(
        `Replay fallback metadata is invalid for ${frame.frameId}`,
        "replay-metadata-invalid"
      );
    }
    const validation = this.#validator.validate(record.output, frame.feasibleIntentions);
    if (!validation.valid) {
      throw new ReplayMismatchError(
        `Replay output is invalid for ${frame.frameId}: ${validation.issue}`,
        "replay-output-invalid"
      );
    }
    this.#index += 1;
    this.#lastRecord = record;
    return cloneControllerOutput(record.output);
  }

  lastAcceptedRecord(frameId: string): AcceptedDecisionRecord | undefined {
    return this.#lastRecord?.frameId === frameId
      ? cloneDecisionRecord(this.#lastRecord)
      : undefined;
  }

  consumedCount(): number {
    return this.#index;
  }

  remainingCount(): number {
    return this.#records.length - this.#index;
  }
}

export interface FallbackPolicy {
  select(feasibleIntentions: readonly FeasibleIntention[]): ControllerOutput;
}

export class FirstAvailableFallbackPolicy implements FallbackPolicy {
  select(feasibleIntentions: readonly FeasibleIntention[]): ControllerOutput {
    const selected = [...feasibleIntentions].sort((left, right) => left.id.localeCompare(right.id))[0];
    if (!selected) throw new Error("No fallback intention available");
    return {
      intentionId: selected.id,
      objective: "Use deterministic fallback policy",
      commitment: 1,
      reasonCode: "fallback-policy"
    };
  }
}

export class OrderedIntentionFallbackPolicy implements FallbackPolicy {
  constructor(private readonly intentionKinds: readonly string[]) {}

  select(feasibleIntentions: readonly FeasibleIntention[]): ControllerOutput {
    const selected = this.intentionKinds
      .map((kind) => feasibleIntentions.find((intention) => intention.kind === kind))
      .find((intention) => intention !== undefined);
    if (!selected) return new FirstAvailableFallbackPolicy().select(feasibleIntentions);
    return {
      intentionId: selected.id,
      objective: "Use domain fallback policy",
      commitment: 1,
      reasonCode: "fallback-policy"
    };
  }
}

export class ScriptedControllerReasoner implements ControllerReasoner {
  constructor(private readonly script: (frame: CognitiveFrame) => ControllerOutput | Promise<ControllerOutput>) {}

  async decide(frame: CognitiveFrame, signal: AbortSignal): Promise<ControllerOutput> {
    if (signal.aborted) throw signal.reason;
    return this.script(frame);
  }
}

export type ControllerResult =
  | {
      readonly status: "committed";
      readonly decision: CommittedDecision;
      readonly intention: FeasibleIntention;
      readonly usedFallback: boolean;
      readonly reasonerAttempts: number;
      readonly enforcedObligationIds: readonly string[];
      readonly fallbackReason?: ControllerFallbackReason;
    }
  | { readonly status: "no-feasible-intention" }
  | {
      readonly status: "obligation-unfulfillable";
      readonly obligations: readonly DecisionObligation[];
    }
  | { readonly status: "cancelled" }
  | { readonly status: "stale"; readonly applyResult: PatchApplyResult };

export type ControllerFallbackReason =
  | "deadline-exceeded"
  | "invalid-output"
  | "reasoner-error";

export interface ControllerDiagnostic {
  readonly frameId: string;
  readonly outcome: ControllerResult["status"];
  readonly reasonerAttempts: number;
  readonly usedFallback: boolean;
  readonly activeObligationIds: readonly string[];
  readonly enforcedObligationIds: readonly string[];
  readonly eligibleIntentionIds: readonly string[];
  readonly fallbackReason?: ControllerFallbackReason;
  readonly validationIssue?: ControllerOutputValidationIssue;
}

export interface ControllerDiagnosticSink {
  record(diagnostic: ControllerDiagnostic): void | Promise<void>;
}

export interface BoundedControllerOptions {
  readonly reasoningTimeoutMs?: number;
  readonly maxReasonerAttempts?: 1 | 2;
  readonly outputValidator?: ControllerOutputValidator;
  readonly diagnosticSink?: ControllerDiagnosticSink;
  readonly decisionRecorder?: AcceptedDecisionRecorder;
}

export interface ObligationConstraintResult {
  readonly dueObligations: readonly DecisionObligation[];
  readonly eligibleIntentions: readonly FeasibleIntention[];
}

export const constrainIntentionsByObligations = (
  feasibleIntentions: readonly FeasibleIntention[],
  activeObligations: readonly DecisionObligation[]
): ObligationConstraintResult => {
  const dueObligations = activeObligations.filter(
    (obligation) => obligation.remainingDecisionCycles <= 1
  );
  return {
    dueObligations,
    eligibleIntentions: feasibleIntentions.filter((intention) =>
      dueObligations.every((obligation) => obligation.requiredIntentionIds.includes(intention.id))
    )
  };
};

export interface ControllerRequest {
  readonly agentId: AgentId;
  readonly situationId: string;
  readonly situation: string;
  readonly socialSignals?: readonly string[];
  readonly now: SimTime;
  readonly signal?: AbortSignal;
}

export class BoundedController {
  readonly #reasoningTimeoutMs: number;
  readonly #maxReasonerAttempts: 1 | 2;
  readonly #outputValidator: ControllerOutputValidator;

  constructor(
    private readonly stateStore: AgentStateStore,
    private readonly world: CortexWorldPort,
    private readonly reasoner: ControllerReasoner,
    private readonly frameBuilder = new FrameBuilder(),
    private readonly fallbackPolicy: FallbackPolicy = new FirstAvailableFallbackPolicy(),
    private readonly options: BoundedControllerOptions = {}
  ) {
    this.#reasoningTimeoutMs = options.reasoningTimeoutMs ?? 10_000;
    this.#maxReasonerAttempts = options.maxReasonerAttempts ?? 1;
    this.#outputValidator = options.outputValidator ?? new ControllerOutputValidator();
    if (!Number.isFinite(this.#reasoningTimeoutMs) || this.#reasoningTimeoutMs <= 0) {
      throw new Error("reasoningTimeoutMs must be a positive finite number");
    }
  }

  async decide(request: ControllerRequest): Promise<ControllerResult> {
    const state = await this.stateStore.snapshot(request.agentId);
    const feasibleIntentions = await this.world.getFeasibleIntentions({
      agentId: request.agentId,
      situationId: request.situationId
    });
    if (feasibleIntentions.length === 0) return { status: "no-feasible-intention" };

    const { dueObligations, eligibleIntentions } = constrainIntentionsByObligations(
      feasibleIntentions,
      state.activeObligations
    );
    if (eligibleIntentions.length === 0) {
      await this.recordDiagnostic({
        frameId: `${state.id}:${request.situationId}:v${state.version}`,
        outcome: "obligation-unfulfillable",
        reasonerAttempts: 0,
        usedFallback: false,
        activeObligationIds: state.activeObligations.map((obligation) => obligation.id),
        enforcedObligationIds: dueObligations.map((obligation) => obligation.id),
        eligibleIntentionIds: []
      });
      return { status: "obligation-unfulfillable", obligations: dueObligations };
    }

    const frame = this.frameBuilder.build({
      state,
      situationId: request.situationId,
      situation: request.situation,
      ...(request.socialSignals === undefined ? {} : { socialSignals: request.socialSignals }),
      feasibleIntentions: eligibleIntentions
    });
    const externalSignal = request.signal ?? new AbortController().signal;
    const deadlineSignal = AbortSignal.timeout(this.#reasoningTimeoutMs);
    const signal = AbortSignal.any([externalSignal, deadlineSignal]);

    let output: ControllerOutput;
    let usedFallback = false;
    let reasonerAttempts = 0;
    let fallbackReason: ControllerFallbackReason | undefined;
    let validationIssue: ControllerOutputValidationIssue | undefined;

    while (true) {
      reasonerAttempts += 1;
      try {
        const candidate: unknown = await abortable(this.reasoner.decide(frame, signal), signal);
        const validation = this.#outputValidator.validate(candidate, eligibleIntentions);
        if (validation.valid) {
          output = validation.output;
          break;
        }
        validationIssue = validation.issue;
        fallbackReason = "invalid-output";
        output = this.selectFallback(eligibleIntentions);
        usedFallback = true;
        break;
      } catch (error) {
        if (externalSignal.aborted) return { status: "cancelled" };
        if (error instanceof ControllerReasonerError && !error.fallbackAllowed) throw error;
        if (deadlineSignal.aborted) {
          fallbackReason = "deadline-exceeded";
        } else if (
          error instanceof ControllerReasonerError &&
          error.retryable &&
          reasonerAttempts < this.#maxReasonerAttempts
        ) {
          continue;
        } else {
          fallbackReason = "reasoner-error";
        }
        output = this.selectFallback(eligibleIntentions);
        usedFallback = true;
        break;
      }
    }

    const replayRecord = isAcceptedDecisionReplayReasoner(this.reasoner)
      ? this.reasoner.lastAcceptedRecord(frame.frameId)
      : undefined;
    if (replayRecord !== undefined) {
      const enforcedObligationIds = dueObligations.map((obligation) => obligation.id);
      if (!sameStrings(replayRecord.enforcedObligationIds, enforcedObligationIds)) {
        throw new ReplayMismatchError(
          `Replay obligation metadata mismatch for ${frame.frameId}`,
          "replay-obligations-mismatch"
        );
      }
      usedFallback = replayRecord.usedFallback;
      reasonerAttempts = replayRecord.reasonerAttempts;
      fallbackReason = replayRecord.fallbackReason;
    }

    const intention = eligibleIntentions.find((candidate) => candidate.id === output.intentionId);
    if (!intention) throw new Error("Fallback selected an unavailable intention");
    const decision: CommittedDecision = {
      id: asDecisionId(`decision:${request.agentId}:${request.situationId}:v${state.version}`),
      agentId: request.agentId,
      intentionId: intention.id,
      ...(output.target === undefined ? {} : { selectedTarget: output.target }),
      objective: output.objective,
      commitment: output.commitment,
      reasonCode: output.reasonCode,
      committedAt: request.now,
      basedOnVersion: state.version
    };
    if (replayRecord !== undefined && replayRecord.decisionId !== decision.id) {
      throw new ReplayMismatchError(
        `Replay decision mismatch: expected ${replayRecord.decisionId}, produced ${decision.id}`,
        "replay-decision-id-mismatch"
      );
    }
    const activeObligations = updateObligations(state.activeObligations, intention, decision);
    const patch: PatchEnvelope = {
      patchId: `${decision.id}:commit`,
      agentId: request.agentId,
      module: "controller",
      basedOnVersion: state.version,
      worldVersion: 0,
      observedThroughSequence: 0,
      triggeredBy: [],
      idempotencyKey: `${decision.id}:commit`,
      rebasePolicy: "never",
      createdAt: request.now,
      patch: { kind: "decision", decision, activeObligations }
    };
    const applyResult = await this.stateStore.apply(patch);
    if (applyResult.status !== "applied") return { status: "stale", applyResult };
    await this.recordAcceptedDecision({
      schemaVersion: CORTEX_ACCEPTED_DECISION_RECORD_SCHEMA_VERSION,
      frameId: frame.frameId,
      frameHash: hashCognitiveFrame(frame),
      basedOnVersion: frame.basedOnVersion,
      eligibleIntentionIds: eligibleIntentions.map((candidate) => candidate.id),
      output,
      decisionId: decision.id,
      usedFallback,
      reasonerAttempts,
      enforcedObligationIds: dueObligations.map((obligation) => obligation.id),
      ...(fallbackReason === undefined ? {} : { fallbackReason })
    });
    await this.recordDiagnostic({
      frameId: frame.frameId,
      outcome: "committed",
      reasonerAttempts,
      usedFallback,
      activeObligationIds: state.activeObligations.map((obligation) => obligation.id),
      enforcedObligationIds: dueObligations.map((obligation) => obligation.id),
      eligibleIntentionIds: eligibleIntentions.map((candidate) => candidate.id),
      ...(fallbackReason === undefined ? {} : { fallbackReason }),
      ...(validationIssue === undefined ? {} : { validationIssue })
    });
    return {
      status: "committed",
      decision,
      intention,
      usedFallback,
      reasonerAttempts,
      enforcedObligationIds: dueObligations.map((obligation) => obligation.id),
      ...(fallbackReason === undefined ? {} : { fallbackReason })
    };
  }

  private async recordDiagnostic(diagnostic: ControllerDiagnostic): Promise<void> {
    try {
      await this.options.diagnosticSink?.record(diagnostic);
    } catch {
      // Diagnostics must never prevent or replace a simulation decision.
    }
  }

  private async recordAcceptedDecision(record: AcceptedDecisionRecord): Promise<void> {
    try {
      await this.options.decisionRecorder?.record(record);
    } catch {
      // Recording is observational and cannot roll back an already committed decision.
    }
  }

  private selectFallback(feasibleIntentions: readonly FeasibleIntention[]): ControllerOutput {
    const selected: unknown = this.fallbackPolicy.select(feasibleIntentions);
    const validation = this.#outputValidator.validate(selected, feasibleIntentions);
    if (!validation.valid) {
      throw new Error(`Fallback policy returned invalid output: ${validation.issue}`);
    }
    return validation.output;
  }
}

const updateObligations = (
  current: readonly DecisionObligation[],
  intention: FeasibleIntention,
  decision: CommittedDecision
): readonly DecisionObligation[] => {
  const carried = current.flatMap((obligation): readonly DecisionObligation[] => {
    if (obligation.requiredIntentionIds.includes(intention.id)) return [];
    const remainingDecisionCycles = obligation.remainingDecisionCycles - 1;
    if (remainingDecisionCycles < 1) {
      throw new Error(`Decision violated enforced obligation: ${obligation.id}`);
    }
    return [{ ...obligation, remainingDecisionCycles }];
  });
  const created = (intention.followUpObligations ?? []).map((spec, index) =>
    createObligation(spec, decision, index)
  );
  return [...carried, ...created];
};

const createObligation = (
  spec: FollowUpObligationSpec,
  decision: CommittedDecision,
  index: number
): DecisionObligation => {
  if (
    spec.requiredIntentionIds.length === 0 ||
    spec.requiredIntentionIds.some((id) => id.trim().length === 0) ||
    !Number.isInteger(spec.withinDecisionCycles) ||
    spec.withinDecisionCycles < 1 ||
    spec.reason.trim().length === 0
  ) {
    throw new Error(`Invalid follow-up obligation on intention: ${decision.intentionId}`);
  }
  return {
    id: `obligation:${decision.id}:${index}`,
    sourceDecisionId: decision.id,
    requiredIntentionIds: [...new Set(spec.requiredIntentionIds)],
    remainingDecisionCycles: spec.withinDecisionCycles,
    reason: spec.reason
  };
};

const abortable = async <T>(promise: Promise<T>, signal: AbortSignal): Promise<T> => {
  if (signal.aborted) throw signal.reason;
  return new Promise<T>((resolve, reject) => {
    const onAbort = (): void => {
      cleanup();
      reject(signal.reason);
    };
    const cleanup = (): void => signal.removeEventListener("abort", onAbort);
    signal.addEventListener("abort", onAbort, { once: true });
    promise.then(
      (value) => {
        cleanup();
        resolve(value);
      },
      (error: unknown) => {
        cleanup();
        reject(error);
      }
    );
  });
};

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isAcceptedDecisionReplayReasoner = (
  value: ControllerReasoner
): value is AcceptedDecisionReplayReasoner =>
  "lastAcceptedRecord" in value && typeof value.lastAcceptedRecord === "function";

const isEntityRef = (value: unknown): value is EntityRef =>
  isRecord(value) &&
  Object.keys(value).length === 2 &&
  typeof value["type"] === "string" &&
  /^[a-z][a-z0-9-]*:[a-z][a-z0-9-]*$/.test(value["type"]) &&
  typeof value["id"] === "string" &&
  value["id"].length > 0;

const sameEntity = (left: EntityRef, right: EntityRef): boolean =>
  left.type === right.type && left.id === right.id;

const sameStrings = (left: readonly string[], right: readonly string[]): boolean =>
  left.length === right.length && left.every((value, index) => value === right[index]);

const isControllerFallbackReason = (value: unknown): value is ControllerFallbackReason =>
  value === "deadline-exceeded" || value === "invalid-output" || value === "reasoner-error";

const cloneControllerOutput = (output: ControllerOutput): ControllerOutput => ({
  intentionId: output.intentionId,
  objective: output.objective,
  commitment: output.commitment,
  reasonCode: output.reasonCode,
  ...(output.target === undefined ? {} : { target: { ...output.target } })
});

const cloneDecisionRecord = (record: AcceptedDecisionRecord): AcceptedDecisionRecord => ({
  ...record,
  eligibleIntentionIds: [...record.eligibleIntentionIds],
  output: cloneControllerOutput(record.output),
  enforcedObligationIds: [...record.enforcedObligationIds]
});

const canonicalJson = (value: unknown): string => {
  if (value === null || typeof value === "boolean" || typeof value === "string") {
    return JSON.stringify(value);
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("Cannot hash a frame containing a non-finite number");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map((item) => canonicalJson(item ?? null)).join(",")}]`;
  if (isRecord(value)) {
    return `{${Object.keys(value)
      .filter((key) => value[key] !== undefined)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
      .join(",")}}`;
  }
  throw new Error(`Cannot hash unsupported frame value: ${typeof value}`);
};
