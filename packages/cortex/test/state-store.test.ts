import {
  asAgentId,
  asDecisionId,
  asEntityId,
  asEventId,
  asSimTime
} from "@cortex/contracts";
import { describe, expect, it } from "vitest";
import { type PatchEnvelope } from "../src/patches.js";
import { createAgentState } from "../src/state.js";
import {
  InMemoryAgentStateStore,
  type StateSliceReducer
} from "../src/state-store.js";
import {
  sliceValue,
  socialPack,
  STANDARD_SLICE_IDS,
  type SocialState
} from "../../standard-packs/src/index.js";

const elena = asAgentId("elena");
const marcus = asAgentId("marcus");

const createStore = async (): Promise<InMemoryAgentStateStore> => {
  const store = new InMemoryAgentStateStore();
  await store.register(createAgentState({ id: elena, identity: { name: "Elena" } }, asSimTime(0)));
  return store;
};

describe("InMemoryAgentStateStore", () => {
  it("enforces module patch ownership", async () => {
    const store = await createStore();
    const result = await store.apply({
      patchId: "bad-owner",
      agentId: elena,
      module: "memory",
      basedOnVersion: 0,
      worldVersion: 1,
      observedThroughSequence: 1,
      triggeredBy: [asEventId("event-1")],
      idempotencyKey: "bad-owner",
      rebasePolicy: "never",
      createdAt: asSimTime(1),
      patch: { kind: "action-awareness", expectations: [] }
    });

    expect(result).toEqual({ status: "rejected", reason: "module-ownership" });
    expect((await store.snapshot(elena)).version).toBe(0);
  });

  it("rejects stale controller decisions", async () => {
    const store = await createStore();
    const decisionPatch: PatchEnvelope = {
      patchId: "decision-1",
      agentId: elena,
      module: "controller",
      basedOnVersion: 0,
      worldVersion: 1,
      observedThroughSequence: 1,
      triggeredBy: [],
      idempotencyKey: "decision-1",
      rebasePolicy: "never",
      createdAt: asSimTime(2),
      patch: {
        kind: "decision",
        decision: {
          id: asDecisionId("decision-1"),
          agentId: elena,
          intentionId: "pretend-to-accept",
          objective: "gather evidence",
          commitment: 0.9,
          reasonCode: "protect-council",
          committedAt: asSimTime(2),
          basedOnVersion: 0
        }
      }
    };

    await store.apply({
      patchId: "perception-1",
      agentId: elena,
      module: "perception",
      basedOnVersion: 0,
      worldVersion: 1,
      observedThroughSequence: 1,
      triggeredBy: [asEventId("event-1")],
      idempotencyKey: "perception-1",
      rebasePolicy: "event-delta",
      createdAt: asSimTime(1),
      patch: {
        kind: "perception",
        observations: [{ eventId: asEventId("event-1"), observedAt: asSimTime(1), facts: [] }]
      }
    });

    expect(await store.apply(decisionPatch)).toEqual({ status: "rejected", reason: "stale-version" });
    expect((await store.snapshot(elena)).currentDecision).toBeUndefined();
  });

  it("applies an event delta exactly once on a newer state", async () => {
    const store = new InMemoryAgentStateStore(socialPack.stateSlices);
    await store.register(
      createAgentState(
        {
          id: elena,
          identity: { name: "Elena" },
          slices: {
            [STANDARD_SLICE_IDS.social]: { schemaVersion: 1, value: { relationships: [] } }
          }
        },
        asSimTime(0)
      )
    );
    await store.apply({
      patchId: "advance",
      agentId: elena,
      module: "perception",
      basedOnVersion: 0,
      worldVersion: 1,
      observedThroughSequence: 1,
      triggeredBy: [],
      idempotencyKey: "advance",
      rebasePolicy: "never",
      createdAt: asSimTime(1),
      patch: {
        kind: "perception",
        observations: [{ eventId: asEventId("event-1"), observedAt: asSimTime(1), facts: [] }]
      }
    });

    const socialPatch: PatchEnvelope = {
      patchId: "social-event-1",
      agentId: elena,
      module: "cortex-social:awareness",
      basedOnVersion: 0,
      worldVersion: 1,
      observedThroughSequence: 1,
      triggeredBy: [asEventId("event-1")],
      idempotencyKey: "social:event-1:elena",
      rebasePolicy: "event-delta",
      createdAt: asSimTime(2),
      patch: {
        kind: "state-slice",
        sliceId: STANDARD_SLICE_IDS.social,
        operation: { deltas: [{ target: marcus, trust: -12, resentment: 8 }] }
      }
    };

    expect((await store.apply(socialPatch)).status).toBe("applied");
    expect((await store.apply(socialPatch)).status).toBe("duplicate");
    expect(
      (
        await store.apply({
          ...socialPatch,
          patchId: "social-event-1-with-different-id",
          idempotencyKey: "different-key-for-same-event"
        })
      ).status
    ).toBe("duplicate");
    expect(
      sliceValue<SocialState>(await store.snapshot(elena), STANDARD_SLICE_IDS.social).relationships
    ).toContainEqual({
      target: marcus,
      trust: -12,
      affection: 0,
      respect: 0,
      fear: 0,
      attraction: 0,
      resentment: 8,
      familiarity: 0
    });
  });

  it("validates bounded controller commitment", async () => {
    const store = await createStore();
    const result = await store.apply({
      patchId: "invalid-decision",
      agentId: elena,
      module: "controller",
      basedOnVersion: 0,
      worldVersion: 1,
      observedThroughSequence: 1,
      triggeredBy: [],
      idempotencyKey: "invalid-decision",
      rebasePolicy: "never",
      createdAt: asSimTime(1),
      patch: {
        kind: "decision",
        decision: {
          id: asDecisionId("invalid-decision"),
          agentId: elena,
          intentionId: "invent-reality",
          objective: "invalid",
          commitment: 1.5,
          reasonCode: "invalid",
          committedAt: asSimTime(1),
          basedOnVersion: 0
        }
      }
    });
    expect(result).toEqual({ status: "rejected", reason: "invalid-value" });
  });

  it("rejects malformed controller obligations", async () => {
    const store = await createStore();
    const decisionId = asDecisionId("decision-with-invalid-obligation");
    const result = await store.apply({
      patchId: "invalid-obligation",
      agentId: elena,
      module: "controller",
      basedOnVersion: 0,
      worldVersion: 1,
      observedThroughSequence: 1,
      triggeredBy: [],
      idempotencyKey: "invalid-obligation",
      rebasePolicy: "never",
      createdAt: asSimTime(1),
      patch: {
        kind: "decision",
        decision: {
          id: decisionId,
          agentId: elena,
          intentionId: "mark",
          objective: "Transmit intelligence",
          commitment: 1,
          reasonCode: "goal-alignment",
          committedAt: asSimTime(1),
          basedOnVersion: 0
        },
        activeObligations: [
          {
            id: "obligation:invalid",
            sourceDecisionId: decisionId,
            requiredIntentionIds: [],
            remainingDecisionCycles: 0,
            reason: ""
          }
        ]
      }
    });

    expect(result).toEqual({ status: "rejected", reason: "invalid-value" });
    expect((await store.snapshot(elena)).activeObligations).toEqual([]);
  });
});

