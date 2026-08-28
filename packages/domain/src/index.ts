import { createHash } from "node:crypto";

export type NamespacedId = `${string}:${string}`;
export type JsonSchema = Readonly<Record<string, unknown>>;

export const CORTEX_DOMAIN_MANIFEST_SCHEMA_V1 = "cortex-domain-manifest-v1" as const;
export const CORTEX_DOMAIN_MANIFEST_TARGET_SCHEMA_V2 = "cortex-domain-manifest-v2" as const;
export const CORTEX_DOMAIN_MANIFEST_CURRENT_SCHEMA = CORTEX_DOMAIN_MANIFEST_SCHEMA_V1;

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

export interface GameDomain {
  readonly id: NamespacedId;
  readonly version: string;
  readonly cortexSdkRange: string;
  readonly actions: readonly ActionDefinition[];
  readonly entities: readonly EntityTypeDefinition[];
  readonly perceptions: readonly PerceptionDefinition[];
  readonly resources: readonly ResourceDefinition[];
  readonly relationshipDimensions: readonly RelationshipDimensionDefinition[];
  readonly motivations: readonly MotivationDefinition[];
  readonly tags: readonly SemanticTag[];
}

export const fingerprintManifest = (value: unknown): Sha256Fingerprint =>
  `sha256:${createHash("sha256").update(canonicalJson(value)).digest("hex")}`;

export const fingerprintGameDomain = (domain: GameDomain): Sha256Fingerprint =>
  fingerprintManifest({
    schemaVersion: CORTEX_DOMAIN_MANIFEST_SCHEMA_V1,
    domain
  });

export type DomainDefinition =
  | ActionDefinition
  | EntityTypeDefinition
  | PerceptionDefinition
  | ResourceDefinition
  | RelationshipDimensionDefinition
  | MotivationDefinition
  | SemanticTag;

export class DomainValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DomainValidationError";
  }
}

const namespacedIdPattern = /^[a-z][a-z0-9-]*:[a-z][a-z0-9-]*$/;

export const isNamespacedId = (value: string): value is NamespacedId =>
  namespacedIdPattern.test(value);

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

  private validateDomain(domain: GameDomain): void {
    this.assertId(domain.id, "domain");
    if (domain.version.trim().length === 0) throw new DomainValidationError("Domain version is required");
    if (domain.cortexSdkRange.trim().length === 0) {
      throw new DomainValidationError("Cortex SDK compatibility range is required");
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
    for (const action of domain.actions) {
      this.assertRegisteredTag(action.category, tagIds, `action category for ${action.id}`);
      this.assertId(action.skillId, `skill for ${action.id}`);
      for (const reference of [
        ...action.risks,
        ...action.requirements,
        ...action.potentialEffects
      ]) {
        this.assertRegisteredTag(reference, tagIds, `semantic reference for ${action.id}`);
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
  }

  private definitionsOf(domain: GameDomain): readonly DomainDefinition[] {
    return [
      ...domain.actions,
      ...domain.entities,
      ...domain.perceptions,
      ...domain.resources,
      ...domain.relationshipDimensions,
      ...domain.motivations,
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
}

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
