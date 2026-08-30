import {
  asMemoryId,
  type AgentId,
  type EntityRef,
  type EventId,
  type FeasibleIntention,
  type MemoryId,
  type NamespacedId,
  type SimTime
} from "@cortex/contracts";
import type {
  AgentState,
  AgentStateStore,
  CommittedDecision,
  PatchApplyResult,
  PatchEnvelope,
  StateSliceReducer,
  StateSliceState
} from "@cortex/runtime";
import type { CortexPack } from "@cortex/sdk";
import { goalsPack } from "./goals.js";
import { planningPack } from "./planning.js";

export * from "./goals.js";
export * from "./planning.js";
export * from "./inspection.js";

export const STANDARD_SLICE_IDS = {
  traits: "cortex-traits:state",
  beliefs: "cortex-beliefs:state",
  memory: "cortex-memory:state",
  social: "cortex-social:state",
  goals: "cortex-goals:state",
  planning: "cortex-planning:state",
  conversation: "cortex-conversation:state"
} as const satisfies Readonly<Record<string, NamespacedId>>;

export interface Belief {
  readonly id: string;
  readonly subject: EntityRef;
  readonly predicate: string;
  readonly object: unknown;
  readonly confidence: number;
  readonly acquiredAt: SimTime;
  readonly sources: readonly EventId[];
}

export interface EpisodicMemory {
  readonly id: MemoryId;
  readonly sourceEvents: readonly EventId[];
  readonly summary: string;
  readonly occurredAt: SimTime;
  readonly importance: number;
  readonly emotionalValence: number;
  readonly confidence: number;
}

export interface Relationship {
  readonly target: AgentId;
  readonly trust: number;
  readonly affection: number;
  readonly respect: number;
  readonly fear: number;
  readonly attraction: number;
  readonly resentment: number;
  readonly familiarity: number;
}

export interface CommunicationRecord {
  readonly decisionId: string;
  readonly speechAct: string;
  readonly utterance?: string;
}

export interface TraitsState {
  readonly personality: Readonly<Record<string, number>>;
}

export interface BeliefsState {
  readonly beliefs: readonly Belief[];
}

export interface MemoryState {
  readonly memories: readonly EpisodicMemory[];
}

export interface SocialState {
  readonly relationships: readonly Relationship[];
}

export interface ConversationState {
  readonly lastCommunication?: CommunicationRecord;
}

export interface SocialRelationshipDelta {
  readonly target: AgentId;
  readonly trust?: number;
  readonly affection?: number;
  readonly respect?: number;
  readonly fear?: number;
  readonly attraction?: number;
  readonly resentment?: number;
  readonly familiarity?: number;
}

const traitsReducer = reducer<TraitsState, { readonly set: Readonly<Record<string, number>> }>({
  sliceId: STANDARD_SLICE_IDS.traits,
  writerModules: ["cortex-traits:profile"],
  initial: { personality: {} },
  validate: isTraitsState,
  reduce: (current, operation) => ({ personality: { ...current.personality, ...operation.set } })
});

const beliefsReducer = reducer<BeliefsState, { readonly upsert: readonly Belief[] }>({
  sliceId: STANDARD_SLICE_IDS.beliefs,
  writerModules: ["cortex-beliefs:manager"],
  initial: { beliefs: [] },
  validate: isBeliefsState,
  reduce: (current, operation) => ({ beliefs: upsertById(current.beliefs, operation.upsert) })
});

const memoryReducer = reducer<MemoryState, { readonly append: readonly EpisodicMemory[] }>({
  sliceId: STANDARD_SLICE_IDS.memory,
  writerModules: ["cortex-memory:ingest"],
  initial: { memories: [] },
  validate: isMemoryState,
  reduce: (current, operation) => ({ memories: [...current.memories, ...operation.append] })
});

const socialReducer = reducer<SocialState, { readonly deltas: readonly SocialRelationshipDelta[] }>({
  sliceId: STANDARD_SLICE_IDS.social,
  writerModules: ["cortex-social:awareness"],
  initial: { relationships: [] },
  validate: isSocialState,
  reduce: (current, operation) => ({
    relationships: updateRelationships(current.relationships, operation.deltas)
  })
});

const conversationReducer = reducer<
  ConversationState,
  { readonly record: CommunicationRecord }
>({
  sliceId: STANDARD_SLICE_IDS.conversation,
  writerModules: ["cortex-conversation:renderer"],
  initial: {},
  validate: isConversationState,
  reduce: (_current, operation) => ({ lastCommunication: operation.record })
});

