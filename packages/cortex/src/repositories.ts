import type {
  ArtifactId,
  Sha256Fingerprint,
  WorldRunBundleV1,
  WorldRunId,
  WorldSessionId,
  WorldSessionRuntimeStateV1,
  WorldSessionV1
} from "@cortex/contracts";
import {
  assertWorldRunBundle,
  assertWorldSession,
  assertWorldSessionRuntimeState,
  fingerprintArtifact
} from "@cortex/contracts";
import type { CognitiveJob } from "./scheduler.js";
import { InMemoryAgentStateStore, type AgentStateStore, type StateSliceReducer } from "./state-store.js";

export interface AgentStateRepository extends AgentStateStore {}

export class InMemoryAgentStateRepository
  extends InMemoryAgentStateStore
  implements AgentStateRepository {
  constructor(sliceReducers: readonly StateSliceReducer[] = []) {
    super(sliceReducers);
  }
}

export interface WorldSessionRepository {
  create(session: WorldSessionV1): Promise<void>;
  get(sessionId: WorldSessionId): Promise<WorldSessionV1 | undefined>;
  save(session: WorldSessionV1, expectedUpdatedAt?: number): Promise<void>;
  list(): Promise<readonly WorldSessionV1[]>;
  createState(state: WorldSessionRuntimeStateV1): Promise<void>;
  getState(sessionId: WorldSessionId): Promise<WorldSessionRuntimeStateV1 | undefined>;
  saveState(state: WorldSessionRuntimeStateV1, expectedRevision: number): Promise<void>;
  restore(session: WorldSessionV1, state: WorldSessionRuntimeStateV1): Promise<void>;
}

export class InMemoryWorldSessionRepository implements WorldSessionRepository {
  readonly #sessions = new Map<WorldSessionId, WorldSessionV1>();
  readonly #states = new Map<WorldSessionId, WorldSessionRuntimeStateV1>();

