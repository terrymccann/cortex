import { createHash } from "node:crypto";
import type {
  ActionId,
  AgentId,
  DecisionId,
  EventId,
  ExpectedEffect,
  NamespacedId,
  PerceptibleWorldEvent,
  SimTime,
  WorldConstraint
} from "./index.js";

export const CORTEX_PUBLIC_ID_MAX_LENGTH = 100 as const;
export const CORTEX_REASON_CODE_MAX_LENGTH = 100 as const;
export const CORTEX_PROVIDER_IDENTIFIER_MAX_LENGTH = 100 as const;
export const CORTEX_OBJECTIVE_MAX_LENGTH = 400 as const;
export const CORTEX_SHORT_TEXT_MAX_LENGTH = 500 as const;
export const CORTEX_DESCRIPTION_MAX_LENGTH = 2_000 as const;
export const CORTEX_RECORD_ARRAY_MAX_ITEMS = 10_000 as const;

export const CORTEX_WORLD_PROJECT_SCHEMA_V1 = "cortex-world-project-v1" as const;
export const CORTEX_WORLD_SESSION_SCHEMA_V1 = "cortex-world-session-v1" as const;
export const CORTEX_WORLD_SESSION_STATE_SCHEMA_V1 = "cortex-world-session-state-v1" as const;
export const CORTEX_WORLD_SESSION_CHECKPOINT_SCHEMA_V1 = "cortex-world-session-checkpoint-v1" as const;
export const CORTEX_WORLD_ACTIVATION_RECORD_SCHEMA_V1 = "cortex-world-activation-record-v1" as const;
export const CORTEX_ACTION_PROPOSAL_SCHEMA_V1 = "cortex-action-proposal-v1" as const;
export const CORTEX_PROPOSAL_DISPOSITION_SCHEMA_V1 =
  "cortex-proposal-disposition-v1" as const;
export const CORTEX_AUTHORITATIVE_ACTION_OUTCOME_SCHEMA_V1 =
  "cortex-authoritative-action-outcome-v1" as const;
export const CORTEX_WORLD_RUN_BUNDLE_SCHEMA_V1 = "cortex-world-run-bundle-v1" as const;
export const CORTEX_BASELINE_MANIFEST_SCHEMA_V1 = "cortex-baseline-manifest-v1" as const;
export const CORTEX_RUNTIME_IDENTITY_SET_SCHEMA_V1 = "cortex-runtime-identities-v1" as const;

export const CORTEX_PACKAGE_IDENTITIES_V1 = Object.freeze({
  contracts: { id: "@cortex/contracts", version: "0.1.0" },
  domain: { id: "@cortex/domain", version: "0.1.0" },
  openai: { id: "@cortex/openai", version: "0.1.0" },
  runtime: { id: "@cortex/runtime", version: "0.1.0" },
  sdk: { id: "@cortex/sdk", version: "0.1.0" }
} as const);

export const CORTEX_PRODUCT_SCHEMA_IDENTITIES_V1 = Object.freeze({
  actionProposal: CORTEX_ACTION_PROPOSAL_SCHEMA_V1,
  activationRecord: CORTEX_WORLD_ACTIVATION_RECORD_SCHEMA_V1,
  authoritativeActionOutcome: CORTEX_AUTHORITATIVE_ACTION_OUTCOME_SCHEMA_V1,
  baselineManifest: CORTEX_BASELINE_MANIFEST_SCHEMA_V1,
  proposalDisposition: CORTEX_PROPOSAL_DISPOSITION_SCHEMA_V1,
  runtimeIdentitySet: CORTEX_RUNTIME_IDENTITY_SET_SCHEMA_V1,
  worldProject: CORTEX_WORLD_PROJECT_SCHEMA_V1,
  worldRunBundle: CORTEX_WORLD_RUN_BUNDLE_SCHEMA_V1,
  worldSession: CORTEX_WORLD_SESSION_SCHEMA_V1,
  worldSessionCheckpoint: CORTEX_WORLD_SESSION_CHECKPOINT_SCHEMA_V1,
  worldSessionState: CORTEX_WORLD_SESSION_STATE_SCHEMA_V1
} as const);

export type WorldProjectId = NamespacedId;
export type WorldSessionId = NamespacedId;
export type ActionProposalId = NamespacedId;
export type ActionSubmissionId = NamespacedId;
export type ActionOutcomeId = NamespacedId;
export type WorldRunId = NamespacedId;
export type BaselineId = NamespacedId;
export type ArtifactId = NamespacedId;
export type Sha256Fingerprint = `sha256:${string}`;

export interface PackageIdentity {
  readonly id: `@cortex/${string}`;
  readonly version: string;
}

export interface PromptIdentity {
  readonly task: "controller" | "goal" | "planner" | string;
  readonly promptVersion: string;
  readonly responseSchemaVersion: string;
}

export interface CompatibilityComponent {
  readonly kind: string;
  readonly id: NamespacedId;
  readonly version: string;
  readonly fingerprint?: Sha256Fingerprint;
}

export interface RuntimeIdentitySet {
  readonly schemaVersion: typeof CORTEX_RUNTIME_IDENTITY_SET_SCHEMA_V1;
  readonly packages: readonly PackageIdentity[];
  readonly schemas: Readonly<Record<string, string>>;
  readonly prompts: readonly PromptIdentity[];
  readonly compatibility: readonly CompatibilityComponent[];
  readonly fingerprint: Sha256Fingerprint;
}

export interface WorldProjectDefinitionRef {
  readonly id: NamespacedId;
  readonly version: string;
  readonly fingerprint: Sha256Fingerprint;
}