export const traitsPack: CortexPack = pack({
  id: "cortex:traits",
  reducer: traitsReducer,
  moduleId: "cortex-traits:profile",
  frameContributors: [
    frameContributor("cortex:traits", "cortex-traits:profile", STANDARD_SLICE_IDS.traits, 2048, (state) =>
      sliceValue<TraitsState>(state, STANDARD_SLICE_IDS.traits).personality
    )
  ]
});

export const beliefsPack: CortexPack = pack({
  id: "cortex:beliefs",
  reducer: beliefsReducer,
  moduleId: "cortex-beliefs:manager",
  frameContributors: [
    frameContributor("cortex:beliefs", "cortex-beliefs:relevant", STANDARD_SLICE_IDS.beliefs, 8192, (state) =>
      [...sliceValue<BeliefsState>(state, STANDARD_SLICE_IDS.beliefs).beliefs]
        .sort((left, right) => right.confidence - left.confidence)
        .slice(0, 8), 8)
  ]
});

export const memoryPack: CortexPack = pack({
  id: "cortex:memory",
  reducer: memoryReducer,
  moduleId: "cortex-memory:ingest",
  frameContributors: [
    frameContributor("cortex:memory", "cortex-memory:relevant", STANDARD_SLICE_IDS.memory, 8192, (state) =>
      [...sliceValue<MemoryState>(state, STANDARD_SLICE_IDS.memory).memories]
        .sort((left, right) => right.importance - left.importance)
        .slice(0, 8), 8)
  ]
});

export const socialPack: CortexPack = pack({
    id: "cortex:social",
    reducer: socialReducer,
    moduleId: "cortex-social:awareness",
    frameContributors: [
      frameContributor("cortex:social", "cortex-social:relationships", STANDARD_SLICE_IDS.social, 8192, (state) =>
        [...sliceValue<SocialState>(state, STANDARD_SLICE_IDS.social).relationships]
          .sort((left, right) => relationshipMagnitude(right) - relationshipMagnitude(left))
          .slice(0, 6), 6),
      {
        id: "cortex-social:signals",
        ownerPackId: "cortex:social",
        schemaVersion: 1,
        maxBytes: 4096,
        maxItems: 8,
        readsSlices: [],
        validate: isStringArray,
        contribute: (_state, input) => {
          const signals = input.sectionInputs?.["cortex-social:signals"];
          return isStringArray(signals) ? signals.slice(0, 8) : [];
        }
      }
    ]
});

export const conversationPack: CortexPack = pack({
  id: "cortex:conversation",
  reducer: conversationReducer,
  moduleId: "cortex-conversation:renderer",
  frameContributors: [
    frameContributor("cortex:conversation", "cortex-conversation:recent", STANDARD_SLICE_IDS.conversation, 4096, (state) =>
      sliceValue<ConversationState>(state, STANDARD_SLICE_IDS.conversation))
  ]
});

export const standardPacks = [
  traitsPack,
  beliefsPack,
  memoryPack,
  socialPack,
  goalsPack,
  planningPack,
  conversationPack
] as const;

export const sliceState = (value: unknown): StateSliceState => ({ schemaVersion: 1, value });

export const sliceValue = <T>(state: Readonly<AgentState>, sliceId: NamespacedId): T => {
  const slice = state.slices[sliceId];
  if (!slice || slice.schemaVersion !== 1) throw new Error(`Missing compatible state slice: ${sliceId}`);
  return slice.value as T;
};

export class MemoryModule {
  constructor(private readonly stateStore: AgentStateStore) {}

  async remember(input: {
    agentId: AgentId;
    sourceEvents: readonly EventId[];
    summary: string;
    occurredAt: SimTime;
    importance: number;
    emotionalValence: number;
    confidence: number;
  }): Promise<PatchApplyResult> {
    const memory: EpisodicMemory = {
      id: asMemoryId(`memory:${input.agentId}:${input.sourceEvents.join("+")}`),
      sourceEvents: input.sourceEvents,
      summary: input.summary,
      occurredAt: input.occurredAt,
      importance: clamp01(input.importance),
      emotionalValence: Math.max(-1, Math.min(1, input.emotionalValence)),
      confidence: clamp01(input.confidence)
    };
    return applySliceOperation(this.stateStore, {
      agentId: input.agentId,
      module: "cortex-memory:ingest",
      sliceId: STANDARD_SLICE_IDS.memory,
      operation: { append: [memory] },
      triggeredBy: input.sourceEvents,
      now: input.occurredAt,
      key: `${memory.id}:ingest`,
      rebasePolicy: "event-delta"
    });
  }
}

export class SocialAwarenessModule {
  constructor(private readonly stateStore: AgentStateStore) {}

