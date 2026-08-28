import {
  asMemoryId,
  type AgentId,
  type EventId,
  type PerceptibleWorldEvent,
  type SimTime
} from "@cortex/contracts";
import type { PatchEnvelope } from "./patches.js";
import type { ActionExpectation, EpisodicMemory } from "./state.js";
import type { AgentStateStore, PatchApplyResult } from "./state-store.js";

export class MemoryModule {
  constructor(private readonly stateStore: AgentStateStore) {}

  async remember(input: {
    agentId: AgentId;
    sourceEvents: readonly EventId[];
    summary: string;
    occurredAt: SimTime;
    importance: number;
    emotionalValence: number;
    confidence: number;
  }): Promise<PatchApplyResult> {
    const state = await this.stateStore.snapshot(input.agentId);
    const memory: EpisodicMemory = {
      id: asMemoryId(`memory:${input.agentId}:${input.sourceEvents.join("+")}`),
      sourceEvents: input.sourceEvents,
      summary: input.summary,
      occurredAt: input.occurredAt,
      importance: clamp01(input.importance),
      emotionalValence: Math.max(-1, Math.min(1, input.emotionalValence)),
      confidence: clamp01(input.confidence)
    };
    return this.stateStore.apply({
      patchId: `${memory.id}:ingest`,
      agentId: input.agentId,
      module: "memory",
      basedOnVersion: state.version,
      worldVersion: 0,
      observedThroughSequence: 0,
      triggeredBy: input.sourceEvents,
      idempotencyKey: `${memory.id}:ingest`,
      rebasePolicy: "event-delta",
      createdAt: input.occurredAt,
      patch: { kind: "memory", memories: [memory] }
    });
  }
}

export class SocialAwarenessModule {
  constructor(private readonly stateStore: AgentStateStore) {}

  async applyInference(input: {
    agentId: AgentId;
    eventId: EventId;
    now: SimTime;
    target: AgentId;
    trustDelta?: number;
    respectDelta?: number;
    fearDelta?: number;
    resentmentDelta?: number;
    familiarityDelta?: number;
  }): Promise<PatchApplyResult> {
    const state = await this.stateStore.snapshot(input.agentId);
    return this.stateStore.apply({
      patchId: `social:${input.agentId}:${input.eventId}`,
      agentId: input.agentId,
      module: "social-awareness",
      basedOnVersion: state.version,
      worldVersion: 0,
      observedThroughSequence: 0,
      triggeredBy: [input.eventId],
      idempotencyKey: `social:${input.agentId}:${input.eventId}`,
      rebasePolicy: "event-delta",
      createdAt: input.now,
      patch: {
        kind: "social",
        relationshipDeltas: [
          {
            target: input.target,
            ...(input.trustDelta === undefined ? {} : { trust: input.trustDelta }),
            ...(input.respectDelta === undefined ? {} : { respect: input.respectDelta }),
            ...(input.fearDelta === undefined ? {} : { fear: input.fearDelta }),
            ...(input.resentmentDelta === undefined ? {} : { resentment: input.resentmentDelta }),
            ...(input.familiarityDelta === undefined ? {} : { familiarity: input.familiarityDelta })
          }
        ]
      }
    });
  }
}

export class ActionAwarenessModule {
  constructor(private readonly stateStore: AgentStateStore) {}

  async expect(agentId: AgentId, expectation: ActionExpectation, now: SimTime): Promise<PatchApplyResult> {
    const state = await this.stateStore.snapshot(agentId);
    return this.applyExpectations(agentId, state.version, [...state.expectations, expectation], now, []);
  }

  async observe(agentId: AgentId, observation: PerceptibleWorldEvent): Promise<PatchApplyResult> {
    const state = await this.stateStore.snapshot(agentId);
    let changed = false;
    const expectations = state.expectations.map((expectation): ActionExpectation => {
      if (expectation.status !== "pending") return expectation;
      const matched = expectation.expectedEffects.filter((effect) =>
        observation.observedFacts.some(
          (fact) =>
            fact.subject.kind === effect.subject.kind &&
            fact.subject.id === effect.subject.id &&
            fact.predicate === effect.predicate &&
            deepEqual(fact.object, effect.expected)
        )
      ).length;
      if (matched === 0) return expectation;
      changed = true;
      return {
        ...expectation,
        status: matched === expectation.expectedEffects.length ? "succeeded" : "partially-succeeded",
        resolutionEventIds: [...expectation.resolutionEventIds, observation.event.id]
      };
    });
    if (!changed) return { status: "no-change", stateVersion: state.version };
    return this.applyExpectations(
      agentId,
      state.version,
      expectations,
      observation.event.simTime,
      [observation.event.id]
    );
  }

  async expire(agentId: AgentId, now: SimTime): Promise<PatchApplyResult> {
    const state = await this.stateStore.snapshot(agentId);
    let changed = false;
    const expectations = state.expectations.map((expectation): ActionExpectation => {
      const expired =
        expectation.status === "pending" &&
        expectation.expectedEffects.every((effect) => effect.deadline < now);
      if (expired) changed = true;
      return { ...expectation, status: expired ? "failed" : expectation.status };
    });
    if (!changed) return { status: "no-change", stateVersion: state.version };
    return this.applyExpectations(agentId, state.version, expectations, now, []);
  }

  private applyExpectations(
    agentId: AgentId,
    basedOnVersion: number,
    expectations: readonly ActionExpectation[],
    now: SimTime,
    triggeredBy: readonly EventId[]
  ): Promise<PatchApplyResult> {
    const idempotencyKey = `awareness:${agentId}:${triggeredBy.join("+") || `clock:${now}`}:v${basedOnVersion}`;
    const patch: PatchEnvelope = {
      patchId: idempotencyKey,
      agentId,
      module: "action-awareness",
      basedOnVersion,
      worldVersion: 0,
      observedThroughSequence: 0,
      triggeredBy,
      idempotencyKey,
      rebasePolicy: "never",
      createdAt: now,
      patch: { kind: "action-awareness", expectations }
    };
    return this.stateStore.apply(patch);
  }
}

const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));
const deepEqual = (left: unknown, right: unknown): boolean =>
  JSON.stringify(left) === JSON.stringify(right);
