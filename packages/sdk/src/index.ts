import { isNamespacedId, type GameDomain, type NamespacedId } from "@cortex/domain";
import type {
  CognitiveFrameContributor,
  FallbackPolicy,
  StateSliceReducer
} from "@cortex/runtime";

export const CORTEX_SDK_VERSION = "0.1.0";

export interface PackDependency {
  readonly packId: NamespacedId;
  readonly versionRange: string;
}

export interface CognitiveModuleDefinition {
  readonly id: NamespacedId;
  readonly cost: "deterministic" | "small-model" | "reasoning-model";
  readonly description: string;
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
    for (const slice of pack.stateSlices) {
      this.assertNamespaced(slice.sliceId, "state slice");
      this.assertNamespaced(slice.module, "state-slice module");
      this.assertUnowned(this.#sliceOwners, slice.sliceId, "state slice");
      if (slice.module.trim().length === 0) {
        throw new PackValidationError(`State slice module is required: ${slice.sliceId}`);
      }
      const initial = slice.initialState();
      if (!slice.validate(initial)) {
        throw new PackValidationError(`Invalid initial state for slice: ${slice.sliceId}`);
      }
    }
    for (const module of pack.modules) {
      this.assertNamespaced(module.id, "module");
      this.assertUnowned(this.#moduleOwners, module.id, "module");
    }
    for (const contributor of pack.frameContributors) {
      this.assertNamespaced(contributor.id, "frame contributor");
      this.assertUnowned(this.#frameOwners, contributor.id, "frame contributor");
    }

    this.#packs.set(pack.id, pack);
    for (const slice of pack.stateSlices) this.#sliceOwners.set(slice.sliceId, pack.id);
    for (const module of pack.modules) this.#moduleOwners.set(module.id, pack.id);
    for (const contributor of pack.frameContributors) this.#frameOwners.set(contributor.id, pack.id);
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

  initialSlices(): Readonly<Record<string, unknown>> {
    return Object.fromEntries(
      this.stateSliceReducers().map((slice) => [slice.sliceId, structuredClone(slice.initialState())])
    );
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
