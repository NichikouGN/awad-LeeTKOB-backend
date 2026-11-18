import { and, asc, eq, isNull } from "drizzle-orm";
import {
  classes,
  classStudents,
  classTas,
} from "../../db/schema/classes.schema";
import type { Database } from "../../db/db";
import type {
  AssignTaReq,
  ClassListReqRecord,
  ClassRes,
  ClassResWithCode,
  CreateClassRecord,
  EnrollStudentReq,
  MembershipRes,
  OffsetLimit,
} from "./class.type";

export class ClassRepository {
  constructor(private readonly db: Database) {}

  async invitationCodeExists(invitationCode: string): Promise<boolean> {
    const [result] = await this.db
      .select({ classId: classes.classId })
      .from(classes)
      .where(eq(classes.invitationCode, invitationCode))
      .limit(1);
    return Boolean(result);
  }

  async createClass({
    className,
    invitationCode,
    adminId,
  }: CreateClassRecord): Promise<ClassResWithCode> {
    const [result] = await this.db
      .insert(classes)
      .values({
        className,
        invitationCode,
        createdByUserId: adminId,
      })
      .returning();

    return {
      classId: result.classId,
      className: result.className,
      invitationCode: result.invitationCode,
    };
  }

  async getClassForStudentRecord({
    userId,
    offset,
    limit,
  }: ClassListReqRecord): Promise<ClassRes[]> {
    const result = await this.db
      .select({ classId: classes.classId, className: classes.className })
      .from(classes)
      .innerJoin(classStudents, eq(classes.classId, classStudents.classId))
      .where(
        and(
          eq(classStudents.studentUserId, userId),
          isNull(classStudents.leftAt),
          isNull(classes.archivedAt),
        ),
      )
      .orderBy(asc(classes.classId))
      .offset(offset)
      .limit(limit);

    return result;
  }

  async getClassForTeachersRecord({
    userId,
    offset,
    limit,
  }: ClassListReqRecord): Promise<ClassRes[]> {
    const result = await this.db
      .select({ classId: classes.classId, className: classes.className })
      .from(classes)
      .innerJoin(classTas, eq(classes.classId, classTas.classId))
      .where(
        and(
          eq(classTas.taUserId, userId),
          isNull(classTas.revokedAt),
          isNull(classes.archivedAt),
        ),
      )
      .orderBy(asc(classes.classId))
      .offset(offset)
      .limit(limit);

    return result;
  }

  async getAllClassRecord({ offset, limit }: OffsetLimit): Promise<ClassRes[]> {
    return this.db
      .select({ classId: classes.classId, className: classes.className })
      .from(classes)
      .where(isNull(classes.archivedAt))
      .orderBy(asc(classes.classId))
      .offset(offset)
      .limit(limit);
  }

  async getClassById(classId: string): Promise<ClassRes | null> {
    const [result] = await this.db
      .select({ classId: classes.classId, className: classes.className })
      .from(classes)
      .where(and(eq(classes.classId, classId), isNull(classes.archivedAt)))
      .limit(1);
    return result ?? null;
  }

  async isActiveTa(classId: string, userId: string): Promise<boolean> {
    const [result] = await this.db
      .select({ classTaId: classTas.classTaId })
      .from(classTas)
      .where(
        and(
          eq(classTas.classId, classId),
          eq(classTas.taUserId, userId),
          isNull(classTas.revokedAt),
        ),
      )
      .limit(1);
    return Boolean(result);
  }

  async isActiveStudent(classId: string, userId: string): Promise<boolean> {
    const [result] = await this.db
      .select({ classStudentId: classStudents.classStudentId })
      .from(classStudents)
      .where(
        and(
          eq(classStudents.classId, classId),
          eq(classStudents.studentUserId, userId),
          isNull(classStudents.leftAt),
        ),
      )
      .limit(1);
    return Boolean(result);
  }

  async assignTa({
    classId,
    taUserId,
    assignedByUserId,
  }: AssignTaReq): Promise<MembershipRes> {
    const [existing] = await this.db
      .select()
      .from(classTas)
      .where(
        and(
          eq(classTas.classId, classId),
          eq(classTas.taUserId, taUserId),
          isNull(classTas.revokedAt),
        ),
      )
      .limit(1);

    if (existing) {
      return {
        classId,
        userId: taUserId,
        changedAt: existing.assignedAt,
      };
    }

    const [inserted] = await this.db
      .insert(classTas)
      .values({ classId, taUserId, assignedByUserId, assignedAt: new Date() })
      .onConflictDoNothing()
      .returning();

    if (inserted) {
      return {
        classId,
        userId: taUserId,
        changedAt: inserted.assignedAt,
      };
    }

    const [afterConflict] = await this.db
      .select()
      .from(classTas)
      .where(
        and(
          eq(classTas.classId, classId),
          eq(classTas.taUserId, taUserId),
          isNull(classTas.revokedAt),
        ),
      )
      .limit(1);

    if (!afterConflict) throw new Error("TA assignment could not be created");
    return { classId, userId: taUserId, changedAt: afterConflict.assignedAt };
  }

  async enrollStudent({
    classId,
    studentUserId,
    joinedByUserId,
  }: EnrollStudentReq): Promise<MembershipRes> {
    const [existing] = await this.db
      .select()
      .from(classStudents)
      .where(
        and(
          eq(classStudents.classId, classId),
          eq(classStudents.studentUserId, studentUserId),
          isNull(classStudents.leftAt),
        ),
      )
      .limit(1);

    if (existing) {
      return {
        classId,
        userId: studentUserId,
        changedAt: existing.joinedAt,
      };
    }

    const [inserted] = await this.db
      .insert(classStudents)
      .values({
        classId,
        studentUserId,
        joinedByUserId,
        joinedAt: new Date(),
      })
      .onConflictDoNothing()
      .returning();

    if (inserted) {
      return {
        classId,
        userId: studentUserId,
        changedAt: inserted.joinedAt,
      };
    }

    const [afterConflict] = await this.db
      .select()
      .from(classStudents)
      .where(
        and(
          eq(classStudents.classId, classId),
          eq(classStudents.studentUserId, studentUserId),
          isNull(classStudents.leftAt),
        ),
      )
      .limit(1);

    if (!afterConflict)
      throw new Error("Student enrollment could not be created");
    return {
      classId,
      userId: studentUserId,
      changedAt: afterConflict.joinedAt,
    };
  }

  async getClassByInvitationCode(code: string): Promise<ClassRes | null> {
    const [result] = await this.db
      .select({ classId: classes.classId, className: classes.className })
      .from(classes)
      .where(and(eq(classes.invitationCode, code), isNull(classes.archivedAt)))
      .limit(1);
    return result ?? null;
  }
}
