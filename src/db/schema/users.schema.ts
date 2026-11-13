import { pgTable, varchar, pgEnum } from "drizzle-orm/pg-core";
import { identity, instant } from "./_helpers";
import { uuid } from "drizzle-orm/cockroach-core";

export const userRoleEnum = pgEnum("user_role", ["ADMIN", "TA", "STU"]);
export const userStatusEnum = pgEnum("user_status", ["ACTIVE", "DISABLED"]);

export const users = pgTable("users", {
  userId: uuid("user_id").defaultRandom().primaryKey(),
  displayName: varchar("display_name", { length: 160 }).notNull(),
  email: varchar("email", { length: 255 }).notNull(),
  role: userRoleEnum().notNull().default("STU"),
  userStatus: userStatusEnum().notNull().default("ACTIVE"),
  createdAt: instant("created_at").notNull(),
  updatedAt: instant("updated_at").notNull(),
});