export interface WorldProjectV1 {
  readonly schemaVersion: typeof CORTEX_WORLD_PROJECT_SCHEMA_V1;
  readonly projectId: WorldProjectId;
  readonly revision: number;
  readonly title: string;
  readonly description?: string;
  readonly domains: readonly WorldProjectDefinitionRef[];
  readonly packs: readonly WorldProjectDefinitionRef[];
  readonly hostAdapter: {
    readonly id: NamespacedId;
    readonly version: string;
    readonly capabilityIds: readonly NamespacedId[];
  };
  readonly actorIds: readonly AgentId[];
  readonly groupIds: readonly NamespacedId[];
  readonly artifactRefs: readonly ArtifactId[];
  readonly providerProfileIds: readonly NamespacedId[];
  readonly compatibilityFingerprint: Sha256Fingerprint;
  readonly contentFingerprint: Sha256Fingerprint;
}

export interface LegacyWorldProjectV0 {
  readonly schemaVersion: "cortex-world-project-v0";
  readonly id: WorldProjectId;
  readonly title: string;
  readonly domain: WorldProjectDefinitionRef;
  readonly packs?: readonly WorldProjectDefinitionRef[];
  readonly hostAdapterId: NamespacedId;
  readonly hostAdapterVersion: string;
  readonly capabilityIds?: readonly NamespacedId[];
  readonly actorIds?: readonly AgentId[];
  readonly compatibilityFingerprint: Sha256Fingerprint;
}

export type WorldSessionLifecycle =
  | "ready"
  | "running"
  | "paused"
  | "stopped"
  | "completed"
  | "budget-exhausted"
  | "deadlocked"
  | "failed";

export interface WorldSessionV1 {
  readonly schemaVersion: typeof CORTEX_WORLD_SESSION_SCHEMA_V1;
  readonly sessionId: WorldSessionId;
  readonly projectId: WorldProjectId;
  readonly projectFingerprint: Sha256Fingerprint;
  readonly lifecycle: WorldSessionLifecycle;
  readonly seed: number;
  readonly createdAt: SimTime;
  readonly updatedAt: SimTime;
  readonly worldVersion: number;
  readonly observedThroughSequence: number;
  readonly agentIds: readonly AgentId[];
  readonly compatibilityFingerprint: Sha256Fingerprint;
  readonly parentSessionId?: WorldSessionId;
}

export interface WorldSessionBudgetPolicyV1 {
  readonly maximumActivations: number;
  readonly maximumProposals: number;
  readonly maximumProviderCalls: number;
  readonly maximumNoProgressSteps: number;
  readonly maximumActivationsPerStep: number;
  readonly activationCooldown: number;
}

export interface WorldSessionUsageV1 {
  readonly activations: number;
  readonly proposals: number;
  readonly acceptedSubmissions: number;
  readonly rejectedSubmissions: number;
  readonly authoritativeOutcomes: number;
  readonly providerCalls: number;
  readonly recordedProviderUses: number;
  readonly meaningfulTransitions: number;
}

export interface WorldActivationTriggerV1 {
  readonly agentId: AgentId;
  readonly reasons: readonly NamespacedId[];
  readonly sourceEventIds: readonly EventId[];
  readonly materialStateFingerprint: Sha256Fingerprint;
  readonly worldVersion: number;
  readonly notBefore: SimTime;
}

export interface WorldActivationRecordV1 {
  readonly schemaVersion: typeof CORTEX_WORLD_ACTIVATION_RECORD_SCHEMA_V1;
  readonly activationId: NamespacedId;
  readonly agentId: AgentId;
  readonly sequence: number;
  readonly reasons: readonly NamespacedId[];
  readonly sourceEventIds: readonly EventId[];
  readonly materialStateFingerprint: Sha256Fingerprint;
  readonly basedOnSessionRevision: number;
  readonly basedOnAgentStateVersion?: number;
  readonly worldVersion: number;
  readonly simTime: SimTime;
  readonly providerMode: "deterministic" | "recorded" | "live";
  readonly disposition: "no-change" | "proposal" | "state-transition" | "deferred" | "discarded" | "failed";
  readonly reasonCode?: NamespacedId;
  readonly proposalId?: ActionProposalId;
  readonly frameFingerprint?: Sha256Fingerprint;
}

export interface WorldSessionActorRecordV1 {
  readonly agentId: AgentId;
  readonly status: "active" | "retired";
  readonly cognitiveTier: 0 | 1 | 2 | 3;
  readonly lastActivatedAt?: SimTime;
  readonly lastMaterialStateFingerprint?: Sha256Fingerprint;
  readonly lastConsiderationKeys: readonly string[];
}

export interface WorldSessionRuntimeStateV1 {
  readonly schemaVersion: typeof CORTEX_WORLD_SESSION_STATE_SCHEMA_V1;
  readonly sessionId: WorldSessionId;
  readonly revision: number;
  readonly simTime: SimTime;
  readonly worldVersion: number;
  readonly observedThroughSequence: number;
  readonly actors: readonly WorldSessionActorRecordV1[];
  readonly observerProjections: readonly PerceptibleWorldEvent[];
  readonly pendingActivations: readonly WorldActivationTriggerV1[];
  readonly activationRecords: readonly WorldActivationRecordV1[];
  readonly acceptedCognition: AcceptedCognitionRecords;
  readonly proposalIds: readonly ActionProposalId[];
  readonly submissionIds: readonly ActionSubmissionId[];
  readonly outcomeIds: readonly ActionOutcomeId[];
  readonly providerInvocations: readonly unknown[];
  readonly usage: WorldSessionUsageV1;
  readonly budgets: WorldSessionBudgetPolicyV1;
  readonly consecutiveNoProgressSteps: number;
  readonly checkpointIds: readonly NamespacedId[];
  readonly lineage?: {
    readonly parentSessionId: WorldSessionId;
    readonly parentCheckpointId: NamespacedId;
  };
}

