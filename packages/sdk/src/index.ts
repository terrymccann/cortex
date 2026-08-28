import {
  fingerprintGameDomain,
  fingerprintManifest,
  isNamespacedId,
  type GameDomain,
  type NamespacedId,
  type Sha256Fingerprint
} from "@cortex/domain";
import type {
  CognitiveFrameContributor,
  FallbackPolicy,
  RuntimeCompatibilityComponent,
  StateSliceReducer
} from "@cortex/runtime";

export type { RuntimeCompatibilityComponent } from "@cortex/runtime";

export const CORTEX_SDK_VERSION = "0.1.0";
export const CORTEX_PACK_MANIFEST_SCHEMA_V1 = "cortex-pack-manifest-v1" as const;
export const CORTEX_PACK_MANIFEST_TARGET_SCHEMA_V2 = "cortex-pack-manifest-v2" as const;
export const CORTEX_PACK_MANIFEST_CURRENT_SCHEMA = CORTEX_PACK_MANIFEST_SCHEMA_V1;

export interface PackDependency {
  readonly packId: NamespacedId;
  readonly versionRange: string;
}

export interface CognitiveModuleDefinition {
  readonly id: NamespacedId;
  readonly cost: "deterministic" | "small-model" | "reasoning-model";
  readonly description: string;
  readonly readsSlices: readonly NamespacedId[];
  readonly writesSlices: readonly NamespacedId[];
}

export interface CortexPack {
  readonly id: NamespacedId;
  readonly version: string;
  readonly cortexSdkRange: string;
  readonly dependencies: readonly PackDependency[];
  readonly domains?: readonly GameDomain[];
  readonly stateSlices: readonly StateSliceReducer[];
  readonly modules: readonly CognitiveModuleDefinition[];
  readonly frameContributors: readonly CognitiveFrameContributor[];
  readonly fallbackPolicy?: FallbackPolicy;
}

export const fingerprintPackCompatibility = (pack: CortexPack): Sha256Fingerprint =>
  fingerprintManifest({
    schemaVersion: CORTEX_PACK_MANIFEST_SCHEMA_V1,
    id: pack.id,
    version: pack.version,
    cortexSdkRange: pack.cortexSdkRange,
    dependencies: [...pack.dependencies].sort((left, right) =>
      left.packId.localeCompare(right.packId)
    ),
    domains: [...(pack.domains ?? [])]
      .map((domain) => ({ id: domain.id, fingerprint: fingerprintGameDomain(domain) }))
      .sort((left, right) => left.id.localeCompare(right.id)),
    stateSlices: pack.stateSlices
      .map((slice) => ({
        sliceId: slice.sliceId,
        schemaVersion: slice.schemaVersion,
        writerModules: [...slice.writerModules].sort()
      }))
      .sort((left, right) => left.sliceId.localeCompare(right.sliceId)),
    modules: pack.modules
      .map((module) => ({
        id: module.id,
        cost: module.cost,
        description: module.description,
        readsSlices: [...module.readsSlices].sort(),
        writesSlices: [...module.writesSlices].sort()
      }))
      .sort((left, right) => left.id.localeCompare(right.id)),
    frameContributors: pack.frameContributors
      .map((contributor) => ({
        id: contributor.id,
        ownerPackId: contributor.ownerPackId,
        schemaVersion: contributor.schemaVersion,
        maxBytes: contributor.maxBytes,
        maxItems: contributor.maxItems,
        readsSlices: [...contributor.readsSlices].sort()
      }))
      .sort((left, right) => left.id.localeCompare(right.id)),
    hasFallbackPolicy: pack.fallbackPolicy !== undefined
  });

export class PackValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PackValidationError";
  }
}

export class PackRegistry {
  readonly #packs = new Map<NamespacedId, CortexPack>();
  readonly #sliceOwners = new Map<string, NamespacedId>();
  readonly #moduleOwners = new Map<string, NamespacedId>();
  readonly #frameOwners = new Map<string, NamespacedId>();
  readonly #fingerprints = new Map<NamespacedId, Sha256Fingerprint>();

