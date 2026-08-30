import {
  CORTEX_WORLD_SESSION_SCHEMA_V1,
  assertWorldSessionCheckpoint,
  assertRuntimeIdentitySet,
  assertWorldProject,
  assertWorldRunBundle,
  assertWorldSession,
  fingerprintArtifact,
  type RuntimeIdentitySet,
  type SimTime,
  type WorldProjectV1,
  type WorldRunBundleV1,
  type WorldSessionBudgetPolicyV1,
  type WorldSessionCheckpointV1,
  type WorldSessionId,
  type WorldSessionV1
} from "@cortex/contracts";
import {
  InMemoryAgentStateRepository,
  InMemoryArtifactRepository,
  InMemoryCognitiveJobRepository,
  InMemoryRunRepository,
  InMemoryWorldSessionRepository,
  SystemLeaseClock,
  type AgentStateRepository,
  type ArtifactRepository,
  type CognitiveJobRepository,
  type LeaseClock,
  type RunRepository,
  type WorldSessionRepository
} from "./repositories.js";
import { RepositoryProposalLifecycle, type ProposalLifecycle } from "./proposals.js";
import {
  HeadlessWorldSession,
  createInitialWorldSessionState,
  type WorldSessionCognitionProvider
} from "./world-session.js";

export interface CortexRuntimeRepositories {
  readonly agentStates: AgentStateRepository;
  readonly worldSessions: WorldSessionRepository;
  readonly cognitiveJobs: CognitiveJobRepository;
  readonly runs: RunRepository;
  readonly artifacts: ArtifactRepository;
}

export interface CortexRuntimeConfig {
  readonly identities: RuntimeIdentitySet;
  readonly repositories?: Partial<CortexRuntimeRepositories>;
  readonly leaseClock?: LeaseClock;
}

export interface CreateWorldSessionRequest {
  readonly sessionId: WorldSessionId;
  readonly project: WorldProjectV1;
  readonly seed: number;
  readonly createdAt: SimTime;
  readonly agentIds?: WorldSessionV1["agentIds"];
  readonly parentSessionId?: WorldSessionId;
  readonly budgets?: WorldSessionBudgetPolicyV1;
}

export interface WorldInspection {
  readonly session: WorldSessionV1;
  readonly proposalCount: number;
  readonly submissionCount: number;
  readonly outcomeCount: number;
}

export interface ReplayResult {
  readonly matched: true;
  readonly runId: WorldRunBundleV1["runId"];
  readonly acceptedCognition: WorldRunBundleV1["acceptedCognition"];
  readonly finalStateFingerprint: WorldRunBundleV1["finalStateFingerprint"];
  readonly modelCalls: 0;
  readonly restoredState: WorldRunBundleV1["runtimeState"];
}

export interface CortexRuntime {
  readonly repositories: CortexRuntimeRepositories;
  readonly proposalLifecycle: ProposalLifecycle;
  readonly leaseClock: LeaseClock;
  createSession(request: CreateWorldSessionRequest): Promise<WorldSessionV1>;
  createHeadlessSession(request: CreateWorldSessionRequest, provider: WorldSessionCognitionProvider): Promise<HeadlessWorldSession>;
  openSession(sessionId: WorldSessionId, provider: WorldSessionCognitionProvider): Promise<HeadlessWorldSession>;
  branchSession(checkpoint: WorldSessionCheckpointV1, sessionId: WorldSessionId, provider: WorldSessionCognitionProvider, createdAt?: SimTime): Promise<HeadlessWorldSession>;
  restoreSession(session: WorldSessionV1): Promise<WorldSessionV1>;
  inspectSession(sessionId: WorldSessionId): Promise<WorldInspection>;
  replay(bundle: WorldRunBundleV1): Promise<ReplayResult>;
}

class ReferenceCortexRuntime implements CortexRuntime {
  readonly repositories: CortexRuntimeRepositories;
  readonly proposalLifecycle: ProposalLifecycle;
  readonly leaseClock: LeaseClock;

