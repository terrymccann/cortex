import {
  asAgentId,
  asEntityId,
  asEventId,
  asGoalId,
  asSimTime,
  type PerceptibleWorldEvent
} from "@cortex/contracts";
import { describe, expect, it } from "vitest";
import {
  BoundedController,
  FrameBuilder,
  MemoryAcceptedDecisionRecorder,
  ReplayControllerReasoner,
  ScriptedControllerReasoner,
  type CognitiveFrame
} from "../src/decision.js";
import { SkillExecutor, type SkillDefinition } from "../src/execution.js";
import { FakeWorld } from "../src/fake-world.js";
import { CortexKernel } from "../src/kernel.js";
import {
  ActionAwarenessModule,
  type EffectMatcher
} from "../src/modules.js";
import { InMemoryAgentStateStore } from "../src/state-store.js";
import { PackRegistry } from "../../sdk/src/index.js";
import {
  CommunicationModule,
  conversationPack,
  goalsPack,
  memoryPack,
  MemoryModule,
  sliceState,
  sliceValue,
  socialPack,
  SocialAwarenessModule,
  STANDARD_SLICE_IDS,
  type ConversationState,
  type SocialState
} from "../../standard-packs/src/index.js";

const elena = asAgentId("elena");
const marcus = asAgentId("marcus");
const elenaRef = { type: "cortex:agent" as const, id: asEntityId("elena") };
const marcusRef = { type: "cortex:agent" as const, id: asEntityId("marcus") };

const affirmativeResponseMatcher: EffectMatcher = {
  definitionId: "social:affirmative-response-observed",
  definitionVersion: 1,
  matches: (effect, observation) =>
    observation.observedFacts.some(
      (fact) =>
        fact.subject.type === effect.subject.type &&
        fact.subject.id === effect.subject.id &&
        fact.predicate === effect.parameters["predicate"] &&
        fact.object === effect.parameters["expected"]
    )
};

const responseSkill: SkillDefinition = {
  intentionKind: "pretend-to-accept",
  actionType: "RESPOND_TO_INVITATION",
  buildArguments: () => ({ response: "affirmative" }),
  buildPreconditions: () => [
    {
      definitionId: "social:target-alive",
      definitionVersion: 1,
      subject: marcusRef,
      parameters: {}
    }
  ],
  buildExpectedEffects: (_intention, now) => [
    {
      subject: marcusRef,
      definitionId: "social:affirmative-response-observed",
      definitionVersion: 1,
      parameters: { predicate: "received_affirmative_response", expected: true },
      deadline: asSimTime(Number(now) + 5)
    }
  ]
};

