import type {
  ActionCommand,
  ActionSubmission,
  AgentId,
  ConstraintValidationResult,
  CortexWorldPort,
  EntityRef,
  FeasibleIntention,
  FeasibleIntentionQuery,
  NamespacedId,
  PerceptionSnapshot,
  ResolvedEntity,
  WorldConstraint
} from "@cortex/contracts";

export interface ConstraintEvaluator {
  readonly definitionId: NamespacedId;
  readonly definitionVersion: number;
  evaluate(
    constraint: WorldConstraint,
    resolveEntity: (ref: EntityRef) => ResolvedEntity | undefined
  ): boolean;
}

export class FakeWorld implements CortexWorldPort {
  readonly #entities = new Map<string, ResolvedEntity>();
  readonly #intentions = new Map<AgentId, readonly FeasibleIntention[]>();
  readonly #allowedActionTypes = new Set<string>();
  readonly #constraintEvaluators = new Map<string, ConstraintEvaluator>();
  readonly #submitted: ActionCommand[] = [];

  setEntity(entity: ResolvedEntity): void {
    this.#entities.set(`${entity.ref.type}:${entity.ref.id}`, entity);
  }

  setFeasibleIntentions(agentId: AgentId, intentions: readonly FeasibleIntention[]): void {
    this.#intentions.set(agentId, intentions);
  }

  allowActionType(actionType: string): void {
    this.#allowedActionTypes.add(actionType);
  }

  registerConstraintEvaluator(evaluator: ConstraintEvaluator): void {
    const key = `${evaluator.definitionId}@${evaluator.definitionVersion}`;
    if (this.#constraintEvaluators.has(key)) {
      throw new Error(`Duplicate constraint evaluator: ${key}`);
    }
    this.#constraintEvaluators.set(key, evaluator);
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
    return this.#entities.get(`${ref.type}:${ref.id}`);
  }

  async validateConstraints(
    constraints: readonly WorldConstraint[]
  ): Promise<ConstraintValidationResult> {
    const failed: WorldConstraint[] = [];
    const resolve = (ref: EntityRef): ResolvedEntity | undefined =>
      this.#entities.get(`${ref.type}:${ref.id}`);
    for (const constraint of constraints) {
      const evaluator = this.#constraintEvaluators.get(
        `${constraint.definitionId}@${constraint.definitionVersion}`
      );
      if (!evaluator || !evaluator.evaluate(constraint, resolve)) failed.push(constraint);
    }
    return { valid: failed.length === 0, failed };
  }

  async submitAction(command: ActionCommand): Promise<ActionSubmission> {
    if (!this.#allowedActionTypes.has(command.actionType)) {
      return { status: "rejected", actionId: command.id, reason: "unknown-action-type" };
    }
    const validation = await this.validateConstraints(command.preconditions);
    if (!validation.valid) {
      return { status: "rejected", actionId: command.id, reason: "precondition-failed" };
    }
    this.#submitted.push(structuredClone(command));
    return { status: "accepted", actionId: command.id };
  }
}
