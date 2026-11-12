import { and, eq } from "drizzle-orm";
import { db } from "../db";
import { constraintRevisions, labConstraints, labs, testCases } from "../schema/labs.schema";
import { seedClasses } from "./classes.seed";

export async function seedLabs() {
  const { classId, taId } = await seedClasses();
  let [demoLab] = await db.select().from(labs).where(eq(labs.title, "Demo Addition Lab"));
  if (!demoLab) {
    const now = new Date();
    [demoLab] = await db.insert(labs).values({
      classId,
      title: "Demo Addition Lab",
      statement: "Read two integers and print their sum.",
      opensAt: new Date(now.getTime() + 60_000),
      deadlineAt: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000),
      cpuSeconds: 1,
      memoryMb: 256,
      createdByUserId: taId,
      createdAt: now,
      updatedByUserId: taId,
      updatedAt: now,
    }).returning();
  }

  let [constraint] = await db.select().from(labConstraints).where(and(
    eq(labConstraints.labId, demoLab.labId),
    eq(labConstraints.constraintId, "C1"),
  ));
  if (!constraint) {
    await db.insert(labConstraints).values({
      labId: demoLab.labId,
      constraintId: "C1",
      currentRevisionId: null,
      isActive: true,
      createdAt: new Date(),
    });
    const [revision] = await db.insert(constraintRevisions).values({
      labId: demoLab.labId,
      constraintId: "C1",
      revisionNumber: 1,
      text: "Use integer addition; do not hard-code the sample answer.",
      deduction: "2.00",
      changeKind: "created",
      changedByUserId: taId,
      changedAt: new Date(),
    }).returning();
    await db.update(labConstraints).set({ currentRevisionId: revision.constraintRevisionId })
      .where(and(eq(labConstraints.labId, demoLab.labId), eq(labConstraints.constraintId, "C1")));
  }

  await db.insert(testCases).values({
    labId: demoLab.labId,
    testNumber: 1,
    inputData: Buffer.from("2 3\n"),
    expectedOutput: Buffer.from("5\n"),
    createdAt: new Date(),
    updatedAt: new Date(),
  }).onConflictDoNothing();
}