  async create(session: WorldSessionV1): Promise<void> {
    assertWorldSession(session);
    if (this.#sessions.has(session.sessionId)) throw new Error(`World session already exists: ${session.sessionId}`);
    this.#sessions.set(session.sessionId, structuredClone(session));
  }

  async get(sessionId: WorldSessionId): Promise<WorldSessionV1 | undefined> {
    const session = this.#sessions.get(sessionId);
    return session === undefined ? undefined : structuredClone(session);
  }

  async save(session: WorldSessionV1, expectedUpdatedAt?: number): Promise<void> {
    assertWorldSession(session);
    const current = this.#sessions.get(session.sessionId);
    if (!current) throw new Error(`Unknown world session: ${session.sessionId}`);
    if (expectedUpdatedAt !== undefined && current.updatedAt !== expectedUpdatedAt) {
      throw new Error(`Stale world session: ${session.sessionId}`);
    }
    if (session.updatedAt < current.updatedAt) throw new Error(`World session moved backwards: ${session.sessionId}`);
    this.#sessions.set(session.sessionId, structuredClone(session));
  }

  async list(): Promise<readonly WorldSessionV1[]> {
    return [...this.#sessions.values()]
      .sort((left, right) => left.sessionId.localeCompare(right.sessionId))
      .map((session) => structuredClone(session));
  }

  async createState(state: WorldSessionRuntimeStateV1): Promise<void> {
    assertWorldSessionRuntimeState(state);
    if (!this.#sessions.has(state.sessionId)) throw new Error(`Unknown world session: ${state.sessionId}`);
    if (this.#states.has(state.sessionId)) throw new Error(`World session state already exists: ${state.sessionId}`);
    this.#states.set(state.sessionId, structuredClone(state));
  }

  async getState(sessionId: WorldSessionId): Promise<WorldSessionRuntimeStateV1 | undefined> {
    const state = this.#states.get(sessionId);
    return state === undefined ? undefined : structuredClone(state);
  }

  async saveState(state: WorldSessionRuntimeStateV1, expectedRevision: number): Promise<void> {
    assertWorldSessionRuntimeState(state);
    const current = this.#states.get(state.sessionId);
    if (!current) throw new Error(`Unknown world session state: ${state.sessionId}`);
    if (current.revision !== expectedRevision || state.revision !== expectedRevision + 1) {
      throw new Error(`Stale world session state: ${state.sessionId}`);
    }
    this.#states.set(state.sessionId, structuredClone(state));
  }

  async restore(session: WorldSessionV1, state: WorldSessionRuntimeStateV1): Promise<void> {
    assertWorldSession(session);
    assertWorldSessionRuntimeState(state);
    if (session.sessionId !== state.sessionId) throw new Error("Restored session and state do not match");
    this.#sessions.set(session.sessionId, structuredClone(session));
    this.#states.set(state.sessionId, structuredClone(state));
  }
}

export type CognitiveJobStatus = "queued" | "leased" | "completed" | "cancelled";

export interface CognitiveJobRecord {
  readonly job: CognitiveJob;
  readonly status: CognitiveJobStatus;
  readonly leaseOwner?: string;
  readonly leaseExpiresAt?: number;
}

export interface CognitiveJobRepository {
  enqueue(job: CognitiveJob): Promise<boolean>;
  claim(now: number, owner: string, leaseDuration: number, limit: number): Promise<readonly CognitiveJob[]>;
  complete(jobId: CognitiveJob["id"], owner: string): Promise<void>;
  cancel(jobId: CognitiveJob["id"]): Promise<boolean>;
  get(jobId: CognitiveJob["id"]): Promise<CognitiveJobRecord | undefined>;
}

export class InMemoryCognitiveJobRepository implements CognitiveJobRepository {
  readonly #records = new Map<CognitiveJob["id"], CognitiveJobRecord>();
  readonly #idempotencyKeys = new Set<string>();

  async enqueue(job: CognitiveJob): Promise<boolean> {
    if (this.#idempotencyKeys.has(job.idempotencyKey)) return false;
    this.#records.set(job.id, { job: structuredClone(job), status: "queued" });
    this.#idempotencyKeys.add(job.idempotencyKey);
    return true;
  }

  async claim(now: number, owner: string, leaseDuration: number, limit: number): Promise<readonly CognitiveJob[]> {
    if (!Number.isFinite(now) || !Number.isFinite(leaseDuration) || leaseDuration <= 0 || !Number.isInteger(limit) || limit < 0 || owner.length === 0) {
      throw new Error("Invalid cognitive-job lease request");
    }
    for (const [id, record] of this.#records) {
      if (record.status === "leased" && record.leaseExpiresAt !== undefined && record.leaseExpiresAt <= now) {
        this.#records.set(id, { job: record.job, status: "queued" });
      }
    }
    const due = [...this.#records.values()]
      .filter((record) => record.status === "queued" && record.job.notBefore <= now && (record.job.deadline === undefined || record.job.deadline >= now))
      .sort((left, right) => right.job.priority - left.job.priority || left.job.notBefore - right.job.notBefore || left.job.id.localeCompare(right.job.id))
      .slice(0, limit);
    for (const record of due) {
      this.#records.set(record.job.id, {
        job: record.job,
        status: "leased",
        leaseOwner: owner,
        leaseExpiresAt: now + leaseDuration
      });
    }
    return due.map((record) => structuredClone(record.job));
  }

  async complete(jobId: CognitiveJob["id"], owner: string): Promise<void> {
    const record = this.#records.get(jobId);
    if (!record || record.status !== "leased" || record.leaseOwner !== owner) throw new Error(`Cognitive job lease not owned: ${jobId}`);
    this.#records.set(jobId, { job: record.job, status: "completed" });
  }

  async cancel(jobId: CognitiveJob["id"]): Promise<boolean> {
    const record = this.#records.get(jobId);
    if (!record || record.status === "completed" || record.status === "cancelled") return false;
    this.#records.set(jobId, { job: record.job, status: "cancelled" });
    return true;
  }

  async get(jobId: CognitiveJob["id"]): Promise<CognitiveJobRecord | undefined> {
    const record = this.#records.get(jobId);
    return record === undefined ? undefined : structuredClone(record);
  }
}

export interface RunRepository {
  put(bundle: WorldRunBundleV1): Promise<void>;
  get(runId: WorldRunId): Promise<WorldRunBundleV1 | undefined>;
  list(): Promise<readonly WorldRunId[]>;
}

export class InMemoryRunRepository implements RunRepository {
  readonly #runs = new Map<WorldRunId, WorldRunBundleV1>();

  async put(bundle: WorldRunBundleV1): Promise<void> {
    assertWorldRunBundle(bundle);
    const current = this.#runs.get(bundle.runId);
    if (current !== undefined && current.bundleFingerprint !== bundle.bundleFingerprint) {
      throw new Error(`World run is immutable: ${bundle.runId}`);
    }
    this.#runs.set(bundle.runId, structuredClone(bundle));
  }

  async get(runId: WorldRunId): Promise<WorldRunBundleV1 | undefined> {
    const bundle = this.#runs.get(runId);
    return bundle === undefined ? undefined : structuredClone(bundle);
  }

  async list(): Promise<readonly WorldRunId[]> {
    return [...this.#runs.keys()].sort((left, right) => left.localeCompare(right));
  }
}

export interface ArtifactRecord<T = unknown> {
  readonly artifactId: ArtifactId;
  readonly kind: string;
  readonly schemaVersion: string;
  readonly content: T;
  readonly fingerprint: Sha256Fingerprint;
  readonly createdAt: number;
}

export interface ArtifactRepository {
  put<T>(record: ArtifactRecord<T>): Promise<void>;
  get<T = unknown>(artifactId: ArtifactId): Promise<ArtifactRecord<T> | undefined>;
  list(kind?: string): Promise<readonly ArtifactRecord[]>;
}

export class InMemoryArtifactRepository implements ArtifactRepository {
  readonly #records = new Map<ArtifactId, ArtifactRecord>();

  async put<T>(record: ArtifactRecord<T>): Promise<void> {
    if (record.kind.length === 0 || record.schemaVersion.length === 0 || !Number.isFinite(record.createdAt) || fingerprintArtifact(record.content) !== record.fingerprint) {
      throw new Error(`Invalid artifact: ${record.artifactId}`);
    }
    const current = this.#records.get(record.artifactId);
    if (current !== undefined && current.fingerprint !== record.fingerprint) throw new Error(`Artifact is immutable: ${record.artifactId}`);
    this.#records.set(record.artifactId, structuredClone(record));
  }

  async get<T = unknown>(artifactId: ArtifactId): Promise<ArtifactRecord<T> | undefined> {
    const record = this.#records.get(artifactId);
    return record === undefined ? undefined : structuredClone(record) as ArtifactRecord<T>;
  }

  async list(kind?: string): Promise<readonly ArtifactRecord[]> {
    return [...this.#records.values()]
      .filter((record) => kind === undefined || record.kind === kind)
      .sort((left, right) => left.artifactId.localeCompare(right.artifactId))
      .map((record) => structuredClone(record));
  }
}

export interface LeaseClock {
  now(): number;
}

export class SystemLeaseClock implements LeaseClock {
  now(): number {
    return Date.now();
  }
}

export class ManualLeaseClock implements LeaseClock {
  #current: number;

  constructor(start = 0) {
    if (!Number.isFinite(start)) throw new Error("Invalid lease-clock start");
    this.#current = start;
  }

  now(): number {
    return this.#current;
  }

  advanceTo(next: number): void {
    if (!Number.isFinite(next) || next < this.#current) throw new Error("Lease clock cannot move backwards");
    this.#current = next;
  }
}
