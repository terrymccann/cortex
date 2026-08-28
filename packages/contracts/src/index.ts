export const CORTEX_CONTRACTS_SCHEMA_V1 = "cortex-contracts-v1" as const;
export const CORTEX_CONTRACTS_TARGET_SCHEMA_V2 = "cortex-contracts-v2" as const;
export const CORTEX_CONTRACTS_CURRENT_SCHEMA = CORTEX_CONTRACTS_SCHEMA_V1;

export type CortexContractsSchemaVersion =
  | typeof CORTEX_CONTRACTS_SCHEMA_V1
  | typeof CORTEX_CONTRACTS_TARGET_SCHEMA_V2;

export type Brand<T, Name extends string> = T & { readonly __brand: Name };

export type AgentId = Brand<string, "AgentId">;
export type EntityId = Brand<string, "EntityId">;
export type EventId = Brand<string, "EventId">;
export type DecisionId = Brand<string, "DecisionId">;
export type ActionId = Brand<string, "ActionId">;
export type GoalId = Brand<string, "GoalId">;
export type MemoryId = Brand<string, "MemoryId">;
export type JobId = Brand<string, "JobId">;
export type SimTime = Brand<number, "SimTime">;

export const asAgentId = (value: string): AgentId => value as AgentId;
export const asEntityId = (value: string): EntityId => value as EntityId;
export const asEventId = (value: string): EventId => value as EventId;
export const asDecisionId = (value: string): DecisionId => value as DecisionId;
export const asActionId = (value: string): ActionId => value as ActionId;
export const asGoalId = (value: string): GoalId => value as GoalId;
export const asMemoryId = (value: string): MemoryId => value as MemoryId;
export const asJobId = (value: string): JobId => value as JobId;
export const asSimTime = (value: number): SimTime => value as SimTime;

export interface EntityRef {
  readonly kind: "agent" | "location" | "organization" | "object";
  readonly id: EntityId;
}

export interface ObservedFact {
  readonly subject: EntityRef;
  readonly predicate: string;
  readonly object: unknown;
  readonly confidence: number;
}

export interface WorldEvent<TType extends string = string, TPayload = unknown> {
  readonly id: EventId;
  readonly sequence: number;
  readonly worldVersion: number;
  readonly simTime: SimTime;
  readonly type: TType;
  readonly actor?: EntityRef;
  readonly targets: readonly EntityRef[];
  readonly location?: EntityRef;
  readonly payload: Readonly<TPayload>;
  readonly causedBy?: EventId | ActionId | DecisionId;
}

export interface PerceptibleWorldEvent<T = unknown> {
  readonly event: WorldEvent<string, T>;
  readonly observer: AgentId;
  readonly channel: "seen" | "heard" | "told" | "felt" | "system";
  readonly clarity: number;
  readonly observedFacts: readonly ObservedFact[];
}

export interface WorldAssumption {
  readonly kind: "entity-exists" | "entity-alive" | "entity-accessible" | "world-version";
  readonly subject?: EntityRef;
  readonly expected?: unknown;
}

export interface ExpectedEffect {
  readonly subject: EntityRef;
  readonly predicate: string;
  readonly expected: unknown;
  readonly deadline: SimTime;
}

export interface ActionCommand {
  readonly id: ActionId;
  readonly agentId: AgentId;
  readonly decisionId: DecisionId;
  readonly actionType: string;
  readonly arguments: Readonly<Record<string, unknown>>;
  readonly preconditions: readonly WorldAssumption[];
  readonly expectedEffects: readonly ExpectedEffect[];
  readonly issuedAt: SimTime;
}

export type ActionSubmission =
  | { readonly status: "accepted"; readonly actionId: ActionId }
  | { readonly status: "deferred"; readonly actionId: ActionId; readonly reason: string }
  | { readonly status: "rejected"; readonly actionId: ActionId; readonly reason: string };

export interface FeasibleIntention {
  readonly id: string;
  readonly kind: string;
  readonly description: string;
  readonly allowedTargets: readonly EntityRef[];
  readonly constraints: readonly string[];
  readonly followUpObligations?: readonly FollowUpObligationSpec[];
}

export interface FollowUpObligationSpec {
  readonly requiredIntentionIds: readonly string[];
  readonly withinDecisionCycles: number;
  readonly reason: string;
}

export interface FeasibleIntentionQuery {
  readonly agentId: AgentId;
  readonly situationId: string;
}

export interface PerceptionSnapshot {
  readonly agentId: AgentId;
  readonly worldVersion: number;
  readonly observedThroughSequence: number;
  readonly observations: readonly ObservedFact[];
}

export interface ResolvedEntity {
  readonly ref: EntityRef;
  readonly exists: boolean;
  readonly alive?: boolean;
  readonly accessible?: boolean;
}

export interface AssumptionResult {
  readonly valid: boolean;
  readonly failed: readonly WorldAssumption[];
}

export interface CortexWorldPort {
  getPerception(agentId: AgentId): Promise<PerceptionSnapshot>;
  getFeasibleIntentions(query: FeasibleIntentionQuery): Promise<readonly FeasibleIntention[]>;
  resolveEntity(ref: EntityRef): Promise<ResolvedEntity | undefined>;
  validateAssumptions(assumptions: readonly WorldAssumption[]): Promise<AssumptionResult>;
  submitAction(command: ActionCommand): Promise<ActionSubmission>;
}
