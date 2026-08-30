import { createHash } from "node:crypto";

export type NamespacedId = `${string}:${string}`;
export type JsonSchema = Readonly<Record<string, unknown>>;

export const CORTEX_DOMAIN_MANIFEST_SCHEMA_V1 = "cortex-domain-manifest-v1" as const;
export const CORTEX_DOMAIN_MANIFEST_TARGET_SCHEMA_V2 = "cortex-domain-manifest-v2" as const;
export const CORTEX_DOMAIN_MANIFEST_CURRENT_SCHEMA = CORTEX_DOMAIN_MANIFEST_TARGET_SCHEMA_V2;

export type Sha256Fingerprint = `sha256:${string}`;

export interface VersionedDefinition {
  readonly id: NamespacedId;
  readonly version: number;
  readonly description: string;
}

export interface SemanticTag extends VersionedDefinition {}

export interface MotivationalAffordance {
  readonly motivationId: NamespacedId;
  readonly direction: "supports" | "threatens" | "neutral";
  readonly strength: number;
}

export interface ActionDefinition extends VersionedDefinition {
  readonly category: NamespacedId;
  readonly targetTypes: readonly NamespacedId[];
  readonly argumentSchema: JsonSchema;
  readonly risks: readonly NamespacedId[];
  readonly requirements: readonly NamespacedId[];
  readonly potentialEffects: readonly NamespacedId[];
  readonly motivationalAffordances: readonly MotivationalAffordance[];
  readonly skillId: NamespacedId;
}

export interface EntityTypeDefinition extends VersionedDefinition {
  readonly propertySchema: JsonSchema;
  readonly semanticProperties: readonly NamespacedId[];
}

export interface PerceptionDefinition extends VersionedDefinition {
  readonly payloadSchema: JsonSchema;
  readonly semanticProperties: readonly NamespacedId[];
}

export interface ConstraintDefinition extends VersionedDefinition {
  readonly subjectTypes: readonly NamespacedId[];
  readonly parameterSchema: JsonSchema;
}

export interface EffectDefinition extends VersionedDefinition {
  readonly subjectTypes: readonly NamespacedId[];
  readonly parameterSchema: JsonSchema;
}

export interface ResourceDefinition extends VersionedDefinition {
  readonly unit?: string;
  readonly scarce: boolean;
  readonly transferable: boolean;
}

export interface RelationshipDimensionDefinition extends VersionedDefinition {
  readonly minimum: number;
  readonly maximum: number;
  readonly neutral: number;
}

export interface MotivationDefinition extends VersionedDefinition {
  readonly minimum: number;
  readonly maximum: number;
}

export interface ConditionTemplate {
  readonly definitionId: NamespacedId;
  readonly definitionVersion: number;
  readonly subjectType?: NamespacedId;
  readonly parameters: Readonly<Record<string, unknown>>;
}

export interface GoalDefinition extends VersionedDefinition {
  readonly parameterSchema: JsonSchema;
  readonly entityParameters: Readonly<Record<string, NamespacedId>>;
  readonly admissibleMotivations: readonly NamespacedId[];
  readonly successCondition: ConditionTemplate;
  readonly failureConditions: readonly ConditionTemplate[];
  readonly relevantCapabilities: readonly NamespacedId[];
  readonly defaultHorizon: "immediate" | "short" | "medium";
  readonly conflictTags: readonly NamespacedId[];
}

export interface CapabilityPlanningCost {
  readonly effort: number;
  readonly risk: number;
}

export interface CapabilityDefinition extends VersionedDefinition {
  readonly parameterSchema: JsonSchema;
  readonly targetTypes: readonly NamespacedId[];
  readonly supportedGoals: readonly NamespacedId[];
  readonly requirements: readonly NamespacedId[];
  readonly risks: readonly NamespacedId[];
  readonly potentialEffects: readonly NamespacedId[];
  readonly actionIds: readonly NamespacedId[];
  readonly planningCost: CapabilityPlanningCost;
  readonly incompatibleWith: readonly NamespacedId[];
}

export interface StrategyStageDefinition {
  readonly stageId: string;
  readonly capabilityOptions: readonly NamespacedId[];
  readonly dependsOn: readonly string[];
  readonly optional: boolean;
}

