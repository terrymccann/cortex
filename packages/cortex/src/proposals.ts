import {
  CORTEX_ACTION_PROPOSAL_SCHEMA_V1,
  CORTEX_AUTHORITATIVE_ACTION_OUTCOME_SCHEMA_V1,
  CORTEX_PROPOSAL_DISPOSITION_SCHEMA_V1,
  assertActionProposal,
  assertAuthoritativeActionOutcome,
  assertProposalDisposition,
  fingerprintArtifact,
  type ActionCommand,
  type ActionProposalV1,
  type ActionSubmission,
  type AuthoritativeActionOutcomeV1,
  type CortexWorldPort,
  type NamespacedId,
  type ProposalDispositionV1,
  type SimTime,
  type WorldSessionId
} from "@cortex/contracts";
import type { ArtifactRepository } from "./repositories.js";

export interface ProposalLifecycle {
  propose(proposal: ActionProposalV1): Promise<void>;
  submit(disposition: ProposalDispositionV1): Promise<void>;
  resolve(outcome: AuthoritativeActionOutcomeV1): Promise<void>;
  proposals(): Promise<readonly ActionProposalV1[]>;
  submissions(): Promise<readonly ProposalDispositionV1[]>;
  outcomes(): Promise<readonly AuthoritativeActionOutcomeV1[]>;
}

export class RepositoryProposalLifecycle implements ProposalLifecycle {
  constructor(private readonly artifacts: ArtifactRepository) {}

  async propose(proposal: ActionProposalV1): Promise<void> {
    assertActionProposal(proposal);
    await this.artifacts.put({
      artifactId: proposal.proposalId,
      kind: "action-proposal",
      schemaVersion: proposal.schemaVersion,
      content: proposal,
      fingerprint: fingerprintArtifact(proposal),
      createdAt: proposal.issuedAt
    });
  }

  async submit(disposition: ProposalDispositionV1): Promise<void> {
    assertProposalDisposition(disposition);
    const proposal = await this.artifacts.get<ActionProposalV1>(disposition.proposalId);
    if (!proposal || proposal.kind !== "action-proposal") throw new Error(`Unknown action proposal: ${disposition.proposalId}`);
    const existing = (await this.submissions()).find((item) => item.proposalId === disposition.proposalId);
    if (existing && existing.submissionId !== disposition.submissionId) throw new Error(`Action proposal already submitted: ${disposition.proposalId}`);
    await this.artifacts.put({
      artifactId: disposition.submissionId,
      kind: "proposal-disposition",
      schemaVersion: disposition.schemaVersion,
      content: disposition,
      fingerprint: fingerprintArtifact(disposition),
      createdAt: disposition.submittedAt
    });
  }

  async resolve(outcome: AuthoritativeActionOutcomeV1): Promise<void> {
    assertAuthoritativeActionOutcome(outcome);
    const submission = await this.artifacts.get<ProposalDispositionV1>(outcome.submissionId);
    if (!submission || submission.kind !== "proposal-disposition" || submission.content.status !== "accepted" || submission.content.proposalId !== outcome.proposalId) {
      throw new Error(`Outcome has no accepted host submission: ${outcome.outcomeId}`);
    }
    const existing = (await this.outcomes()).find((item) => item.proposalId === outcome.proposalId);
    if (existing && existing.outcomeId !== outcome.outcomeId) throw new Error(`Action proposal already resolved: ${outcome.proposalId}`);
    await this.artifacts.put({
      artifactId: outcome.outcomeId,
      kind: "authoritative-action-outcome",
      schemaVersion: outcome.schemaVersion,
      content: outcome,
      fingerprint: fingerprintArtifact(outcome),
      createdAt: outcome.observedAt
    });
  }

  async proposals(): Promise<readonly ActionProposalV1[]> {
    return (await this.artifacts.list("action-proposal")).map((record) => structuredClone(record.content as ActionProposalV1));
  }

