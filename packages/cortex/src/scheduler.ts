import type { AgentId, EventId, JobId, SimTime } from "@cortex/contracts";
import type { ModuleId } from "./patches.js";

export interface CognitiveJob {
  readonly id: JobId;
  readonly agentId: AgentId;
  readonly module: ModuleId;
  readonly basedOnVersion: number;
  readonly triggerEvents: readonly EventId[];
  readonly notBefore: SimTime;
  readonly deadline?: SimTime;
  readonly priority: number;
  readonly idempotencyKey: string;
}

type JobStatus = "queued" | "running" | "completed" | "cancelled";

interface StoredJob {
  readonly job: CognitiveJob;
  status: JobStatus;
}

export class InMemoryCognitiveScheduler {
  readonly #jobs = new Map<JobId, StoredJob>();
  readonly #idempotencyKeys = new Set<string>();

  schedule(job: CognitiveJob): boolean {
    if (this.#idempotencyKeys.has(job.idempotencyKey)) return false;
    this.#jobs.set(job.id, { job, status: "queued" });
    this.#idempotencyKeys.add(job.idempotencyKey);
    return true;
  }

  claim(now: SimTime, limit: number): readonly CognitiveJob[] {
    for (const stored of this.#jobs.values()) {
      if (stored.status === "queued" && stored.job.deadline !== undefined && stored.job.deadline < now) {
        stored.status = "cancelled";
      }
    }

    const due = [...this.#jobs.values()]
      .filter(({ job, status }) => status === "queued" && job.notBefore <= now && (job.deadline === undefined || job.deadline >= now))
      .sort((left, right) => right.job.priority - left.job.priority || left.job.notBefore - right.job.notBefore)
      .slice(0, limit);

    for (const stored of due) stored.status = "running";
    return due.map(({ job }) => job);
  }

  complete(jobId: JobId): void {
    const stored = this.#jobs.get(jobId);
    if (!stored || stored.status !== "running") throw new Error(`Job is not running: ${jobId}`);
    stored.status = "completed";
  }

  cancel(predicate: (job: CognitiveJob) => boolean): number {
    let cancelled = 0;
    for (const stored of this.#jobs.values()) {
      if ((stored.status === "queued" || stored.status === "running") && predicate(stored.job)) {
        stored.status = "cancelled";
        cancelled += 1;
      }
    }
    return cancelled;
  }

  status(jobId: JobId): JobStatus | undefined {
    return this.#jobs.get(jobId)?.status;
  }
}