describe("versioned state-slice ownership", () => {
  const reducer: StateSliceReducer = {
    sliceId: "test:counter",
    schemaVersion: 2,
    writerModules: ["test:counter-writer"],
    initialState: () => ({ value: 0 }),
    validate: (value) =>
      typeof value === "object" &&
      value !== null &&
      typeof (value as { value?: unknown }).value === "number",
    reduce: (current, operation) => ({
      value:
        (current as { value: number }).value +
        (operation as { increment: number }).increment
    })
  };

  it("stores slice schema metadata and rejects undeclared writers", async () => {
    const store = new InMemoryAgentStateStore([reducer]);
    await store.register(
      createAgentState(
        {
          id: elena,
          identity: { name: "Elena" },
          slices: { "test:counter": { schemaVersion: 2, value: { value: 1 } } }
        },
        asSimTime(0)
      )
    );
    const envelope = {
      patchId: "counter-1",
      agentId: elena,
      module: "test:counter-writer",
      basedOnVersion: 0,
      worldVersion: 0,
      observedThroughSequence: 0,
      triggeredBy: [],
      idempotencyKey: "counter-1",
      rebasePolicy: "never" as const,
      createdAt: asSimTime(1),
      patch: {
        kind: "state-slice" as const,
        sliceId: "test:counter",
        operation: { increment: 2 }
      }
    };

    expect(await store.apply({ ...envelope, module: "test:intruder" })).toEqual({
      status: "rejected",
      reason: "state-slice-ownership"
    });
    expect(await store.apply(envelope)).toEqual({ status: "applied", stateVersion: 1 });
    expect((await store.snapshot(elena)).slices["test:counter"]).toEqual({
      schemaVersion: 2,
      value: { value: 3 }
    });
  });

  it("rejects incompatible initial slice schemas", async () => {
    const store = new InMemoryAgentStateStore([reducer]);
    await expect(
      store.register(
        createAgentState(
          {
            id: elena,
            identity: { name: "Elena" },
            slices: { "test:counter": { schemaVersion: 1, value: { value: 0 } } }
          },
          asSimTime(0)
        )
      )
    ).rejects.toThrow("State-slice schema mismatch");
  });
});
