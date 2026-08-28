import { asAgentId, asJobId, asSimTime } from "@cortex/contracts";
import { describe, expect, it } from "vitest";
import { InMemoryCognitiveScheduler } from "../src/scheduler.js";

describe("InMemoryCognitiveScheduler", () => {
  it("claims due work by priority and enforces idempotency", () => {
    const scheduler = new InMemoryCognitiveScheduler();
    const agentId = asAgentId("elena");
    const low = {
      id: asJobId("low"),
      agentId,
      module: "memory" as const,
      basedOnVersion: 0,
      triggerEvents: [],
      notBefore: asSimTime(10),
      priority: 1,
      idempotencyKey: "memory:1"
    };
    const high = {
      ...low,
      id: asJobId("high"),
      module: "controller" as const,
      priority: 9,
      idempotencyKey: "controller:1"
    };

    expect(scheduler.schedule(low)).toBe(true);
    expect(scheduler.schedule(low)).toBe(false);
    expect(scheduler.schedule(high)).toBe(true);
    expect(scheduler.claim(asSimTime(9), 10)).toEqual([]);
    expect(scheduler.claim(asSimTime(10), 1)).toEqual([high]);
    expect(scheduler.status(asJobId("high"))).toBe("running");
  });

  it("cancels queued or running stale work", () => {
    const scheduler = new InMemoryCognitiveScheduler();
    const job = {
      id: asJobId("plan"),
      agentId: asAgentId("elena"),
      module: "planner" as const,
      basedOnVersion: 3,
      triggerEvents: [],
      notBefore: asSimTime(0),
      priority: 5,
      idempotencyKey: "plan:3"
    };
    scheduler.schedule(job);
    scheduler.claim(asSimTime(0), 1);

    expect(scheduler.cancel((candidate) => candidate.basedOnVersion === 3)).toBe(1);
    expect(scheduler.status(job.id)).toBe("cancelled");
  });

  it("cancels work that missed its simulation deadline", () => {
    const scheduler = new InMemoryCognitiveScheduler();
    const job = {
      id: asJobId("expired"),
      agentId: asAgentId("elena"),
      module: "controller" as const,
      basedOnVersion: 1,
      triggerEvents: [],
      notBefore: asSimTime(0),
      deadline: asSimTime(5),
      priority: 10,
      idempotencyKey: "expired-controller"
    };
    scheduler.schedule(job);

    expect(scheduler.claim(asSimTime(6), 1)).toEqual([]);
    expect(scheduler.status(job.id)).toBe("cancelled");
  });
});
