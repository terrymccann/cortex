import {
  asAgentId,
  asEntityId,
  asEventId,
  asSimTime,
  type PerceptibleWorldEvent
} from "@cortex/contracts";
import { describe, expect, it } from "vitest";
import { CortexKernel } from "../src/kernel.js";
import { InMemoryAgentStateStore } from "../src/state-store.js";

describe("CortexKernel", () => {
  it("ingests only observer-specific events and remains idempotent", async () => {
    const elena = asAgentId("elena");
    const marcus = asAgentId("marcus");
    const store = new InMemoryAgentStateStore();
    const kernel = new CortexKernel(store);
    await kernel.registerAgent({ id: elena, identity: { name: "Elena" } }, asSimTime(0));
    await kernel.registerAgent({ id: marcus, identity: { name: "Marcus" } }, asSimTime(0));

    const event: PerceptibleWorldEvent = {
      observer: elena,
      channel: "heard",
      clarity: 1,
      observedFacts: [
        {
          subject: { kind: "agent", id: asEntityId("marcus") },
          predicate: "invited_to_conspiracy",
          object: { invitee: "elena" },
          confidence: 1
        }
      ],
      event: {
        id: asEventId("invitation-1"),
        sequence: 1,
        worldVersion: 1,
        simTime: asSimTime(10),
        type: "CONSPIRACY_INVITATION",
        targets: [{ kind: "agent", id: asEntityId("elena") }],
        payload: {}
      }
    };

    expect((await kernel.ingest(event)).status).toBe("applied");
    expect((await kernel.ingest(event)).status).toBe("duplicate");
    expect((await store.snapshot(elena)).perception).toHaveLength(1);
    expect((await store.snapshot(marcus)).perception).toHaveLength(0);
  });
});

