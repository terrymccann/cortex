import { describe, expect, it } from "vitest";
import type { NamespacedId } from "@cortex/domain";
import type { CortexPack } from "../src/index.js";
import {
  fingerprintPackCompatibility,
  PackRegistry,
  PackValidationError
} from "../src/index.js";

const createPack = (id: "test:first" | "test:second", sliceId: NamespacedId): CortexPack => {
  const suffix = id === "test:first" ? "first" : "second";
  return {
    id,
    version: "1.0.0",
    cortexSdkRange: ">=0.0.0",
    dependencies: [],
    stateSlices: [
      {
        sliceId,
        schemaVersion: 1,
        writerModules: [`test:${suffix}-module`],
        initialState: () => ({ value: 0 }),
        validate: (value) =>
          typeof value === "object" &&
          value !== null &&
          typeof (value as { value?: unknown }).value === "number",
        reduce: (current, operation) => ({
          value:
            (current as { value: number }).value +
            (operation as { increment: number }).increment
        })
      }
    ],
    modules: [
      {
        id: `test:${suffix}-module`,
        cost: "deterministic",
        description: "Test module",
        readsSlices: [sliceId],
        writesSlices: [sliceId]
      }
    ],
    frameContributors: [
      {
        id: `test:${suffix}-frame`,
        ownerPackId: id,
        schemaVersion: 1,
        maxBytes: 1024,
        maxItems: 1,
        readsSlices: [sliceId],
        validate: (value) => typeof value === "object" && value !== null,
        contribute: (state) => state.slices[sliceId]?.value
      }
    ]
  };
};

describe("PackRegistry", () => {
  it("collects registered state slices and frame contributors", () => {
    const registry = new PackRegistry();
    registry.register(createPack("test:first", "test:counter"));

    expect(registry.initialSlices()).toEqual({
      "test:counter": { schemaVersion: 1, value: { value: 0 } }
    });
    expect(registry.stateSliceReducers()).toHaveLength(1);
    expect(registry.frameContributors()).toHaveLength(1);
    expect(registry.compatibilityFingerprint("test:first")).toBe(
      fingerprintPackCompatibility(createPack("test:first", "test:counter"))
    );
  });

  it("rejects duplicate state-slice ownership", () => {
    const registry = new PackRegistry();
    registry.register(createPack("test:first", "test:counter"));

    expect(() => registry.register(createPack("test:second", "test:counter"))).toThrowError(
      PackValidationError
    );
  });

  it("rejects an incompatible pack dependency", () => {
    const registry = new PackRegistry();
    registry.register(createPack("test:first", "test:first-state"));
    const dependent: CortexPack = {
      ...createPack("test:second", "test:second-state"),
      dependencies: [{ packId: "test:first", versionRange: "2.0.0" }]
    };

    expect(() => registry.register(dependent)).toThrow("requires 2.0.0; installed 1.0.0");
  });

  it("fingerprints declared compatibility metadata without function serialization", () => {
    const first = createPack("test:first", "test:counter");
    const equivalent = createPack("test:first", "test:counter");
    expect(fingerprintPackCompatibility(first)).toBe(fingerprintPackCompatibility(equivalent));
    expect(fingerprintPackCompatibility({ ...first, version: "1.0.1" })).not.toBe(
      fingerprintPackCompatibility(first)
    );
    expect(fingerprintPackCompatibility(first)).toMatch(/^sha256:[a-f0-9]{64}$/);
  });

  it("rejects undeclared slice writers and frame-section dependencies", () => {
    const registry = new PackRegistry();
    const base = createPack("test:first", "test:counter");
    expect(() =>
      registry.register({
        ...base,
        stateSlices: [{ ...base.stateSlices[0]!, writerModules: ["test:missing-module"] }]
      })
    ).toThrow("is not declared by pack");

    expect(() =>
      new PackRegistry().register({
        ...base,
        frameContributors: [
          { ...base.frameContributors[0]!, readsSlices: ["test:undeclared"] }
        ]
      })
    ).toThrow("Undeclared frame-section slice dependency");
  });

  it("makes frame compatibility independent of pack registration order", () => {
    const first = createPack("test:first", "test:first-state");
    const second = createPack("test:second", "test:second-state");
    const left = new PackRegistry();
    left.register(first);
    left.register(second);
    const right = new PackRegistry();
    right.register(second);
    right.register(first);

    expect(left.frameManifestFingerprint()).toBe(right.frameManifestFingerprint());
  });

  it("registers an unordered dependency batch and rejects missing dependencies and cycles", () => {
    const first = createPack("test:first", "test:first-state");
    const second = {
      ...createPack("test:second", "test:second-state"),
      dependencies: [{ packId: "test:first" as const, versionRange: "1.0.0" }]
    };
    const registry = new PackRegistry();
    registry.registerAll([second, first]);
    expect(registry.pack("test:first")).toBeDefined();
    expect(registry.pack("test:second")).toBeDefined();

    expect(() => new PackRegistry().registerAll([second])).toThrow("Missing pack dependency");
    const cyclicFirst = {
      ...first,
      dependencies: [{ packId: "test:second" as const, versionRange: "1.0.0" }]
    };
    expect(() => new PackRegistry().registerAll([cyclicFirst, second])).toThrow(
      "Pack dependency cycle"
    );
  });

  it("includes explicit matcher versions in runtime compatibility", () => {
    const registry = new PackRegistry();
    registry.register(createPack("test:first", "test:counter"));
    const v1 = [{ kind: "constraint-matcher" as const, id: "test:available" as const, version: "1" }];
    const v2 = [{ kind: "constraint-matcher" as const, id: "test:available" as const, version: "2" }];

    expect(registry.compatibilityComponents(v1)).toContainEqual(v1[0]);
    expect(registry.frameManifestFingerprint(v1)).not.toBe(registry.frameManifestFingerprint(v2));
  });
});
