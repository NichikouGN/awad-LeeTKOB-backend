import { describe, expect, it } from "bun:test";
import { randomUUID } from "node:crypto";
import {
  createJudgeConsumer,
  JudgeQueue,
  OutboxDispatcher,
} from "../src/modules/judging/judging.queue";
import { JudgeWorker } from "../src/modules/judging/judging.service";
import { PostgresJudgeQueueRepository } from "../src/modules/judging/judging.repository";

const integrationEnabled = process.env.JUDGE_QUEUE_INTEGRATION === "1";
const queueDescribe = integrationEnabled ? describe : describe.skip;
const waitFor = async (
  condition: () => Promise<boolean>,
  timeoutMs = 10_000,
) => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await condition()) return;
    await Bun.sleep(100);
  }
  throw new Error("Timed out waiting for the judge queue integration result");
};

queueDescribe("PostgreSQL outbox and BullMQ recovery", () => {
  it("judges work committed while the consumer was stopped, exactly once", async () => {
    const [{ db, pool }, { DrizzleSubmissionRepository }] = await Promise.all([
      import("../src/db/db"),
      import("../src/modules/submissions/submission.repository"),
    ]);
    const connection = {
      host: "127.0.0.1",
      port: 6379,
      maxRetriesPerRequest: null,
    };
    const queueBeforeRestart = new JudgeQueue(connection);
    const queueAfterRestart = new JudgeQueue(connection);
    const submissionRepository = new DrizzleSubmissionRepository(db);
    const submissionId = randomUUID();
    let dispatcherBeforeRestart: OutboxDispatcher | undefined;
    let dispatcherAfterRestart: OutboxDispatcher | undefined;
    let consumer: ReturnType<typeof createJudgeConsumer> | undefined;

    try {
      const fixtureResult = await pool.query<{
        lab_id: string;
        student_user_id: string;
      }>(
        `SELECT labs.lab_id, users.user_id AS student_user_id
         FROM labs CROSS JOIN users
         WHERE labs.title = 'Demo Addition Lab' AND users.email = 'seed:student'
         LIMIT 1`,
      );
      const fixture = fixtureResult.rows[0];
      if (!fixture)
        throw new Error("Seeded demo lab/student fixture is missing");

      dispatcherBeforeRestart = new OutboxDispatcher(
        pool,
        queueBeforeRestart,
        100,
      );
      await dispatcherBeforeRestart.start();

      const created = await submissionRepository.createQueued({
        labId: fixture.lab_id,
        studentUserId: fixture.student_user_id,
        idempotencyKey: `queue-restart-${submissionId}`,
        requestSha256: "a".repeat(64),
        sourceSha256: "b".repeat(64),
        sourceCode: Buffer.from("int main() { return 0; }"),
        sourceBytes: Buffer.byteLength("int main() { return 0; }"),
        receivedAt: new Date(),
      });
      const jobResult = await pool.query<{ judge_job_id: string }>(
        "SELECT judge_job_id FROM judge_jobs WHERE submission_id = $1",
        [created.submissionId],
      );
      const job = jobResult.rows[0];
      if (!job) throw new Error("Judge job fixture was not persisted");

      const labProvider = {
        getJudgeBundle: async (labId: string) => ({
          labId,
          classId: "integration-class",
          statement: "Deterministic queue integration fixture",
          limits: { cpuSeconds: 1, memoryMb: 256 },
          constraints: [],
          tests: [{ testNumber: 1, input: "", expectedOutput: "" }],
        }),
      };
      const sourceProvider = {
        getJudgeSource: async () => ({
          labId: fixture.lab_id,
          sourceCode: Buffer.from("int main() { return 0; }"),
        }),
      };
      const runner = {
        judge: async ({
          bundle,
        }: {
          bundle: { tests: Array<{ testNumber: number }> };
        }) => ({
          overallVerdict: "AC" as const,
          tests: bundle.tests.map((test) => ({
            testNumber: test.testNumber,
            verdict: "AC" as const,
            executionMs: 0,
            memoryKb: null,
          })),
        }),
      };
      const judgeWorker = new JudgeWorker(
        new PostgresJudgeQueueRepository(pool),
        sourceProvider,
        labProvider,
        runner,
        {
          workerId: `integration-${submissionId}`,
          leaseMs: 30_000,
          heartbeatMs: 5_000,
        },
      );

      // Keep the consumer stopped while the listener observes and queues the
      // committed outbox event. Then restart the consumer against that job.
      await waitFor(async () =>
        Boolean(await queueBeforeRestart.getJob(`judge-${job.judge_job_id}`)),
      );
      await dispatcherBeforeRestart.stop();
      dispatcherBeforeRestart = undefined;
      await queueBeforeRestart.close();

      consumer = createJudgeConsumer(judgeWorker, {
        connection,
        concurrency: 1,
        lockDuration: 30_000,
      });
      dispatcherAfterRestart = new OutboxDispatcher(
        pool,
        queueAfterRestart,
        100,
      );
      await dispatcherAfterRestart.start();
      await waitFor(async () => {
        const result = await pool.query<{
          status: string;
          result_count: string;
        }>(
          `SELECT judge_jobs.status,
                  (SELECT count(*) FROM test_results WHERE submission_id = $1) AS result_count
           FROM judge_jobs WHERE submission_id = $1`,
          [created.submissionId],
        );
        return (
          result.rows[0]?.status === "succeeded" &&
          result.rows[0].result_count === "1"
        );
      });
      await Bun.sleep(250);

      expect(
        await queueAfterRestart.getJob(`judge-${job.judge_job_id}`),
      ).toBeUndefined();
      const storedResult = await pool.query<{
        judge_status: string;
        overall_verdict: string;
      }>(
        "SELECT judge_status, overall_verdict FROM submissions WHERE submission_id = $1",
        [created.submissionId],
      );
      const stored = storedResult.rows[0];
      expect(stored).toEqual({
        judge_status: "finished",
        overall_verdict: "AC",
      });
    } finally {
      await dispatcherBeforeRestart?.stop();
      await dispatcherAfterRestart?.stop();
      await consumer?.close();
      const { pool } = await import("../src/db/db");
      const jobResult = await pool.query<{ judge_job_id: string }>(
        `SELECT judge_jobs.judge_job_id
         FROM judge_jobs JOIN submissions USING (submission_id)
         WHERE submissions.idempotency_key = $1`,
        [`queue-restart-${submissionId}`],
      );
      const queueJobId = jobResult.rows[0]
        ? `judge-${jobResult.rows[0].judge_job_id}`
        : undefined;
      if (queueJobId) {
        for (const queue of [queueBeforeRestart, queueAfterRestart]) {
          const remainingJob = await queue
            .getJob(queueJobId)
            .catch(() => undefined);
          await remainingJob?.remove().catch(() => undefined);
        }
      }
      await queueBeforeRestart.close().catch(() => undefined);
      await queueAfterRestart.close().catch(() => undefined);
      await pool.query(
        `DELETE FROM test_results WHERE submission_id IN
           (SELECT submission_id FROM submissions WHERE idempotency_key = $1)`,
        [`queue-restart-${submissionId}`],
      );
      await pool.query(
        `DELETE FROM judge_jobs WHERE submission_id IN
           (SELECT submission_id FROM submissions WHERE idempotency_key = $1)`,
        [`queue-restart-${submissionId}`],
      );
      await pool.query(
        `DELETE FROM outbox_events WHERE aggregate_id IN
           (SELECT submission_id FROM submissions WHERE idempotency_key = $1)`,
        [`queue-restart-${submissionId}`],
      );
      await pool.query("DELETE FROM submissions WHERE idempotency_key = $1", [
        `queue-restart-${submissionId}`,
      ]);
    }
  }, 30_000);
});
