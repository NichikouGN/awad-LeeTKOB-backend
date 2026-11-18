import { and, asc, desc, eq } from "drizzle-orm";
import type { Database } from "../../db/db";
import {
  constraintRevisions,
  labConstraints,
  labs,
  testCases,
} from "../../db/schema/labs.schema";
import type { LabCreateRecord, LabRecord, LabSummaryRecord } from "./types";

export interface LabRepository {
  create(record: LabCreateRecord): Promise<LabRecord>;
  findById(labId: string): Promise<LabRecord | null>;
  listByClass(
    classId: string,
    offset: number,
    limit: number,
  ): Promise<LabSummaryRecord[]>;
}

export class DrizzleLabRepository implements LabRepository {
  constructor(private readonly db: Database) {}

  async create(record: LabCreateRecord): Promise<LabRecord> {
    return this.db.transaction(async (tx) => {
      const [lab] = await tx
        .insert(labs)
        .values({
          classId: record.classId,
          title: record.title,
          statement: record.statement,
          opensAt: record.opensAt,
          deadlineAt: record.deadlineAt,
          cpuSeconds: record.cpuSeconds,
          memoryMb: record.memoryMb,
          createdByUserId: record.createdByUserId,
          createdAt: record.now,
          updatedByUserId: record.createdByUserId,
          updatedAt: record.now,
        })
        .returning();

      const savedConstraints: LabRecord["constraints"] = [];
      for (const constraint of record.constraints) {
        await tx.insert(labConstraints).values({
          labId: lab.labId,
          constraintId: constraint.id,
          currentRevisionId: null,
          isActive: true,
          createdAt: record.now,
        });
        const [revision] = await tx
          .insert(constraintRevisions)
          .values({
            labId: lab.labId,
            constraintId: constraint.id,
            revisionNumber: 1,
            text: constraint.text,
            deduction: constraint.deduction,
            changeKind: "created",
            changedByUserId: record.createdByUserId,
            changedAt: record.now,
          })
          .returning();
        await tx
          .update(labConstraints)
          .set({ currentRevisionId: revision.constraintRevisionId })
          .where(
            and(
              eq(labConstraints.labId, lab.labId),
              eq(labConstraints.constraintId, constraint.id),
            ),
          );
        savedConstraints.push({
          id: constraint.id,
          text: constraint.text,
          deduction: constraint.deduction,
        });
      }

      const savedTests = record.tests.map((test, index) => ({
        labId: lab.labId,
        testNumber: index + 1,
        inputData: test.input,
        expectedOutput: test.expectedOutput,
        createdAt: record.now,
        updatedAt: record.now,
      }));
      await tx.insert(testCases).values(savedTests);

      return {
        ...lab,
        constraints: savedConstraints,
        tests: record.tests.map((test, index) => ({
          testNumber: index + 1,
          ...test,
        })),
      };
    });
  }

  async findById(labId: string): Promise<LabRecord | null> {
    const [lab] = await this.db
      .select()
      .from(labs)
      .where(eq(labs.labId, labId))
      .limit(1);
    if (!lab) return null;

    const constraintRows = await this.db
      .select({
        id: labConstraints.constraintId,
        text: constraintRevisions.text,
        deduction: constraintRevisions.deduction,
      })
      .from(labConstraints)
      .innerJoin(
        constraintRevisions,
        eq(
          labConstraints.currentRevisionId,
          constraintRevisions.constraintRevisionId,
        ),
      )
      .where(
        and(eq(labConstraints.labId, labId), eq(labConstraints.isActive, true)),
      )
      .orderBy(asc(labConstraints.constraintId));
    const testRows = await this.db
      .select()
      .from(testCases)
      .where(eq(testCases.labId, labId))
      .orderBy(asc(testCases.testNumber));

    return {
      ...lab,
      constraints: constraintRows,
      tests: testRows.map((test) => ({
        testNumber: test.testNumber,
        input: test.inputData,
        expectedOutput: test.expectedOutput,
      })),
    };
  }

  async listByClass(
    classId: string,
    offset: number,
    limit: number,
  ): Promise<LabSummaryRecord[]> {
    return this.db
      .select({
        labId: labs.labId,
        classId: labs.classId,
        title: labs.title,
        opensAt: labs.opensAt,
        deadlineAt: labs.deadlineAt,
        updatedAt: labs.updatedAt,
      })
      .from(labs)
      .where(eq(labs.classId, classId))
      .orderBy(desc(labs.createdAt), desc(labs.labId))
      .offset(offset)
      .limit(limit);
  }
}
