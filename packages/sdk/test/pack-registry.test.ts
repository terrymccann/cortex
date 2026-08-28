import { describe, expect, it } from "vitest";
import type { CortexPack } from "../src/index.js";
import { PackRegistry, PackValidationError } from "../src/index.js";

const createPack = (id: "test:first" | "test:second", sliceId: string): CortexPack => {
  const suffix = id === "test:first" ? "first" : "second";
  return {
    id,
    version: "1.0.0",
    cortexSdkRange: ">=0.0.0",
    dependencies: [],
    stateSlices: [
      {
        sliceId,
        module: `test:${suffix}-module`,
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
        description: "Test module"
      }
    ],
    frameContributors: [
      {
        id: `test:${suffix}-frame`,
        contribute: (state) => state.slices[sliceId]
      }
    ]
  };
};

describe("PackRegistry", () => {
  it("collects registered state slices and frame contributors", () => {
    const registry = new PackRegistry();
    registry.register(createPack("test:first", "test:counter"));

    expect(registry.initialSlices()).toEqual({ "test:counter": { value: 0 } });
    expect(registry.stateSliceReducers()).toHaveLength(1);
    expect(registry.frameContributors()).toHaveLength(1);
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
});
