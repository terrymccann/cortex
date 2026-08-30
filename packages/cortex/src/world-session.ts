import {
  CORTEX_WORLD_ACTIVATION_RECORD_SCHEMA_V1,
  CORTEX_WORLD_SESSION_STATE_SCHEMA_V1,
  asSimTime,
  assertActionProposal,
  assertAuthoritativeActionOutcome,
  assertProposalDisposition,
  assertWorldSessionCheckpoint,
  assertWorldSessionRuntimeState,
  createWorldRunBundle,
  createWorldSessionCheckpoint,
  fingerprintArtifact,
  type ActionProposalV1,
  type AgentId,
  type AuthoritativeActionOutcomeV1,
  type NamespacedId,
  type PerceptibleWorldEvent,
  type ProposalDispositionV1,
  type RuntimeIdentitySet,
  type Sha256Fingerprint,
  type SimTime,
  type WorldActivationRecordV1,
  type WorldActivationTriggerV1,
  type WorldProjectV1,
  type WorldRunBundleV1,
  type WorldRunId,
  type WorldSessionBudgetPolicyV1,
  type WorldSessionCheckpointV1,
  type WorldSessionId,
  type WorldSessionRuntimeStateV1,
  type WorldSessionV1
} from "@cortex/contracts";
import type { ProposalLifecycle } from "./proposals.js";
import type {
  AgentStateRepository,
  ArtifactRepository,
  RunRepository,
  WorldSessionRepository
} from "./repositories.js";
import { createAgentState, type AgentSeed, type AgentState } from "./state.js";

export const DEFAULT_WORLD_SESSION_BUDGETS: WorldSessionBudgetPolicyV1 = Object.freeze({
  maximumActivations: 1_000,
  maximumProposals: 1_000,
  maximumProviderCalls: 100,
  maximumNoProgressSteps: 100,
  maximumActivationsPerStep: 8,
  activationCooldown: 0
});

export type WorldSessionProviderMode = "deterministic" | "recorded" | "live";

export interface WorldSessionActivationRequest {
  readonly session: WorldSessionV1;
  readonly sessionRevision: number;
  readonly agentId: AgentId;
  readonly agentState?: Readonly<AgentState>;
  readonly simTime: SimTime;
  readonly worldVersion: number;
  readonly observedThroughSequence: number;
  readonly reasons: readonly NamespacedId[];
  readonly sourceEventIds: readonly PerceptibleWorldEvent["event"]["id"][];
  readonly observerProjections: readonly PerceptibleWorldEvent[];
  readonly legalCapabilityIds: readonly NamespacedId[];
  readonly materialStateFingerprint: Sha256Fingerprint;
}

export interface WorldSessionActivationResult {
  readonly disposition: "no-change" | "proposal" | "state-transition";
  readonly acceptedCognition?: {
    readonly goals?: readonly unknown[];
    readonly plans?: readonly unknown[];
    readonly decisions?: readonly unknown[];
  };
  readonly proposal?: ActionProposalV1;
  readonly frameFingerprint?: Sha256Fingerprint;
  readonly considerationKeys?: readonly string[];
  readonly providerInvocation?: unknown;
}

export interface WorldSessionCognitionProvider {
  readonly mode: WorldSessionProviderMode;
  activate(
    request: WorldSessionActivationRequest,
    signal: AbortSignal
  ): Promise<WorldSessionActivationResult>;
}

export interface WorldSessionStepResult {
  readonly sessionId: WorldSessionId;
  readonly revision: number;
  readonly simTime: SimTime;
  readonly disposition: "progressed" | "idle" | "deferred" | "paused" | "terminal" | "stale";
  readonly activations: readonly WorldActivationRecordV1[];
  readonly proposals: readonly ActionProposalV1[];
}

export interface HeadlessWorldInspection {
  readonly schemaVersion: "cortex-world-inspection-v1";
  readonly session: WorldSessionV1;
  readonly state: WorldSessionRuntimeStateV1;
  readonly observerProjectionCountByAgent: Readonly<Record<string, number>>;
  readonly proposals: readonly ActionProposalV1[];
  readonly submissions: readonly ProposalDispositionV1[];
  readonly outcomes: readonly AuthoritativeActionOutcomeV1[];
  readonly stateFingerprint: Sha256Fingerprint;
}

export interface HeadlessWorldSessionDependencies {
  readonly project: WorldProjectV1;
  readonly identities: RuntimeIdentitySet;
  readonly provider: WorldSessionCognitionProvider;
  readonly sessions: WorldSessionRepository;
  readonly agentStates: AgentStateRepository;
  readonly artifacts: ArtifactRepository;
  readonly runs: RunRepository;
  readonly proposals: ProposalLifecycle;
}

