import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  foreignKey,
  index,
  integer,
  numeric,
  pgTable,
  primaryKey,
  smallint,
  text,
  unique,
  varchar,
} from "drizzle-orm/pg-core";
import { identity, instant, bytes } from "./_helpers";
import { users } from "./users.schema";
import { classes } from "./classes.schema";
import { uuid } from "drizzle-orm/cockroach-core";

export const labs = pgTable(
  "labs",
  {
    labId: identity("lab_id"),
    classId: uuid("class_id")
      .notNull()
      .references(() => classes.classId, { onDelete: "restrict" }),
    title: varchar("title", { length: 160 }).notNull(),
    statement: text("statement").notNull(),
    opensAt: instant("opens_at").notNull(),
    deadlineAt: instant("deadline_at").notNull(),
    cpuSeconds: smallint("cpu_seconds").notNull().default(1),
    memoryMb: smallint("memory_mb").notNull().default(256),
    createdByUserId: uuid("created_by_user_id")
      .notNull()
      .references(() => users.userId, { onDelete: "restrict" }),
    createdAt: instant("created_at").notNull(),
    updatedByUserId: uuid("updated_by_user_id")
      .notNull()
      .references(() => users.userId, { onDelete: "restrict" }),
    updatedAt: instant("updated_at").notNull(),
  },
  (t) => [
    check("labs_open_before_deadline", sql`${t.opensAt} < ${t.deadlineAt}`),
    check("labs_cpu_seconds_check", sql`${t.cpuSeconds} BETWEEN 1 AND 5`),
    check("labs_memory_mb_check", sql`${t.memoryMb} BETWEEN 64 AND 512`),
    index("labs_class_opens_idx").on(t.classId, t.opensAt, t.labId),
    index("labs_deadline_idx").on(t.deadlineAt, t.labId),
    index("labs_created_by_at_idx").on(t.createdByUserId, t.createdAt),
  ],
);

export const labConstraints = pgTable(
  "lab_constraints",
  {
    labId: uuid("lab_id")
      .notNull()
      .references(() => labs.labId, { onDelete: "restrict" }),
    constraintId: varchar("constraint_id", { length: 40 }).notNull(),
    // The logical pointer is validated with the owning constraint in the write transaction.
    // Keeping this as a scalar avoids a circular Drizzle table reference.
    currentRevisionId: uuid("current_revision_id"),
    isActive: boolean("is_active").notNull(),
    createdAt: instant("created_at").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.labId, t.constraintId] }),
    index("lab_constraints_active_idx").on(t.labId, t.isActive, t.constraintId),
  ],
);

export const constraintRevisions = pgTable(
  "constraint_revisions",
  {
    constraintRevisionId: identity("constraint_revision_id"),
    labId: uuid("lab_id").notNull(),
    constraintId: varchar("constraint_id", { length: 40 }).notNull(),
    revisionNumber: integer("revision_number").notNull(),
    text: text("text").notNull(),
    deduction: numeric("deduction", { precision: 4, scale: 2 }).notNull(),
    changeKind: varchar("change_kind", { length: 24 }).notNull(),
    changedByUserId: uuid("changed_by_user_id")
      .notNull()
      .references(() => users.userId, { onDelete: "restrict" }),
    changedAt: instant("changed_at").notNull(),
    changeReason: text("change_reason"),
  },
  (t) => [
    foreignKey({
      columns: [t.labId, t.constraintId],
      foreignColumns: [labConstraints.labId, labConstraints.constraintId],
    }).onDelete("restrict"),
    unique("constraint_revisions_number_unique").on(
      t.labId,
      t.constraintId,
      t.revisionNumber,
    ),
    unique("constraint_revisions_owner_id_unique").on(
      t.labId,
      t.constraintId,
      t.constraintRevisionId,
    ),
    check(
      "constraint_revisions_deduction_check",
      sql`${t.deduction} BETWEEN 0.01 AND 10.00`,
    ),
    check("constraint_revisions_number_check", sql`${t.revisionNumber} > 0`),
    check(
      "constraint_revisions_kind_check",
      sql`${t.changeKind} IN ('created', 'edited', 'removed')`,
    ),
    index("constraint_revisions_lab_changed_at_idx").on(t.labId, t.changedAt),
  ],
);

export const testCases = pgTable(
  "test_cases",
  {
    testCaseId: identity("test_case_id"),
    labId: uuid("lab_id")
      .notNull()
      .references(() => labs.labId, { onDelete: "restrict" }),
    testNumber: integer("test_number").notNull(),
    inputData: bytes("input_data").notNull(),
    expectedOutput: bytes("expected_output").notNull(),
    createdAt: instant("created_at").notNull(),
    updatedAt: instant("updated_at").notNull(),
  },
  (t) => [
    unique("test_cases_lab_test_number_unique").on(t.labId, t.testNumber),
    unique("test_cases_lab_id_unique").on(t.labId, t.testCaseId),
  ],
);