  async applyInference(input: {
    agentId: AgentId;
    eventId: EventId;
    now: SimTime;
    target: AgentId;
    trustDelta?: number;
    respectDelta?: number;
    fearDelta?: number;
    resentmentDelta?: number;
    familiarityDelta?: number;
  }): Promise<PatchApplyResult> {
    const delta: SocialRelationshipDelta = {
      target: input.target,
      ...(input.trustDelta === undefined ? {} : { trust: input.trustDelta }),
      ...(input.respectDelta === undefined ? {} : { respect: input.respectDelta }),
      ...(input.fearDelta === undefined ? {} : { fear: input.fearDelta }),
      ...(input.resentmentDelta === undefined ? {} : { resentment: input.resentmentDelta }),
      ...(input.familiarityDelta === undefined ? {} : { familiarity: input.familiarityDelta })
    };
    return applySliceOperation(this.stateStore, {
      agentId: input.agentId,
      module: "cortex-social:awareness",
      sliceId: STANDARD_SLICE_IDS.social,
      operation: { deltas: [delta] },
      triggeredBy: [input.eventId],
      now: input.now,
      key: `social:${input.agentId}:${input.eventId}`,
      rebasePolicy: "event-delta"
    });
  }
}

export interface CommunicationOutput {
  readonly decisionId: string;
  readonly speechAct: string;
  readonly utterance: string;
}

export interface CommunicationRenderer {
  render(decision: CommittedDecision, intention: FeasibleIntention): CommunicationOutput;
}

export class CommunicationModule {
  constructor(
    private readonly stateStore: AgentStateStore,
    private readonly renderer: CommunicationRenderer
  ) {}

  async communicate(
    decision: CommittedDecision,
    intention: FeasibleIntention,
    now: SimTime
  ): Promise<{ output: CommunicationOutput; applyResult: PatchApplyResult }> {
    const state = await this.stateStore.snapshot(decision.agentId);
    const output = this.renderer.render(decision, intention);
    if (state.currentDecision?.id !== decision.id) {
      return { output, applyResult: { status: "rejected", reason: "decision-not-current" } };
    }
    const applyResult = await applySliceOperation(this.stateStore, {
      agentId: state.id,
      module: "cortex-conversation:renderer",
      sliceId: STANDARD_SLICE_IDS.conversation,
      operation: { record: output },
      triggeredBy: [],
      now,
      key: `communication:${decision.id}`,
      rebasePolicy: "never"
    });
    return { output, applyResult };
  }
}

const applySliceOperation = async (
  store: AgentStateStore,
  input: {
    readonly agentId: AgentId;
    readonly module: NamespacedId;
    readonly sliceId: NamespacedId;
    readonly operation: unknown;
    readonly triggeredBy: readonly EventId[];
    readonly now: SimTime;
    readonly key: string;
    readonly rebasePolicy: "never" | "event-delta";
  }
): Promise<PatchApplyResult> => {
  const state = await store.snapshot(input.agentId);
  const patch: PatchEnvelope = {
    patchId: input.key,
    agentId: input.agentId,
    module: input.module,
    basedOnVersion: state.version,
    worldVersion: 0,
    observedThroughSequence: 0,
    triggeredBy: input.triggeredBy,
    idempotencyKey: input.key,
    rebasePolicy: input.rebasePolicy,
    createdAt: input.now,
    patch: { kind: "state-slice", sliceId: input.sliceId, operation: input.operation }
  };
  return store.apply(patch);
};

function reducer<TState, TOperation>(input: {
  readonly sliceId: NamespacedId;
  readonly writerModules: readonly NamespacedId[];
  readonly initial: TState;
  validate(value: unknown): value is TState;
  reduce(current: TState, operation: TOperation): TState;
}): StateSliceReducer {
  return {
    sliceId: input.sliceId,
    schemaVersion: 1,
    writerModules: input.writerModules,
    initialState: () => structuredClone(input.initial),
    validate: input.validate,
    reduce: (current, operation) => input.reduce(current as TState, operation as TOperation)
  };
}

function pack(input: {
  readonly id: NamespacedId;
  readonly reducer: StateSliceReducer;
  readonly moduleId: NamespacedId;
  readonly frameContributors: CortexPack["frameContributors"];
}): CortexPack {
  return {
    id: input.id,
    version: "1.0.0",
    cortexSdkRange: ">=0.0.0",
    dependencies: [],
    stateSlices: [input.reducer],
    modules: [
      {
        id: input.moduleId,
        cost: "deterministic",
        description: `${input.id} standard cognitive module`,
        readsSlices: [input.reducer.sliceId],
        writesSlices: [input.reducer.sliceId]
      }
    ],
    frameContributors: input.frameContributors
  };
}