  async submissions(): Promise<readonly ProposalDispositionV1[]> {
    return (await this.artifacts.list("proposal-disposition")).map((record) => structuredClone(record.content as ProposalDispositionV1));
  }

  async outcomes(): Promise<readonly AuthoritativeActionOutcomeV1[]> {
    return (await this.artifacts.list("authoritative-action-outcome")).map((record) => structuredClone(record.content as AuthoritativeActionOutcomeV1));
  }
}

export interface ProposalFirstHostPort {
  submit(proposal: ActionProposalV1): Promise<ProposalDispositionV1>;
}

export interface DirectWorldProposalAdapterOptions {
  readonly sessionId: WorldSessionId;
  readonly capabilityIdForAction: (command: ActionCommand) => NamespacedId;
  readonly actionTypeForCommand: (command: ActionCommand) => NamespacedId;
  readonly worldVersion: () => number;
}

/** Adapts the legacy in-process world callback to the proposal-first lifecycle. */
export class CortexWorldPortProposalAdapter implements ProposalFirstHostPort {
  constructor(
    private readonly world: CortexWorldPort,
    private readonly lifecycle: ProposalLifecycle,
    private readonly options: DirectWorldProposalAdapterOptions
  ) {}

  async submit(proposal: ActionProposalV1): Promise<ProposalDispositionV1> {
    assertActionProposal(proposal);
    await this.lifecycle.propose(proposal);
    const command: ActionCommand = {
      id: proposal.actionId,
      agentId: proposal.agentId,
      decisionId: proposal.decisionId,
      actionType: proposal.actionType,
      arguments: proposal.arguments,
      preconditions: proposal.constraints,
      expectedEffects: proposal.expectedEffects,
      issuedAt: proposal.issuedAt
    };
    const legacy = await this.world.submitAction(command);
    const disposition = dispositionFromLegacy(proposal, legacy, this.options.worldVersion());
    await this.lifecycle.submit(disposition);
    return disposition;
  }

  proposalFromCommand(command: ActionCommand): ActionProposalV1 {
    return {
      schemaVersion: CORTEX_ACTION_PROPOSAL_SCHEMA_V1,
      proposalId: `proposal:${command.id}` as NamespacedId,
      sessionId: this.options.sessionId,
      agentId: command.agentId,
      decisionId: command.decisionId,
      actionId: command.id,
      capabilityId: this.options.capabilityIdForAction(command),
      actionType: this.options.actionTypeForCommand(command),
      arguments: structuredClone(command.arguments),
      constraints: structuredClone(command.preconditions),
      expectedEffects: structuredClone(command.expectedEffects),
      basedOnWorldVersion: this.options.worldVersion(),
      issuedAt: command.issuedAt
    };
  }
}

export const dispositionFromLegacy = (
  proposal: ActionProposalV1,
  legacy: ActionSubmission,
  hostWorldVersion: number
): ProposalDispositionV1 => {
  const reason = legacy.status === "accepted" ? undefined : normalizeLegacyReason(legacy.reason);
  return {
    schemaVersion: CORTEX_PROPOSAL_DISPOSITION_SCHEMA_V1,
    submissionId: `submission:${proposal.proposalId.split(":").slice(1).join("-")}`,
    proposalId: proposal.proposalId,
    status: legacy.status,
    ...(reason === undefined ? {} : { reasonCode: reason }),
    hostWorldVersion,
    submittedAt: proposal.issuedAt
  };
};

export const authoritativeOutcome = (input: Omit<AuthoritativeActionOutcomeV1, "schemaVersion">): AuthoritativeActionOutcomeV1 => {
  const outcome = { schemaVersion: CORTEX_AUTHORITATIVE_ACTION_OUTCOME_SCHEMA_V1, ...structuredClone(input) };
  assertAuthoritativeActionOutcome(outcome);
  return outcome;
};

const normalizeLegacyReason = (reason: string): NamespacedId => {
  const value = reason.toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 72);
  return `host:reason-${value.length === 0 ? "unspecified" : value}`;
};
