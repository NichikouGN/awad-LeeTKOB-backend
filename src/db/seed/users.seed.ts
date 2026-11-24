import { db } from "../db";
import { users } from "../schema/users.schema";
import { and, eq } from "drizzle-orm";
import { hashPassword } from "../../modules/auth/auth.utils";

export async function seedUsers() {
  const now = new Date();
  const taPasswordHash = await hashPassword("1234"); // Local demo password.

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
      passwordHash: taPasswordHash,
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
  // Repair the old placeholder without resetting an already changed password.
  await db
    .update(users)
    .set({ passwordHash: taPasswordHash, updatedAt: now })
    .where(and(eq(users.email, "seed:ta"), eq(users.passwordHash, "123")));
}
