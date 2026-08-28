import { describe, expect, it } from "vitest";
import { DomainRegistry, DomainValidationError, type GameDomain } from "../src/index.js";

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
  resources: [],
  relationshipDimensions: [],
  tags: []
};

describe("DomainRegistry", () => {
  it("registers and resolves a versioned game ontology", () => {
    const registry = new DomainRegistry();
    registry.register(droneDomain);

    expect(registry.domain("drone:reconnaissance")?.version).toBe("1.0.0");
    expect(registry.action("drone:retreat")?.skillId).toBe("drone:retreat-skill");
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
});

