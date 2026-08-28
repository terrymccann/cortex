import type {
  AgentId,
  DecisionId,
  EntityRef,
  EventId,
  ExpectedEffect,
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

export interface ActionExpectation {
  readonly actionId: string;
  readonly expectedEffects: readonly ExpectedEffect[];
  readonly status: "pending" | "succeeded" | "partially-succeeded" | "failed";
  readonly resolutionEventIds: readonly EventId[];
}

export interface StateSliceState {
  readonly schemaVersion: number;
  readonly value: unknown;
}

export interface AgentRuntimeEnvelope {
  readonly id: AgentId;
  readonly version: number;
  readonly updatedAt: SimTime;
  readonly identity: Identity;
  readonly resolution: CognitiveResolution;
  readonly perception: readonly PerceivedObservation[];
  readonly currentDecision?: CommittedDecision;
  readonly activeObligations: readonly DecisionObligation[];
  readonly expectations: readonly ActionExpectation[];
  readonly slices: Readonly<Record<string, StateSliceState>>;
}

export type AgentState = AgentRuntimeEnvelope;

export interface AgentSeed {
  readonly id: AgentId;
  readonly identity: Identity;
  readonly resolution?: Partial<CognitiveResolution>;
  readonly activeObligations?: readonly DecisionObligation[];
  readonly slices?: Readonly<Record<string, StateSliceState>>;
}

export function createAgentState(seed: AgentSeed, now: SimTime): AgentState {
  return {
    id: seed.id,
    version: 0,
    updatedAt: now,
    identity: seed.identity,
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
    activeObligations: seed.activeObligations ?? [],
    expectations: [],
    slices: seed.slices ?? {}
  };
}
