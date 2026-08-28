import {
  asAgentId,
  asDecisionId,
  asEntityId,
  asEventId,
  asSimTime,
  type FeasibleIntention
} from "@cortex/contracts";
import { describe, expect, it } from "vitest";
import { CommunicationModule, SkillExecutor, type SkillDefinition } from "../src/execution.js";
import { FakeWorld } from "../src/fake-world.js";
import { CortexKernel } from "../src/kernel.js";
import { MemoryModule } from "../src/modules.js";
import type { CommittedDecision } from "../src/state.js";
import { InMemoryAgentStateStore } from "../src/state-store.js";

const elena = asAgentId("elena");

describe("cognitive module boundaries", () => {
  it("rejects a memory whose source event the agent never perceived", async () => {
    const store = new InMemoryAgentStateStore();
    const kernel = new CortexKernel(store);
    await kernel.registerAgent({ id: elena, identity: { name: "Elena" } }, asSimTime(0));

    const result = await new MemoryModule(store).remember({
      agentId: elena,
      sourceEvents: [asEventId("secret-unobserved-event")],
      summary: "Elena somehow knows a private secret.",
      occurredAt: asSimTime(1),
      importance: 1,
      emotionalValence: 0,
      confidence: 1
    });

    expect(result).toEqual({ status: "rejected", reason: "unobserved-source-event" });
    expect((await store.snapshot(elena)).memories).toEqual([]);
  });

  it("rejects speech generated from a decision that is not current", async () => {
    const store = new InMemoryAgentStateStore();
    const kernel = new CortexKernel(store);
    await kernel.registerAgent({ id: elena, identity: { name: "Elena" } }, asSimTime(0));
    const decision: CommittedDecision = {
      id: asDecisionId("old-decision"),
      agentId: elena,
      intentionId: "reject",
      objective: "Reject the invitation",
      commitment: 1,
      reasonCode: "protect-council",
      committedAt: asSimTime(1),
      basedOnVersion: 0
    };
    const intention: FeasibleIntention = {
      id: "reject",
      kind: "reject",
      description: "Reject the invitation",
      allowedTargets: [{ type: "cortex:agent", id: asEntityId("marcus") }],
      constraints: []
    };

    const result = await new CommunicationModule(store, {
      render: (currentDecision, currentIntention) => ({
        decisionId: currentDecision.id,
        speechAct: currentIntention.kind,
        utterance: "No."
      })
    }).communicate(decision, intention, asSimTime(2));
    expect(result.applyResult).toEqual({ status: "rejected", reason: "decision-not-current" });
    expect((await store.snapshot(elena)).lastCommunication).toBeUndefined();
  });

  it("does not submit a world action from a decision that is not current", async () => {
    const store = new InMemoryAgentStateStore();
    const kernel = new CortexKernel(store);
    const world = new FakeWorld();
    world.allowActionType("RESPOND_TO_INVITATION");
    await kernel.registerAgent({ id: elena, identity: { name: "Elena" } }, asSimTime(0));
    const decision: CommittedDecision = {
      id: asDecisionId("old-decision"),
      agentId: elena,
      intentionId: "reject",
      objective: "Reject the invitation",
      commitment: 1,
      reasonCode: "protect-council",
      committedAt: asSimTime(1),
      basedOnVersion: 0
    };
    const intention: FeasibleIntention = {
      id: "reject",
      kind: "reject",
      description: "Reject the invitation",
      allowedTargets: [],
      constraints: []
    };
    const skill: SkillDefinition = {
      intentionKind: "reject",
      actionType: "RESPOND_TO_INVITATION",
      buildArguments: () => ({ response: "reject" }),
      buildPreconditions: () => [],
      buildExpectedEffects: () => []
    };

    const result = await new SkillExecutor(world, store, [skill]).execute(
      decision,
      intention,
      asSimTime(2)
    );
    expect(result.submission).toEqual({
      status: "rejected",
      actionId: result.command.id,
      reason: "decision-not-current"
    });
    expect(world.submittedActions()).toEqual([]);
  });
});