export class HeadlessWorldSession {
  readonly #controllers = new Map<AgentId, AbortController>();

  constructor(
    readonly sessionId: WorldSessionId,
    private readonly dependencies: HeadlessWorldSessionDependencies
  ) {}

  async start(now?: SimTime): Promise<WorldSessionV1> {
    return this.transition(["ready", "paused"], "running", now);
  }

  async pause(now?: SimTime): Promise<WorldSessionV1> {
    this.abortRunning("cortex:session-paused");
    return this.transition(["running"], "paused", now);
  }

  async resume(now?: SimTime): Promise<WorldSessionV1> {
    return this.start(now);
  }

  async stop(now?: SimTime): Promise<WorldSessionV1> {
    this.abortRunning("cortex:session-stopped");
    return this.transition(["ready", "running", "paused"], "stopped", now);
  }

  async complete(now?: SimTime): Promise<WorldSessionV1> {
    this.abortRunning("cortex:session-completed");
    return this.transition(["running", "paused"], "completed", now);
  }

  async registerAgent(seed: AgentSeed, now: SimTime, tier: 0 | 1 | 2 | 3 = 1): Promise<void> {
    const [session, state] = await this.current();
    if (state.actors.some((actor) => actor.agentId === seed.id && actor.status === "active")) {
      try {
        await this.dependencies.agentStates.snapshot(seed.id);
      } catch {
        await this.dependencies.agentStates.register(createAgentState(seed, now));
      }
      return;
    }
    try {
      await this.dependencies.agentStates.register(createAgentState(seed, now));
    } catch (error) {
      if (!(error instanceof Error) || !error.message.startsWith("Agent already registered")) throw error;
    }
    const actors = [
      ...state.actors.filter((actor) => actor.agentId !== seed.id),
      { agentId: seed.id, status: "active" as const, cognitiveTier: tier, lastConsiderationKeys: [] }
    ].sort((left, right) => left.agentId.localeCompare(right.agentId));
    await this.saveState({ ...state, revision: state.revision + 1, simTime: now, actors }, state.revision);
    if (!session.agentIds.includes(seed.id)) {
      await this.dependencies.sessions.save({
        ...session,
        agentIds: [...session.agentIds, seed.id].sort((left, right) => left.localeCompare(right)),
        updatedAt: maximumTime(session.updatedAt, now)
      }, session.updatedAt);
    }
  }

  async retireAgent(agentId: AgentId, now: SimTime): Promise<void> {
    const [, state] = await this.current();
    if (!state.actors.some((actor) => actor.agentId === agentId && actor.status === "active")) throw new Error(`Unknown active session agent: ${agentId}`);
    this.#controllers.get(agentId)?.abort(new Error("Agent retired"));
    await this.saveState({
      ...state,
      revision: state.revision + 1,
      simTime: now,
      actors: state.actors.map((actor) => actor.agentId === agentId ? { ...actor, status: "retired" as const } : actor),
      pendingActivations: state.pendingActivations.filter((trigger) => trigger.agentId !== agentId)
    }, state.revision);
  }

  async ingest(events: readonly PerceptibleWorldEvent[]): Promise<{ readonly accepted: number; readonly duplicate: number }> {
    const [session, state] = await this.current();
    if (terminal(session.lifecycle)) throw new Error(`Cannot ingest into terminal session: ${session.lifecycle}`);
    assertOrderedProjectionBatch(events);
    const active = new Set(state.actors.filter((actor) => actor.status === "active").map((actor) => actor.agentId));
    const existing = new Set(state.observerProjections.map(projectionKey));
    const accepted: PerceptibleWorldEvent[] = [];
    let duplicate = 0;
    for (const event of events) {
      if (!active.has(event.observer)) throw new Error(`Projection observer is not an active session agent: ${event.observer}`);
      if (event.event.sequence < state.observedThroughSequence || event.event.worldVersion < state.worldVersion) throw new Error("Observer projection moved the host ledger backwards");
      const key = projectionKey(event);
      if (existing.has(key)) {
        duplicate += 1;
        continue;
      }
      existing.add(key);
      accepted.push(structuredClone(event));
    }
    if (accepted.length === 0) return { accepted: 0, duplicate };
    const nextWorldVersion = Math.max(state.worldVersion, ...accepted.map((event) => event.event.worldVersion));
    const nextSequence = Math.max(state.observedThroughSequence, ...accepted.map((event) => event.event.sequence));
    const nextTime = asSimTime(Math.max(state.simTime, ...accepted.map((event) => Number(event.event.simTime))));
    const pending = mergeActivationTriggers(state.pendingActivations, accepted, state.actors, nextTime);
    await this.saveState({
      ...state,
      revision: state.revision + 1,
      simTime: nextTime,
      worldVersion: nextWorldVersion,
      observedThroughSequence: nextSequence,
      observerProjections: [...state.observerProjections, ...accepted],
      pendingActivations: pending,
      actors: state.actors.map((actor) => {
        const trigger = pending.find((item) => item.agentId === actor.agentId);
        return trigger === undefined ? actor : { ...actor, lastMaterialStateFingerprint: trigger.materialStateFingerprint };
      })
    }, state.revision);
    await this.dependencies.sessions.save({
      ...session,
      updatedAt: maximumTime(session.updatedAt, nextTime),
      worldVersion: nextWorldVersion,
      observedThroughSequence: nextSequence
    }, session.updatedAt);
    return { accepted: accepted.length, duplicate };
  }