export interface WorldSessionCheckpointV1 {
  readonly schemaVersion: typeof CORTEX_WORLD_SESSION_CHECKPOINT_SCHEMA_V1;
  readonly checkpointId: NamespacedId;
  readonly session: WorldSessionV1;
  readonly state: WorldSessionRuntimeStateV1;
  readonly agentStateSnapshots: Readonly<Record<string, unknown>>;
  readonly checkpointFingerprint: Sha256Fingerprint;
}

export interface ActionProposalV1 {
  readonly schemaVersion: typeof CORTEX_ACTION_PROPOSAL_SCHEMA_V1;
  readonly proposalId: ActionProposalId;
  readonly sessionId: WorldSessionId;
  readonly agentId: AgentId;
  readonly decisionId: DecisionId;
  readonly actionId: ActionId;
  readonly capabilityId: NamespacedId;
  readonly actionType: NamespacedId;
  readonly arguments: Readonly<Record<string, unknown>>;
  readonly constraints: readonly WorldConstraint[];
  readonly expectedEffects: readonly ExpectedEffect[];
  readonly basedOnWorldVersion: number;
  readonly issuedAt: SimTime;
  readonly expiresAt?: SimTime;
}

export interface ProposalDispositionV1 {
  readonly schemaVersion: typeof CORTEX_PROPOSAL_DISPOSITION_SCHEMA_V1;
  readonly submissionId: ActionSubmissionId;
  readonly proposalId: ActionProposalId;
  readonly status: "accepted" | "deferred" | "rejected";
  readonly reasonCode?: NamespacedId;
  readonly hostWorldVersion: number;
  readonly submittedAt: SimTime;
}

export interface AuthoritativeActionOutcomeV1 {
  readonly schemaVersion: typeof CORTEX_AUTHORITATIVE_ACTION_OUTCOME_SCHEMA_V1;
  readonly outcomeId: ActionOutcomeId;
  readonly proposalId: ActionProposalId;
  readonly submissionId: ActionSubmissionId;
  readonly actionId: ActionId;
  readonly status: "succeeded" | "partially-succeeded" | "failed" | "cancelled";
  readonly reasonCode: NamespacedId;
  readonly canonicalEventIds: readonly NamespacedId[];
  readonly hostEvidence: readonly {
    readonly eventId: NamespacedId;
    readonly worldVersion: number;
    readonly evidenceFingerprint: Sha256Fingerprint;
  }[];
  readonly observedAt: SimTime;
}

export interface AcceptedCognitionRecords {
  readonly goals: readonly unknown[];
  readonly plans: readonly unknown[];
  readonly decisions: readonly unknown[];
}

export interface WorldRunBundleV1 {
  readonly schemaVersion: typeof CORTEX_WORLD_RUN_BUNDLE_SCHEMA_V1;
  readonly runId: WorldRunId;
  readonly createdAt: string;
  readonly identities: RuntimeIdentitySet;
  readonly project: {
    readonly projectId: WorldProjectId;
    readonly contentFingerprint: Sha256Fingerprint;
  };
  readonly session: WorldSessionV1;
  readonly observerProjections: readonly PerceptibleWorldEvent[];
  readonly acceptedCognition: AcceptedCognitionRecords;
  readonly proposals: readonly ActionProposalV1[];
  readonly submissions: readonly ProposalDispositionV1[];
  readonly outcomes: readonly AuthoritativeActionOutcomeV1[];
  readonly checkpoints: readonly WorldSessionCheckpointV1[];
  readonly providerInvocations: readonly unknown[];
  readonly scenarioArtifacts: Readonly<Record<string, unknown>>;
  readonly finalAgentStateFingerprints: Readonly<Record<string, Sha256Fingerprint>>;
  readonly finalStateFingerprint: Sha256Fingerprint;
  readonly runtimeState?: WorldSessionRuntimeStateV1;
  readonly bundleFingerprint: Sha256Fingerprint;
}

export interface BaselineManifestV1 {
  readonly schemaVersion: typeof CORTEX_BASELINE_MANIFEST_SCHEMA_V1;
  readonly baselineId: BaselineId;
  readonly status: "candidate" | "frozen";
  readonly createdAt: string;
  readonly identitiesFingerprint: Sha256Fingerprint;
  readonly compatibilityFingerprint: Sha256Fingerprint;
  readonly sourceRunBundleFingerprint: Sha256Fingerprint;
  readonly cohortFingerprint?: Sha256Fingerprint;
  readonly policy: {
    readonly mutable: false;
    readonly requiredInvariants: Readonly<Record<string, number | boolean>>;
  };
  readonly manifestFingerprint: Sha256Fingerprint;
}

export class ProductContractValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProductContractValidationError";
  }
}

const namespacedIdPattern = /^[a-z][a-z0-9-]*:[a-z][a-z0-9-]*$/;
const sha256Pattern = /^sha256:[a-f0-9]{64}$/;
const semanticVersionPattern = /^\d+\.\d+\.\d+(?:-[a-z0-9.-]+)?$/;

export const isBoundedNamespacedId = (value: unknown): value is NamespacedId =>
  typeof value === "string" &&
  value.length <= CORTEX_PUBLIC_ID_MAX_LENGTH &&
  namespacedIdPattern.test(value);

export const isBoundedReasonCode = (value: unknown): value is NamespacedId =>
  typeof value === "string" &&
  value.length <= CORTEX_REASON_CODE_MAX_LENGTH &&
  namespacedIdPattern.test(value);

export const isSha256Fingerprint = (value: unknown): value is Sha256Fingerprint =>
  typeof value === "string" && sha256Pattern.test(value);

export const fingerprintArtifact = (value: unknown): Sha256Fingerprint =>
  `sha256:${createHash("sha256").update(canonicalJson(value)).digest("hex")}`;

