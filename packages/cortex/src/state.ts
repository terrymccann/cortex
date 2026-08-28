import type {
  AgentId,
  DecisionId,
  EntityRef,
  EventId,
  ExpectedEffect,
  GoalId,
  MemoryId,
  ObservedFact,
  SimTime
} from "@cortex/contracts";

export type CognitiveTier = 0 | 1 | 2 | 3;

export interface Identity {
  readonly name: string;
}

export interface CognitiveBudget {
  readonly periodEndsAt: SimTime;
  readonly smallModelCallsRemaining: number;
  readonly reasoningCallsRemaining: number;
  readonly generatedTokensRemaining: number;
  readonly concurrentJobsRemaining: number;
}

export interface CognitiveResolution {
  readonly tier: CognitiveTier;
  readonly reasons: readonly string[];
  readonly budget: CognitiveBudget;
}

export interface PerceivedObservation {
  readonly eventId: EventId;
  readonly observedAt: SimTime;
  readonly facts: readonly ObservedFact[];
}

export interface Belief {
  readonly id: string;
  readonly subject: EntityRef;
  readonly predicate: string;
  readonly object: unknown;
  readonly confidence: number;
  readonly acquiredAt: SimTime;
  readonly sources: readonly EventId[];
}

export interface Relationship {
  readonly target: AgentId;
  readonly trust: number;
  readonly affection: number;
  readonly respect: number;
  readonly fear: number;
  readonly attraction: number;
  readonly resentment: number;
  readonly familiarity: number;
}

export interface EpisodicMemory {
  readonly id: MemoryId;
  readonly sourceEvents: readonly EventId[];
  readonly summary: string;
  readonly occurredAt: SimTime;
  readonly importance: number;
  readonly emotionalValence: number;
  readonly confidence: number;
}

export interface Goal {
  readonly id: GoalId;
  readonly kind: string;
  readonly description: string;
  readonly priority: number;
  readonly status: "active" | "suspended" | "satisfied" | "abandoned";
}

export interface CommittedDecision {
  readonly id: DecisionId;
  readonly agentId: AgentId;
  readonly intentionId: string;
  readonly selectedTarget?: EntityRef;
  readonly objective: string;
  readonly commitment: number;
  readonly reasonCode: string;
  readonly committedAt: SimTime;
  readonly basedOnVersion: number;
}

export interface DecisionObligation {
  readonly id: string;
  readonly sourceDecisionId: DecisionId;
  readonly requiredIntentionIds: readonly string[];
  readonly remainingDecisionCycles: number;
  readonly reason: string;
}

export interface PlanState {
  readonly id: string;
  readonly status: "created" | "invalidated";
}

export interface CommunicationRecord {
  readonly decisionId: string;
  readonly speechAct: string;
  readonly utterance?: string;
}

export interface ActionExpectation {
  readonly actionId: string;
  readonly expectedEffects: readonly ExpectedEffect[];
  readonly status: "pending" | "succeeded" | "partially-succeeded" | "failed";
  readonly resolutionEventIds: readonly EventId[];
}

export interface AgentState {
  readonly id: AgentId;
  readonly version: number;
  readonly updatedAt: SimTime;
  readonly identity: Identity;
  readonly personality: Readonly<Record<string, number>>;
  readonly resolution: CognitiveResolution;
  readonly perception: readonly PerceivedObservation[];
  readonly beliefs: readonly Belief[];
  readonly relationships: readonly Relationship[];
  readonly memories: readonly EpisodicMemory[];
  readonly goals: readonly Goal[];
  readonly activePlan: PlanState | undefined;
  readonly currentDecision?: CommittedDecision;
  readonly activeObligations: readonly DecisionObligation[];
  readonly lastCommunication: CommunicationRecord | undefined;
  readonly expectations: readonly ActionExpectation[];
  readonly slices: Readonly<Record<string, unknown>>;
}

export interface AgentSeed {
  readonly id: AgentId;
  readonly identity: Identity;
  readonly personality?: Readonly<Record<string, number>>;
  readonly resolution?: Partial<CognitiveResolution>;
  readonly relationships?: readonly Relationship[];
  readonly beliefs?: readonly Belief[];
  readonly memories?: readonly EpisodicMemory[];
  readonly goals?: readonly Goal[];
  readonly activeObligations?: readonly DecisionObligation[];
  readonly slices?: Readonly<Record<string, unknown>>;
}

export function createAgentState(seed: AgentSeed, now: SimTime): AgentState {
  return {
    id: seed.id,
    version: 0,
    updatedAt: now,
    identity: seed.identity,
    personality: seed.personality ?? {},
    resolution: {
      tier: seed.resolution?.tier ?? 0,
      reasons: seed.resolution?.reasons ?? [],
      budget: seed.resolution?.budget ?? {
        periodEndsAt: now,
        smallModelCallsRemaining: 0,
        reasoningCallsRemaining: 0,
        generatedTokensRemaining: 0,
        concurrentJobsRemaining: 0
      }
    },
    perception: [],
    beliefs: seed.beliefs ?? [],
    relationships: seed.relationships ?? [],
    memories: seed.memories ?? [],
    goals: seed.goals ?? [],
    activePlan: undefined,
    activeObligations: seed.activeObligations ?? [],
    lastCommunication: undefined,
    expectations: [],
    slices: seed.slices ?? {}
  };
}