  async notifyWorldRevision(input: {
    readonly worldVersion: number;
    readonly simTime: SimTime;
    readonly materialStateFingerprint: Sha256Fingerprint;
    readonly agentIds?: readonly AgentId[];
  }): Promise<void> {
    const [session, state] = await this.current();
    if (!Number.isInteger(input.worldVersion) || input.worldVersion <= state.worldVersion) throw new Error("Host world revision must advance");
    if (input.simTime < state.simTime) throw new Error("Host world revision moved simulation time backwards");
    const selected = new Set(input.agentIds ?? state.actors.filter((actor) => actor.status === "active").map((actor) => actor.agentId));
    if ([...selected].some((agentId) => !state.actors.some((actor) => actor.agentId === agentId && actor.status === "active"))) {
      throw new Error("Host world revision named an unknown active session agent");
    }
    const triggers = state.actors
      .filter((actor) => actor.status === "active" && selected.has(actor.agentId))
      .map((actor): WorldActivationTriggerV1 => ({
        agentId: actor.agentId,
        reasons: ["cortex:host-revision"],
        sourceEventIds: [],
        materialStateFingerprint: input.materialStateFingerprint,
        worldVersion: input.worldVersion,
        notBefore: input.simTime
      }));
    await this.saveState({
      ...state,
      revision: state.revision + 1,
      simTime: input.simTime,
      worldVersion: input.worldVersion,
      pendingActivations: mergeTriggers(state.pendingActivations, triggers)
    }, state.revision);
    await this.dependencies.sessions.save({ ...session, updatedAt: maximumTime(session.updatedAt, input.simTime), worldVersion: input.worldVersion }, session.updatedAt);
  }