export const createRuntimeIdentitySet = (input: {
  readonly packages?: readonly PackageIdentity[];
  readonly schemas?: Readonly<Record<string, string>>;
  readonly prompts: readonly PromptIdentity[];
  readonly compatibility?: readonly CompatibilityComponent[];
}): RuntimeIdentitySet => {
  const body = {
    schemaVersion: CORTEX_RUNTIME_IDENTITY_SET_SCHEMA_V1,
    packages: [...structuredClone(input.packages ?? Object.values(CORTEX_PACKAGE_IDENTITIES_V1))]
      .sort((left, right) => left.id.localeCompare(right.id)),
    schemas: Object.fromEntries(
      Object.entries(input.schemas ?? CORTEX_PRODUCT_SCHEMA_IDENTITIES_V1)
        .sort(([left], [right]) => left.localeCompare(right))
    ),
    prompts: [...structuredClone(input.prompts)]
      .sort((left, right) => left.task.localeCompare(right.task)),
    compatibility: [...structuredClone(input.compatibility ?? [])]
      .sort((left, right) =>
        left.kind.localeCompare(right.kind) || left.id.localeCompare(right.id) ||
        left.version.localeCompare(right.version)
      )
  };
  const identities = { ...body, fingerprint: fingerprintArtifact(body) };
  assertRuntimeIdentitySet(identities);
  return identities;
};

export const assertRuntimeIdentitySet = (value: RuntimeIdentitySet): void => {
  assertExactKeys(value, ["schemaVersion", "packages", "schemas", "prompts", "compatibility", "fingerprint"], "runtime identities");
  if (value.schemaVersion !== CORTEX_RUNTIME_IDENTITY_SET_SCHEMA_V1) invalid("runtime identity schema");
  assertBoundedArray(value.packages, "packages");
  assertBoundedArray(value.prompts, "prompts");
  assertBoundedArray(value.compatibility, "compatibility");
  for (const identity of value.packages) {
    if (!identity.id.startsWith("@cortex/") || identity.id.length > CORTEX_PUBLIC_ID_MAX_LENGTH ||
      !semanticVersionPattern.test(identity.version)) invalid("package identity");
  }
  if (Object.entries(value.schemas).some(([key, schema]) => !boundedToken(key) || !boundedToken(schema))) invalid("schema identity");
  for (const prompt of value.prompts) {
    if (!boundedToken(prompt.task) || !boundedToken(prompt.promptVersion) || !boundedToken(prompt.responseSchemaVersion)) {
      invalid("prompt identity");
    }
  }
  for (const component of value.compatibility) assertCompatibilityComponent(component);
  const { fingerprint: _fingerprint, ...body } = value;
  if (fingerprintArtifact(body) !== value.fingerprint) invalid("runtime identity fingerprint");
};

export const migrateWorldProjectV0 = (legacy: LegacyWorldProjectV0): WorldProjectV1 => {
  if (legacy.schemaVersion !== "cortex-world-project-v0") invalid("legacy world project schema");
  const withoutFingerprint = {
    schemaVersion: CORTEX_WORLD_PROJECT_SCHEMA_V1,
    projectId: legacy.id,
    revision: 1,
    title: legacy.title,
    domains: [structuredClone(legacy.domain)],
    packs: structuredClone(legacy.packs ?? []),
    hostAdapter: {
      id: legacy.hostAdapterId,
      version: legacy.hostAdapterVersion,
      capabilityIds: structuredClone(legacy.capabilityIds ?? [])
    },
    actorIds: structuredClone(legacy.actorIds ?? []),
    groupIds: [],
    artifactRefs: [],
    providerProfileIds: [],
    compatibilityFingerprint: legacy.compatibilityFingerprint
  };
  const migrated: WorldProjectV1 = {
    ...withoutFingerprint,
    contentFingerprint: fingerprintArtifact(withoutFingerprint)
  };
  assertWorldProject(migrated);
  return migrated;
};

export const assertWorldProject = (value: WorldProjectV1): void => {
  assertExactKeys(value, ["schemaVersion", "projectId", "revision", "title", "description", "domains", "packs", "hostAdapter", "actorIds", "groupIds", "artifactRefs", "providerProfileIds", "compatibilityFingerprint", "contentFingerprint"], "world project", ["description"]);
  if (value.schemaVersion !== CORTEX_WORLD_PROJECT_SCHEMA_V1 || !isBoundedNamespacedId(value.projectId)) invalid("world project identity");
  if (!Number.isInteger(value.revision) || value.revision < 1) invalid("world project revision");
  assertText(value.title, CORTEX_SHORT_TEXT_MAX_LENGTH, "world project title");
  if (value.description !== undefined) assertText(value.description, CORTEX_DESCRIPTION_MAX_LENGTH, "world project description");
  assertBoundedArray(value.domains, "world project domains");
  if (value.domains.length === 0) invalid("world project domains");
  assertBoundedArray(value.packs, "world project packs");
  for (const ref of [...value.domains, ...value.packs]) assertDefinitionRef(ref);
  if (!isBoundedNamespacedId(value.hostAdapter.id) || !boundedToken(value.hostAdapter.version)) invalid("host adapter");
  assertIds(value.hostAdapter.capabilityIds, "host capabilities");
  assertOpaqueIds(value.actorIds, "actor ids");
  assertIds(value.groupIds, "group ids");
  assertIds(value.artifactRefs, "artifact refs");
  assertIds(value.providerProfileIds, "provider profiles");
  if (!isSha256Fingerprint(value.compatibilityFingerprint)) invalid("world project compatibility fingerprint");
  const { contentFingerprint: _fingerprint, ...body } = value;
  if (fingerprintArtifact(body) !== value.contentFingerprint) invalid("world project content fingerprint");
};