  constructor(private readonly config: CortexRuntimeConfig) {
    assertRuntimeIdentitySet(config.identities);
    this.repositories = {
      agentStates: config.repositories?.agentStates ?? new InMemoryAgentStateRepository(),
      worldSessions: config.repositories?.worldSessions ?? new InMemoryWorldSessionRepository(),
      cognitiveJobs: config.repositories?.cognitiveJobs ?? new InMemoryCognitiveJobRepository(),
      runs: config.repositories?.runs ?? new InMemoryRunRepository(),
      artifacts: config.repositories?.artifacts ?? new InMemoryArtifactRepository()
    };
    this.proposalLifecycle = new RepositoryProposalLifecycle(this.repositories.artifacts);
    this.leaseClock = config.leaseClock ?? new SystemLeaseClock();
  }

  async createSession(request: CreateWorldSessionRequest): Promise<WorldSessionV1> {
    assertWorldProject(request.project);
    if (request.project.compatibilityFingerprint !== this.config.identities.fingerprint) throw new Error("World project compatibility mismatch");
    const agentIds = structuredClone(request.agentIds ?? request.project.actorIds);
    if (new Set(agentIds).size !== agentIds.length || agentIds.some((agentId) => !request.project.actorIds.includes(agentId))) {
      throw new Error("World session agents must be unique actors registered by the project");
    }
    const session: WorldSessionV1 = {
      schemaVersion: CORTEX_WORLD_SESSION_SCHEMA_V1,
      sessionId: request.sessionId,
      projectId: request.project.projectId,
      projectFingerprint: request.project.contentFingerprint,
      lifecycle: "ready",
      seed: request.seed,
      createdAt: request.createdAt,
      updatedAt: request.createdAt,
      worldVersion: 0,
      observedThroughSequence: 0,
      agentIds,
      compatibilityFingerprint: this.config.identities.fingerprint,
      ...(request.parentSessionId === undefined ? {} : { parentSessionId: request.parentSessionId })
    };
    await this.repositories.artifacts.put({
      artifactId: request.project.projectId,
      kind: "world-project",
      schemaVersion: request.project.schemaVersion,
      content: request.project,
      fingerprint: fingerprintArtifact(request.project),
      createdAt: request.createdAt
    });
    await this.repositories.worldSessions.create(session);
    await this.repositories.worldSessions.createState(createInitialWorldSessionState(session, request.budgets));
    return structuredClone(session);
  }

  async createHeadlessSession(request: CreateWorldSessionRequest, provider: WorldSessionCognitionProvider): Promise<HeadlessWorldSession> {
    const session = await this.createSession(request);
    return this.openSession(session.sessionId, provider);
  }

  async openSession(sessionId: WorldSessionId, provider: WorldSessionCognitionProvider): Promise<HeadlessWorldSession> {
    const session = await this.repositories.worldSessions.get(sessionId);
    const state = await this.repositories.worldSessions.getState(sessionId);
    if (!session || !state) throw new Error(`Unknown world session: ${sessionId}`);
    if (session.compatibilityFingerprint !== this.config.identities.fingerprint) throw new Error("World session compatibility mismatch");
    const artifact = await this.repositories.artifacts.get<WorldProjectV1>(session.projectId);
    if (!artifact || artifact.kind !== "world-project") throw new Error(`World project is unavailable: ${session.projectId}`);
    assertWorldProject(artifact.content);
    if (artifact.content.contentFingerprint !== session.projectFingerprint) throw new Error("World session project mismatch");
    return new HeadlessWorldSession(sessionId, {
      project: artifact.content,
      identities: this.config.identities,
      provider,
      sessions: this.repositories.worldSessions,
      agentStates: this.repositories.agentStates,
      artifacts: this.repositories.artifacts,
      runs: this.repositories.runs,
      proposals: this.proposalLifecycle
    });
  }

