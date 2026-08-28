import {
  asAgentId,
  asEntityId,
  asEventId,
  asSimTime,
  type PerceptibleWorldEvent
} from "@cortex/contracts";
import { describe, expect, it } from "vitest";
import {
  BoundedController,
  ControllerOutputValidator,
  ControllerReasonerError,
  constrainIntentionsByObligations,
  DecisionGate,
  FrameBuilder,
  MemoryAcceptedDecisionRecorder,
  OrderedIntentionFallbackPolicy,
  ReplayControllerReasoner,
  ReplayMismatchError,
  ScriptedControllerReasoner,
  type ControllerOutput
} from "../src/decision.js";
import { FakeWorld } from "../src/fake-world.js";
import { CortexKernel } from "../src/kernel.js";
import { InMemoryAgentStateStore } from "../src/state-store.js";

const elena = asAgentId("elena");
const marcusRef = { kind: "agent" as const, id: asEntityId("marcus") };

const configureIntentions = (world: FakeWorld): void => {
  world.setFeasibleIntentions(elena, [
    {
      id: "accept",
      kind: "accept",
      description: "Accept the invitation",
      allowedTargets: [marcusRef],
      constraints: []
    },
    {
      id: "reject",
      kind: "reject",
      description: "Reject the invitation",
      allowedTargets: [marcusRef],
      constraints: []
    },
    {
      id: "pretend-to-accept",
      kind: "pretend-to-accept",
      description: "Pretend to accept the invitation",
      allowedTargets: [marcusRef],
      constraints: []
    }
  ]);
};

describe("DecisionGate", () => {
  it("opens for a consequential social conflict but not a routine moment", () => {
    const gate = new DecisionGate();
    expect(
      gate.score({
        consequence: 0.95,
        uncertainty: 0.7,
        novelty: 0.8,
        socialWeight: 0.9,
        conflict: 0.9,
        planFailure: 0,
        narrativeSignificance: 0.8
      }).opened
    ).toBe(true);
    expect(
      gate.score({
        consequence: 0.05,
        uncertainty: 0,
        novelty: 0,
        socialWeight: 0.1,
        conflict: 0,
        planFailure: 0,
        narrativeSignificance: 0
      }).opened
    ).toBe(false);
  });
});