export const assertWorldSession = (value: WorldSessionV1): void => {
  assertExactKeys(value, ["schemaVersion", "sessionId", "projectId", "projectFingerprint", "lifecycle", "seed", "createdAt", "updatedAt", "worldVersion", "observedThroughSequence", "agentIds", "compatibilityFingerprint", "parentSessionId"], "world session", ["parentSessionId"]);
  if (value.schemaVersion !== CORTEX_WORLD_SESSION_SCHEMA_V1 ||
    !isBoundedNamespacedId(value.sessionId) || !isBoundedNamespacedId(value.projectId)) invalid("world session identity");
  if (!isSha256Fingerprint(value.projectFingerprint) || !isSha256Fingerprint(value.compatibilityFingerprint)) invalid("world session fingerprint");
  if (!["ready", "running", "paused", "stopped", "completed", "budget-exhausted", "deadlocked", "failed"].includes(value.lifecycle)) invalid("world session lifecycle");
  if (!Number.isSafeInteger(value.seed) || !nonNegativeInteger(value.worldVersion) || !nonNegativeInteger(value.observedThroughSequence)) invalid("world session counter");
  if (!Number.isFinite(value.createdAt) || !Number.isFinite(value.updatedAt) || value.updatedAt < value.createdAt) invalid("world session time");
  assertOpaqueIds(value.agentIds, "world session agents");
  if (value.parentSessionId !== undefined && !isBoundedNamespacedId(value.parentSessionId)) invalid("parent session id");
};

export const assertActionProposal = (value: ActionProposalV1): void => {
  assertExactKeys(value, ["schemaVersion", "proposalId", "sessionId", "agentId", "decisionId", "actionId", "capabilityId", "actionType", "arguments", "constraints", "expectedEffects", "basedOnWorldVersion", "issuedAt", "expiresAt"], "action proposal", ["expiresAt"]);
  if (value.schemaVersion !== CORTEX_ACTION_PROPOSAL_SCHEMA_V1 ||
    !isBoundedNamespacedId(value.proposalId) || !isBoundedNamespacedId(value.sessionId) ||
    !boundedOpaqueId(value.agentId) || !boundedOpaqueId(value.decisionId) || !boundedOpaqueId(value.actionId) ||
    !isBoundedNamespacedId(value.capabilityId) || !isBoundedNamespacedId(value.actionType)) invalid("action proposal identity");
  if (!nonNegativeInteger(value.basedOnWorldVersion) || !Number.isFinite(value.issuedAt)) invalid("action proposal version or time");
  if (value.expiresAt !== undefined && (!Number.isFinite(value.expiresAt) || value.expiresAt < value.issuedAt)) invalid("action proposal expiry");
  assertJsonObject(value.arguments, "action proposal arguments");
  assertBoundedArray(value.constraints, "action proposal constraints");
  assertBoundedArray(value.expectedEffects, "action proposal expected effects");
  for (const constraint of value.constraints) {
    if (!isBoundedNamespacedId(constraint.definitionId) || !positiveInteger(constraint.definitionVersion)) invalid("proposal constraint");
    assertJsonObject(constraint.parameters, "proposal constraint parameters");
  }
  for (const effect of value.expectedEffects) {
    if (!isBoundedNamespacedId(effect.definitionId) || !positiveInteger(effect.definitionVersion) || !Number.isFinite(effect.deadline)) invalid("proposal expected effect");
    assertJsonObject(effect.parameters, "proposal effect parameters");
  }
};

export const assertWorldSessionRuntimeState = (value: WorldSessionRuntimeStateV1): void => {
  assertExactKeys(value, ["schemaVersion", "sessionId", "revision", "simTime", "worldVersion", "observedThroughSequence", "actors", "observerProjections", "pendingActivations", "activationRecords", "acceptedCognition", "proposalIds", "submissionIds", "outcomeIds", "providerInvocations", "usage", "budgets", "consecutiveNoProgressSteps", "checkpointIds", "lineage"], "world session state", ["lineage"]);
  if (value.schemaVersion !== CORTEX_WORLD_SESSION_STATE_SCHEMA_V1 || !isBoundedNamespacedId(value.sessionId) ||
    !nonNegativeInteger(value.revision) || !Number.isFinite(value.simTime) || !nonNegativeInteger(value.worldVersion) ||
    !nonNegativeInteger(value.observedThroughSequence) || !nonNegativeInteger(value.consecutiveNoProgressSteps)) invalid("world session state");
  for (const records of [value.actors, value.observerProjections, value.pendingActivations, value.activationRecords, value.acceptedCognition.goals, value.acceptedCognition.plans, value.acceptedCognition.decisions, value.providerInvocations]) assertBoundedArray(records, "world session records");
  assertIds(value.proposalIds, "world session proposal ids");
  assertIds(value.submissionIds, "world session submission ids");
  assertIds(value.outcomeIds, "world session outcome ids");
  assertIds(value.checkpointIds, "world session checkpoint ids");
  assertExactKeys(value.acceptedCognition, ["goals", "plans", "decisions"], "accepted cognition");
  assertExactKeys(value.usage, ["activations", "proposals", "acceptedSubmissions", "rejectedSubmissions", "authoritativeOutcomes", "providerCalls", "recordedProviderUses", "meaningfulTransitions"], "world session usage");
  const actorIds = new Set<string>();
  for (const actor of value.actors) {
    assertExactKeys(actor, ["agentId", "status", "cognitiveTier", "lastActivatedAt", "lastMaterialStateFingerprint", "lastConsiderationKeys"], "world session actor", ["lastActivatedAt", "lastMaterialStateFingerprint"]);
    if (!boundedOpaqueId(actor.agentId) || actorIds.has(actor.agentId) || ![0, 1, 2, 3].includes(actor.cognitiveTier) || !["active", "retired"].includes(actor.status)) invalid("world session actor");
    actorIds.add(actor.agentId);
    if (actor.lastActivatedAt !== undefined && !Number.isFinite(actor.lastActivatedAt)) invalid("actor activation time");
    if (actor.lastMaterialStateFingerprint !== undefined && !isSha256Fingerprint(actor.lastMaterialStateFingerprint)) invalid("actor material fingerprint");
    if (actor.lastConsiderationKeys.length > 100 || actor.lastConsiderationKeys.some((key) => !boundedToken(key))) invalid("actor consideration key");
  }
  for (const trigger of value.pendingActivations) {
    assertExactKeys(trigger, ["agentId", "reasons", "sourceEventIds", "materialStateFingerprint", "worldVersion", "notBefore"], "activation trigger");
    if (!actorIds.has(trigger.agentId) || trigger.reasons.length === 0 || trigger.reasons.some((reason) => !isBoundedReasonCode(reason)) || !isSha256Fingerprint(trigger.materialStateFingerprint) || !nonNegativeInteger(trigger.worldVersion) || !Number.isFinite(trigger.notBefore)) invalid("activation trigger");
    assertOpaqueIds(trigger.sourceEventIds, "activation trigger event ids");
  }
  for (const record of value.activationRecords) assertWorldActivationRecord(record);
  assertBudgetPolicy(value.budgets);
  if (Object.values(value.usage).some((count) => !nonNegativeInteger(count))) invalid("world session usage");
  if (value.lineage !== undefined) {
    assertExactKeys(value.lineage, ["parentSessionId", "parentCheckpointId"], "world session lineage");
    if (!isBoundedNamespacedId(value.lineage.parentSessionId) || !isBoundedNamespacedId(value.lineage.parentCheckpointId)) invalid("world session lineage");
  }
};

