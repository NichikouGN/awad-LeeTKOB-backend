import { Queue, Worker, type JobsOptions, type WorkerOptions } from "bullmq";
import type { Pool, PoolClient } from "pg";
import type { JudgeWorker } from "./judging.service";

export const JUDGE_QUEUE_NAME = "leetkob-judge";
const OUTBOX_CHANNEL = "outbox_event_created";
const RECOVERY_INTERVAL_MS = 2_000;

export type JudgeQueuePayload = {
  judgeJobId: string;
  submissionId: string;
};

type OutboxRow = {
  outbox_event_id: string;
  job_type: string;
  aggregate_id: string;
};

export class JudgeQueue extends Queue<JudgeQueuePayload> {
  constructor(connection: WorkerOptions["connection"]) {
    super(JUDGE_QUEUE_NAME, { connection });
  }

  async enqueue(job: JudgeQueuePayload, delayMs = 0): Promise<void> {
    const options: JobsOptions = {
      jobId: `judge-${job.judgeJobId}`,
      delay: Math.max(0, delayMs),
      removeOnComplete: true,
      removeOnFail: true,
    };
    await this.add("judge_submission", job, options);
  }
}

/** LISTEN gives low-latency wakeups; pending-outbox and runnable-job scans recover lost notifications/Redis state. */
export class OutboxDispatcher {
  private listener?: PoolClient;
  private interval?: ReturnType<typeof setInterval>;
  private draining?: Promise<void>;
  private reconnecting = false;
  private stopping = false;

  constructor(
    private readonly pool: Pool,
    private readonly queue: JudgeQueue,
    private readonly pollIntervalMs = RECOVERY_INTERVAL_MS,
  ) {}

  async start(): Promise<void> {
    this.stopping = false;
    this.listener = await this.pool.connect();
    await this.listener.query(`LISTEN ${OUTBOX_CHANNEL}`);
    this.attachListenerHandlers(this.listener);
    this.interval = setInterval(() => {
      void this.dispatchPending().catch((error) =>
        console.error("Outbox reconciliation failed", safeError(error)),
      );
    }, this.pollIntervalMs);
    await this.dispatchPending().catch((error) =>
      console.error("Initial outbox reconciliation failed", safeError(error)),
    );
  }

  async stop(): Promise<void> {
    this.stopping = true;
    if (this.interval) clearInterval(this.interval);
    this.interval = undefined;
    if (this.listener) {
      await this.listener.query("UNLISTEN *").catch(() => undefined);
      this.listener.release();
      this.listener = undefined;
    }
    await this.draining?.catch(() => undefined);
  }

  private attachListenerHandlers(listener: PoolClient): void {
    listener.on("notification", () => {
      void this.dispatchPending().catch((error) =>
        console.error("Outbox dispatch notification failed", safeError(error)),
      );
    });
    listener.on("error", (error) => {
      console.error("Outbox listener failed", safeError(error));
      void this.reconnectListener();
    });
  }

  private dispatchPending(): Promise<void> {
    if (this.draining) return this.draining;
    this.draining = this.drain().finally(() => {
      this.draining = undefined;
    });
    return this.draining;
  }

  private async drain(): Promise<void> {
    await this.dispatchOutboxBatch();
    await this.reconcileRunnableJobs();
  }

  private async dispatchOutboxBatch(): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const rows = await client.query<OutboxRow>(
        `SELECT outbox_event_id, job_type, aggregate_id
         FROM outbox_events
         WHERE status = 'pending' AND job_type = 'judge_submission'
           AND available_at <= now()
         ORDER BY outbox_event_id
         FOR UPDATE SKIP LOCKED
         LIMIT 50`,
      );
      for (const row of rows.rows) {
        const job = await this.loadJudgeJob(client, row.aggregate_id);
        if (!job) {
          throw new Error("Outbox event has no corresponding judge job");
        }
        await this.queue.enqueue(
          job,
          Math.max(0, job.availableAt.getTime() - Date.now()),
        );
        await client.query(
          `UPDATE outbox_events SET status = 'dispatched', dispatched_at = now(),
            attempt_count = attempt_count + 1, last_failure_code = NULL
           WHERE outbox_event_id = $1`,
          [row.outbox_event_id],
        );
      }
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  private async reconcileRunnableJobs(): Promise<void> {
    const now = new Date();
    const result = await this.pool.query<{
      judge_job_id: string;
      submission_id: string;
      available_at: Date;
    }>(
      `SELECT judge_job_id, submission_id, available_at
       FROM judge_jobs
       WHERE (status IN ('queued', 'retryable') AND available_at <= $1)
          OR (status = 'running' AND lease_expires_at <= $1)
       ORDER BY available_at, judge_job_id
       LIMIT 100`,
      [now],
    );
    for (const row of result.rows) {
      const jobId = `judge-${row.judge_job_id}`;
      if (await this.queue.getJob(jobId)) continue;
      await this.queue.enqueue(
        {
          judgeJobId: row.judge_job_id,
          submissionId: row.submission_id,
        },
        Math.max(0, row.available_at.getTime() - Date.now()),
      );
    }
  }

  private async loadJudgeJob(
    client: PoolClient,
    submissionId: string,
  ): Promise<(JudgeQueuePayload & { availableAt: Date }) | null> {
    const result = await client.query<{
      judge_job_id: string;
      submission_id: string;
      available_at: Date;
    }>(
      `SELECT judge_job_id, submission_id, available_at
       FROM judge_jobs WHERE submission_id = $1`,
      [submissionId],
    );
    const row = result.rows[0];
    return row
      ? {
          judgeJobId: row.judge_job_id,
          submissionId: row.submission_id,
          availableAt: row.available_at,
        }
      : null;
  }

  private async reconnectListener(): Promise<void> {
    if (this.stopping || this.reconnecting) return;
    this.reconnecting = true;
    this.listener?.release(true);
    this.listener = undefined;
    try {
      this.listener = await this.pool.connect();
      await this.listener.query(`LISTEN ${OUTBOX_CHANNEL}`);
      this.attachListenerHandlers(this.listener);
      this.reconnecting = false;
      await this.dispatchPending();
    } catch (error) {
      console.error("Outbox listener reconnect failed", safeError(error));
      setTimeout(() => {
        this.reconnecting = false;
        void this.reconnectListener();
      }, this.pollIntervalMs);
    }
  }
}

export const createJudgeConsumer = (
  judgeWorker: JudgeWorker,
  options: Omit<WorkerOptions, "connection"> & {
    connection: WorkerOptions["connection"];
  },
): Worker<JudgeQueuePayload> => {
  const worker = new Worker<JudgeQueuePayload>(
    JUDGE_QUEUE_NAME,
    async (job) => {
      if (job.name !== "judge_submission") {
        throw new Error("Unsupported judge queue job");
      }
      await judgeWorker.runOne(job.data.judgeJobId);
    },
    options,
  );
  worker.on("failed", (job, error) => {
    console.error("Judge queue job failed", job?.id, safeError(error));
  });
  worker.on("error", (error) => {
    console.error("Judge queue worker error", safeError(error));
  });
  return worker;
};

function safeError(error: unknown): string {
  return error instanceof Error ? error.name : "UnknownError";
}