export interface StrategyTemplateDefinition extends VersionedDefinition {
  readonly supportedGoals: readonly NamespacedId[];
  readonly stages: readonly StrategyStageDefinition[];
  readonly successConditionRefs: readonly NamespacedId[];
  readonly failureConditionRefs: readonly NamespacedId[];
}

export interface GameDomain {
  readonly id: NamespacedId;
  readonly version: string;
  readonly cortexSdkRange: string;
  readonly actions: readonly ActionDefinition[];
  readonly entities: readonly EntityTypeDefinition[];
  readonly perceptions: readonly PerceptionDefinition[];
  readonly constraints: readonly ConstraintDefinition[];
  readonly effects: readonly EffectDefinition[];
  readonly resources: readonly ResourceDefinition[];
  readonly relationshipDimensions: readonly RelationshipDimensionDefinition[];
  readonly motivations: readonly MotivationDefinition[];
  readonly goals: readonly GoalDefinition[];
  readonly capabilities: readonly CapabilityDefinition[];
  readonly strategies: readonly StrategyTemplateDefinition[];
  readonly tags: readonly SemanticTag[];
}

export const fingerprintManifest = (value: unknown): Sha256Fingerprint =>
  `sha256:${createHash("sha256").update(canonicalJson(value)).digest("hex")}`;

export const fingerprintGameDomain = (domain: GameDomain): Sha256Fingerprint =>
  fingerprintManifest({
    schemaVersion: CORTEX_DOMAIN_MANIFEST_CURRENT_SCHEMA,
    domain
  });

export type DomainDefinition =
  | ActionDefinition
  | EntityTypeDefinition
  | PerceptionDefinition
  | ConstraintDefinition
  | EffectDefinition
  | ResourceDefinition
  | RelationshipDimensionDefinition
  | MotivationDefinition
  | GoalDefinition
  | CapabilityDefinition
  | StrategyTemplateDefinition
  | SemanticTag;

export class DomainValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DomainValidationError";
  }
}

const namespacedIdPattern = /^[a-z][a-z0-9-]*:[a-z][a-z0-9-]*$/;
export const CORTEX_DOMAIN_PUBLIC_ID_MAX_LENGTH = 100 as const;

export const isNamespacedId = (value: string): value is NamespacedId =>
  value.length <= CORTEX_DOMAIN_PUBLIC_ID_MAX_LENGTH && namespacedIdPattern.test(value);

export class DomainRegistry {
  readonly #domains = new Map<NamespacedId, GameDomain>();
  readonly #definitions = new Map<NamespacedId, DomainDefinition>();
  readonly #fingerprints = new Map<NamespacedId, Sha256Fingerprint>();

  register(domain: GameDomain): void {
    this.validateDomain(domain);
    if (this.#domains.has(domain.id)) {
      throw new DomainValidationError(`Domain already registered: ${domain.id}`);
    }

    const definitions = this.definitionsOf(domain);
    for (const definition of definitions) {
      if (this.#definitions.has(definition.id)) {
        throw new DomainValidationError(`Definition already registered: ${definition.id}`);
      }
    }

    this.#domains.set(domain.id, structuredClone(domain));
    this.#fingerprints.set(domain.id, fingerprintGameDomain(domain));
    for (const definition of definitions) {
      this.#definitions.set(definition.id, structuredClone(definition));
    }
  }

  fingerprint(id: NamespacedId): Sha256Fingerprint | undefined {
    return this.#fingerprints.get(id);
  }

  domain(id: NamespacedId): Readonly<GameDomain> | undefined {
    const domain = this.#domains.get(id);
    return domain === undefined ? undefined : structuredClone(domain);
  }

  definition<TDefinition extends DomainDefinition = DomainDefinition>(
    id: NamespacedId
  ): Readonly<TDefinition> | undefined {
    const definition = this.#definitions.get(id);
    return definition === undefined ? undefined : (structuredClone(definition) as TDefinition);
  }

