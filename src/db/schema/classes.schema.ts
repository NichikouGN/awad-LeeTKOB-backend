import { sql } from "drizzle-orm";
import { check, index, pgTable, unique, uniqueIndex, varchar } from "drizzle-orm/pg-core";
import { identity, instant, bytes } from "./_helpers";
import { users } from "./users.schema";
import { uuid } from "drizzle-orm/cockroach-core";

export const classes = pgTable(
  "classes",
  {
    classId: identity("class_id"),
    name: varchar("name", { length: 120 }).notNull(),
    createdByUserId: uuid("created_by_user_id")
      .notNull()
      .references(() => users.userId, { onDelete: "restrict" }),
    createdAt: instant("created_at").notNull(),
    updatedAt: instant("updated_at").notNull(),
    archivedAt: instant("archived_at"),
  },
  (t) => [index("classes_created_by_created_at_idx").on(t.createdByUserId, t.createdAt)],
);

export const classTas = pgTable(
  "class_tas",
  {
    classTaId: identity("class_ta_id"),
    classId: uuid("class_id")
      .notNull()
      .references(() => classes.classId, { onDelete: "restrict" }),
    taUserId: uuid("ta_user_id")
      .notNull()
      .references(() => users.userId, { onDelete: "restrict" }),
    assignedByUserId: uuid("assigned_by_user_id")
      .notNull()
      .references(() => users.userId, { onDelete: "restrict" }),
    assignedAt: instant("assigned_at").notNull(),
    revokedAt: instant("revoked_at"),
  },
  (t) => [
    uniqueIndex("class_tas_active_unique")
      .on(t.classId, t.taUserId)
      .where(sql`${t.revokedAt} IS NULL`),
    index("class_tas_active_ta_class_idx")
      .on(t.taUserId, t.classId)
      .where(sql`${t.revokedAt} IS NULL`),
    index("class_tas_assigned_by_at_idx").on(t.assignedByUserId, t.assignedAt),
  ],
);

export const classStudents = pgTable(
  "class_students",
  {
    classStudentId: identity("class_student_id"),
    classId: uuid("class_id")
      .notNull()
      .references(() => classes.classId, { onDelete: "restrict" }),
    studentUserId: uuid("student_user_id")
      .notNull()
      .references(() => users.userId, { onDelete: "restrict" }),
    joinedAt: instant("joined_at").notNull(),
    joinedVia: varchar("joined_via", { length: 16 }).notNull(),
    joinedByUserId: uuid("joined_by_user_id").references(() => users.userId, {
      onDelete: "restrict",
    }),
    leftAt: instant("left_at"),
  },
  (t) => [
    uniqueIndex("class_students_active_unique")
      .on(t.classId, t.studentUserId)
      .where(sql`${t.leftAt} IS NULL`),
    index("class_students_active_student_class_idx")
      .on(t.studentUserId, t.classId)
      .where(sql`${t.leftAt} IS NULL`),
    index("class_students_joined_by_at_idx").on(t.joinedByUserId, t.joinedAt),
    check("class_students_joined_via_check", sql`${t.joinedVia} IN ('invite', 'staff')`),
  ],
);

export const inviteCodes = pgTable(
  "invite_codes",
  {
    inviteCodeId: identity("invite_code_id"),
    classId: uuid("class_id")
      .notNull()
      .references(() => classes.classId, { onDelete: "restrict" }),
    codeHash: bytes("code_hash").notNull(),
    createdByUserId: uuid("created_by_user_id")
      .notNull()
      .references(() => users.userId, { onDelete: "restrict" }),
    createdAt: instant("created_at").notNull(),
    expiresAt: instant("expires_at").notNull(),
    revokedAt: instant("revoked_at"),
  },
  (t) => [
    unique("invite_codes_code_hash_unique").on(t.codeHash),
    index("invite_codes_class_created_at_idx").on(t.classId, t.createdAt),
    uniqueIndex("invite_codes_one_active_per_class")
      .on(t.classId)
      .where(sql`${t.revokedAt} IS NULL`),
  ],
);