  async step(now: SimTime): Promise<WorldSessionStepResult> {
    const [session, state] = await this.current();
    if (session.lifecycle === "paused") return resultOf(state, now, "paused", [], []);
    if (terminal(session.lifecycle)) return resultOf(state, now, "terminal", [], []);
    if (session.lifecycle !== "running") throw new Error(`World session is not running: ${session.lifecycle}`);
    if (state.usage.activations >= state.budgets.maximumActivations || state.usage.proposals >= state.budgets.maximumProposals ||
      (this.dependencies.provider.mode === "live" && state.usage.providerCalls >= state.budgets.maximumProviderCalls)) {
      await this.setTerminal("budget-exhausted", now);
      return resultOf(state, now, "terminal", [], []);
    }
    const activeById = new Map(state.actors.filter((actor) => actor.status === "active").map((actor) => [actor.agentId, actor]));
    const due = state.pendingActivations
      .filter((trigger) => trigger.notBefore <= now && activeById.has(trigger.agentId))
      .sort((left, right) => left.notBefore - right.notBefore || left.agentId.localeCompare(right.agentId));
    if (due.length === 0) return resultOf(state, now, "idle", [], []);
    const remainingActivations = state.budgets.maximumActivations - state.usage.activations;
    const remainingProviderCalls = this.dependencies.provider.mode === "live"
      ? state.budgets.maximumProviderCalls - state.usage.providerCalls
      : Number.MAX_SAFE_INTEGER;
    const available = due.filter((trigger) => {
      const last = activeById.get(trigger.agentId)?.lastActivatedAt;
      return last === undefined || Number(now) - Number(last) >= state.budgets.activationCooldown;
    }).slice(0, Math.min(state.budgets.maximumActivationsPerStep, remainingActivations, remainingProviderCalls));
    if (available.length === 0) return resultOf(state, now, "deferred", [], []);

    const requests = await Promise.all(available.map(async (trigger) => {
      const controller = new AbortController();
      this.#controllers.set(trigger.agentId, controller);
      let agentState: Readonly<AgentState> | undefined;
      try { agentState = await this.dependencies.agentStates.snapshot(trigger.agentId); } catch { /* Session actors may use an external cognition provider. */ }
      const request: WorldSessionActivationRequest = {
        session,
        sessionRevision: state.revision,
        agentId: trigger.agentId,
        ...(agentState === undefined ? {} : { agentState }),
        simTime: now,
        worldVersion: state.worldVersion,
        observedThroughSequence: state.observedThroughSequence,
        reasons: trigger.reasons,
        sourceEventIds: trigger.sourceEventIds,
        observerProjections: state.observerProjections.filter((event) => event.observer === trigger.agentId),
        legalCapabilityIds: this.dependencies.project.hostAdapter.capabilityIds,
        materialStateFingerprint: trigger.materialStateFingerprint
      };
      try {
        const output = await this.dependencies.provider.activate(request, controller.signal);
        return { trigger, request, output } as const;
      } catch (error) {
        return { trigger, request, error } as const;
      } finally {
        this.#controllers.delete(trigger.agentId);
      }
    }));

    const latest = await this.state();
    const latestSession = await this.session();
    if (latest.revision !== state.revision || latest.worldVersion !== state.worldVersion || latestSession.lifecycle !== "running") {
      const records = requests.map(({ trigger, request }, index) => activationRecord({
        trigger, request, index: state.activationRecords.length + index + 1,
        mode: this.dependencies.provider.mode, disposition: "discarded", reasonCode: "cortex:stale-result"
      }));
      if (latest.revision === state.revision) {
        await this.saveState({
          ...latest,
          revision: latest.revision + 1,
          activationRecords: [...latest.activationRecords, ...records],
          usage: {
            ...latest.usage,
            activations: latest.usage.activations + records.length,
            providerCalls: latest.usage.providerCalls + (this.dependencies.provider.mode === "live" ? records.length : 0),
            recordedProviderUses: latest.usage.recordedProviderUses + (this.dependencies.provider.mode === "recorded" ? records.length : 0)
          }
        }, latest.revision);
      }
      return resultOf(latest, now, "stale", records, []);
    }

    const records: WorldActivationRecordV1[] = [];
    const proposals: ActionProposalV1[] = [];
    const cognition = {
      goals: [...state.acceptedCognition.goals],
      plans: [...state.acceptedCognition.plans],
      decisions: [...state.acceptedCognition.decisions]
    };
    const invocations = [...state.providerInvocations];
    const actors = state.actors.map((actor) => ({ ...actor }));
    let meaningful = 0;
    let remainingProposals = state.budgets.maximumProposals - state.usage.proposals;
    for (let index = 0; index < requests.length; index += 1) {
      const execution = requests[index]!;
      const actorIndex = actors.findIndex((actor) => actor.agentId === execution.trigger.agentId);
      if ("error" in execution) {
        records.push(activationRecord({ trigger: execution.trigger, request: execution.request, index: state.activationRecords.length + index + 1, mode: this.dependencies.provider.mode, disposition: "failed", reasonCode: "cortex:provider-failed" }));
        continue;
      }
      validateActivationResult(execution.output, execution.request, this.dependencies.project);
      if (this.dependencies.provider.mode === "recorded" && execution.output.providerInvocation === undefined) {
        throw new Error("Recorded cognition must include its provider invocation record");
      }
      if (execution.output.providerInvocation !== undefined) invocations.push(structuredClone(execution.output.providerInvocation));
      let proposalAccepted = execution.output.proposal === undefined;
      if (execution.output.proposal !== undefined) {
        if (remainingProposals > 0) {
          await this.dependencies.proposals.propose(execution.output.proposal);
          proposals.push(structuredClone(execution.output.proposal));
          remainingProposals -= 1;
          proposalAccepted = true;
        }
      }
      const accepted = execution.output.acceptedCognition;
      if (accepted && proposalAccepted) {
        cognition.goals.push(...structuredClone(accepted.goals ?? []));
        cognition.plans.push(...structuredClone(accepted.plans ?? []));
        cognition.decisions.push(...structuredClone(accepted.decisions ?? []));
      }
      if (execution.output.disposition !== "no-change" && proposalAccepted) meaningful += 1;
      if (actorIndex >= 0) actors[actorIndex] = {
        ...actors[actorIndex]!,
        lastActivatedAt: now,
        lastConsiderationKeys: structuredClone(execution.output.considerationKeys ?? [])
      };
      records.push(activationRecord({
        trigger: execution.trigger,
        request: execution.request,
        index: state.activationRecords.length + index + 1,
        mode: this.dependencies.provider.mode,
        disposition: proposalAccepted ? execution.output.disposition : "deferred",
        ...(!proposalAccepted ? { reasonCode: "cortex:proposal-budget-exhausted" as const } : {}),
        ...(execution.output.proposal === undefined || !proposalAccepted ? {} : { proposalId: execution.output.proposal.proposalId }),
        ...(execution.output.frameFingerprint === undefined ? {} : { frameFingerprint: execution.output.frameFingerprint })
      }));
    }
    const nextNoProgress = meaningful === 0 ? state.consecutiveNoProgressSteps + 1 : 0;
    const next: WorldSessionRuntimeStateV1 = {
      ...state,
      revision: state.revision + 1,
      simTime: now,
      actors,
      pendingActivations: state.pendingActivations.filter((trigger) => !available.some((selected) => selected.agentId === trigger.agentId)),
      activationRecords: [...state.activationRecords, ...records],
      acceptedCognition: cognition,
      proposalIds: [...state.proposalIds, ...proposals.map((proposal) => proposal.proposalId)],
      providerInvocations: invocations,
      usage: {
        ...state.usage,
        activations: state.usage.activations + records.length,
        proposals: state.usage.proposals + proposals.length,
        providerCalls: state.usage.providerCalls + (this.dependencies.provider.mode === "live" ? records.length : 0),
        recordedProviderUses: state.usage.recordedProviderUses + (this.dependencies.provider.mode === "recorded" ? records.length : 0),
        meaningfulTransitions: state.usage.meaningfulTransitions + meaningful
      },
      consecutiveNoProgressSteps: nextNoProgress
    };
    await this.saveState(next, state.revision);
    if (nextNoProgress >= state.budgets.maximumNoProgressSteps) await this.setTerminal("deadlocked", now);
    return resultOf(next, now, meaningful > 0 ? "progressed" : "deferred", records, proposals);
  }