  register(pack: CortexPack): void {
    this.validateCompatibility(pack);
    this.assertNamespaced(pack.id, "pack");
    if (this.#packs.has(pack.id)) throw new PackValidationError(`Pack already registered: ${pack.id}`);

    for (const dependency of pack.dependencies) {
      const installed = this.#packs.get(dependency.packId);
      if (!installed) {
        throw new PackValidationError(`Missing pack dependency: ${dependency.packId}`);
      }
      if (!this.versionSatisfies(installed.version, dependency.versionRange)) {
        throw new PackValidationError(
          `Pack dependency ${dependency.packId} requires ${dependency.versionRange}; installed ${installed.version}`
        );
      }
    }
    const localSliceIds = new Set<string>();
    const localModuleIds = new Set<string>();
    const localFrameIds = new Set<string>();
    for (const slice of pack.stateSlices) {
      this.assertNamespaced(slice.sliceId, "state slice");
      this.assertUnowned(this.#sliceOwners, slice.sliceId, "state slice");
      if (localSliceIds.has(slice.sliceId)) {
        throw new PackValidationError(`Duplicate state slice in pack: ${slice.sliceId}`);
      }
      localSliceIds.add(slice.sliceId);
      if (!Number.isInteger(slice.schemaVersion) || slice.schemaVersion < 1) {
        throw new PackValidationError(`Invalid state-slice schema version: ${slice.sliceId}`);
      }
      if (slice.writerModules.length === 0) {
        throw new PackValidationError(`State slice has no writer modules: ${slice.sliceId}`);
      }
      for (const moduleId of slice.writerModules) {
        this.assertNamespaced(moduleId, "state-slice writer module");
        if (!pack.modules.some((module) => module.id === moduleId)) {
          throw new PackValidationError(
            `State-slice writer ${moduleId} is not declared by pack ${pack.id}`
          );
        }
        const module = pack.modules.find((candidate) => candidate.id === moduleId)!;
        if (!module.writesSlices.includes(slice.sliceId)) {
          throw new PackValidationError(
            `State-slice writer ${moduleId} does not declare write access to ${slice.sliceId}`
          );
        }
      }
      const initial = slice.initialState();
      if (!slice.validate(initial)) {
        throw new PackValidationError(`Invalid initial state for slice: ${slice.sliceId}`);
      }
    }
    for (const module of pack.modules) {
      this.assertNamespaced(module.id, "module");
      this.assertUnowned(this.#moduleOwners, module.id, "module");
      if (localModuleIds.has(module.id)) {
        throw new PackValidationError(`Duplicate module in pack: ${module.id}`);
      }
      localModuleIds.add(module.id);
      for (const sliceId of [...module.readsSlices, ...module.writesSlices]) {
        this.assertNamespaced(sliceId, `module slice reference for ${module.id}`);
      }
      for (const sliceId of module.writesSlices) {
        const slice = pack.stateSlices.find((candidate) => candidate.sliceId === sliceId);
        if (!slice || !slice.writerModules.includes(module.id)) {
          throw new PackValidationError(`Undeclared state-slice write ${module.id} -> ${sliceId}`);
        }
      }
      for (const sliceId of module.readsSlices) {
        const local = pack.stateSlices.some((slice) => slice.sliceId === sliceId);
        const dependencyOwned = pack.dependencies.some(
          (dependency) => this.#sliceOwners.get(sliceId) === dependency.packId
        );
        if (!local && !dependencyOwned) {
          throw new PackValidationError(`Undeclared state-slice read ${module.id} -> ${sliceId}`);
        }
      }
    }
    for (const contributor of pack.frameContributors) {
      this.assertNamespaced(contributor.id, "frame contributor");
      this.assertUnowned(this.#frameOwners, contributor.id, "frame contributor");
      if (localFrameIds.has(contributor.id)) {
        throw new PackValidationError(`Duplicate frame contributor in pack: ${contributor.id}`);
      }
      localFrameIds.add(contributor.id);
      if (contributor.ownerPackId !== pack.id) {
        throw new PackValidationError(`Frame contributor ${contributor.id} has the wrong owner`);
      }
      if (!Number.isInteger(contributor.schemaVersion) || contributor.schemaVersion < 1) {
        throw new PackValidationError(`Invalid frame-section schema version: ${contributor.id}`);
      }
      if (!Number.isInteger(contributor.maxBytes) || contributor.maxBytes < 1) {
        throw new PackValidationError(`Invalid frame-section byte budget: ${contributor.id}`);
      }
      if (
        contributor.maxItems !== undefined &&
        (!Number.isInteger(contributor.maxItems) || contributor.maxItems < 0)
      ) {
        throw new PackValidationError(`Invalid frame-section item budget: ${contributor.id}`);
      }
      for (const sliceId of contributor.readsSlices) {
        const local = pack.stateSlices.some((slice) => slice.sliceId === sliceId);
        const dependencyOwned = pack.dependencies.some(
          (dependency) => this.#sliceOwners.get(sliceId) === dependency.packId
        );
        if (!local && !dependencyOwned) {
          throw new PackValidationError(
            `Undeclared frame-section slice dependency ${contributor.id} -> ${sliceId}`
          );
        }
      }
    }

    this.#packs.set(pack.id, pack);
    this.#fingerprints.set(pack.id, fingerprintPackCompatibility(pack));
    for (const slice of pack.stateSlices) this.#sliceOwners.set(slice.sliceId, pack.id);
    for (const module of pack.modules) this.#moduleOwners.set(module.id, pack.id);
    for (const contributor of pack.frameContributors) this.#frameOwners.set(contributor.id, pack.id);
  }

  registerAll(packs: readonly CortexPack[]): void {
    const pending = new Map<NamespacedId, CortexPack>();
    for (const pack of packs) {
      if (pending.has(pack.id) || this.#packs.has(pack.id)) {
        throw new PackValidationError(`Pack already registered: ${pack.id}`);
      }
      pending.set(pack.id, pack);
    }

    const visiting = new Set<NamespacedId>();
    const visited = new Set<NamespacedId>();
    const ordered: CortexPack[] = [];
    const visit = (pack: CortexPack): void => {
      if (visited.has(pack.id)) return;
      if (visiting.has(pack.id)) {
        throw new PackValidationError(`Pack dependency cycle detected at ${pack.id}`);
      }
      visiting.add(pack.id);
      for (const dependency of pack.dependencies) {
        if (this.#packs.has(dependency.packId)) continue;
        const dependencyPack = pending.get(dependency.packId);
        if (!dependencyPack) {
          throw new PackValidationError(`Missing pack dependency: ${dependency.packId}`);
        }
        visit(dependencyPack);
      }
      visiting.delete(pack.id);
      visited.add(pack.id);
      ordered.push(pack);
    };
    for (const pack of packs) visit(pack);
    for (const pack of ordered) this.register(pack);
  }

  compatibilityFingerprint(id: NamespacedId): Sha256Fingerprint | undefined {
    return this.#fingerprints.get(id);
  }

  pack(id: NamespacedId): CortexPack | undefined {
    return this.#packs.get(id);
  }

  stateSliceReducers(): readonly StateSliceReducer[] {
    return [...this.#packs.values()].flatMap((pack) => pack.stateSlices);
  }

  frameContributors(): readonly CognitiveFrameContributor[] {
    return [...this.#packs.values()].flatMap((pack) => pack.frameContributors);
  }

  initialSlices(): Readonly<Record<string, { readonly schemaVersion: number; readonly value: unknown }>> {
    return Object.fromEntries(
      this.stateSliceReducers().map((slice) => [
        slice.sliceId,
        { schemaVersion: slice.schemaVersion, value: structuredClone(slice.initialState()) }
      ])
    );
  }

  compatibilityComponents(
    additional: readonly RuntimeCompatibilityComponent[] = []
  ): readonly RuntimeCompatibilityComponent[] {
    const packComponents = [...this.#packs.values()].flatMap((pack) => [
      {
        kind: "pack" as const,
        id: pack.id,
        version: pack.version,
        fingerprint: this.#fingerprints.get(pack.id)!
      },
      ...(pack.domains ?? []).map((domain) => ({
        kind: "domain" as const,
        id: domain.id,
        version: domain.version,
        fingerprint: fingerprintGameDomain(domain)
      })),
      ...pack.stateSlices.map((slice) => ({
        kind: "state-slice" as const,
        id: slice.sliceId,
        version: String(slice.schemaVersion)
      })),
      ...pack.frameContributors.map((contributor) => ({
        kind: "frame-section" as const,
        id: contributor.id,
        version: String(contributor.schemaVersion)
      }))
    ]);
    const components = [...packComponents, ...additional];
    const keys = new Set<string>();
    for (const component of components) {
      this.assertNamespaced(component.id, `${component.kind} compatibility component`);
      if (component.version.trim().length === 0) {
        throw new PackValidationError(`Compatibility component version is required: ${component.id}`);
      }
      const key = `${component.kind}:${component.id}`;
      if (keys.has(key)) throw new PackValidationError(`Duplicate compatibility component: ${key}`);
      keys.add(key);
    }
    return components.sort((left, right) =>
      `${left.kind}:${left.id}`.localeCompare(`${right.kind}:${right.id}`)
    );
  }

  frameManifestFingerprint(
    additional: readonly RuntimeCompatibilityComponent[] = []
  ): Sha256Fingerprint {
    return fingerprintManifest(this.compatibilityComponents(additional));
  }

  fallbackPolicy(packId: NamespacedId): FallbackPolicy | undefined {
    return this.#packs.get(packId)?.fallbackPolicy;
  }

  private validateCompatibility(pack: CortexPack): void {
    if (pack.version.trim().length === 0) throw new PackValidationError(`Pack version is required: ${pack.id}`);
    const supported =
      pack.cortexSdkRange === "*" ||
      pack.cortexSdkRange === CORTEX_SDK_VERSION ||
      pack.cortexSdkRange === ">=0.0.0";
    if (!supported) {
      throw new PackValidationError(
        `Pack ${pack.id} requires Cortex SDK ${pack.cortexSdkRange}; runtime is ${CORTEX_SDK_VERSION}`
      );
    }
  }

  private versionSatisfies(actual: string, range: string): boolean {
    return range === "*" || range === ">=0.0.0" || range === actual;
  }

  private assertNamespaced(id: string, label: string): void {
    if (!isNamespacedId(id)) throw new PackValidationError(`Invalid namespaced ${label} id: ${id}`);
  }

  private assertUnowned(
    owners: ReadonlyMap<string, NamespacedId>,
    id: string,
    label: string
  ): void {
    const owner = owners.get(id);
    if (owner) throw new PackValidationError(`Duplicate ${label} ${id}; already owned by ${owner}`);
  }
}