export const assertWorldActivationRecord = (value: WorldActivationRecordV1): void => {
  assertExactKeys(value, ["schemaVersion", "activationId", "agentId", "sequence", "reasons", "sourceEventIds", "materialStateFingerprint", "basedOnSessionRevision", "basedOnAgentStateVersion", "worldVersion", "simTime", "providerMode", "disposition", "reasonCode", "proposalId", "frameFingerprint"], "activation record", ["basedOnAgentStateVersion", "reasonCode", "proposalId", "frameFingerprint"]);
  if (value.schemaVersion !== CORTEX_WORLD_ACTIVATION_RECORD_SCHEMA_V1 || !isBoundedNamespacedId(value.activationId) ||
    !boundedOpaqueId(value.agentId) || !positiveInteger(value.sequence) || value.reasons.length === 0 ||
    value.reasons.some((reason) => !isBoundedReasonCode(reason)) || !isSha256Fingerprint(value.materialStateFingerprint) ||
    !nonNegativeInteger(value.basedOnSessionRevision) || (value.basedOnAgentStateVersion !== undefined && !nonNegativeInteger(value.basedOnAgentStateVersion)) ||
    !nonNegativeInteger(value.worldVersion) || !Number.isFinite(value.simTime) ||
    !["deterministic", "recorded", "live"].includes(value.providerMode) ||
    !["no-change", "proposal", "state-transition", "deferred", "discarded", "failed"].includes(value.disposition)) invalid("activation record");
  assertOpaqueIds(value.sourceEventIds, "activation event ids");
  if (value.reasonCode !== undefined && !isBoundedReasonCode(value.reasonCode)) invalid("activation reason");
  if (value.proposalId !== undefined && !isBoundedNamespacedId(value.proposalId)) invalid("activation proposal");
  if (value.frameFingerprint !== undefined && !isSha256Fingerprint(value.frameFingerprint)) invalid("activation frame");
};

export const createWorldSessionCheckpoint = (
  input: Omit<WorldSessionCheckpointV1, "schemaVersion" | "checkpointFingerprint">
): WorldSessionCheckpointV1 => {
  const body = { schemaVersion: CORTEX_WORLD_SESSION_CHECKPOINT_SCHEMA_V1, ...structuredClone(input) };
  const checkpoint = { ...body, checkpointFingerprint: fingerprintArtifact(body) };
  assertWorldSessionCheckpoint(checkpoint);
  return checkpoint;
};

export const assertWorldSessionCheckpoint = (value: WorldSessionCheckpointV1): void => {
  assertExactKeys(value, ["schemaVersion", "checkpointId", "session", "state", "agentStateSnapshots", "checkpointFingerprint"], "world session checkpoint");
  if (value.schemaVersion !== CORTEX_WORLD_SESSION_CHECKPOINT_SCHEMA_V1 || !isBoundedNamespacedId(value.checkpointId)) invalid("world session checkpoint");
  assertWorldSession(value.session);
  assertWorldSessionRuntimeState(value.state);
  assertJsonObject(value.agentStateSnapshots, "checkpoint agent snapshots");
  if (value.session.sessionId !== value.state.sessionId) invalid("checkpoint session linkage");
  const { checkpointFingerprint: _fingerprint, ...body } = value;
  if (fingerprintArtifact(body) !== value.checkpointFingerprint) invalid("checkpoint fingerprint");
};

export const assertProposalDisposition = (value: ProposalDispositionV1): void => {
  assertExactKeys(value, ["schemaVersion", "submissionId", "proposalId", "status", "reasonCode", "hostWorldVersion", "submittedAt"], "proposal disposition", ["reasonCode"]);
  if (value.schemaVersion !== CORTEX_PROPOSAL_DISPOSITION_SCHEMA_V1 ||
    !isBoundedNamespacedId(value.submissionId) || !isBoundedNamespacedId(value.proposalId) ||
    !nonNegativeInteger(value.hostWorldVersion) || !Number.isFinite(value.submittedAt)) invalid("proposal disposition");
  if (!["accepted", "deferred", "rejected"].includes(value.status)) invalid("proposal disposition status");
  if ((value.status === "deferred" || value.status === "rejected") && !isBoundedReasonCode(value.reasonCode)) invalid("proposal disposition reason");
  if (value.status === "accepted" && value.reasonCode !== undefined && !isBoundedReasonCode(value.reasonCode)) invalid("proposal disposition reason");
};

