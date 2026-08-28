import {
  asActionId,
  asAgentId,
  asDecisionId,
  asEntityId,
  asSimTime,
  type ActionCommand
} from "@cortex/contracts";
import { describe, expect, it } from "vitest";
import { FakeWorld } from "../src/fake-world.js";

describe("FakeWorld", () => {
  it("revalidates action preconditions at submission time", async () => {
    const world = new FakeWorld();
    world.allowActionType("RESPOND_TO_INVITATION");
    const marcus = { kind: "agent" as const, id: asEntityId("marcus") };
    world.setEntity({ ref: marcus, exists: true, alive: false, accessible: true });
    const command: ActionCommand = {
      id: asActionId("action-1"),
      agentId: asAgentId("elena"),
      decisionId: asDecisionId("decision-1"),
      actionType: "RESPOND_TO_INVITATION",
      arguments: { response: "pretend-to-accept" },
      preconditions: [{ kind: "entity-alive", subject: marcus }],
      expectedEffects: [],
      issuedAt: asSimTime(5)
    };

    expect(await world.submitAction(command)).toEqual({
      status: "rejected",
      actionId: asActionId("action-1"),
      reason: "precondition-failed"
    });
    expect(world.submittedActions()).toHaveLength(0);
  });

  it("rejects action types the simulation did not define", async () => {
    const world = new FakeWorld();
    const command: ActionCommand = {
      id: asActionId("invented-action"),
      agentId: asAgentId("elena"),
      decisionId: asDecisionId("decision-1"),
      actionType: "CREATE_MACHINE_GUN",
      arguments: {},
      preconditions: [],
      expectedEffects: [],
      issuedAt: asSimTime(5)
    };

    expect(await world.submitAction(command)).toEqual({
      status: "rejected",
      actionId: command.id,
      reason: "unknown-action-type"
    });
  });
});