  async submit(disposition: ProposalDispositionV1): Promise<void> {
    assertProposalDisposition(disposition);
    const state = await this.state();
    if (!state.proposalIds.includes(disposition.proposalId)) throw new Error(`Proposal does not belong to session: ${disposition.proposalId}`);
    await this.dependencies.proposals.submit(disposition);
    await this.saveState({
      ...state,
      revision: state.revision + 1,
      worldVersion: Math.max(state.worldVersion, disposition.hostWorldVersion),
      submissionIds: [...state.submissionIds, disposition.submissionId],
      usage: {
        ...state.usage,
        acceptedSubmissions: state.usage.acceptedSubmissions + (disposition.status === "accepted" ? 1 : 0),
        rejectedSubmissions: state.usage.rejectedSubmissions + (disposition.status === "rejected" ? 1 : 0)
      }
    }, state.revision);
    const session = await this.session();
    if (disposition.hostWorldVersion > session.worldVersion) {
      await this.dependencies.sessions.save({
        ...session,
        worldVersion: disposition.hostWorldVersion,
        updatedAt: maximumTime(session.updatedAt, disposition.submittedAt)
      }, session.updatedAt);
    }
  }

  async recordOutcome(
    outcome: AuthoritativeActionOutcomeV1,
    projections: readonly PerceptibleWorldEvent[]
  ): Promise<void> {
    assertAuthoritativeActionOutcome(outcome);
    const state = await this.state();
    if (!state.submissionIds.includes(outcome.submissionId)) throw new Error(`Outcome submission does not belong to session: ${outcome.submissionId}`);
    const projectionIds = new Set(projections.map((projection) => projection.event.id));
    if (outcome.canonicalEventIds.some((id) => !projectionIds.has(id as never))) throw new Error("Outcome evidence is missing from observer projections");
    await this.dependencies.proposals.resolve(outcome);
    await this.saveState({
      ...state,
      revision: state.revision + 1,
      outcomeIds: [...state.outcomeIds, outcome.outcomeId],
      usage: { ...state.usage, authoritativeOutcomes: state.usage.authoritativeOutcomes + 1 }
    }, state.revision);
    await this.ingest(projections);
  }

  async checkpoint(checkpointId: NamespacedId): Promise<WorldSessionCheckpointV1> {
    const [session, state] = await this.current();
    const stateWithCheckpoint = state.checkpointIds.includes(checkpointId)
      ? state
      : { ...state, revision: state.revision + 1, checkpointIds: [...state.checkpointIds, checkpointId] };
    if (stateWithCheckpoint !== state) await this.saveState(stateWithCheckpoint, state.revision);
    const snapshots: Record<string, unknown> = {};
    for (const actor of stateWithCheckpoint.actors) {
      try { snapshots[actor.agentId] = await this.dependencies.agentStates.snapshot(actor.agentId); } catch { /* External providers need no Core state snapshot. */ }
    }
    const checkpoint = createWorldSessionCheckpoint({
      checkpointId,
      session,
      state: stateWithCheckpoint,
      agentStateSnapshots: snapshots
    });
    await this.dependencies.artifacts.put({
      artifactId: checkpointId,
      kind: "world-session-checkpoint",
      schemaVersion: checkpoint.schemaVersion,
      content: checkpoint,
      fingerprint: fingerprintArtifact(checkpoint),
      createdAt: stateWithCheckpoint.simTime
    });
    return checkpoint;
  }

