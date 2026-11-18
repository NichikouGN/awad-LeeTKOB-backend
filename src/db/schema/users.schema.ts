import { pgTable, varchar, pgEnum } from "drizzle-orm/pg-core";
import { timestamp } from "drizzle-orm/cockroach-core";
import { identity } from "./_helpers";

export const userRoleEnum = pgEnum("user_role", ["ADMIN", "TA", "STU"]);
export const userStatusEnum = pgEnum("user_status", ["ACTIVE", "DISABLED"]);

export const users = pgTable("users", {
  userId: identity("user_id"),
  displayName: varchar("display_name", { length: 160 }).notNull(),
  email: varchar("email", { length: 255 }).notNull(),
  passwordHash: varchar("password_hash", { length: 255 }).notNull(),
  role: userRoleEnum().notNull().default("STU"),
  userStatus: userStatusEnum().notNull().default("ACTIVE"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});
