import { readFileSync, readdirSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const productionRoots = [
  "packages/contracts/src",
  "packages/cortex/src",
  "packages/openai/src"
];

const sourceFiles = (directory: string): readonly string[] =>
  readdirSync(directory).flatMap((entry) => {
    const path = resolve(directory, entry);
    return statSync(path).isDirectory()
      ? sourceFiles(path)
      : path.endsWith(".ts")
        ? [path]
        : [];
  });

describe("production source conformance", () => {
  it("keeps reference worlds and optional social inputs outside the kernel", () => {
    const source = productionRoots
      .flatMap((root) => sourceFiles(resolve(root)))
      .map((file) => `${file}\n${readFileSync(file, "utf8")}`)
      .join("\n");

    for (const forbidden of [
      "drone:",
      "colony:",
      "Marcus",
      "Elena",
      "socialSignals",
      "@cortex/standard-packs"
    ]) {
      expect(source, `production source contains forbidden reference: ${forbidden}`).not.toContain(
        forbidden
      );
    }
  });
});