  async restore(checkpoint: WorldSessionCheckpointV1): Promise<void> {
    assertWorldSessionCheckpoint(checkpoint);
    if (checkpoint.session.sessionId !== this.sessionId || checkpoint.session.compatibilityFingerprint !== this.dependencies.identities.fingerprint) throw new Error("Checkpoint compatibility mismatch");
    this.abortRunning("cortex:checkpoint-restored");
    await this.dependencies.sessions.restore(checkpoint.session, checkpoint.state);
    for (const snapshot of Object.values(checkpoint.agentStateSnapshots)) {
      await this.dependencies.agentStates.restore(snapshot as AgentState);
    }
  }

  async inspect(): Promise<HeadlessWorldInspection> {
    const [session, state] = await this.current();
    const [allProposals, allSubmissions, allOutcomes] = await Promise.all([
      this.dependencies.proposals.proposals(),
      this.dependencies.proposals.submissions(),
      this.dependencies.proposals.outcomes()
    ]);
    const proposalById = new Map(allProposals.map((item) => [item.proposalId, item]));
    const submissionById = new Map(allSubmissions.map((item) => [item.submissionId, item]));
    const outcomeById = new Map(allOutcomes.map((item) => [item.outcomeId, item]));
    const proposals = state.proposalIds.map((id) => proposalById.get(id)).filter((item) => item !== undefined);
    const submissions = state.submissionIds.map((id) => submissionById.get(id)).filter((item) => item !== undefined);
    const outcomes = state.outcomeIds.map((id) => outcomeById.get(id)).filter((item) => item !== undefined);
    return {
      schemaVersion: "cortex-world-inspection-v1",
      session,
      state,
      observerProjectionCountByAgent: Object.fromEntries(state.actors.map((actor) => [actor.agentId, state.observerProjections.filter((event) => event.observer === actor.agentId).length])),
      proposals,
      submissions,
      outcomes,
      stateFingerprint: fingerprintArtifact(state)
    };
  }

  async exportRun(input: {
    readonly runId: WorldRunId;
    readonly createdAt: string;
    readonly scenarioArtifacts?: Readonly<Record<string, unknown>>;
  }): Promise<WorldRunBundleV1> {
    const inspection = await this.inspect();
    const checkpoints: WorldSessionCheckpointV1[] = [];
    for (const id of inspection.state.checkpointIds) {
      const artifact = await this.dependencies.artifacts.get<WorldSessionCheckpointV1>(id);
      if (artifact?.kind === "world-session-checkpoint") checkpoints.push(artifact.content);
    }
    const finalAgentStateFingerprints: Record<string, Sha256Fingerprint> = {};
    for (const actor of inspection.state.actors) {
      try { finalAgentStateFingerprints[actor.agentId] = fingerprintArtifact(await this.dependencies.agentStates.snapshot(actor.agentId)); }
      catch { finalAgentStateFingerprints[actor.agentId] = fingerprintArtifact({ agentId: actor.agentId, external: true }); }
    }
    const bundle = createWorldRunBundle({
      runId: input.runId,
      createdAt: input.createdAt,
      identities: this.dependencies.identities,
      project: { projectId: this.dependencies.project.projectId, contentFingerprint: this.dependencies.project.contentFingerprint },
      session: inspection.session,
      observerProjections: inspection.state.observerProjections,
      acceptedCognition: inspection.state.acceptedCognition,
      proposals: inspection.proposals,
      submissions: inspection.submissions,
      outcomes: inspection.outcomes,
      checkpoints,
      providerInvocations: inspection.state.providerInvocations,
      scenarioArtifacts: structuredClone(input.scenarioArtifacts ?? {}),
      finalAgentStateFingerprints,
      finalStateFingerprint: fingerprintArtifact(inspection.state),
      runtimeState: inspection.state
    });
    await this.dependencies.runs.put(bundle);
    return bundle;
  }

  async session(): Promise<WorldSessionV1> {
    const session = await this.dependencies.sessions.get(this.sessionId);
    if (!session) throw new Error(`Unknown world session: ${this.sessionId}`);
    return session;
  }

  async state(): Promise<WorldSessionRuntimeStateV1> {
    const state = await this.dependencies.sessions.getState(this.sessionId);
    if (!state) throw new Error(`Unknown world session state: ${this.sessionId}`);
    return state;
  }

