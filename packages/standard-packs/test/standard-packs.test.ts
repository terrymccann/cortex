import {
  asAgentId,
  asEventId,
  asSimTime
} from "@cortex/contracts";
import {
  FrameBuilder,
  InMemoryAgentStateStore,
  createAgentState
} from "@cortex/runtime";
import { PackRegistry } from "@cortex/sdk";
import { describe, expect, it } from "vitest";
import {
  MemoryModule,
  STANDARD_SLICE_IDS,
  memoryPack,
  sliceState,
  sliceValue,
  socialPack,
  standardPacks,
  traitsPack,
  type MemoryState
} from "../src/index.js";

const agent = asAgentId("pack-agent");

describe("standard cognitive packs", () => {
  it("registers every optional capability through public pack contracts", () => {
    const registry = new PackRegistry();
    for (const pack of standardPacks) registry.register(pack);

    expect(registry.stateSliceReducers()).toHaveLength(standardPacks.length);
    expect(Object.keys(registry.initialSlices()).sort()).toEqual(
      Object.values(STANDARD_SLICE_IDS).sort()
    );
    expect(registry.frameContributors().every((contributor) =>
      contributor.ownerPackId.startsWith("cortex:")
    )).toBe(true);
  });

  it("does not attach social state or sections to an agent with only traits installed", () => {
    const registry = new PackRegistry();
    registry.register(traitsPack);
    const state = createAgentState(
      {
        id: agent,
        identity: { name: "Pack Agent" },
        slices: {
          ...registry.initialSlices(),
          [STANDARD_SLICE_IDS.traits]: sliceState({ personality: { caution: 0.7 } })
        }
      },
      asSimTime(0)
    );
    const frame = new FrameBuilder(
      registry.frameContributors(),
      registry.frameManifestFingerprint()
    ).build({
      state,
      situationId: "test",
      situation: "No social pack is installed.",
      feasibleIntentions: []
    });

    expect(state.slices[STANDARD_SLICE_IDS.social]).toBeUndefined();
    expect(frame.sections.map((section) => section.id)).toEqual(["cortex-traits:profile"]);
  });

  it("routes memory mutation through its owned generic state slice", async () => {
    const store = new InMemoryAgentStateStore(memoryPack.stateSlices);
    await store.register(
      createAgentState(
        {
          id: agent,
          identity: { name: "Pack Agent" },
          slices: { [STANDARD_SLICE_IDS.memory]: sliceState({ memories: [] }) }
        },
        asSimTime(0)
      )
    );
    await store.apply({
      patchId: "perception:event-1",
      agentId: agent,
      module: "perception",
      basedOnVersion: 0,
      worldVersion: 1,
      observedThroughSequence: 1,
      triggeredBy: [asEventId("event-1")],
      idempotencyKey: "perception:event-1",
      rebasePolicy: "event-delta",
      createdAt: asSimTime(1),
      patch: {
        kind: "perception",
        observations: [{ eventId: asEventId("event-1"), observedAt: asSimTime(1), facts: [] }]
      }
    });

    expect(
      await new MemoryModule(store).remember({
        agentId: agent,
        sourceEvents: [asEventId("event-1")],
        summary: "Observed a domain event.",
        occurredAt: asSimTime(2),
        importance: 0.8,
        emotionalValence: 0,
        confidence: 1
      })
    ).toEqual({ status: "applied", stateVersion: 2 });
    expect(
      sliceValue<MemoryState>(await store.snapshot(agent), STANDARD_SLICE_IDS.memory).memories
    ).toHaveLength(1);

    expect(
      await store.apply({
        patchId: "intruder",
        agentId: agent,
        module: "cortex-social:awareness",
        basedOnVersion: 2,
        worldVersion: 1,
        observedThroughSequence: 1,
        triggeredBy: [],
        idempotencyKey: "intruder",
        rebasePolicy: "never",
        createdAt: asSimTime(3),
        patch: {
          kind: "state-slice",
          sliceId: STANDARD_SLICE_IDS.memory,
          operation: { append: [] }
        }
      })
    ).toEqual({ status: "rejected", reason: "state-slice-ownership" });
  });

  it("keeps social ownership isolated from the other standard packs", () => {
    expect(socialPack.stateSlices.map((slice) => slice.sliceId)).toEqual([
      STANDARD_SLICE_IDS.social
    ]);
    expect(socialPack.frameContributors.map((contributor) => contributor.id)).toEqual([
      "cortex-social:relationships",
      "cortex-social:signals"
    ]);
  });
});