function frameContributor(
  ownerPackId: NamespacedId,
  id: NamespacedId,
  sliceId: NamespacedId,
  maxBytes: number,
  contribute: (state: Readonly<AgentState>) => unknown,
  maxItems?: number
): CortexPack["frameContributors"][number] {
  return {
    id,
    ownerPackId,
    schemaVersion: 1,
    maxBytes,
    ...(maxItems === undefined ? {} : { maxItems }),
    readsSlices: [sliceId],
    validate: (value) => value !== undefined,
    contribute
  };
}

const upsertById = <T extends { readonly id: string }>(current: readonly T[], next: readonly T[]): readonly T[] => {
  const values = new Map(current.map((value) => [value.id, value]));
  for (const value of next) values.set(value.id, value);
  return [...values.values()];
};

const clampRelationship = (value: number): number => Math.max(-100, Math.min(100, value));

const updateRelationships = (
  current: readonly Relationship[],
  deltas: readonly SocialRelationshipDelta[]
): readonly Relationship[] => {
  const values = new Map(current.map((relationship) => [relationship.target, relationship]));
  for (const delta of deltas) {
    const existing = values.get(delta.target) ?? {
      target: delta.target,
      trust: 0,
      affection: 0,
      respect: 0,
      fear: 0,
      attraction: 0,
      resentment: 0,
      familiarity: 0
    };
    values.set(delta.target, {
      target: delta.target,
      trust: clampRelationship(existing.trust + (delta.trust ?? 0)),
      affection: clampRelationship(existing.affection + (delta.affection ?? 0)),
      respect: clampRelationship(existing.respect + (delta.respect ?? 0)),
      fear: clampRelationship(existing.fear + (delta.fear ?? 0)),
      attraction: clampRelationship(existing.attraction + (delta.attraction ?? 0)),
      resentment: clampRelationship(existing.resentment + (delta.resentment ?? 0)),
      familiarity: Math.max(0, Math.min(100, existing.familiarity + (delta.familiarity ?? 0)))
    });
  }
  return [...values.values()];
};

const relationshipMagnitude = (relationship: Relationship): number =>
  Math.max(Math.abs(relationship.trust), Math.abs(relationship.resentment), Math.abs(relationship.fear));

function isTraitsState(value: unknown): value is TraitsState {
  return isRecord(value) && isNumberRecord(value["personality"]);
}
function isBeliefsState(value: unknown): value is BeliefsState {
  return isRecord(value) &&
    Array.isArray(value["beliefs"]) &&
    value["beliefs"].every(
      (belief) =>
        isRecord(belief) &&
        typeof belief["id"] === "string" &&
        isFiniteNumber(belief["confidence"]) &&
        Array.isArray(belief["sources"])
    );
}
function isMemoryState(value: unknown): value is MemoryState {
  return isRecord(value) &&
    Array.isArray(value["memories"]) &&
    value["memories"].every(
      (memory) =>
        isRecord(memory) &&
        typeof memory["id"] === "string" &&
        typeof memory["summary"] === "string" &&
        isFiniteNumber(memory["importance"]) &&
        isFiniteNumber(memory["emotionalValence"]) &&
        isFiniteNumber(memory["confidence"]) &&
        Array.isArray(memory["sourceEvents"])
    );
}
function isSocialState(value: unknown): value is SocialState {
  return isRecord(value) &&
    Array.isArray(value["relationships"]) &&
    value["relationships"].every(
      (relationship) =>
        isRecord(relationship) &&
        typeof relationship["target"] === "string" &&
        ["trust", "affection", "respect", "fear", "attraction", "resentment", "familiarity"]
          .every((key) => isFiniteNumber(relationship[key]))
    );
}
function isConversationState(value: unknown): value is ConversationState {
  if (!isRecord(value)) return false;
  const record = value["lastCommunication"];
  return record === undefined ||
    (isRecord(record) &&
      typeof record["decisionId"] === "string" &&
      typeof record["speechAct"] === "string" &&
      (record["utterance"] === undefined || typeof record["utterance"] === "string"));
}
function isStringArray(value: unknown): value is readonly string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}
function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function isNumberRecord(value: unknown): boolean {
  return isRecord(value) &&
    Object.values(value).every((item) => typeof item === "number" && Number.isFinite(item));
}
function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}
const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));
export const CORTEX_STANDARD_PACKS_PACKAGE_IDENTITY = Object.freeze({
  id: "@cortex/standard-packs",
  version: "0.1.0"
} as const);