  private async current(): Promise<readonly [WorldSessionV1, WorldSessionRuntimeStateV1]> {
    return Promise.all([this.session(), this.state()]);
  }

  private async saveState(state: WorldSessionRuntimeStateV1, expectedRevision: number): Promise<void> {
    assertWorldSessionRuntimeState(state);
    await this.dependencies.sessions.saveState(state, expectedRevision);
  }

  private async transition(
    allowed: readonly WorldSessionV1["lifecycle"][],
    lifecycle: WorldSessionV1["lifecycle"],
    now?: SimTime
  ): Promise<WorldSessionV1> {
    const session = await this.session();
    if (!allowed.includes(session.lifecycle)) throw new Error(`Invalid world session transition: ${session.lifecycle} -> ${lifecycle}`);
    const state = await this.state();
    const updatedAt = now === undefined ? session.updatedAt : maximumTime(session.updatedAt, now);
    const next = { ...session, lifecycle, updatedAt };
    await this.dependencies.sessions.save(next, session.updatedAt);
    if (now !== undefined && now > state.simTime) await this.saveState({ ...state, revision: state.revision + 1, simTime: now }, state.revision);
    return next;
  }

  private async setTerminal(lifecycle: "budget-exhausted" | "deadlocked", now: SimTime): Promise<void> {
    this.abortRunning(`cortex:${lifecycle}`);
    const session = await this.session();
    if (!terminal(session.lifecycle)) await this.dependencies.sessions.save({ ...session, lifecycle, updatedAt: maximumTime(session.updatedAt, now) }, session.updatedAt);
  }

