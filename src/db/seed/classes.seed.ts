import { eq } from "drizzle-orm";
import { db } from "../db";
import { classStudents, classTas, classes } from "../schema/classes.schema";
import { users } from "../schema/users.schema";

export async function seedClasses() {
  const [admin] = await db.select().from(users).where(eq(users.email, "seed:admin"));
  const [ta] = await db.select().from(users).where(eq(users.email, "seed:ta"));
  const [student] = await db.select().from(users).where(eq(users.email, "seed:student"));
  if (!admin || !ta || !student) throw new Error("Seed users must be created before classes");

  let [demoClass] = await db.select().from(classes).where(eq(classes.name, "Demo Programming Class"));
  if (!demoClass) {
    [demoClass] = await db.insert(classes).values({
      name: "Demo Programming Class",
      createdByUserId: admin.userId,
      createdAt: new Date(),
      updatedAt: new Date(),
    }).returning();
  }

  await db.insert(classTas).values({
    classId: demoClass.classId,
    taUserId: ta.userId,
    assignedByUserId: admin.userId,
    assignedAt: new Date(),
  }).onConflictDoNothing();

  await db.insert(classStudents).values({
    classId: demoClass.classId,
    studentUserId: student.userId,
    joinedAt: new Date(),
    joinedVia: "staff",
    joinedByUserId: admin.userId,
  }).onConflictDoNothing();

  return { classId: demoClass.classId, adminId: admin.userId, taId: ta.userId, studentId: student.userId };
}
