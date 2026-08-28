import {
  asActionId,
  type ActionCommand,
  type ActionSubmission,
  type CortexWorldPort,
  type ExpectedEffect,
  type FeasibleIntention,
  type SimTime,
  type WorldConstraint
} from "@cortex/contracts";
import type { PatchEnvelope } from "./patches.js";
import type { CommittedDecision } from "./state.js";
import type { AgentStateStore, PatchApplyResult } from "./state-store.js";

export interface CommunicationOutput {
  readonly decisionId: string;
  readonly speechAct: string;
  readonly utterance: string;
}

export interface CommunicationRenderer {
  render(decision: CommittedDecision, intention: FeasibleIntention): CommunicationOutput;
}

export class CommunicationModule {
  constructor(
    private readonly stateStore: AgentStateStore,
    private readonly renderer: CommunicationRenderer
  ) {}

  async communicate(
    decision: CommittedDecision,
    intention: FeasibleIntention,
    now: SimTime
  ): Promise<{ output: CommunicationOutput; applyResult: PatchApplyResult }> {
    const state = await this.stateStore.snapshot(decision.agentId);
    const output = this.renderer.render(decision, intention);
    if (state.currentDecision?.id !== decision.id) {
      return {
        output,
        applyResult: { status: "rejected", reason: "decision-not-current" }
      };
    }
    const patch: PatchEnvelope = {
      patchId: `communication:${decision.id}`,
      agentId: state.id,
      module: "communication",
      basedOnVersion: state.version,
      worldVersion: 0,
      observedThroughSequence: 0,
      triggeredBy: [],
      idempotencyKey: `communication:${decision.id}`,
      rebasePolicy: "never",
      createdAt: now,
      patch: { kind: "communication", ...output }
    };
    return { output, applyResult: await this.stateStore.apply(patch) };
  }

}

export interface SkillDefinition {
  readonly intentionKind: string;
  readonly actionType: string;
  buildArguments(intention: FeasibleIntention, decision: CommittedDecision): Readonly<Record<string, unknown>>;
  buildPreconditions(intention: FeasibleIntention): readonly WorldConstraint[];
  buildExpectedEffects(intention: FeasibleIntention, now: SimTime): readonly ExpectedEffect[];
}

export class SkillExecutor {
  readonly #skills = new Map<string, SkillDefinition>();

  constructor(
    private readonly world: CortexWorldPort,
    private readonly stateStore: AgentStateStore,
    skills: readonly SkillDefinition[]
  ) {
    for (const skill of skills) this.#skills.set(skill.intentionKind, skill);
  }

  async execute(
    decision: CommittedDecision,
    intention: FeasibleIntention,
    now: SimTime
  ): Promise<{ command: ActionCommand; submission: ActionSubmission }> {
    const skill = this.#skills.get(intention.kind);
    if (!skill) throw new Error(`No skill registered for intention: ${intention.kind}`);
    const command: ActionCommand = {
      id: asActionId(`action:${decision.id}`),
      agentId: decision.agentId,
      decisionId: decision.id,
      actionType: skill.actionType,
      arguments: skill.buildArguments(intention, decision),
      preconditions: skill.buildPreconditions(intention),
      expectedEffects: skill.buildExpectedEffects(intention, now),
      issuedAt: now
    };
    const state = await this.stateStore.snapshot(decision.agentId);
    if (state.currentDecision?.id !== decision.id) {
      return {
        command,
        submission: {
          status: "rejected",
          actionId: command.id,
          reason: "decision-not-current"
        }
      };
    }
    return { command, submission: await this.world.submitAction(command) };
  }
}