describe("BoundedController", () => {
  it("records only an accepted decision and replays it against the identical frame", async () => {
    const makeRuntime = async () => {
      const store = new InMemoryAgentStateStore();
      const kernel = new CortexKernel(store);
      const world = new FakeWorld();
      configureIntentions(world);
      await kernel.registerAgent({ id: elena, identity: { name: "Elena" } }, asSimTime(0));
      return { store, world };
    };
    const recordedRuntime = await makeRuntime();
    const recorder = new MemoryAcceptedDecisionRecorder();
    const recordingController = new BoundedController(
      recordedRuntime.store,
      recordedRuntime.world,
      new ScriptedControllerReasoner(() => ({
        intentionId: "pretend-to-accept",
        objective: "Gather evidence",
        commitment: 0.9,
        reasonCode: "protect-council"
      })),
      new FrameBuilder(),
      new OrderedIntentionFallbackPolicy(["reject"]),
      { decisionRecorder: recorder }
    );
    const request = {
      agentId: elena,
      situationId: "invitation",
      situation: "Marcus asks Elena to join a conspiracy.",
      now: asSimTime(10)
    };

    const recorded = await recordingController.decide(request);
    const records = recorder.records();
    expect(recorded.status).toBe("committed");
    expect(records).toHaveLength(1);
    expect(records[0]?.output.intentionId).toBe("pretend-to-accept");
    expect(records[0]?.frameHash).toMatch(/^[a-f0-9]{64}$/);

    const replayRuntime = await makeRuntime();
    const replayReasoner = new ReplayControllerReasoner(records);
    const replayController = new BoundedController(
      replayRuntime.store,
      replayRuntime.world,
      replayReasoner
    );
    const replayed = await replayController.decide(request);

    expect(replayed).toEqual(recorded);
    expect(await replayRuntime.store.snapshot(elena)).toEqual(
      await recordedRuntime.store.snapshot(elena)
    );
    expect(replayReasoner.consumedCount()).toBe(1);
    expect(replayReasoner.remainingCount()).toBe(0);
  });

  it("fails replay loudly when the cognitive frame differs", async () => {
    const store = new InMemoryAgentStateStore();
    const kernel = new CortexKernel(store);
    const world = new FakeWorld();
    configureIntentions(world);
    await kernel.registerAgent({ id: elena, identity: { name: "Elena" } }, asSimTime(0));
    const recorder = new MemoryAcceptedDecisionRecorder();
    const controller = new BoundedController(
      store,
      world,
      new ScriptedControllerReasoner(() => ({
        intentionId: "reject",
        objective: "Decline",
        commitment: 1,
        reasonCode: "risk-mitigation"
      })),
      new FrameBuilder(),
      new OrderedIntentionFallbackPolicy(["reject"]),
      { decisionRecorder: recorder }
    );
    await controller.decide({
      agentId: elena,
      situationId: "invitation",
      situation: "Marcus asks Elena to join a conspiracy.",
      now: asSimTime(10)
    });

    const replayStore = new InMemoryAgentStateStore();
    const replayKernel = new CortexKernel(replayStore);
    await replayKernel.registerAgent({ id: elena, identity: { name: "Elena" } }, asSimTime(0));
    const replay = new BoundedController(
      replayStore,
      world,
      new ReplayControllerReasoner(recorder.records()),
      new FrameBuilder(),
      new OrderedIntentionFallbackPolicy(["reject"])
    );

    await expect(
      replay.decide({
        agentId: elena,
        situationId: "invitation",
        situation: "The situation was altered after recording.",
        now: asSimTime(10)
      })
    ).rejects.toBeInstanceOf(ReplayMismatchError);
    expect((await replayStore.snapshot(elena)).currentDecision).toBeUndefined();
  });

  it("uses a deterministic safe fallback for an invented intention", async () => {
    const store = new InMemoryAgentStateStore();
    const kernel = new CortexKernel(store);
    const world = new FakeWorld();
    configureIntentions(world);
    await kernel.registerAgent({ id: elena, identity: { name: "Elena" } }, asSimTime(0));
    const controller = new BoundedController(
      store,
      world,
      new ScriptedControllerReasoner(() => ({
        intentionId: "summon-a-dragon",
        objective: "Invent a solution",
        commitment: 1,
        reasonCode: "hallucinated"
      })),
      new FrameBuilder(),
      new OrderedIntentionFallbackPolicy(["reject"])
    );

    const result = await controller.decide({
      agentId: elena,
      situationId: "invitation",
      situation: "Marcus asks Elena to join a conspiracy.",
      now: asSimTime(10)
    });

    expect(result.status).toBe("committed");
    if (result.status === "committed") {
      expect(result.usedFallback).toBe(true);
      expect(result.intention.kind).toBe("reject");
      expect(result.decision.reasonCode).toBe("fallback-policy");
    }
  });

  it("discards a controller result when state changes while reasoning", async () => {
    const store = new InMemoryAgentStateStore();
    const kernel = new CortexKernel(store);
    const world = new FakeWorld();
    configureIntentions(world);
    await kernel.registerAgent({ id: elena, identity: { name: "Elena" } }, asSimTime(0));

    let resolveOutput: ((output: ControllerOutput) => void) | undefined;
    let markStarted: (() => void) | undefined;
    const started = new Promise<void>((resolve) => {
      markStarted = resolve;
    });
    const pending = new Promise<ControllerOutput>((resolve) => {
      resolveOutput = resolve;
    });
    const recorder = new MemoryAcceptedDecisionRecorder();
    const controller = new BoundedController(
      store,
      world,
      new ScriptedControllerReasoner(() => {
        markStarted?.();
        return pending;
      }),
      new FrameBuilder(),
      new OrderedIntentionFallbackPolicy(["reject"]),
      { decisionRecorder: recorder }
    );

    const deciding = controller.decide({
      agentId: elena,
      situationId: "invitation",
      situation: "Marcus asks Elena to join a conspiracy.",
      now: asSimTime(10)
    });
    await started;

    const changedWorldEvent: PerceptibleWorldEvent = {
      observer: elena,
      channel: "seen",
      clarity: 1,
      observedFacts: [
        { subject: marcusRef, predicate: "alive", object: false, confidence: 1 }
      ],
      event: {
        id: asEventId("marcus-died"),
        sequence: 2,
        worldVersion: 2,
        simTime: asSimTime(11),
        type: "AGENT_DIED",
        targets: [marcusRef],
        payload: {}
      }
    };
    await kernel.ingest(changedWorldEvent);
    resolveOutput?.({
      intentionId: "pretend-to-accept",
      objective: "Gather evidence",
      commitment: 0.9,
      reasonCode: "protect-council"
    });

    const result = await deciding;
    expect(result.status).toBe("stale");
    expect(recorder.records()).toEqual([]);
    expect((await store.snapshot(elena)).currentDecision).toBeUndefined();
  });

  it("does not convert cancelled reasoning into a fallback decision", async () => {
    const store = new InMemoryAgentStateStore();
    const kernel = new CortexKernel(store);
    const world = new FakeWorld();
    configureIntentions(world);
    await kernel.registerAgent({ id: elena, identity: { name: "Elena" } }, asSimTime(0));
    const abortController = new AbortController();
    let markStarted: (() => void) | undefined;
    const started = new Promise<void>((resolve) => {
      markStarted = resolve;
    });
    const controller = new BoundedController(
      store,
      world,
      new ScriptedControllerReasoner((_frame) =>
        new Promise<ControllerOutput>((_resolve, reject) => {
          markStarted?.();
          abortController.signal.addEventListener("abort", () => reject(abortController.signal.reason), {
            once: true
          });
        })
      )
    );

    const deciding = controller.decide({
      agentId: elena,
      situationId: "invitation",
      situation: "Marcus asks Elena to join a conspiracy.",
      now: asSimTime(10),
      signal: abortController.signal
    });
    await started;
    abortController.abort(new Error("world-assumption-invalidated"));

    expect(await deciding).toEqual({ status: "cancelled" });
    expect((await store.snapshot(elena)).currentDecision).toBeUndefined();
  });

  it("enforces a one-cycle follow-up obligation before invoking the reasoner", async () => {
    const store = new InMemoryAgentStateStore();
    const kernel = new CortexKernel(store);
    const world = new FakeWorld();
    world.setFeasibleIntentions(elena, [
      {
        id: "mark",
        kind: "mark",
        description: "Transmit the intelligence",
        allowedTargets: [],
        constraints: [],
        followUpObligations: [
          {
            requiredIntentionIds: ["retreat"],
            withinDecisionCycles: 1,
            reason: "Withdrawal must immediately follow transmission"
          }
        ]
      },
      {
        id: "hide",
        kind: "hide",
        description: "Reduce exposure",
        allowedTargets: [],
        constraints: []
      },
      {
        id: "retreat",
        kind: "retreat",
        description: "Withdraw",
        allowedTargets: [],
        constraints: []
      }
    ]);
    await kernel.registerAgent({ id: elena, identity: { name: "Elena" } }, asSimTime(0));

    const frames: string[][] = [];
    let invocation = 0;
    const controller = new BoundedController(
      store,
      world,
      new ScriptedControllerReasoner((frame) => {
        frames.push(frame.feasibleIntentions.map((intention) => intention.id));
        invocation += 1;
        return invocation === 1
          ? {
              intentionId: "mark",
              objective: "Preserve the intelligence",
              commitment: 0.9,
              reasonCode: "goal-alignment"
            }
          : {
              intentionId: "hide",
              objective: "Choose a locally rational alternative",
              commitment: 0.8,
              reasonCode: "risk-mitigation"
            };
      }),
      new FrameBuilder(),
      new OrderedIntentionFallbackPolicy(["retreat"])
    );

    const first = await controller.decide({
      agentId: elena,
      situationId: "critical",
      situation: "The drone is damaged.",
      now: asSimTime(1)
    });
    expect(first.status).toBe("committed");
    expect((await store.snapshot(elena)).activeObligations).toHaveLength(1);

    const second = await controller.decide({
      agentId: elena,
      situationId: "critical-follow-up",
      situation: "The transmission completed.",
      now: asSimTime(2)
    });

    expect(frames).toEqual([["mark", "hide", "retreat"], ["retreat"]]);
    expect(second.status).toBe("committed");
    if (second.status === "committed") {
      expect(second.intention.id).toBe("retreat");
      expect(second.usedFallback).toBe(true);
      expect(second.fallbackReason).toBe("invalid-output");
      expect(second.enforcedObligationIds).toHaveLength(1);
    }
    expect((await store.snapshot(elena)).activeObligations).toEqual([]);
  });

  it("reports an obligation that the authoritative world cannot currently fulfill", async () => {
    const store = new InMemoryAgentStateStore();
    const kernel = new CortexKernel(store);
    const world = new FakeWorld();
    world.setFeasibleIntentions(elena, [
      {
        id: "mark",
        kind: "mark",
        description: "Transmit the intelligence",
        allowedTargets: [],
        constraints: [],
        followUpObligations: [
          {
            requiredIntentionIds: ["retreat"],
            withinDecisionCycles: 1,
            reason: "Retreat next"
          }
        ]
      }
    ]);
    await kernel.registerAgent({ id: elena, identity: { name: "Elena" } }, asSimTime(0));
    let calls = 0;
    const controller = new BoundedController(
      store,
      world,
      new ScriptedControllerReasoner(() => {
        calls += 1;
        return {
          intentionId: "mark",
          objective: "Preserve the intelligence",
          commitment: 1,
          reasonCode: "goal-alignment"
        };
      })
    );
    await controller.decide({
      agentId: elena,
      situationId: "critical",
      situation: "The drone is damaged.",
      now: asSimTime(1)
    });
    world.setFeasibleIntentions(elena, [
      {
        id: "hide",
        kind: "hide",
        description: "Reduce exposure",
        allowedTargets: [],
        constraints: []
      }
    ]);

    const result = await controller.decide({
      agentId: elena,
      situationId: "blocked",
      situation: "The retreat route is blocked.",
      now: asSimTime(2)
    });

    expect(result.status).toBe("obligation-unfulfillable");
    expect(calls).toBe(1);
  });

  it("retries one explicitly retryable provider failure", async () => {
    const store = new InMemoryAgentStateStore();
    const kernel = new CortexKernel(store);
    const world = new FakeWorld();
    configureIntentions(world);
    await kernel.registerAgent({ id: elena, identity: { name: "Elena" } }, asSimTime(0));
    let calls = 0;
    const controller = new BoundedController(
      store,
      world,
      new ScriptedControllerReasoner(() => {
        calls += 1;
        if (calls === 1) {
          throw new ControllerReasonerError("Provider unavailable", "provider-unavailable", true);
        }
        return {
          intentionId: "reject",
          objective: "Decline the invitation",
          commitment: 0.9,
          reasonCode: "risk-mitigation"
        };
      }),
      new FrameBuilder(),
      new OrderedIntentionFallbackPolicy(["reject"]),
      { maxReasonerAttempts: 2 }
    );

    const result = await controller.decide({
      agentId: elena,
      situationId: "invitation",
      situation: "Marcus asks Elena to join a conspiracy.",
      now: asSimTime(1)
    });

    expect(result.status).toBe("committed");
    if (result.status === "committed") {
      expect(result.reasonerAttempts).toBe(2);
      expect(result.usedFallback).toBe(false);
    }
  });

  it("falls back when the reasoner exceeds its deadline", async () => {
    const store = new InMemoryAgentStateStore();
    const kernel = new CortexKernel(store);
    const world = new FakeWorld();
    configureIntentions(world);
    await kernel.registerAgent({ id: elena, identity: { name: "Elena" } }, asSimTime(0));
    const controller = new BoundedController(
      store,
      world,
      new ScriptedControllerReasoner(() => new Promise<ControllerOutput>(() => undefined)),
      new FrameBuilder(),
      new OrderedIntentionFallbackPolicy(["reject"]),
      { reasoningTimeoutMs: 20 }
    );

    const result = await controller.decide({
      agentId: elena,
      situationId: "invitation",
      situation: "Marcus asks Elena to join a conspiracy.",
      now: asSimTime(1)
    });

    expect(result.status).toBe("committed");
    if (result.status === "committed") {
      expect(result.usedFallback).toBe(true);
      expect(result.fallbackReason).toBe("deadline-exceeded");
      expect(result.intention.kind).toBe("reject");
    }
  });
});

