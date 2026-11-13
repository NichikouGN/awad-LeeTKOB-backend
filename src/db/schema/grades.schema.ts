import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  jsonb,
  numeric,
  pgTable,
  text,
  unique,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";
import { identity, instant } from "./_helpers";
import { users } from "./users.schema";
import { constraintRevisions, labs } from "./labs.schema";
import { submissions } from "./submissions.schema";
import { uuid } from "drizzle-orm/cockroach-core";

export const grades = pgTable(
  "grades",
  {
    gradeId: identity("grade_id"),
    labId: uuid("lab_id")
      .notNull()
      .references(() => labs.labId, { onDelete: "restrict" }),
    studentUserId: uuid("student_user_id")
      .notNull()
      .references(() => users.userId, { onDelete: "restrict" }),
    submissionId: uuid("submission_id")
      .unique()
      .references(() => submissions.submissionId, { onDelete: "restrict" }),
    baseScore: numeric("base_score", { precision: 4, scale: 2 }).notNull(),
    score: numeric("score", { precision: 4, scale: 2 }).notNull(),
    gradeSource: varchar("grade_source", { length: 24 }).notNull(),
    updatedAt: instant("updated_at").notNull(),
    updatedByUserId: uuid("updated_by_user_id").references(
      () => users.userId,
      { onDelete: "restrict" },
    ),
  },
  (t) => [
    unique("grades_lab_student_unique").on(t.labId, t.studentUserId),
    check(
      "grades_scores_check",
      sql`${t.baseScore} BETWEEN 0 AND 10 AND ${t.score} BETWEEN 0 AND 10`,
    ),
    check(
      "grades_source_check",
      sql`${t.gradeSource} IN ('accepted_formula', 'non_ac_default', 'no_submission_default')`,
    ),
    index("grades_lab_score_student_idx").on(t.labId, t.score, t.studentUserId),
    index("grades_student_lab_idx").on(t.studentUserId, t.labId),
  ],
);

export const deductions = pgTable(
  "deductions",
  {
    deductionId: identity("deduction_id"),
    gradeId: uuid("grade_id")
      .notNull()
      .references(() => grades.gradeId, { onDelete: "restrict" }),
    constraintId: varchar("constraint_id", { length: 40 }).notNull(),
    constraintRevisionId: uuid("constraint_revision_id")
      .notNull()
      .references(() => constraintRevisions.constraintRevisionId, { onDelete: "restrict" }),
    amount: numeric("amount", { precision: 4, scale: 2 }).notNull(),
    reason: text("reason").notNull(),
    evidence: jsonb("evidence").notNull(),
    isActive: boolean("is_active").notNull(),
    createdAt: instant("created_at").notNull(),
    removedAt: instant("removed_at"),
  },
  (t) => [
    check("deductions_amount_check", sql`${t.amount} BETWEEN 0.01 AND 10.00`),
    check(
      "deductions_evidence_check",
      sql`jsonb_typeof(${t.evidence}) = 'array' AND jsonb_array_length(${t.evidence}) > 0`,
    ),
    uniqueIndex("deductions_one_active_constraint_idx")
      .on(t.gradeId, t.constraintId)
      .where(sql`${t.isActive}`),
    index("deductions_grade_active_idx").on(t.gradeId, t.isActive),
    index("deductions_revision_idx").on(t.constraintRevisionId),
  ],
);

export const appeals = pgTable(
  "appeals",
  {
    appealId: identity("appeal_id"),
    deductionId: uuid("deduction_id")
      .notNull()
      .unique()
      .references(() => deductions.deductionId, { onDelete: "restrict" }),
    studentUserId: uuid("student_user_id")
      .notNull()
      .references(() => users.userId, { onDelete: "restrict" }),
    explanation: text("explanation").notNull(),
    status: varchar("status", { length: 12 }).notNull().default("pending"),
    createdAt: instant("created_at").notNull(),
    decidedByUserId: uuid("decided_by_user_id").references(
      () => users.userId,
      { onDelete: "restrict" },
    ),
    decidedAt: instant("decided_at"),
    decisionReason: text("decision_reason"),
  },
  (t) => [
    check("appeals_status_check", sql`${t.status} IN ('pending', 'accepted', 'rejected')`),
    check("appeals_explanation_check", sql`length(btrim(${t.explanation})) > 0`),
    check(
      "appeals_decision_fields_consistent",
      sql`(${t.status} = 'pending' AND ${t.decidedByUserId} IS NULL AND ${t.decidedAt} IS NULL AND ${t.decisionReason} IS NULL) OR (${t.status} IN ('accepted', 'rejected') AND ${t.decidedByUserId} IS NOT NULL AND ${t.decidedAt} IS NOT NULL AND ${t.decisionReason} IS NOT NULL)`,
    ),
    index("appeals_status_created_idx").on(t.status, t.createdAt, t.appealId),
    index("appeals_student_created_idx").on(t.studentUserId, t.createdAt),
    index("appeals_decider_decided_idx").on(t.decidedByUserId, t.decidedAt),
  ],
);

export const gradeAdjustments = pgTable(
  "grade_adjustments",
  {
    gradeAdjustmentId: identity("grade_adjustment_id"),
    gradeId: uuid("grade_id")
      .notNull()
      .references(() => grades.gradeId, { onDelete: "restrict" }),
    appealId: uuid("appeal_id").references(() => appeals.appealId, {
      onDelete: "restrict",
    }),
    adjustmentType: varchar("adjustment_type", { length: 24 }).notNull(),
    scoreBefore: numeric("score_before", { precision: 4, scale: 2 }).notNull(),
    scoreAfter: numeric("score_after", { precision: 4, scale: 2 }).notNull(),
    reason: text("reason").notNull(),
    changedByUserId: uuid("changed_by_user_id")
      .notNull()
      .references(() => users.userId, { onDelete: "restrict" }),
    createdAt: instant("created_at").notNull(),
  },
  (t) => [
    check(
      "grade_adjustments_type_check",
      sql`${t.adjustmentType} IN ('appeal_accepted', 'manual_correction')`,
    ),
    check(
      "grade_adjustments_scores_check",
      sql`${t.scoreBefore} BETWEEN 0 AND 10 AND ${t.scoreAfter} BETWEEN 0 AND 10`,
    ),
    check(
      "grade_adjustments_appeal_type_consistent",
      sql`(${t.adjustmentType} = 'appeal_accepted' AND ${t.appealId} IS NOT NULL) OR (${t.adjustmentType} = 'manual_correction' AND ${t.appealId} IS NULL)`,
    ),
    index("grade_adjustments_grade_created_idx").on(t.gradeId, t.createdAt),
    index("grade_adjustments_actor_created_idx").on(t.changedByUserId, t.createdAt),
    uniqueIndex("grade_adjustments_appeal_once_idx")
      .on(t.appealId)
      .where(sql`${t.appealId} IS NOT NULL`),
  ],
);

export const labPublications = pgTable(
  "lab_publications",
  {
    labId: uuid("lab_id")
      .primaryKey()
      .references(() => labs.labId, { onDelete: "restrict" }),
    publishedByUserId: uuid("published_by_user_id")
      .notNull()
      .references(() => users.userId, { onDelete: "restrict" }),
    publishedAt: instant("published_at").notNull(),
    createdAt: instant("created_at").notNull(),
  },
  (t) => [index("lab_publications_actor_published_idx").on(t.publishedByUserId, t.publishedAt)],
);