  action(id: NamespacedId): Readonly<ActionDefinition> | undefined {
    const action = [...this.#domains.values()]
      .flatMap((domain) => domain.actions)
      .find((candidate) => candidate.id === id);
    return action === undefined ? undefined : structuredClone(action);
  }

  goal(id: NamespacedId): Readonly<GoalDefinition> | undefined {
    const goal = [...this.#domains.values()]
      .flatMap((domain) => domain.goals)
      .find((candidate) => candidate.id === id);
    return goal === undefined ? undefined : structuredClone(goal);
  }

  goals(): readonly Readonly<GoalDefinition>[] {
    return [...this.#domains.values()]
      .flatMap((domain) => domain.goals)
      .map((goal) => structuredClone(goal))
      .sort((left, right) => left.id.localeCompare(right.id));
  }

  capability(id: NamespacedId): Readonly<CapabilityDefinition> | undefined {
    const capability = [...this.#domains.values()]
      .flatMap((domain) => domain.capabilities)
      .find((candidate) => candidate.id === id);
    return capability === undefined ? undefined : structuredClone(capability);
  }

  capabilities(): readonly Readonly<CapabilityDefinition>[] {
    return [...this.#domains.values()]
      .flatMap((domain) => domain.capabilities)
      .map((capability) => structuredClone(capability))
      .sort((left, right) => left.id.localeCompare(right.id));
  }

  strategy(id: NamespacedId): Readonly<StrategyTemplateDefinition> | undefined {
    const strategy = [...this.#domains.values()]
      .flatMap((domain) => domain.strategies)
      .find((candidate) => candidate.id === id);
    return strategy === undefined ? undefined : structuredClone(strategy);
  }

  strategies(): readonly Readonly<StrategyTemplateDefinition>[] {
    return [...this.#domains.values()]
      .flatMap((domain) => domain.strategies)
      .map((strategy) => structuredClone(strategy))
      .sort((left, right) => left.id.localeCompare(right.id));
  }

  effect(id: NamespacedId): Readonly<EffectDefinition> | undefined {
    const effect = [...this.#domains.values()]
      .flatMap((domain) => domain.effects)
      .find((candidate) => candidate.id === id);
    return effect === undefined ? undefined : structuredClone(effect);
  }

  private validateDomain(domain: GameDomain): void {
    this.assertId(domain.id, "domain");
    if (domain.version.trim().length === 0) throw new DomainValidationError("Domain version is required");
    if (domain.cortexSdkRange.trim().length === 0) {
      throw new DomainValidationError("Cortex SDK compatibility range is required");
    }
    if (
      !Array.isArray((domain as Partial<GameDomain>).goals) ||
      !Array.isArray((domain as Partial<GameDomain>).capabilities) ||
      !Array.isArray((domain as Partial<GameDomain>).strategies)
    ) {
      throw new DomainValidationError(
        "Domain manifest v2 requires explicit goals, capabilities, and strategies arrays"
      );
    }

    const definitions = this.definitionsOf(domain);
    const localIds = new Set<NamespacedId>();
    for (const definition of definitions) {
      this.assertId(definition.id, "definition");
      if (!Number.isInteger(definition.version) || definition.version < 1) {
        throw new DomainValidationError(`Definition version must be a positive integer: ${definition.id}`);
      }
      if (definition.description.trim().length === 0) {
        throw new DomainValidationError(`Definition description is required: ${definition.id}`);
      }
      if (localIds.has(definition.id)) {
        throw new DomainValidationError(`Duplicate definition in domain: ${definition.id}`);
      }
      localIds.add(definition.id);
    }

    const entityIds = new Set(domain.entities.map((entity) => entity.id));
    const motivationIds = new Set(domain.motivations.map((motivation) => motivation.id));
    const tagIds = new Set(domain.tags.map((tag) => tag.id));
    const constraintIds = new Set(domain.constraints.map((constraint) => constraint.id));
    const effectIds = new Set(domain.effects.map((effect) => effect.id));
    const effects = new Map(domain.effects.map((effect) => [effect.id, effect]));
    const actionIds = new Set(domain.actions.map((action) => action.id));
    const goalIds = new Set(domain.goals.map((goal) => goal.id));
    const capabilityIds = new Set(domain.capabilities.map((capability) => capability.id));
    for (const action of domain.actions) {
      this.assertRegisteredTag(action.category, tagIds, `action category for ${action.id}`);
      this.assertId(action.skillId, `skill for ${action.id}`);
      for (const reference of action.risks) {
        this.assertRegisteredTag(reference, tagIds, `semantic reference for ${action.id}`);
      }
      for (const requirement of action.requirements) {
        this.assertRegisteredDefinition(
          requirement,
          constraintIds,
          `constraint reference for ${action.id}`
        );
      }
      for (const effect of action.potentialEffects) {
        this.assertRegisteredDefinition(effect, effectIds, `effect reference for ${action.id}`);
      }
      for (const targetType of action.targetTypes) {
        if (!entityIds.has(targetType)) {
          throw new DomainValidationError(`Unknown target type ${targetType} in action ${action.id}`);
        }
      }
      for (const affordance of action.motivationalAffordances) {
        if (!motivationIds.has(affordance.motivationId)) {
          throw new DomainValidationError(
            `Unknown motivation ${affordance.motivationId} in action ${action.id}`
          );
        }
        if (affordance.strength < 0 || affordance.strength > 1) {
          throw new DomainValidationError(
            `Motivational affordance strength must be between 0 and 1: ${action.id}`
          );
        }
      }
    }

    for (const entity of domain.entities) {
      for (const property of entity.semanticProperties) {
        this.assertRegisteredTag(property, tagIds, `semantic property for ${entity.id}`);
      }
    }
    for (const perception of domain.perceptions) {
      for (const property of perception.semanticProperties) {
        this.assertRegisteredTag(property, tagIds, `semantic property for ${perception.id}`);
      }
    }
    for (const definition of [...domain.constraints, ...domain.effects]) {
      for (const subjectType of definition.subjectTypes) {
        if (!entityIds.has(subjectType)) {
          throw new DomainValidationError(
            `Unknown subject type ${subjectType} in definition ${definition.id}`
          );
        }
      }
    }
    for (const relationship of domain.relationshipDimensions) {
      if (
        relationship.minimum >= relationship.maximum ||
        relationship.neutral < relationship.minimum ||
        relationship.neutral > relationship.maximum
      ) {
        throw new DomainValidationError(`Invalid relationship range: ${relationship.id}`);
      }
    }
    for (const motivation of domain.motivations) {
      if (motivation.minimum >= motivation.maximum) {
        throw new DomainValidationError(`Invalid motivation range: ${motivation.id}`);
      }
    }
    for (const goal of domain.goals) {
      if (!isObjectSchema(goal.parameterSchema)) {
        throw new DomainValidationError(`Goal parameter schema must describe an object: ${goal.id}`);
      }
      if (goal.admissibleMotivations.length === 0) {
        throw new DomainValidationError(`Goal has no admissible motivations: ${goal.id}`);
      }
      const goalProperties = isRecord(goal.parameterSchema["properties"])
        ? goal.parameterSchema["properties"]
        : {};
      for (const [parameter, entityType] of Object.entries(goal.entityParameters)) {
        if (goalProperties[parameter] === undefined) {
          throw new DomainValidationError(`Unknown entity parameter ${parameter} in goal ${goal.id}`);
        }
        if (!entityIds.has(entityType)) {
          throw new DomainValidationError(`Unknown entity type ${entityType} in goal ${goal.id}`);
        }
      }
      for (const motivationId of goal.admissibleMotivations) {
        if (!motivationIds.has(motivationId)) {
          throw new DomainValidationError(`Unknown motivation ${motivationId} in goal ${goal.id}`);
        }
      }
      for (const condition of [goal.successCondition, ...goal.failureConditions]) {
        const effect = effects.get(condition.definitionId);
        if (!effect || effect.version !== condition.definitionVersion) {
          throw new DomainValidationError(
            `Unknown condition ${condition.definitionId}@${condition.definitionVersion} in goal ${goal.id}`
          );
        }
        if (!validateJsonSchema(effect.parameterSchema, condition.parameters)) {
          throw new DomainValidationError(`Invalid condition parameters in goal ${goal.id}`);
        }
        if (condition.subjectType !== undefined && !effect.subjectTypes.includes(condition.subjectType)) {
          throw new DomainValidationError(
            `Invalid condition subject type ${condition.subjectType} in goal ${goal.id}`
          );
        }
      }
      if (goal.relevantCapabilities.length === 0) {
        throw new DomainValidationError(`Goal has no relevant capabilities: ${goal.id}`);
      }
      for (const capabilityId of goal.relevantCapabilities) {
        if (!capabilityIds.has(capabilityId)) {
          throw new DomainValidationError(`Unknown capability ${capabilityId} in goal ${goal.id}`);
        }
      }
      for (const tag of goal.conflictTags) {
        this.assertRegisteredTag(tag, tagIds, `conflict tag for ${goal.id}`);
      }
    }
    for (const capability of domain.capabilities) {
      if (!isObjectSchema(capability.parameterSchema)) {
        throw new DomainValidationError(`Capability parameter schema must describe an object: ${capability.id}`);
      }
      if (capability.supportedGoals.length === 0 || capability.supportedGoals.some((id) => !goalIds.has(id))) {
        throw new DomainValidationError(`Unknown or missing supported goal in capability ${capability.id}`);
      }
      if (capability.actionIds.length === 0 || capability.actionIds.some((id) => !actionIds.has(id))) {
        throw new DomainValidationError(`Unknown or missing action in capability ${capability.id}`);
      }
      for (const targetType of capability.targetTypes) {
        if (!entityIds.has(targetType)) throw new DomainValidationError(`Unknown capability target type ${targetType}`);
      }
      for (const requirement of capability.requirements) {
        this.assertRegisteredDefinition(requirement, constraintIds, `capability constraint for ${capability.id}`);
      }
      for (const risk of capability.risks) {
        this.assertRegisteredTag(risk, tagIds, `capability risk for ${capability.id}`);
      }
      for (const effectId of capability.potentialEffects) {
        this.assertRegisteredDefinition(effectId, effectIds, `capability effect for ${capability.id}`);
      }
      if (
        !Number.isFinite(capability.planningCost.effort) || capability.planningCost.effort < 0 || capability.planningCost.effort > 1 ||
        !Number.isFinite(capability.planningCost.risk) || capability.planningCost.risk < 0 || capability.planningCost.risk > 1
      ) {
        throw new DomainValidationError(`Invalid planning cost in capability ${capability.id}`);
      }
      for (const incompatibleId of capability.incompatibleWith) {
        if (!capabilityIds.has(incompatibleId) || incompatibleId === capability.id) {
          throw new DomainValidationError(`Unknown or self-incompatible capability in ${capability.id}`);
        }
      }
      for (const goalId of capability.supportedGoals) {
        const goal = domain.goals.find((candidate) => candidate.id === goalId)!;
        if (!goal.relevantCapabilities.includes(capability.id)) {
          throw new DomainValidationError(`Capability ${capability.id} is not relevant to supported goal ${goalId}`);
        }
      }
    }
    for (const strategy of domain.strategies) {
      if (strategy.supportedGoals.length === 0 || strategy.supportedGoals.some((id) => !goalIds.has(id))) {
        throw new DomainValidationError(`Unknown or missing supported goal in strategy ${strategy.id}`);
      }
      const stageIds = new Set<string>();
      for (const stage of strategy.stages) {
        if (stage.stageId.trim().length === 0 || stageIds.has(stage.stageId)) {
          throw new DomainValidationError(`Invalid or duplicate strategy stage in ${strategy.id}`);
        }
        stageIds.add(stage.stageId);
        if (stage.capabilityOptions.length === 0 || stage.capabilityOptions.some((id) => !capabilityIds.has(id))) {
          throw new DomainValidationError(`Unknown or missing stage capability in strategy ${strategy.id}`);
        }
        if (stage.capabilityOptions.some((id) => {
          const capability = domain.capabilities.find((candidate) => candidate.id === id)!;
          return strategy.supportedGoals.some((goalId) => !capability.supportedGoals.includes(goalId));
        })) {
          throw new DomainValidationError(`Strategy capability does not support every strategy goal: ${strategy.id}`);
        }
      }
      for (const stage of strategy.stages) {
        if (stage.dependsOn.some((id) => !stageIds.has(id) || id === stage.stageId)) {
          throw new DomainValidationError(`Invalid strategy dependency in ${strategy.id}`);
        }
      }
      assertAcyclic(strategy.stages.map((stage) => ({ id: stage.stageId, dependsOn: stage.dependsOn })), `strategy ${strategy.id}`);
      for (const effectId of [...strategy.successConditionRefs, ...strategy.failureConditionRefs]) {
        if (!effectIds.has(effectId)) throw new DomainValidationError(`Unknown strategy condition ${effectId}`);
      }
      for (const goalId of strategy.supportedGoals) {
        const goal = domain.goals.find((candidate) => candidate.id === goalId)!;
        if (!strategy.successConditionRefs.includes(goal.successCondition.definitionId) ||
          strategy.failureConditionRefs.some((effectId) => !goal.failureConditions.some((condition) => condition.definitionId === effectId))) {
          throw new DomainValidationError(`Strategy conditions do not match supported goal ${goalId}`);
        }
      }
    }
  }

  private definitionsOf(domain: GameDomain): readonly DomainDefinition[] {
    return [
      ...domain.actions,
      ...domain.entities,
      ...domain.perceptions,
      ...domain.constraints,
      ...domain.effects,
      ...domain.resources,
      ...domain.relationshipDimensions,
      ...domain.motivations,
      ...domain.goals,
      ...domain.capabilities,
      ...domain.strategies,
      ...domain.tags
    ];
  }

  private assertId(value: string, label: string): asserts value is NamespacedId {
    if (!isNamespacedId(value)) {
      throw new DomainValidationError(`Invalid namespaced ${label} id: ${value}`);
    }
  }

  private assertRegisteredTag(
    value: NamespacedId,
    tagIds: ReadonlySet<NamespacedId>,
    label: string
  ): void {
    this.assertId(value, label);
    if (!tagIds.has(value)) throw new DomainValidationError(`Unknown ${label}: ${value}`);
  }

  private assertRegisteredDefinition(
    value: NamespacedId,
    definitionIds: ReadonlySet<NamespacedId>,
    label: string
  ): void {
    this.assertId(value, label);
    if (!definitionIds.has(value)) throw new DomainValidationError(`Unknown ${label}: ${value}`);
  }
}

export const validateJsonSchema = (schema: JsonSchema, value: unknown): boolean => {
  const expectedType = schema["type"];
  if (expectedType === "object") {
    if (!isRecord(value)) return false;
    const required = schema["required"];
    if (Array.isArray(required) && required.some((key) => typeof key !== "string" || value[key] === undefined)) {
      return false;
    }
    const properties = isRecord(schema["properties"]) ? schema["properties"] : {};
    if (schema["additionalProperties"] === false && Object.keys(value).some((key) => properties[key] === undefined)) {
      return false;
    }
    return Object.entries(properties).every(([key, propertySchema]) =>
      value[key] === undefined || (isRecord(propertySchema) && validateJsonSchema(propertySchema, value[key]))
    );
  }
  if (expectedType === "array") {
    if (!Array.isArray(value)) return false;
    const items = schema["items"];
    return items === undefined || (isRecord(items) && value.every((item) => validateJsonSchema(items, item)));
  }
  if (expectedType === "string") return typeof value === "string";
  if (expectedType === "number") return typeof value === "number" && Number.isFinite(value);
  if (expectedType === "integer") return typeof value === "number" && Number.isInteger(value);
  if (expectedType === "boolean") return typeof value === "boolean";
  return expectedType === undefined;
};

const isObjectSchema = (schema: JsonSchema): boolean => schema["type"] === "object";

const assertAcyclic = (
  nodes: readonly { readonly id: string; readonly dependsOn: readonly string[] }[],
  label: string
): void => {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (id: string): void => {
    if (visited.has(id)) return;
    if (visiting.has(id)) throw new DomainValidationError(`Dependency cycle in ${label}`);
    visiting.add(id);
    for (const dependency of byId.get(id)?.dependsOn ?? []) visit(dependency);
    visiting.delete(id);
    visited.add(id);
  };
  for (const node of nodes) visit(node.id);
};

const canonicalJson = (value: unknown): string => {
  if (value === null || typeof value === "boolean" || typeof value === "string") {
    return JSON.stringify(value);
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("Cannot fingerprint a non-finite number");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map((item) => canonicalJson(item ?? null)).join(",")}]`;
  if (isRecord(value)) {
    return `{${Object.keys(value)
      .filter((key) => value[key] !== undefined)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
      .join(",")}}`;
  }
  throw new Error(`Cannot fingerprint unsupported value: ${typeof value}`);
};

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