export const assertAuthoritativeActionOutcome = (value: AuthoritativeActionOutcomeV1): void => {
  assertExactKeys(value, ["schemaVersion", "outcomeId", "proposalId", "submissionId", "actionId", "status", "reasonCode", "canonicalEventIds", "hostEvidence", "observedAt"], "authoritative outcome");
  if (value.schemaVersion !== CORTEX_AUTHORITATIVE_ACTION_OUTCOME_SCHEMA_V1 ||
    !isBoundedNamespacedId(value.outcomeId) || !isBoundedNamespacedId(value.proposalId) ||
    !isBoundedNamespacedId(value.submissionId) || !boundedOpaqueId(value.actionId) ||
    !isBoundedReasonCode(value.reasonCode) || !Number.isFinite(value.observedAt)) invalid("authoritative outcome");
  if (!["succeeded", "partially-succeeded", "failed", "cancelled"].includes(value.status)) invalid("authoritative outcome status");
  assertIds(value.canonicalEventIds, "canonical event ids");
  if (value.canonicalEventIds.length === 0 || value.hostEvidence.length === 0) invalid("authoritative outcome evidence");
  assertBoundedArray(value.hostEvidence, "host evidence");
  for (const evidence of value.hostEvidence) {
    if (!isBoundedNamespacedId(evidence.eventId) || !nonNegativeInteger(evidence.worldVersion) || !isSha256Fingerprint(evidence.evidenceFingerprint)) invalid("host evidence");
    if (!value.canonicalEventIds.includes(evidence.eventId)) invalid("host evidence event link");
  }
};

export const createWorldRunBundle = (
  input: Omit<WorldRunBundleV1, "schemaVersion" | "bundleFingerprint">
): WorldRunBundleV1 => {
  const body = { schemaVersion: CORTEX_WORLD_RUN_BUNDLE_SCHEMA_V1, ...structuredClone(input) };
  const bundle = { ...body, bundleFingerprint: fingerprintArtifact(body) };
  assertWorldRunBundle(bundle);
  return bundle;
};

export const assertWorldRunBundle = (value: WorldRunBundleV1, expected?: RuntimeIdentitySet): void => {
  assertExactKeys(value, ["schemaVersion", "runId", "createdAt", "identities", "project", "session", "observerProjections", "acceptedCognition", "proposals", "submissions", "outcomes", "checkpoints", "providerInvocations", "scenarioArtifacts", "finalAgentStateFingerprints", "finalStateFingerprint", "runtimeState", "bundleFingerprint"], "world run bundle", ["runtimeState"]);
  if (value.schemaVersion !== CORTEX_WORLD_RUN_BUNDLE_SCHEMA_V1 || !isBoundedNamespacedId(value.runId)) invalid("world run identity");
  if (Number.isNaN(Date.parse(value.createdAt))) invalid("world run createdAt");
  assertRuntimeIdentitySet(value.identities);
  if (expected !== undefined && value.identities.fingerprint !== expected.fingerprint) invalid("world run compatibility");
  if (!isBoundedNamespacedId(value.project.projectId) || !isSha256Fingerprint(value.project.contentFingerprint)) invalid("world run project");
  assertWorldSession(value.session);
  if (value.session.projectId !== value.project.projectId || value.session.projectFingerprint !== value.project.contentFingerprint || value.session.compatibilityFingerprint !== value.identities.fingerprint) invalid("world run linkage");
  for (const records of [value.observerProjections, value.acceptedCognition.goals, value.acceptedCognition.plans, value.acceptedCognition.decisions, value.proposals, value.submissions, value.outcomes, value.checkpoints, value.providerInvocations]) assertBoundedArray(records, "world run records");
  value.proposals.forEach(assertActionProposal);
  value.submissions.forEach(assertProposalDisposition);
  value.outcomes.forEach(assertAuthoritativeActionOutcome);
  value.checkpoints.forEach(assertWorldSessionCheckpoint);
  assertProposalLifecycle(value.proposals, value.submissions, value.outcomes);
  if (!isSha256Fingerprint(value.finalStateFingerprint) || Object.values(value.finalAgentStateFingerprints).some((item) => !isSha256Fingerprint(item))) invalid("world run final state");
  if (value.runtimeState !== undefined) {
    assertWorldSessionRuntimeState(value.runtimeState);
    if (value.runtimeState.sessionId !== value.session.sessionId || fingerprintArtifact(value.runtimeState) !== value.finalStateFingerprint) invalid("world run runtime state");
  }
  const { bundleFingerprint: _fingerprint, ...body } = value;
  if (fingerprintArtifact(body) !== value.bundleFingerprint) invalid("world run bundle fingerprint");
};

export const createBaselineManifest = (
  input: Omit<BaselineManifestV1, "schemaVersion" | "manifestFingerprint">
): BaselineManifestV1 => {
  const body = { schemaVersion: CORTEX_BASELINE_MANIFEST_SCHEMA_V1, ...structuredClone(input) };
  const manifest = { ...body, manifestFingerprint: fingerprintArtifact(body) };
  assertBaselineManifest(manifest);
  return manifest;
};

export const assertBaselineManifest = (value: BaselineManifestV1): void => {
  assertExactKeys(value, ["schemaVersion", "baselineId", "status", "createdAt", "identitiesFingerprint", "compatibilityFingerprint", "sourceRunBundleFingerprint", "cohortFingerprint", "policy", "manifestFingerprint"], "baseline manifest", ["cohortFingerprint"]);
  if (value.schemaVersion !== CORTEX_BASELINE_MANIFEST_SCHEMA_V1 || !isBoundedNamespacedId(value.baselineId) || Number.isNaN(Date.parse(value.createdAt))) invalid("baseline identity");
  if (value.status !== "candidate" && value.status !== "frozen") invalid("baseline status");
  if (!isSha256Fingerprint(value.identitiesFingerprint) || !isSha256Fingerprint(value.compatibilityFingerprint) || !isSha256Fingerprint(value.sourceRunBundleFingerprint) || (value.cohortFingerprint !== undefined && !isSha256Fingerprint(value.cohortFingerprint))) invalid("baseline fingerprint");
  if (value.policy.mutable !== false) invalid("baseline mutability");
  const { manifestFingerprint: _fingerprint, ...body } = value;
  if (fingerprintArtifact(body) !== value.manifestFingerprint) invalid("baseline manifest fingerprint");
};