describe("ControllerOutputValidator", () => {
  it("treats provider output as unknown data", () => {
    const validator = new ControllerOutputValidator();
    expect(validator.validate(null, [])).toEqual({ valid: false, issue: "not-an-object" });
    expect(
      validator.validate(
        {
          intentionId: "invented",
          objective: "Mutate the world",
          commitment: 1,
          reasonCode: "hallucinated"
        },
        []
      )
    ).toEqual({ valid: false, issue: "invalid-intention" });
    expect(
      validator.validate(
        {
          intentionId: "reject",
          objective: "Decline",
          commitment: 1,
          reasonCode: "risk-mitigation",
          executableAction: "DELETE_WORLD"
        },
        [
          {
            id: "reject",
            kind: "reject",
            description: "Decline",
            allowedTargets: [],
            constraints: []
          }
        ]
      )
    ).toEqual({ valid: false, issue: "unknown-field" });
  });
});

describe("constrainIntentionsByObligations", () => {
  it("exports the same due-obligation filtering used by the controller", () => {
    const feasible = [
      { id: "hide", kind: "hide", description: "Hide", allowedTargets: [], constraints: [] },
      { id: "retreat", kind: "retreat", description: "Retreat", allowedTargets: [], constraints: [] }
    ];
    const result = constrainIntentionsByObligations(feasible, [
      {
        id: "obligation:test",
        sourceDecisionId: "decision:test" as never,
        requiredIntentionIds: ["retreat"],
        remainingDecisionCycles: 1,
        reason: "Retreat now"
      }
    ]);

    expect(result.eligibleIntentions.map((intention) => intention.id)).toEqual(["retreat"]);
    expect(result.dueObligations.map((obligation) => obligation.id)).toEqual(["obligation:test"]);
  });
});
