import { describe, expect, it, mock } from "bun:test";
import { ClassService } from "../src/modules/class/class.service";
import type { ClassRepository } from "../src/modules/class/class.repository";
import type { UserProvider } from "../src/modules/user/interface/user-provider";

const classId = "64d0d19c-73e8-4d19-bae2-1d6c0f10f397";
const classRecord = { classId, className: "Intro to Programming" };

const makeService = (overrides: Record<string, unknown> = {}) => {
  const repository = {
    invitationCodeExists: mock(async () => false),
    createClass: mock(async ({ className, invitationCode }) => ({
      classId,
      className,
      invitationCode,
    })),
    getClassForStudentRecord: mock(async () => []),
    getClassForTeachersRecord: mock(async () => []),
    getAllClassRecord: mock(async () => []),
    getClassById: mock(async () => classRecord),
    isActiveTa: mock(async () => true),
    isActiveStudent: mock(async () => true),
    assignTa: mock(async ({ classId: id, taUserId }) => ({
      classId: id,
      userId: taUserId,
      changedAt: new Date("2026-11-18T10:00:00.000Z"),
    })),
    enrollStudent: mock(async ({ classId: id, studentUserId }) => ({
      classId: id,
      userId: studentUserId,
      changedAt: new Date("2026-11-18T10:00:00.000Z"),
    })),
    getClassByInvitationCode: mock(async () => classRecord),
    ...overrides,
  };
  const users = {
    getUserRole: mock(async () => "STU"),
    getUserStatus: mock(async () => "ACTIVE"),
  };

  return {
    repository,
    users,
    service: new ClassService(
      repository as unknown as ClassRepository,
      users as unknown as UserProvider,
    ),
  };
};

describe("class service access and membership rules", () => {
  it("hides a class from a student without an active membership", async () => {
    const { service } = makeService({
      isActiveStudent: mock(async () => false),
    });

    await expect(
      service.getClassDetail({ classId, userId: "student-id", role: "STU" }),
    ).rejects.toMatchObject({ status: 404 });
  });

  it("requires an active TA target before assignment", async () => {
    const { service, repository, users } = makeService();
    users.getUserRole.mockResolvedValueOnce("STU");

    await expect(
      service.assignTa({
        classId,
        taUserId: "student-id",
        assignedByUserId: "admin-id",
      }),
    ).rejects.toMatchObject({ status: 422 });
    expect(repository.assignTa).not.toHaveBeenCalled();
  });

  it("requires the TA actor to be assigned to the class before enrollment", async () => {
    const { service, repository } = makeService({
      isActiveTa: mock(async () => false),
    });

    await expect(
      service.enrollStudent({
        classId,
        studentUserId: "student-id",
        joinedByUserId: "ta-id",
        actorRole: "TA",
      }),
    ).rejects.toMatchObject({ status: 404 });
    expect(repository.enrollStudent).not.toHaveBeenCalled();
  });

  it("rejects an unknown invitation code without enrolling a student", async () => {
    const { service, repository } = makeService({
      getClassByInvitationCode: mock(async () => null),
    });

    await expect(
      service.joinByCode({
        invitationCode: "000000",
        studentUserId: "student-id",
      }),
    ).rejects.toMatchObject({ status: 404 });
    expect(repository.enrollStudent).not.toHaveBeenCalled();
  });

  it("generates a six-digit invitation code as part of class creation", async () => {
    const { service, repository } = makeService();

    const result = await service.createClass({
      className: "  Intro to Programming  ",
      adminId: "admin-id",
    });

    expect(result.className).toBe("Intro to Programming");
    expect(result.invitationCode).toMatch(/^\d{6}$/);
    expect(repository.createClass).toHaveBeenCalledTimes(1);
  });
});
