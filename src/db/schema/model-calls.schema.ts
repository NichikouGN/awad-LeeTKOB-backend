import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  jsonb,
  pgTable,
  text,
} from "drizzle-orm/pg-core";
import { identity, instant } from "./_helpers";
import type {
  ModelPrompt,
  ModelUsage,
  ConstraintVerdict,
} from "../../modules/constraint-review/contract";

export const modelBudgets = pgTable(
  "model_budget_accounts",
  {
    scope: text("scope").primaryKey(),
    limitMicros: integer("limit_micros").notNull(),
    createdAt: instant("created_at").notNull().defaultNow(),
  },
  (t) => [
    check(
      "model_budget_limit_check",
      sql`${t.limitMicros} BETWEEN 1 AND 1000000`,
    ),
  ],
);

export const modelCalls = pgTable(
  "model_calls",
  {
    callId: identity("call_id"),
    scope: text("scope")
      .notNull()
      .references(() => modelBudgets.scope, { onDelete: "restrict" }),
    submissionId: text("submission_id"),
    attemptNumber: integer("attempt_number"),
    constraintId: text("constraint_id").notNull(),
    provider: text("provider").notNull(),
    requestedModel: text("requested_model").notNull(),
    reservedMicros: integer("reserved_micros").notNull(),
    accountedMicros: integer("accounted_micros"),
    prompt: jsonb("prompt").$type<ModelPrompt>().notNull(),
    status: text("status")
      .$type<"reserved" | "completed" | "uncertain">()
      .notNull(),
    usage: jsonb("usage").$type<ModelUsage>(),
    output:
      jsonb("output").$type<Pick<ConstraintVerdict, "verdict" | "evidence">>(),
    reason: text("reason"),
    createdAt: instant("created_at").notNull().defaultNow(),
    completedAt: instant("completed_at"),
  },
  (t) => [
    check(
      "model_calls_status_check",
      sql`${t.status} IN ('reserved','completed','uncertain')`,
    ),
    check(
      "model_calls_reservation_check",
      sql`${t.reservedMicros} > 0 AND (${t.accountedMicros} IS NULL OR ${t.accountedMicros} >= 0)`,
    ),
    index("model_calls_scope_idx").on(t.scope),
    index("model_calls_submission_attempt_idx").on(
      t.submissionId,
      t.attemptNumber,
    ),
  ],
);
