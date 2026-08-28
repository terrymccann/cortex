import type {
  ActionCommand,
  ActionSubmission,
  AgentId,
  AssumptionResult,
  CortexWorldPort,
  EntityRef,
  FeasibleIntention,
  FeasibleIntentionQuery,
  PerceptionSnapshot,
  ResolvedEntity,
  WorldAssumption
} from "@cortex/contracts";

export class FakeWorld implements CortexWorldPort {
  readonly #entities = new Map<string, ResolvedEntity>();
  readonly #intentions = new Map<AgentId, readonly FeasibleIntention[]>();
  readonly #allowedActionTypes = new Set<string>();
  readonly #submitted: ActionCommand[] = [];

  setEntity(entity: ResolvedEntity): void {
    this.#entities.set(`${entity.ref.kind}:${entity.ref.id}`, entity);
  }

  setFeasibleIntentions(agentId: AgentId, intentions: readonly FeasibleIntention[]): void {
    this.#intentions.set(agentId, intentions);
  }

  allowActionType(actionType: string): void {
    this.#allowedActionTypes.add(actionType);
  }

  submittedActions(): readonly ActionCommand[] {
    return structuredClone(this.#submitted);
  }

  async getPerception(agentId: AgentId): Promise<PerceptionSnapshot> {
    return { agentId, worldVersion: 0, observedThroughSequence: 0, observations: [] };
  }

  async getFeasibleIntentions(query: FeasibleIntentionQuery): Promise<readonly FeasibleIntention[]> {
    return this.#intentions.get(query.agentId) ?? [];
  }

  async resolveEntity(ref: EntityRef): Promise<ResolvedEntity | undefined> {
    return this.#entities.get(`${ref.kind}:${ref.id}`);
  }

  async validateAssumptions(assumptions: readonly WorldAssumption[]): Promise<AssumptionResult> {
    const failed: WorldAssumption[] = [];
    for (const assumption of assumptions) {
      if (!assumption.subject) continue;
      const entity = await this.resolveEntity(assumption.subject);
      const valid =
        assumption.kind === "entity-exists"
          ? entity?.exists === true
          : assumption.kind === "entity-alive"
            ? entity?.alive === true
            : assumption.kind === "entity-accessible"
              ? entity?.accessible === true
              : true;
      if (!valid) failed.push(assumption);
    }
    return { valid: failed.length === 0, failed };
  }

  async submitAction(command: ActionCommand): Promise<ActionSubmission> {
    if (!this.#allowedActionTypes.has(command.actionType)) {
      return { status: "rejected", actionId: command.id, reason: "unknown-action-type" };
    }
    const assumptions = await this.validateAssumptions(command.preconditions);
    if (!assumptions.valid) {
      return { status: "rejected", actionId: command.id, reason: "precondition-failed" };
    }
    this.#submitted.push(structuredClone(command));
    return { status: "accepted", actionId: command.id };
  }
}
