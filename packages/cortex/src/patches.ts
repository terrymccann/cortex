import type { AgentId, EventId, NamespacedId, SimTime } from "@cortex/contracts";
import type {
  ActionExpectation,
  CommittedDecision,
  DecisionObligation,
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

export interface DecisionPatch {
  readonly kind: "decision";
  readonly decision: CommittedDecision;
  readonly activeObligations?: readonly DecisionObligation[];
}

export interface StateSlicePatch {
  readonly kind: "state-slice";
  readonly sliceId: NamespacedId;
  readonly operation: unknown;
}

export type DomainPatch =
  | PerceptionPatch
  | ActionAwarenessPatch
  | DecisionPatch
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
  controller: ["decision"]
};
