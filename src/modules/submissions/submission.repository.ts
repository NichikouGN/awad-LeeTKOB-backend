import { and, asc, eq } from "drizzle-orm";
import type { Database } from "../../db/db";
import { outboxEvents } from "../../db/schema/audit.schema";
import {
  judgeJobs,
  submissions,
  testResults,
} from "../../db/schema/submissions.schema";
import type {
  QueueSubmissionRecord,
  SubmissionSnapshotRecord,
} from "./submission.type";

export interface SubmissionRepository {
  findByIdempotencyKey(
    labId: string,
    studentUserId: string,
    idempotencyKey: string,
  ): Promise<SubmissionSnapshotRecord | null>;
  createQueued(
    record: QueueSubmissionRecord,
  ): Promise<SubmissionSnapshotRecord>;
  findOwnedById(
    submissionId: string,
    studentUserId: string,
  ): Promise<SubmissionSnapshotRecord | null>;
}

export class DrizzleSubmissionRepository implements SubmissionRepository {
  constructor(private readonly db: Database) {}

  async findByIdempotencyKey(
    labId: string,
    studentUserId: string,
    idempotencyKey: string,
  ): Promise<SubmissionSnapshotRecord | null> {
    const [row] = await this.db
      .select()
      .from(submissions)
      .where(
        and(
          eq(submissions.labId, labId),
          eq(submissions.studentUserId, studentUserId),
          eq(submissions.idempotencyKey, idempotencyKey),
        ),
      )
      .limit(1);
    if (!row) return null;
    return this.toSnapshot(row, await this.getTestResults(row.submissionId));
  }

  async createQueued(
    record: QueueSubmissionRecord,
  ): Promise<SubmissionSnapshotRecord> {
    return this.db.transaction(async (tx) => {
      const [submission] = await tx
        .insert(submissions)
        .values({
          labId: record.labId,
          studentUserId: record.studentUserId,
          idempotencyKey: record.idempotencyKey,
          requestSha256: record.requestSha256,
          sourceCode: record.sourceCode,
          sourceBytes: record.sourceBytes,
          sourceSha256: record.sourceSha256,
          receivedAt: record.receivedAt,
          judgeStatus: "queued",
          overallVerdict: null,
          judgeCompletedAt: null,
        })
        .returning();

      await tx.insert(judgeJobs).values({
        submissionId: submission.submissionId,
        status: "queued",
        attemptCount: 0,
        availableAt: record.receivedAt,
        createdAt: record.receivedAt,
        updatedAt: record.receivedAt,
      });
      await tx.insert(outboxEvents).values({
        eventKey: `judge-submission:${submission.submissionId}`,
        jobType: "judge_submission",
        aggregateId: submission.submissionId,
        status: "pending",
        attemptCount: 0,
        availableAt: record.receivedAt,
        createdAt: record.receivedAt,
        dispatchedAt: null,
        lastFailureCode: null,
      });

      return this.toSnapshot(submission, []);
    });
  }

  async findOwnedById(
    submissionId: string,
    studentUserId: string,
  ): Promise<SubmissionSnapshotRecord | null> {
    const [row] = await this.db
      .select()
      .from(submissions)
      .where(
        and(
          eq(submissions.submissionId, submissionId),
          eq(submissions.studentUserId, studentUserId),
        ),
      )
      .limit(1);
    if (!row) return null;
    return this.toSnapshot(row, await this.getTestResults(row.submissionId));
  }

  private async getTestResults(submissionId: string) {
    return this.db
      .select({
        testNumber: testResults.testNumber,
        verdict: testResults.verdict,
        executionMs: testResults.executionMs,
      })
      .from(testResults)
      .where(eq(testResults.submissionId, submissionId))
      .orderBy(asc(testResults.testNumber));
  }

  private toSnapshot(
    row: typeof submissions.$inferSelect,
    tests: Array<{
      testNumber: number;
      verdict: string;
      executionMs: number | null;
    }>,
  ): SubmissionSnapshotRecord {
    return {
      submissionId: row.submissionId,
      labId: row.labId,
      studentUserId: row.studentUserId,
      requestSha256: row.requestSha256,
      sourceSha256: row.sourceSha256,
      receivedAt: row.receivedAt,
      judgeStatus: row.judgeStatus as SubmissionSnapshotRecord["judgeStatus"],
      overallVerdict:
        row.overallVerdict as SubmissionSnapshotRecord["overallVerdict"],
      tests: tests.map((test) => ({
        testNumber: test.testNumber,
        verdict:
          test.verdict as SubmissionSnapshotRecord["tests"][number]["verdict"],
        executionMs: test.executionMs,
      })),
    };
  }
}