  private abortRunning(reason: string): void {
    for (const controller of this.#controllers.values()) controller.abort(new Error(reason));
    this.#controllers.clear();
  }
}

export const createInitialWorldSessionState = (
  session: WorldSessionV1,
  budgets: WorldSessionBudgetPolicyV1 = DEFAULT_WORLD_SESSION_BUDGETS
): WorldSessionRuntimeStateV1 => ({
  schemaVersion: CORTEX_WORLD_SESSION_STATE_SCHEMA_V1,
  sessionId: session.sessionId,
  revision: 0,
  simTime: session.createdAt,
  worldVersion: session.worldVersion,
  observedThroughSequence: session.observedThroughSequence,
  actors: session.agentIds.map((agentId) => ({ agentId, status: "active", cognitiveTier: 1, lastConsiderationKeys: [] })),
  observerProjections: [],
  pendingActivations: [],
  activationRecords: [],
  acceptedCognition: { goals: [], plans: [], decisions: [] },
  proposalIds: [], submissionIds: [], outcomeIds: [], providerInvocations: [],
  usage: { activations: 0, proposals: 0, acceptedSubmissions: 0, rejectedSubmissions: 0, authoritativeOutcomes: 0, providerCalls: 0, recordedProviderUses: 0, meaningfulTransitions: 0 },
  budgets: structuredClone(budgets),
  consecutiveNoProgressSteps: 0,
  checkpointIds: []
});

const validateActivationResult = (
  output: WorldSessionActivationResult,
  request: WorldSessionActivationRequest,
  project: WorldProjectV1
): void => {
  if (!output || !["no-change", "proposal", "state-transition"].includes(output.disposition)) throw new Error("Invalid cognition provider disposition");
  if (output.disposition === "proposal" && output.proposal === undefined) throw new Error("Proposal disposition requires an action proposal");
  if (output.disposition !== "proposal" && output.proposal !== undefined) throw new Error("Unexpected action proposal");
  if (output.proposal !== undefined) {
    assertActionProposal(output.proposal);
    if (output.proposal.sessionId !== request.session.sessionId || output.proposal.agentId !== request.agentId ||
      output.proposal.basedOnWorldVersion !== request.worldVersion || !project.hostAdapter.capabilityIds.includes(output.proposal.capabilityId)) {
      throw new Error("Cognition provider proposal is outside the registered session boundary");
    }
  }
  if ((output.considerationKeys?.length ?? 0) > 100 || output.considerationKeys?.some((key) => key.length === 0 || key.length > 100)) throw new Error("Invalid consideration key");
};

const activationRecord = (input: {
  readonly trigger: WorldActivationTriggerV1;
  readonly request: WorldSessionActivationRequest;
  readonly index: number;
  readonly mode: WorldSessionProviderMode;
  readonly disposition: WorldActivationRecordV1["disposition"];
  readonly reasonCode?: NamespacedId;
  readonly proposalId?: ActionProposalV1["proposalId"];
  readonly frameFingerprint?: Sha256Fingerprint;
}): WorldActivationRecordV1 => ({
  schemaVersion: CORTEX_WORLD_ACTIVATION_RECORD_SCHEMA_V1,
  activationId: `activation:a${input.index}`,
  agentId: input.trigger.agentId,
  sequence: input.index,
  reasons: input.trigger.reasons,
  sourceEventIds: input.trigger.sourceEventIds,
  materialStateFingerprint: input.trigger.materialStateFingerprint,
  basedOnSessionRevision: input.request.sessionRevision,
  ...(input.request.agentState === undefined ? {} : { basedOnAgentStateVersion: input.request.agentState.version }),
  worldVersion: input.request.worldVersion,
  simTime: input.request.simTime,
  providerMode: input.mode,
  disposition: input.disposition,
  ...(input.reasonCode === undefined ? {} : { reasonCode: input.reasonCode }),
  ...(input.proposalId === undefined ? {} : { proposalId: input.proposalId }),
  ...(input.frameFingerprint === undefined ? {} : { frameFingerprint: input.frameFingerprint })
});

const mergeActivationTriggers = (
  existing: readonly WorldActivationTriggerV1[],
  events: readonly PerceptibleWorldEvent[],
  actors: WorldSessionRuntimeStateV1["actors"],
  now: SimTime
): readonly WorldActivationTriggerV1[] => {
  const triggers = [...new Set(events.map((event) => event.observer))].flatMap((agentId): readonly WorldActivationTriggerV1[] => {
    const relevant = events.filter((event) => event.observer === agentId);
    const fingerprint = fingerprintArtifact(relevant.map((event) => ({
      type: event.event.type,
      worldVersion: event.event.worldVersion,
      observedFacts: event.observedFacts
    })));
    const actor = actors.find((candidate) => candidate.agentId === agentId);
    if (actor?.lastMaterialStateFingerprint === fingerprint && !existing.some((item) => item.agentId === agentId)) return [];
    return [{
      agentId,
      reasons: ["cortex:material-observation"],
      sourceEventIds: relevant.map((event) => event.event.id),
      materialStateFingerprint: fingerprint,
      worldVersion: Math.max(...relevant.map((event) => event.event.worldVersion)),
      notBefore: now
    }];
  });
  return mergeTriggers(existing, triggers);
};

const mergeTriggers = (
  existing: readonly WorldActivationTriggerV1[],
  added: readonly WorldActivationTriggerV1[]
): readonly WorldActivationTriggerV1[] => {
  const byAgent = new Map(existing.map((trigger) => [trigger.agentId, structuredClone(trigger)]));
  for (const trigger of added) {
    const current = byAgent.get(trigger.agentId);
    byAgent.set(trigger.agentId, current === undefined ? structuredClone(trigger) : {
      agentId: trigger.agentId,
      reasons: [...new Set([...current.reasons, ...trigger.reasons])].sort(),
      sourceEventIds: [...new Set([...current.sourceEventIds, ...trigger.sourceEventIds])],
      materialStateFingerprint: trigger.materialStateFingerprint,
      worldVersion: Math.max(current.worldVersion, trigger.worldVersion),
      notBefore: asSimTime(Math.max(current.notBefore, trigger.notBefore))
    });
  }
  return [...byAgent.values()].sort((left, right) => left.notBefore - right.notBefore || left.agentId.localeCompare(right.agentId));
};

const assertOrderedProjectionBatch = (events: readonly PerceptibleWorldEvent[]): void => {
  for (let index = 0; index < events.length; index += 1) {
    const event = events[index]!;
    if (!Number.isInteger(event.event.sequence) || event.event.sequence < 0 || !Number.isInteger(event.event.worldVersion) || event.event.worldVersion < 0 || !Number.isFinite(event.event.simTime) || event.clarity < 0 || event.clarity > 1) throw new Error("Invalid observer projection");
    if (index > 0) {
      const previous = events[index - 1]!;
      if (event.event.sequence < previous.event.sequence || event.event.worldVersion < previous.event.worldVersion) throw new Error("Observer projection batch is not ordered");
    }
  }
};

const projectionKey = (event: PerceptibleWorldEvent): string => `${event.observer}:${event.event.id}`;
const maximumTime = (left: SimTime, right: SimTime): SimTime => asSimTime(Math.max(left, right));
const terminal = (lifecycle: WorldSessionV1["lifecycle"]): boolean => ["stopped", "completed", "budget-exhausted", "deadlocked", "failed"].includes(lifecycle);

const resultOf = (
  state: WorldSessionRuntimeStateV1,
  now: SimTime,
  disposition: WorldSessionStepResult["disposition"],
  activations: readonly WorldActivationRecordV1[],
  proposals: readonly ActionProposalV1[]
): WorldSessionStepResult => ({ sessionId: state.sessionId, revision: state.revision, simTime: now, disposition, activations, proposals });
