import { describe, expect, it } from "vitest";
import {
  CORTEX_DOMAIN_MANIFEST_SCHEMA_V1,
  DomainRegistry,
  DomainValidationError,
  fingerprintGameDomain,
  fingerprintManifest,
  type GameDomain
} from "../src/index.js";

const droneDomain: GameDomain = {
  id: "drone:reconnaissance",
  version: "1.0.0",
  cortexSdkRange: ">=0.0.0",
  entities: [
    {
      id: "drone:unit",
      version: 1,
      description: "An autonomous reconnaissance unit",
      propertySchema: { type: "object" },
      semanticProperties: ["drone:mobile"]
    }
  ],
  motivations: [
    {
      id: "drone:mission-completion",
      version: 1,
      description: "Complete the assigned reconnaissance mission",
      minimum: 0,
      maximum: 1
    }
  ],
  actions: [
    {
      id: "drone:retreat",
      version: 1,
      description: "Retreat to a safe rally point",
      category: "drone:movement",
      targetTypes: ["drone:unit"],
      argumentSchema: { type: "object" },
      risks: ["drone:mission-delay"],
      requirements: ["drone:can-move"],
      potentialEffects: ["drone:survival"],
      motivationalAffordances: [
        {
          motivationId: "drone:mission-completion",
          direction: "threatens",
          strength: 0.3
        }
      ],
      skillId: "drone:retreat-skill"
    }
  ],
  perceptions: [],
  constraints: [
    {
      id: "drone:can-move",
      version: 1,
      description: "The unit can move",
      subjectTypes: ["drone:unit"],
      parameterSchema: { type: "object", additionalProperties: false }
    }
  ],
  effects: [
    {
      id: "drone:survival",
      version: 1,
      description: "The unit remains operational",
      subjectTypes: ["drone:unit"],
      parameterSchema: { type: "object" }
    }
  ],
  resources: [],
  relationshipDimensions: [],
  tags: [
    { id: "drone:mobile", version: 1, description: "Can change position" },
    { id: "drone:movement", version: 1, description: "Movement action" },
    { id: "drone:mission-delay", version: 1, description: "May delay the mission" },
    { id: "drone:survival-risk", version: 1, description: "Risk to unit survival" }
  ]
};

describe("DomainRegistry", () => {
  it("registers and resolves a versioned game ontology", () => {
    const registry = new DomainRegistry();
    registry.register(droneDomain);

    expect(registry.domain("drone:reconnaissance")?.version).toBe("1.0.0");
    expect(registry.action("drone:retreat")?.skillId).toBe("drone:retreat-skill");
    expect(registry.fingerprint("drone:reconnaissance")).toBe(fingerprintGameDomain(droneDomain));
  });

  it("rejects action references to unknown entity types", () => {
    const registry = new DomainRegistry();
    const invalid: GameDomain = {
      ...droneDomain,
      actions: [{ ...droneDomain.actions[0]!, targetTypes: ["drone:unknown"] }]
    };

    expect(() => registry.register(invalid)).toThrowError(DomainValidationError);
  });

  it("rejects identifiers that are not namespaced", () => {
    const registry = new DomainRegistry();
    expect(() => registry.register({ ...droneDomain, id: "drone" as never })).toThrow(
      "Invalid namespaced domain id"
    );
  });

  it("rejects semantic references that were not registered as tags", () => {
    const registry = new DomainRegistry();
    const invalid: GameDomain = {
      ...droneDomain,
      actions: [{ ...droneDomain.actions[0]!, risks: ["drone:unknown-risk"] }]
    };

    expect(() => registry.register(invalid)).toThrow("Unknown semantic reference");
  });

  it("rejects action references to unknown constraint definitions", () => {
    const registry = new DomainRegistry();
    const invalid: GameDomain = {
      ...droneDomain,
      actions: [{ ...droneDomain.actions[0]!, requirements: ["drone:unknown-constraint"] }]
    };

    expect(() => registry.register(invalid)).toThrow("Unknown constraint reference");
  });

  it("rejects action references to unknown effect definitions", () => {
    const registry = new DomainRegistry();
    const invalid: GameDomain = {
      ...droneDomain,
      actions: [{ ...droneDomain.actions[0]!, potentialEffects: ["drone:unknown-effect"] }]
    };

    expect(() => registry.register(invalid)).toThrow("Unknown effect reference");
  });

  it("rejects constraint subject types that are not registered entities", () => {
    const registry = new DomainRegistry();
    const invalid: GameDomain = {
      ...droneDomain,
      constraints: [{ ...droneDomain.constraints[0]!, subjectTypes: ["drone:unknown"] }]
    };

    expect(() => registry.register(invalid)).toThrow("Unknown subject type");
  });

  it("fingerprints manifest content canonically and includes its schema", () => {
    expect(fingerprintManifest({ b: 2, a: 1 })).toBe(fingerprintManifest({ a: 1, b: 2 }));
    expect(fingerprintGameDomain(droneDomain)).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(
      fingerprintManifest({ schemaVersion: CORTEX_DOMAIN_MANIFEST_SCHEMA_V1, domain: droneDomain })
    ).toBe(fingerprintGameDomain(droneDomain));
    expect(fingerprintGameDomain({ ...droneDomain, version: "1.0.1" })).not.toBe(
      fingerprintGameDomain(droneDomain)
    );
  });
});
