import { sql } from "drizzle-orm";
import {
  boolean,
  char,
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  unique,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";
import { identity, instant, bytes } from "./_helpers";
import { users } from "./users.schema";
import { constraintRevisions, labConstraints, labs } from "./labs.schema";
import { uuid } from "drizzle-orm/cockroach-core";

export const submissions = pgTable(
  "submissions",
  {
    submissionId: identity("submission_id"),
    labId: uuid("lab_id")
      .notNull()
      .references(() => labs.labId, { onDelete: "restrict" }),
    studentUserId: uuid("student_user_id")
      .notNull()
      .references(() => users.userId, { onDelete: "restrict" }),
    idempotencyKey: varchar("idempotency_key", { length: 128 }).notNull(),
    requestSha256: char("request_sha256", { length: 64 }).notNull(),
    sourceCode: bytes("source_code").notNull(),
    sourceBytes: integer("source_bytes").notNull(),
    sourceSha256: char("source_sha256", { length: 64 }).notNull(),
    receivedAt: instant("received_at").notNull(),
    judgeStatus: varchar("judge_status", { length: 16 }).notNull(),
    overallVerdict: varchar("overall_verdict", { length: 8 }),
    judgeCompletedAt: instant("judge_completed_at"),
  },
  (t) => [
    unique("submissions_idempotency_unique").on(t.labId, t.studentUserId, t.idempotencyKey),
    unique("submissions_lab_submission_unique").on(t.labId, t.submissionId),
    check("submissions_source_bytes_check", sql`${t.sourceBytes} BETWEEN 1 AND 65536`),
    check(
      "submissions_judge_status_check",
      sql`${t.judgeStatus} IN ('queued', 'running', 'finished', 'failed')`,
    ),
    check(
      "submissions_overall_verdict_check",
      sql`${t.overallVerdict} IS NULL OR ${t.overallVerdict} IN ('AC', 'WA', 'TLE', 'MLE', 'RE', 'CE')`,
    ),
    index("submissions_latest_idx").on(t.labId, t.studentUserId, t.receivedAt, t.submissionId),
    index("submissions_lab_received_idx").on(t.labId, t.receivedAt, t.submissionId),
    index("submissions_student_received_idx").on(t.studentUserId, t.receivedAt),
    index("submissions_judge_status_received_idx").on(t.judgeStatus, t.receivedAt),
  ],
);

export const judgeJobs = pgTable(
  "judge_jobs",
  {
    judgeJobId: identity("judge_job_id"),
    submissionId: uuid("submission_id")
      .notNull()
      .unique()
      .references(() => submissions.submissionId, { onDelete: "restrict" }),
    status: varchar("status", { length: 16 }).notNull(),
    attemptCount: integer("attempt_count").notNull().default(0),
    availableAt: instant("available_at").notNull(),
    leaseOwner: varchar("lease_owner", { length: 160 }),
    leaseExpiresAt: instant("lease_expires_at"),
    lastErrorCode: varchar("last_error_code", { length: 64 }),
    createdAt: instant("created_at").notNull(),
    updatedAt: instant("updated_at").notNull(),
    completedAt: instant("completed_at"),
  },
  (t) => [
    check(
      "judge_jobs_status_check",
      sql`${t.status} IN ('queued', 'running', 'succeeded', 'retryable', 'failed')`,
    ),
    check("judge_jobs_attempt_count_check", sql`${t.attemptCount} >= 0`),
    index("judge_jobs_runnable_idx")
      .on(t.availableAt, t.judgeJobId)
      .where(sql`${t.status} IN ('queued', 'retryable')`),
    index("judge_jobs_expired_lease_idx")
      .on(t.leaseExpiresAt, t.judgeJobId)
      .where(sql`${t.status} = 'running'`),
  ],
);

export const testResults = pgTable(
  "test_results",
  {
    testResultId: identity("test_result_id"),
    submissionId: uuid("submission_id")
      .notNull()
      .references(() => submissions.submissionId, { onDelete: "restrict" }),
    testNumber: integer("test_number").notNull(),
    verdict: varchar("verdict", { length: 8 }).notNull(),
    executionMs: integer("execution_ms"),
    memoryKb: integer("memory_kb"),
    createdAt: instant("created_at").notNull(),
  },
  (t) => [
    unique("test_results_submission_test_unique").on(t.submissionId, t.testNumber),
    check(
      "test_results_verdict_check",
      sql`${t.verdict} IN ('AC', 'WA', 'TLE', 'MLE', 'RE', 'CE')`,
    ),
    check(
      "test_results_metrics_check",
      sql`(${t.executionMs} IS NULL OR ${t.executionMs} >= 0) AND (${t.memoryKb} IS NULL OR ${t.memoryKb} >= 0)`,
    ),
  ],
);

export const reviewRuns = pgTable(
  "review_runs",
  {
    reviewRunId: identity("review_run_id"),
    submissionId: uuid("submission_id")
      .notNull()
      .references(() => submissions.submissionId, { onDelete: "restrict" }),
    attemptNumber: integer("attempt_number").notNull(),
    status: varchar("status", { length: 16 }).notNull(),
    methodSummary: varchar("method_summary", { length: 16 }).notNull(),
    providerName: varchar("provider_name", { length: 120 }),
    modelName: varchar("model_name", { length: 160 }),
    inputTokens: integer("input_tokens"),
    outputTokens: integer("output_tokens"),
    costUsd: numeric("cost_usd", { precision: 10, scale: 6 }),
    failureCode: varchar("failure_code", { length: 64 }),
    startedAt: instant("started_at"),
    completedAt: instant("completed_at"),
    createdAt: instant("created_at").notNull(),
  },
  (t) => [
    unique("review_runs_submission_attempt_unique").on(t.submissionId, t.attemptNumber),
    check(
      "review_runs_status_check",
      sql`${t.status} IN ('queued', 'running', 'completed', 'partial', 'failed')`,
    ),
    check("review_runs_method_check", sql`${t.methodSummary} IN ('hard_rule', 'model', 'mixed')`),
    check(
      "review_runs_usage_check",
      sql`(${t.inputTokens} IS NULL OR ${t.inputTokens} >= 0) AND (${t.outputTokens} IS NULL OR ${t.outputTokens} >= 0) AND (${t.costUsd} IS NULL OR ${t.costUsd} >= 0)`,
    ),
    index("review_runs_status_created_idx").on(t.status, t.createdAt),
    index("review_runs_submission_created_idx").on(t.submissionId, t.createdAt),
    index("review_runs_provider_created_idx").on(t.providerName, t.createdAt),
  ],
);

export const reviewItems = pgTable(
  "review_items",
  {
    reviewItemId: identity("review_item_id"),
    reviewRunId: uuid("review_run_id")
      .notNull()
      .references(() => reviewRuns.reviewRunId, { onDelete: "restrict" }),
    submissionId: uuid("submission_id")
      .notNull()
      .references(() => submissions.submissionId, { onDelete: "restrict" }),
    labId: uuid("lab_id")
      .notNull()
      .references(() => labs.labId, { onDelete: "restrict" }),
    constraintId: varchar("constraint_id", { length: 40 }).notNull(),
    constraintRevisionId: uuid("constraint_revision_id")
      .notNull()
      .references(() => constraintRevisions.constraintRevisionId, { onDelete: "restrict" }),
    proposedVerdict: varchar("proposed_verdict", { length: 12 }).notNull(),
    proposalReason: text("proposal_reason"),
    evidence: jsonb("evidence").notNull().default([]),
    queueStatus: varchar("queue_status", { length: 12 }).notNull(),
    sampledPass: boolean("sampled_pass").notNull(),
    createdAt: instant("created_at").notNull(),
  },
  (t) => [
    foreignKey({
      columns: [t.labId, t.constraintId],
      foreignColumns: [labConstraints.labId, labConstraints.constraintId],
    }).onDelete("restrict"),
    foreignKey({
      columns: [t.labId, t.constraintId, t.constraintRevisionId],
      foreignColumns: [
        constraintRevisions.labId,
        constraintRevisions.constraintId,
        constraintRevisions.constraintRevisionId,
      ],
    }).onDelete("restrict"),
    unique("review_items_submission_constraint_run_unique").on(
      t.submissionId,
      t.constraintId,
      t.constraintRevisionId,
      t.reviewRunId,
    ),
    check(
      "review_items_verdict_check",
      sql`${t.proposedVerdict} IN ('pass', 'violation', 'unsure')`,
    ),
    check("review_items_queue_status_check", sql`${t.queueStatus} IN ('pending', 'resolved')`),
    check("review_items_evidence_array_check", sql`jsonb_typeof(${t.evidence}) = 'array'`),
    index("review_items_queue_idx").on(t.labId, t.queueStatus, t.createdAt, t.reviewItemId),
    index("review_items_history_idx").on(t.submissionId, t.constraintId, t.createdAt),
    index("review_items_pending_idx")
      .on(t.labId, t.createdAt)
      .where(sql`${t.queueStatus} = 'pending'`),
  ],
);

export const reviewDecisions = pgTable(
  "review_decisions",
  {
    reviewDecisionId: identity("review_decision_id"),
    reviewItemId: uuid("review_item_id")
      .notNull()
      .references(() => reviewItems.reviewItemId, { onDelete: "restrict" }),
    sequenceNumber: integer("sequence_number").notNull(),
    verdict: varchar("verdict", { length: 12 }).notNull(),
    reason: text("reason").notNull(),
    evidence: jsonb("evidence").notNull(),
    decidedByUserId: uuid("decided_by_user_id")
      .notNull()
      .references(() => users.userId, { onDelete: "restrict" }),
    decidedAt: instant("decided_at").notNull(),
    isCurrent: boolean("is_current").notNull(),
  },
  (t) => [
    unique("review_decisions_sequence_unique").on(t.reviewItemId, t.sequenceNumber),
    uniqueIndex("review_decisions_one_current_idx").on(t.reviewItemId).where(sql`${t.isCurrent}`),
    check("review_decisions_sequence_check", sql`${t.sequenceNumber} > 0`),
    check("review_decisions_verdict_check", sql`${t.verdict} IN ('pass', 'violation')`),
    check("review_decisions_evidence_array_check", sql`jsonb_typeof(${t.evidence}) = 'array'`),
    index("review_decisions_actor_decided_idx").on(t.decidedByUserId, t.decidedAt),
    index("review_decisions_history_idx").on(t.reviewItemId, t.decidedAt),
  ],
);
