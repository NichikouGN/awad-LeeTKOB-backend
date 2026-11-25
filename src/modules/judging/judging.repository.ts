import type { Pool } from "pg";
import type {
  ConstraintVerdict,
  ReviewWriter,
} from "../constraint-review/contract";
import type {
  JudgeClaim,
  JudgeQueueRepository,
  JudgeResult,
} from "./judging.type";

export class PostgresJudgeQueueRepository implements JudgeQueueRepository {
  constructor(
    private readonly pool: Pool,
    private readonly reviewWriter?: ReviewWriter,
  ) {}

  async claimNext(
    workerId: string,
    now: Date,
    leaseMs: number,
    judgeJobId?: string,
  ): Promise<JudgeClaim | null> {
    const leaseExpiresAt = new Date(now.getTime() + leaseMs);
    const result = await this.pool.query<{
      judge_job_id: string;
      submission_id: string;
      attempt_count: number;
    }>(
      `WITH next_job AS (
         SELECT judge_job_id
         FROM judge_jobs
         WHERE ($4::uuid IS NULL OR judge_job_id = $4::uuid)
           AND (
             (status IN ('queued', 'retryable') AND available_at <= $1)
             OR (status = 'running' AND lease_expires_at <= $1)
           )
         ORDER BY available_at, judge_job_id
         FOR UPDATE SKIP LOCKED
         LIMIT 1
       ), claimed AS (
         UPDATE judge_jobs AS job
         SET status = 'running', lease_owner = $2, lease_expires_at = $3,
             attempt_count = attempt_count + 1, updated_at = $1
         FROM next_job
         WHERE job.judge_job_id = next_job.judge_job_id
         RETURNING job.judge_job_id, job.submission_id, job.attempt_count
       )
       UPDATE submissions
       SET judge_status = 'running'
       FROM claimed
       WHERE submissions.submission_id = claimed.submission_id
       RETURNING claimed.judge_job_id, claimed.submission_id, claimed.attempt_count`,
      [now, workerId, leaseExpiresAt, judgeJobId ?? null],
    );
    const row = result.rows[0];
    return row
      ? {
          judgeJobId: row.judge_job_id,
          submissionId: row.submission_id,
          leaseOwner: workerId,
          attemptCount: row.attempt_count,
        }
      : null;
  }

  async renewLease(
    claim: JudgeClaim,
    now: Date,
    leaseMs: number,
  ): Promise<boolean> {
    const result = await this.pool.query(
      `UPDATE judge_jobs
       SET lease_expires_at = $3, updated_at = $4
       WHERE judge_job_id = $1 AND lease_owner = $2 AND status = 'running'`,
      [
        claim.judgeJobId,
        claim.leaseOwner,
        new Date(now.getTime() + leaseMs),
        now,
      ],
    );
    return result.rowCount === 1;
  }

  async completeClaim(
    claim: JudgeClaim,
    result: JudgeResult,
    now: Date,
    review: ConstraintVerdict[],
  ): Promise<boolean> {
    if (!Array.isArray(review))
      throw new Error("Review proposals must be an array");
    if (result.overallVerdict !== "AC" && review.length)
      throw new Error("Non-Accepted submissions cannot have review proposals");
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const completed = await client.query<{ submission_id: string }>(
        `UPDATE judge_jobs
         SET status = 'succeeded', lease_owner = NULL, lease_expires_at = NULL,
             completed_at = $3, updated_at = $3, last_error_code = NULL
         WHERE judge_job_id = $1 AND lease_owner = $2 AND status = 'running'
         RETURNING submission_id`,
        [claim.judgeJobId, claim.leaseOwner, now],
      );
      const submissionId = completed.rows[0]?.submission_id;
      if (!submissionId) {
        await client.query("ROLLBACK");
        return false;
      }

      await client.query("DELETE FROM test_results WHERE submission_id = $1", [
        submissionId,
      ]);
      for (const test of result.tests) {
        await client.query(
          `INSERT INTO test_results
             (submission_id, test_number, verdict, execution_ms, memory_kb, created_at)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [
            submissionId,
            test.testNumber,
            test.verdict,
            Math.floor(test.executionMs),
            test.memoryKb === null ? null : Math.floor(test.memoryKb),
            now,
          ],
        );
      }
      await client.query(
        `UPDATE submissions
         SET judge_status = 'finished', overall_verdict = $2, judge_completed_at = $3
         WHERE submission_id = $1`,
        [submissionId, result.overallVerdict, now],
      );
      if (review.length) {
        if (!this.reviewWriter)
          throw new Error("Review persistence is not configured");
        await this.reviewWriter.save(client, {
          submissionId,
          attemptNumber: claim.attemptCount,
          verdicts: review,
          now,
        });
      }
      await client.query("COMMIT");
      return true;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async failClaim(
    claim: JudgeClaim,
    category: string,
    now: Date,
    maxAttempts: number,
  ): Promise<void> {
    const terminal = claim.attemptCount >= maxAttempts;
    const delayMs = Math.min(
      60_000,
      1_000 * 2 ** Math.max(0, claim.attemptCount - 1),
    );
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const result = await client.query<{ submission_id: string }>(
        `UPDATE judge_jobs
         SET status = $3, available_at = $4, lease_owner = NULL,
             lease_expires_at = NULL, last_error_code = $5, updated_at = $6
         WHERE judge_job_id = $1 AND lease_owner = $2 AND status = 'running'
         RETURNING submission_id`,
        [
          claim.judgeJobId,
          claim.leaseOwner,
          terminal ? "failed" : "retryable",
          new Date(now.getTime() + delayMs),
          category,
          now,
        ],
      );
      const submissionId = result.rows[0]?.submission_id;
      if (submissionId) {
        await client.query(
          `UPDATE submissions SET judge_status = $2 WHERE submission_id = $1`,
          [submissionId, terminal ? "failed" : "queued"],
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
}
