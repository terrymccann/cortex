import {
  type AgentId,
  type ExpectedEffect,
  type EventId,
  type NamespacedId,
  type PerceptibleWorldEvent,
  type SimTime
} from "@cortex/contracts";
import type { PatchEnvelope } from "./patches.js";
import type { ActionExpectation } from "./state.js";
import type { AgentStateStore, PatchApplyResult } from "./state-store.js";

export class ActionAwarenessModule {
  readonly #effectMatchers = new Map<string, EffectMatcher>();

  constructor(
    private readonly stateStore: AgentStateStore,
    effectMatchers: readonly EffectMatcher[] = []
  ) {
    for (const matcher of effectMatchers) {
      const key = `${matcher.definitionId}@${matcher.definitionVersion}`;
      if (this.#effectMatchers.has(key)) throw new Error(`Duplicate effect matcher: ${key}`);
      this.#effectMatchers.set(key, matcher);
    }
  }

  async expect(
    agentId: AgentId,
    expectation: ActionExpectation,
    now: SimTime
  ): Promise<PatchApplyResult> {
    const state = await this.stateStore.snapshot(agentId);
    return this.applyExpectations(agentId, state.version, [...state.expectations, expectation], now, []);
  }

  async observe(agentId: AgentId, observation: PerceptibleWorldEvent): Promise<PatchApplyResult> {
    const state = await this.stateStore.snapshot(agentId);
    let changed = false;
    const expectations = state.expectations.map((expectation): ActionExpectation => {
      if (expectation.status !== "pending") return expectation;
      const matched = expectation.expectedEffects.filter((effect) => {
        const matcher = this.#effectMatchers.get(
          `${effect.definitionId}@${effect.definitionVersion}`
        );
        return matcher?.matches(effect, observation) ?? false;
      }).length;
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

export interface EffectMatcher {
  readonly definitionId: NamespacedId;
  readonly definitionVersion: number;
  matches(effect: ExpectedEffect, observation: PerceptibleWorldEvent): boolean;
}
