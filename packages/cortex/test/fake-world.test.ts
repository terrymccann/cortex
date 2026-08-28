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
    const marcus = { type: "cortex:agent" as const, id: asEntityId("marcus") };
    world.setEntity({ ref: marcus, exists: true, alive: false, accessible: true });
    world.registerConstraintEvaluator({
      definitionId: "test:entity-alive",
      definitionVersion: 1,
      evaluate: (constraint, resolve) =>
        constraint.subject !== undefined && resolve(constraint.subject)?.alive === true
    });
    const command: ActionCommand = {
      id: asActionId("action-1"),
      agentId: asAgentId("elena"),
      decisionId: asDecisionId("decision-1"),
      actionType: "RESPOND_TO_INVITATION",
      arguments: { response: "pretend-to-accept" },
      preconditions: [
        {
          definitionId: "test:entity-alive",
          definitionVersion: 1,
          subject: marcus,
          parameters: {}
        }
      ],
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

  it("fails closed when no evaluator owns a constraint definition", async () => {
    const world = new FakeWorld();
    const constraint = {
      definitionId: "test:unknown-constraint" as const,
      definitionVersion: 1,
      parameters: {}
    };

    expect(await world.validateConstraints([constraint])).toEqual({
      valid: false,
      failed: [constraint]
    });
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