const assertProposalLifecycle = (
  proposals: readonly ActionProposalV1[],
  submissions: readonly ProposalDispositionV1[],
  outcomes: readonly AuthoritativeActionOutcomeV1[]
): void => {
  const proposalIds = new Set<string>();
  for (const proposal of proposals) {
    if (proposalIds.has(proposal.proposalId)) invalid("duplicate proposal");
    proposalIds.add(proposal.proposalId);
  }
  const submissionById = new Map<string, ProposalDispositionV1>();
  const submittedProposalIds = new Set<string>();
  for (const submission of submissions) {
    if (!proposalIds.has(submission.proposalId) || submissionById.has(submission.submissionId) || submittedProposalIds.has(submission.proposalId)) invalid("proposal submission lifecycle");
    submissionById.set(submission.submissionId, submission);
    submittedProposalIds.add(submission.proposalId);
  }
  const outcomesByProposal = new Set<string>();
  for (const outcome of outcomes) {
    const submission = submissionById.get(outcome.submissionId);
    if (!submission || submission.proposalId !== outcome.proposalId || submission.status !== "accepted" || outcomesByProposal.has(outcome.proposalId)) invalid("proposal outcome lifecycle");
    outcomesByProposal.add(outcome.proposalId);
  }
};

const assertDefinitionRef = (value: WorldProjectDefinitionRef): void => {
  if (!isBoundedNamespacedId(value.id) || !boundedToken(value.version) || !isSha256Fingerprint(value.fingerprint)) invalid("world project definition reference");
};

const assertBudgetPolicy = (value: WorldSessionBudgetPolicyV1): void => {
  assertExactKeys(value, ["maximumActivations", "maximumProposals", "maximumProviderCalls", "maximumNoProgressSteps", "maximumActivationsPerStep", "activationCooldown"], "world session budget policy");
  if (!positiveInteger(value.maximumActivations) || !positiveInteger(value.maximumProposals) ||
    !nonNegativeInteger(value.maximumProviderCalls) || !positiveInteger(value.maximumNoProgressSteps) ||
    !positiveInteger(value.maximumActivationsPerStep) || !nonNegativeInteger(value.activationCooldown)) invalid("world session budget policy");
};

const assertCompatibilityComponent = (value: CompatibilityComponent): void => {
  if (!boundedToken(value.kind) || !isBoundedNamespacedId(value.id) || !boundedToken(value.version) || (value.fingerprint !== undefined && !isSha256Fingerprint(value.fingerprint))) invalid("compatibility component");
};

const assertIds = (values: readonly unknown[], field: string): void => {
  assertBoundedArray(values, field);
  if (values.some((value) => !isBoundedNamespacedId(value)) || new Set(values).size !== values.length) invalid(field);
};

const assertOpaqueIds = (values: readonly unknown[], field: string): void => {
  assertBoundedArray(values, field);
  if (values.some((value) => !boundedOpaqueId(value)) || new Set(values).size !== values.length) invalid(field);
};

const assertBoundedArray = (value: readonly unknown[], field: string): void => {
  if (!Array.isArray(value) || value.length > CORTEX_RECORD_ARRAY_MAX_ITEMS) invalid(field);
};

const assertText = (value: unknown, maximum: number, field: string): void => {
  if (typeof value !== "string" || value.trim().length === 0 || value.length > maximum) invalid(field);
};

const assertJsonObject = (value: unknown, field: string): void => {
  if (!isRecord(value)) throw new ProductContractValidationError(`Invalid ${field}`);
  canonicalJson(value);
};

const boundedOpaqueId = (value: unknown): value is string =>
  typeof value === "string" && value.length > 0 && value.length <= CORTEX_PUBLIC_ID_MAX_LENGTH &&
  /^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(value);

const boundedToken = (value: unknown): value is string =>
  typeof value === "string" && value.length > 0 && value.length <= CORTEX_PROVIDER_IDENTIFIER_MAX_LENGTH &&
  /^[A-Za-z0-9][A-Za-z0-9._:@/-]*$/.test(value);

const positiveInteger = (value: unknown): value is number => Number.isInteger(value) && Number(value) > 0;
const nonNegativeInteger = (value: unknown): value is number => Number.isInteger(value) && Number(value) >= 0;

const assertExactKeys = (
  value: unknown,
  allowed: readonly string[],
  field: string,
  optional: readonly string[] = []
): void => {
  if (!isRecord(value)) throw new ProductContractValidationError(`Invalid ${field}`);
  const record = value as Readonly<Record<string, unknown>>;
  const allowedSet = new Set(allowed);
  if (Object.keys(record).some((key) => !allowedSet.has(key))) invalid(`${field} field`);
  if (allowed.some((key) => !optional.includes(key) && !(key in record))) invalid(`${field} field`);
};

const canonicalJson = (value: unknown): string => JSON.stringify(canonicalize(value));

const canonicalize = (value: unknown): unknown => {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new ProductContractValidationError("Non-finite number in artifact");
    return value;
  }
  if (Array.isArray(value)) return value.map(canonicalize);
  if (isRecord(value)) {
    return Object.fromEntries(Object.entries(value).sort(([left], [right]) => left.localeCompare(right)).map(([key, item]) => [key, canonicalize(item)]));
  }
  throw new ProductContractValidationError(`Unsupported artifact value: ${typeof value}`);
};

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const invalid = (field: string): never => {
  throw new ProductContractValidationError(`Invalid ${field}`);
};
