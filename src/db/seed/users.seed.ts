import { db } from "../db";
import { users } from "../schema/users.schema";

export async function seedUsers() {
  const now = new Date();

  const userSeed = [
    {
      email: "seed:admin",
      displayName: "Demo Admin",
      role: "ADMIN",
      userStatus: "ACTIVE",
      createdAt: now,
      updatedAt: now,
    },
    {
      email: "seed:ta",
      displayName: "Demo TA",
      role: "TA",
      userStatus: "ACTIVE",
      createdAt: now,
      updatedAt: now,
    },
    {
      email: "seed:student",
      displayName: "Demo Student",
      role: "STU",
      userStatus: "ACTIVE",
      createdAt: now,
      updatedAt: now,
    },
  ] satisfies (typeof users.$inferInsert)[];

  await db.insert(users).values(userSeed).onConflictDoNothing();
}