  async branchSession(
    checkpoint: WorldSessionCheckpointV1,
    sessionId: WorldSessionId,
    provider: WorldSessionCognitionProvider,
    createdAt?: SimTime
  ): Promise<HeadlessWorldSession> {
    assertWorldSessionCheckpoint(checkpoint);
    if (checkpoint.session.compatibilityFingerprint !== this.config.identities.fingerprint) throw new Error("Checkpoint compatibility mismatch");
    const projectArtifact = await this.repositories.artifacts.get<WorldProjectV1>(checkpoint.session.projectId);
    if (!projectArtifact || projectArtifact.kind !== "world-project") throw new Error(`World project is unavailable: ${checkpoint.session.projectId}`);
    const branchTime = createdAt ?? checkpoint.state.simTime;
    const session: WorldSessionV1 = {
      ...checkpoint.session,
      sessionId,
      lifecycle: "paused",
      createdAt: branchTime,
      updatedAt: branchTime,
      parentSessionId: checkpoint.session.sessionId
    };
    const state = {
      ...structuredClone(checkpoint.state),
      sessionId,
      revision: 0,
      simTime: branchTime,
      proposalIds: [],
      submissionIds: [],
      outcomeIds: [],
      checkpointIds: [],
      lineage: { parentSessionId: checkpoint.session.sessionId, parentCheckpointId: checkpoint.checkpointId }
    };
    await this.repositories.worldSessions.create(session);
    await this.repositories.worldSessions.createState(state);
    return this.openSession(sessionId, provider);
  }

  async restoreSession(session: WorldSessionV1): Promise<WorldSessionV1> {
    assertWorldSession(session);
    if (session.compatibilityFingerprint !== this.config.identities.fingerprint) throw new Error("World session compatibility mismatch");
    const current = await this.repositories.worldSessions.get(session.sessionId);
    if (current === undefined) {
      await this.repositories.worldSessions.create(session);
      await this.repositories.worldSessions.createState(createInitialWorldSessionState(session));
    }
    else await this.repositories.worldSessions.save(session, current.updatedAt);
    return structuredClone(session);
  }

  async inspectSession(sessionId: WorldSessionId): Promise<WorldInspection> {
    const session = await this.repositories.worldSessions.get(sessionId);
    if (!session) throw new Error(`Unknown world session: ${sessionId}`);
    const [proposals, submissions, outcomes] = await Promise.all([
      this.proposalLifecycle.proposals(),
      this.proposalLifecycle.submissions(),
      this.proposalLifecycle.outcomes()
    ]);
    return {
      session,
      proposalCount: proposals.filter((item) => item.sessionId === sessionId).length,
      submissionCount: submissions.filter((item) => proposals.some((proposal) => proposal.sessionId === sessionId && proposal.proposalId === item.proposalId)).length,
      outcomeCount: outcomes.filter((item) => proposals.some((proposal) => proposal.sessionId === sessionId && proposal.proposalId === item.proposalId)).length
    };
  }

  async replay(bundle: WorldRunBundleV1): Promise<ReplayResult> {
    assertWorldRunBundle(bundle, this.config.identities);
    if (bundle.runtimeState !== undefined) {
      if (fingerprintArtifact(bundle.runtimeState.observerProjections) !== fingerprintArtifact(bundle.observerProjections) ||
        fingerprintArtifact(bundle.runtimeState.acceptedCognition) !== fingerprintArtifact(bundle.acceptedCognition) ||
        fingerprintArtifact(bundle.runtimeState.providerInvocations) !== fingerprintArtifact(bundle.providerInvocations) ||
        fingerprintArtifact(bundle.runtimeState.proposalIds) !== fingerprintArtifact(bundle.proposals.map((item) => item.proposalId)) ||
        fingerprintArtifact(bundle.runtimeState.submissionIds) !== fingerprintArtifact(bundle.submissions.map((item) => item.submissionId)) ||
        fingerprintArtifact(bundle.runtimeState.outcomeIds) !== fingerprintArtifact(bundle.outcomes.map((item) => item.outcomeId))) {
        throw new Error("World run runtime state does not match its replay ledger");
      }
    }
    await this.repositories.runs.put(bundle);
    return {
      matched: true,
      runId: bundle.runId,
      acceptedCognition: structuredClone(bundle.acceptedCognition),
      finalStateFingerprint: bundle.finalStateFingerprint,
      modelCalls: 0,
      restoredState: structuredClone(bundle.runtimeState)
    };
  }
}

export const createCortexRuntime = (config: CortexRuntimeConfig): CortexRuntime =>
  new ReferenceCortexRuntime(config);