describe("Marcus/Elena grounded vertical slice", () => {
  it("keeps perception, cognition, speech, action, and observed success coherent", async () => {
    const packs = new PackRegistry();
    for (const pack of [memoryPack, socialPack, goalsPack, conversationPack]) packs.register(pack);
    const store = new InMemoryAgentStateStore(packs.stateSliceReducers());
    const world = new FakeWorld();
    const kernel = new CortexKernel(store);
    const memory = new MemoryModule(store);
    const social = new SocialAwarenessModule(store);
    const awareness = new ActionAwarenessModule(store, [affirmativeResponseMatcher]);
    const recorder = new MemoryAcceptedDecisionRecorder();
    let recordedFrame: CognitiveFrame | undefined;

    await kernel.registerAgent(
      {
        id: elena,
        identity: { name: "Elena" },
        resolution: {
          tier: 2,
          reasons: ["conspiracy-invitation"],
          budget: {
            periodEndsAt: asSimTime(100),
            smallModelCallsRemaining: 5,
            reasoningCallsRemaining: 2,
            generatedTokensRemaining: 2000,
            concurrentJobsRemaining: 1
          }
        },
        slices: {
          ...packs.initialSlices(),
          [STANDARD_SLICE_IDS.goals]: sliceState({
            goals: [
              {
                id: asGoalId("protect-council"),
                kind: "protect",
                description: "Protect the council from political violence",
                priority: 0.95,
                status: "active"
              }
            ]
          }),
          [STANDARD_SLICE_IDS.social]: sliceState({
            relationships: [
              {
                target: marcus,
                trust: 18,
                affection: -10,
                respect: 61,
                fear: 20,
                attraction: 0,
                resentment: 42,
                familiarity: 75
              }
            ]
          })
        }
      },
      asSimTime(0)
    );

    world.setEntity({ ref: marcusRef, exists: true, alive: true, accessible: true });
    world.registerConstraintEvaluator({
      definitionId: "social:target-alive",
      definitionVersion: 1,
      evaluate: (constraint, resolve) =>
        constraint.subject !== undefined && resolve(constraint.subject)?.alive === true
    });
    world.allowActionType("RESPOND_TO_INVITATION");
    world.setFeasibleIntentions(elena, [
      {
        id: "accept",
        kind: "accept",
        description: "Accept Marcus's invitation",
        allowedTargets: [marcusRef],
        constraints: []
      },
      {
        id: "reject",
        kind: "reject",
        description: "Reject Marcus's invitation",
        allowedTargets: [marcusRef],
        constraints: []
      },
      {
        id: "report-marcus",
        kind: "report",
        description: "Report Marcus immediately",
        allowedTargets: [marcusRef],
        constraints: []
      },
      {
        id: "pretend-to-accept",
        kind: "pretend-to-accept",
        description: "Pretend to accept while gathering evidence",
        allowedTargets: [marcusRef],
        constraints: []
      }
    ]);

    const invitation: PerceptibleWorldEvent = {
      observer: elena,
      channel: "heard",
      clarity: 1,
      observedFacts: [
        {
          subject: marcusRef,
          predicate: "invited_to_conspiracy",
          object: { invitee: elenaRef.id },
          confidence: 1
        }
      ],
      event: {
        id: asEventId("invitation"),
        sequence: 1,
        worldVersion: 1,
        simTime: asSimTime(10),
        type: "CONSPIRACY_INVITATION",
        actor: marcusRef,
        targets: [elenaRef],
        payload: {}
      }
    };
    expect((await kernel.ingest(invitation)).status).toBe("applied");

    const priorThreat: PerceptibleWorldEvent = {
      observer: elena,
      channel: "seen",
      clarity: 0.9,
      observedFacts: [
        {
          subject: marcusRef,
          predicate: "threatened_council_rival",
          object: true,
          confidence: 0.9
        }
      ],
      event: {
        id: asEventId("prior-threat"),
        sequence: 0,
        worldVersion: 0,
        simTime: asSimTime(5),
        type: "THREAT_OBSERVED",
        actor: marcusRef,
        targets: [],
        payload: {}
      }
    };
    expect((await kernel.ingest(priorThreat)).status).toBe("applied");
    expect(
      (
        await memory.remember({
          agentId: elena,
          sourceEvents: [asEventId("prior-threat")],
          summary: "Marcus threatened a council rival after losing a vote.",
          occurredAt: asSimTime(5),
          importance: 0.85,
          emotionalValence: -0.6,
          confidence: 0.9
        })
      ).status
    ).toBe("applied");
    expect(
      (
        await social.applyInference({
          agentId: elena,
          eventId: invitation.event.id,
          now: invitation.event.simTime,
          target: marcus,
          trustDelta: -12,
          fearDelta: 5,
          resentmentDelta: 8,
          familiarityDelta: 2
        })
      ).status
    ).toBe("applied");

    const controller = new BoundedController(
      store,
      world,
      new ScriptedControllerReasoner((frame) => {
        recordedFrame = frame;
        expect(frame.feasibleIntentions.map((candidate) => candidate.id)).toEqual([
          "accept",
          "reject",
          "report-marcus",
          "pretend-to-accept"
        ]);
        const memorySection = frame.sections.find(
          (section) => section.id === "cortex-memory:relevant"
        );
        expect(
          (memorySection?.value as { summary: string }[] | undefined)?.[0]?.summary
        ).toContain("threatened");
        return {
          intentionId: "pretend-to-accept",
          target: marcusRef,
          objective: "Gather evidence without alerting Marcus",
          commitment: 0.9,
          reasonCode: "protect-council"
        };
      }),
      new FrameBuilder(
        packs.frameContributors(),
        packs.frameManifestFingerprint([
          { kind: "constraint-matcher", id: "social:target-alive", version: "1" },
          { kind: "effect-matcher", id: "social:affirmative-response-observed", version: "1" }
        ]),
        packs.compatibilityComponents([
          { kind: "constraint-matcher", id: "social:target-alive", version: "1" },
          { kind: "effect-matcher", id: "social:affirmative-response-observed", version: "1" }
        ])
      ),
      undefined,
      { decisionRecorder: recorder }
    );
    const result = await controller.decide({
      agentId: elena,
      situationId: "invitation",
      situation: "Marcus privately asks Elena to join a conspiracy against the mayor.",
      sectionInputs: {
        "cortex-social:signals": ["covert-recruitment", "political-pressure"]
      },
      now: asSimTime(11)
    });
    expect(result.status).toBe("committed");
    if (result.status !== "committed") throw new Error("Expected a committed decision");

    const communication = await new CommunicationModule(store, {
      render: (decision, intention) => ({
        decisionId: decision.id,
        speechAct: intention.kind,
        utterance: "I understand. Tell me what you need me to do."
      })
    }).communicate(
      result.decision,
      result.intention,
      asSimTime(12)
    );
    expect(communication.applyResult.status).toBe("applied");

    const execution = await new SkillExecutor(world, store, [responseSkill]).execute(
      result.decision,
      result.intention,
      asSimTime(12)
    );
    expect(execution.submission.status).toBe("accepted");
    expect(execution.command.decisionId).toBe(result.decision.id);
    expect(communication.output.decisionId).toBe(result.decision.id);
    expect(communication.output.speechAct).toBe("pretend-to-accept");
    expect(execution.command.arguments).toEqual({ response: "affirmative" });

    expect(
      (
        await awareness.expect(
          elena,
          {
            actionId: execution.command.id,
            expectedEffects: execution.command.expectedEffects,
            status: "pending",
            resolutionEventIds: []
          },
          asSimTime(12)
        )
      ).status
    ).toBe("applied");

    const outcome: PerceptibleWorldEvent = {
      observer: elena,
      channel: "system",
      clarity: 1,
      observedFacts: [
        {
          subject: marcusRef,
          predicate: "received_affirmative_response",
          object: true,
          confidence: 1
        }
      ],
      event: {
        id: asEventId("response-heard"),
        sequence: 2,
        worldVersion: 2,
        simTime: asSimTime(13),
        type: "RESPONSE_OBSERVED",
        actor: elenaRef,
        targets: [marcusRef],
        payload: {},
        causedBy: execution.command.id
      }
    };
    expect((await kernel.ingest(outcome)).status).toBe("applied");
    expect((await awareness.observe(elena, outcome)).status).toBe("applied");

    const finalState = await store.snapshot(elena);
    expect(finalState.currentDecision?.intentionId).toBe("pretend-to-accept");
    expect(
      sliceValue<ConversationState>(finalState, STANDARD_SLICE_IDS.conversation)
        .lastCommunication?.decisionId
    ).toBe(finalState.currentDecision?.id);
    expect(finalState.expectations).toContainEqual(
      expect.objectContaining({ actionId: execution.command.id, status: "succeeded" })
    );
    expect(sliceValue<SocialState>(finalState, STANDARD_SLICE_IDS.social).relationships[0]).toEqual(
      expect.objectContaining({ target: marcus, trust: 6, fear: 25, resentment: 50 })
    );
    if (recordedFrame === undefined) throw new Error("Expected the social decision frame");
    const replay = new ReplayControllerReasoner(recorder.records());
    await expect(replay.decide(recordedFrame, new AbortController().signal)).resolves.toEqual(
      recorder.records()[0]?.output
    );
    expect(replay.consumedCount()).toBe(1);
  });

  it("marks an unobserved intended effect as failed after its deadline", async () => {
    const store = new InMemoryAgentStateStore();
    const kernel = new CortexKernel(store);
    const awareness = new ActionAwarenessModule(store);
    await kernel.registerAgent({ id: elena, identity: { name: "Elena" } }, asSimTime(0));
    await awareness.expect(
      elena,
      {
        actionId: "interrupted-response",
        expectedEffects: [
          {
            subject: marcusRef,
            definitionId: "social:affirmative-response-observed",
            definitionVersion: 1,
            parameters: { predicate: "received_affirmative_response", expected: true },
            deadline: asSimTime(5)
          }
        ],
        status: "pending",
        resolutionEventIds: []
      },
      asSimTime(1)
    );

    expect((await awareness.expire(elena, asSimTime(6))).status).toBe("applied");
    expect((await store.snapshot(elena)).expectations[0]?.status).toBe("failed");
  });
});
