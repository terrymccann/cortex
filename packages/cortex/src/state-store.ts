import type { AgentId, NamespacedId, SimTime } from "@cortex/contracts";
import { ownedPatchKinds, type PatchEnvelope } from "./patches.js";
import type { AgentState, Relationship } from "./state.js";

export type PatchRejectionReason =
  | "agent-not-found"
  | "module-ownership"
  | "stale-version"
  | "unobserved-source-event"
  | "decision-not-current"
  | "unknown-state-slice"
  | "state-slice-ownership"
  | "invalid-value";

export type PatchApplyResult =
  | { readonly status: "applied"; readonly stateVersion: number }
  | { readonly status: "duplicate"; readonly stateVersion: number }
  | { readonly status: "no-change"; readonly stateVersion: number }
  | { readonly status: "rejected"; readonly reason: PatchRejectionReason };

export interface AgentStateStore {
  register(state: AgentState): Promise<void>;
  snapshot(agentId: AgentId): Promise<Readonly<AgentState>>;
  apply(patch: PatchEnvelope): Promise<PatchApplyResult>;
}

export interface StateSliceReducer {
  readonly sliceId: NamespacedId;
  readonly schemaVersion: number;
  readonly writerModules: readonly NamespacedId[];
  initialState(): unknown;
  validate(value: unknown): boolean;
  reduce(current: unknown, operation: unknown): unknown;
}

const clampRelationship = (value: number): number => Math.max(-100, Math.min(100, value));

const updateRelationships = (
  current: readonly Relationship[],
  deltas: Extract<PatchEnvelope["patch"], { kind: "social" }>["relationshipDeltas"]
): readonly Relationship[] => {
  const byTarget = new Map(current.map((relationship) => [relationship.target, relationship]));

  for (const delta of deltas) {
    const existing = byTarget.get(delta.target) ?? {
      target: delta.target,
      trust: 0,
      affection: 0,
      respect: 0,
      fear: 0,
      attraction: 0,
      resentment: 0,
      familiarity: 0
    };

    byTarget.set(delta.target, {
      target: delta.target,
      trust: clampRelationship(existing.trust + (delta.trust ?? 0)),
      affection: clampRelationship(existing.affection + (delta.affection ?? 0)),
      respect: clampRelationship(existing.respect + (delta.respect ?? 0)),
      fear: clampRelationship(existing.fear + (delta.fear ?? 0)),
      attraction: clampRelationship(existing.attraction + (delta.attraction ?? 0)),
      resentment: clampRelationship(existing.resentment + (delta.resentment ?? 0)),
      familiarity: Math.max(0, Math.min(100, existing.familiarity + (delta.familiarity ?? 0)))
    });
  }

  return [...byTarget.values()];
};

function reducePatch(state: AgentState, envelope: PatchEnvelope): AgentState {
  const patch = envelope.patch;
  const base = {
    ...state,
    version: state.version + 1,
    updatedAt: envelope.createdAt
  };

  switch (patch.kind) {
    case "perception":
      return { ...base, perception: [...state.perception, ...patch.observations] };
    case "action-awareness":
      return { ...base, expectations: patch.expectations };
    case "memory":
      return { ...base, memories: [...state.memories, ...patch.memories] };
    case "social":
      return {
        ...base,
        relationships: updateRelationships(state.relationships, patch.relationshipDeltas)
      };
    case "goal": {
      const updated = new Map(state.goals.map((goal) => [goal.id, goal]));
      for (const goal of patch.goals) updated.set(goal.id, goal);
      return { ...base, goals: [...updated.values()] };
    }
    case "decision":
      return {
        ...base,
        currentDecision: patch.decision,
        activeObligations: patch.activeObligations ?? state.activeObligations
      };
    case "plan":
      return {
        ...base,
        activePlan: patch.status === "created" ? { id: patch.planId, status: patch.status } : undefined
      };
    case "communication":
      return {
        ...base,
        lastCommunication: patch
      };
    case "state-slice":
      throw new Error("State-slice patches are reduced by their registered reducer");
  }
}

const clone = <T>(value: T): T => structuredClone(value);

export class InMemoryAgentStateStore implements AgentStateStore {
  readonly #states = new Map<AgentId, AgentState>();
  readonly #appliedIdempotencyKeys = new Set<string>();
  readonly #processedTriggers = new Set<string>();
  readonly #sliceReducers = new Map<string, StateSliceReducer>();

  constructor(sliceReducers: readonly StateSliceReducer[] = []) {
    for (const reducer of sliceReducers) {
      if (this.#sliceReducers.has(reducer.sliceId)) {
        throw new Error(`Duplicate state-slice reducer: ${reducer.sliceId}`);
      }
      if (!Number.isInteger(reducer.schemaVersion) || reducer.schemaVersion < 1) {
        throw new Error(`Invalid state-slice schema version: ${reducer.sliceId}`);
      }
      if (reducer.writerModules.length === 0) {
        throw new Error(`State slice has no writer modules: ${reducer.sliceId}`);
      }
      this.#sliceReducers.set(reducer.sliceId, reducer);
    }
  }

