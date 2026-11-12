import { db } from "../db";
import { users } from "../schema/users.schema";

export async function seedUsers() {
  const now = new Date();
  const userSeed = [
    {
      identitySubject: "seed:admin",
      displayName: "Demo Admin",
      role: "admin",
      accountStatus: "active",
      createdAt: now,
      updatedAt: now,
    },
    {
      identitySubject: "seed:ta",
      displayName: "Demo TA",
      role: "ta",
      accountStatus: "active",
      createdAt: now,
      updatedAt: now,
    },
    {
      identitySubject: "seed:student",
      displayName: "Demo Student",
      role: "student",
      accountStatus: "active",
      createdAt: now,
      updatedAt: now,
    },
  ];

  await db.insert(users).values(userSeed).onConflictDoNothing();
}
