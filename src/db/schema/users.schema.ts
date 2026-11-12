import { sql } from "drizzle-orm";
import { check, pgTable, unique, varchar } from "drizzle-orm/pg-core";
import { identity, instant } from "./_helpers";

export const users = pgTable(
  "users",
  {
    userId: identity("user_id"),
    identitySubject: varchar("identity_subject", { length: 255 }).notNull(),
    displayName: varchar("display_name", { length: 160 }).notNull(),
    role: varchar("role", { length: 16 }).notNull(),
    accountStatus: varchar("account_status", { length: 16 }).notNull().default("active"),
    createdAt: instant("created_at").notNull(),
    updatedAt: instant("updated_at").notNull(),
  },
  (t) => [
    unique("users_identity_subject_unique").on(t.identitySubject),
    check("users_role_check", sql`${t.role} IN ('admin', 'ta', 'student')`),
    check("users_account_status_check", sql`${t.accountStatus} IN ('active', 'disabled')`),
  ],
);
