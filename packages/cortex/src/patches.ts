import type { AgentId, EventId, NamespacedId, SimTime } from "@cortex/contracts";
import type {
  ActionExpectation,
  CommittedDecision,
  DecisionObligation,
  EpisodicMemory,
  Goal,
  PerceivedObservation
} from "./state.js";

export type ModuleId = string;

export interface PerceptionPatch {
  readonly kind: "perception";
  readonly observations: readonly PerceivedObservation[];
}

export interface ActionAwarenessPatch {
  readonly kind: "action-awareness";
  readonly expectations: readonly ActionExpectation[];
}

export interface MemoryPatch {
  readonly kind: "memory";
  readonly memories: readonly EpisodicMemory[];
}

export interface SocialPatch {
  readonly kind: "social";
  readonly relationshipDeltas: readonly {
    readonly target: AgentId;
    readonly trust?: number;
    readonly affection?: number;
    readonly respect?: number;
    readonly fear?: number;
    readonly attraction?: number;
    readonly resentment?: number;
    readonly familiarity?: number;
  }[];
}

export interface GoalPatch {
  readonly kind: "goal";
  readonly goals: readonly Goal[];
}

export interface PlanPatch {
  readonly kind: "plan";
  readonly planId: string;
  readonly status: "created" | "invalidated";
}

export interface DecisionPatch {
  readonly kind: "decision";
  readonly decision: CommittedDecision;
  readonly activeObligations?: readonly DecisionObligation[];
}

export interface CommunicationPatch {
  readonly kind: "communication";
  readonly decisionId: string;
  readonly speechAct: string;
  readonly utterance?: string;
}

export interface StateSlicePatch {
  readonly kind: "state-slice";
  readonly sliceId: NamespacedId;
  readonly operation: unknown;
}

export type DomainPatch =
  | PerceptionPatch
  | ActionAwarenessPatch
  | MemoryPatch
  | SocialPatch
  | GoalPatch
  | PlanPatch
  | DecisionPatch
  | CommunicationPatch
  | StateSlicePatch;

export type RebasePolicy = "never" | "event-delta" | "commutative";

export interface PatchEnvelope<TPatch extends DomainPatch = DomainPatch> {
  readonly patchId: string;
  readonly agentId: AgentId;
  readonly module: ModuleId;
  readonly basedOnVersion: number;
  readonly worldVersion: number;
  readonly observedThroughSequence: number;
  readonly triggeredBy: readonly EventId[];
  readonly idempotencyKey: string;
  readonly rebasePolicy: RebasePolicy;
  readonly createdAt: SimTime;
  readonly patch: TPatch;
}

export const ownedPatchKinds: Readonly<Record<string, readonly DomainPatch["kind"][]>> = {
  perception: ["perception"],
  "action-awareness": ["action-awareness"],
  memory: ["memory"],
  "social-awareness": ["social"],
  "goal-manager": ["goal"],
  planner: ["plan"],
  controller: ["decision"],
  communication: ["communication"]
};
