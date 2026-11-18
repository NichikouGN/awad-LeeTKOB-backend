import { db } from "../db";
import { users } from "../schema/users.schema";

export async function seedUsers() {
  const now = new Date();

  const userSeed = [
    {
      email: "seed:admin",
      displayName: "Demo Admin",
      passwordHash:
        "$2b$12$MA1KkO1I3U8.AwuWQIOAY.HGEmqjxiqjA7pxxsIxdfRGoTeDSSFFS", //1234
      role: "ADMIN",
      userStatus: "ACTIVE",
      createdAt: now,
      updatedAt: now,
    },
    {
      email: "seed:ta",
      displayName: "Demo TA",
      passwordHash: "123",
      role: "TA",
      userStatus: "ACTIVE",
      createdAt: now,
      updatedAt: now,
    },
    {
      email: "seed:student",
      displayName: "Demo Student",
      passwordHash: "123",
      role: "STU",
      userStatus: "ACTIVE",
      createdAt: now,
      updatedAt: now,
    },
  ] satisfies (typeof users.$inferInsert)[];

  await db.insert(users).values(userSeed).onConflictDoNothing();
}
