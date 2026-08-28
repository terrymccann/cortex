import type { PerceptibleWorldEvent, SimTime } from "@cortex/contracts";
import type { PatchEnvelope, PerceptionPatch } from "./patches.js";
import { createAgentState, type AgentSeed } from "./state.js";
import type { AgentStateStore, PatchApplyResult } from "./state-store.js";

export class CortexKernel {
  constructor(private readonly stateStore: AgentStateStore) {}

  async registerAgent(seed: AgentSeed, now: SimTime): Promise<void> {
    await this.stateStore.register(createAgentState(seed, now));
  }

  async ingest(event: PerceptibleWorldEvent): Promise<PatchApplyResult> {
    const state = await this.stateStore.snapshot(event.observer);
    const patch: PatchEnvelope<PerceptionPatch> = {
      patchId: `perception:${event.observer}:${event.event.id}`,
      agentId: event.observer,
      module: "perception",
      basedOnVersion: state.version,
      worldVersion: event.event.worldVersion,
      observedThroughSequence: event.event.sequence,
      triggeredBy: [event.event.id],
      idempotencyKey: `perception:${event.observer}:${event.event.id}`,
      rebasePolicy: "event-delta",
      createdAt: event.event.simTime,
      patch: {
        kind: "perception",
        observations: [
          {
            eventId: event.event.id,
            observedAt: event.event.simTime,
            facts: event.observedFacts
          }
        ]
      }
    };
    return this.stateStore.apply(patch);
  }
}

