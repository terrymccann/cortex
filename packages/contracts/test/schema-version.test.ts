import { describe, expect, it } from "vitest";
import {
  CORTEX_CONTRACTS_CURRENT_SCHEMA,
  CORTEX_CONTRACTS_SCHEMA_V1,
  CORTEX_CONTRACTS_TARGET_SCHEMA_V2
} from "../src/index.js";

describe("contract schema versions", () => {
  it("keeps v1 current until the breaking Phase 3.0 migration is complete", () => {
    expect(CORTEX_CONTRACTS_CURRENT_SCHEMA).toBe(CORTEX_CONTRACTS_SCHEMA_V1);
    expect(CORTEX_CONTRACTS_TARGET_SCHEMA_V2).toBe("cortex-contracts-v2");
  });
});