  async register(state: AgentState): Promise<void> {
    if (this.#states.has(state.id)) throw new Error(`Agent already registered: ${state.id}`);
    for (const [sliceId, slice] of Object.entries(state.slices)) {
      const reducer = this.#sliceReducers.get(sliceId);
      if (!reducer) throw new Error(`Unknown initial state slice: ${sliceId}`);
      if (slice.schemaVersion !== reducer.schemaVersion) {
        throw new Error(`State-slice schema mismatch: ${sliceId}`);
      }
      if (!reducer.validate(slice.value)) {
        throw new Error(`Invalid initial state slice: ${sliceId}`);
      }
    }
    this.#states.set(state.id, clone(state));
  }

  async snapshot(agentId: AgentId): Promise<Readonly<AgentState>> {
    const state = this.#states.get(agentId);
    if (!state) throw new Error(`Unknown agent: ${agentId}`);
    return clone(state);
  }

  async apply(envelope: PatchEnvelope): Promise<PatchApplyResult> {
    const state = this.#states.get(envelope.agentId);
    if (!state) return { status: "rejected", reason: "agent-not-found" };

    const triggerKeys = envelope.triggeredBy.map(
      (eventId) => `${envelope.agentId}:${envelope.module}:${eventId}`
    );
    if (
      this.#appliedIdempotencyKeys.has(envelope.idempotencyKey) ||
      triggerKeys.some((key) => this.#processedTriggers.has(key))
    ) {
      return { status: "duplicate", stateVersion: state.version };
    }

    if (envelope.patch.kind === "state-slice") {
      const reducer = this.#sliceReducers.get(envelope.patch.sliceId);
      if (!reducer) return { status: "rejected", reason: "unknown-state-slice" };
      if (!reducer.writerModules.some((moduleId) => moduleId === envelope.module)) {
        return { status: "rejected", reason: "state-slice-ownership" };
      }
    } else if (!(ownedPatchKinds[envelope.module] ?? []).includes(envelope.patch.kind)) {
      return { status: "rejected", reason: "module-ownership" };
    }

    if (
      envelope.module !== "perception" &&
      envelope.triggeredBy.some(
        (eventId) => !state.perception.some((observation) => observation.eventId === eventId)
      )
    ) {
      return { status: "rejected", reason: "unobserved-source-event" };
    }

    if (state.version !== envelope.basedOnVersion) {
      if (envelope.rebasePolicy === "never") {
        return { status: "rejected", reason: "stale-version" };
      }
      if (envelope.rebasePolicy === "event-delta" && triggerKeys.length === 0) {
        return { status: "rejected", reason: "stale-version" };
      }
    }

    if (envelope.patch.kind === "decision") {
      const { commitment } = envelope.patch.decision;
      if (!Number.isFinite(commitment) || commitment < 0 || commitment > 1) {
        return { status: "rejected", reason: "invalid-value" };
      }
      if (
        envelope.patch.activeObligations?.some(
          (obligation) =>
            obligation.id.trim().length === 0 ||
            obligation.requiredIntentionIds.length === 0 ||
            obligation.requiredIntentionIds.some((id) => id.trim().length === 0) ||
            !Number.isInteger(obligation.remainingDecisionCycles) ||
            obligation.remainingDecisionCycles < 1 ||
            obligation.reason.trim().length === 0
        )
      ) {
        return { status: "rejected", reason: "invalid-value" };
      }
    }

    let next: AgentState;
    if (envelope.patch.kind === "state-slice") {
      const reducer = this.#sliceReducers.get(envelope.patch.sliceId)!;
      const currentSlice = state.slices[envelope.patch.sliceId];
      if (
        currentSlice !== undefined &&
        currentSlice.schemaVersion !== reducer.schemaVersion
      ) {
        return { status: "rejected", reason: "invalid-value" };
      }
      const current = currentSlice?.value ?? reducer.initialState();
      let reduced: unknown;
      try {
        reduced = reducer.reduce(clone(current), clone(envelope.patch.operation));
      } catch {
        return { status: "rejected", reason: "invalid-value" };
      }
      if (!reducer.validate(reduced)) return { status: "rejected", reason: "invalid-value" };
      next = {
        ...state,
        version: state.version + 1,
        updatedAt: envelope.createdAt,
        slices: {
          ...state.slices,
          [envelope.patch.sliceId]: {
            schemaVersion: reducer.schemaVersion,
            value: clone(reduced)
          }
        }
      };
    } else {
      next = reducePatch(state, envelope);
    }
    this.#states.set(envelope.agentId, next);
    this.#appliedIdempotencyKeys.add(envelope.idempotencyKey);
    for (const key of triggerKeys) this.#processedTriggers.add(key);
    return { status: "applied", stateVersion: next.version };
  }
}

export class ManualSimClock {
  #now: SimTime;

  constructor(start: SimTime) {
    this.#now = start;
  }

  now(): SimTime {
    return this.#now;
  }

  advanceTo(next: SimTime): void {
    if (next < this.#now) throw new Error("Simulation clock cannot move backwards");
    this.#now = next;
  }
}
