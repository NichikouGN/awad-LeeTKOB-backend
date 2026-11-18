import { randomInt } from "node:crypto";
import { AppError } from "../../libs/errors/app-error";
import type { UserProvider } from "../user/interface/user-provider";
import type { ClassRepository } from "./class.repository";
import type { ClassProvider } from "./interface/class-provider";
import type {
  AssignTaReq,
  ClassDetailReq,
  ClassListReq,
  ClassRes,
  ClassResWithCode,
  CreateClassReq,
  EnrollStudentReq,
  JoinByCodeReq,
  MembershipRes,
} from "./class.type";

const INVITATION_CODE_ATTEMPTS = 8;

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "23505"
  );
}

export class ClassService implements ClassProvider {
  constructor(
    private readonly classRepository: ClassRepository,
    private readonly userProvider: UserProvider,
  ) {}

  async createClass({
    className,
    adminId,
  }: CreateClassReq): Promise<ClassResWithCode> {
    const normalizedName = className.trim();
    if (normalizedName.length < 1 || normalizedName.length > 120) {
      throw new AppError(400, "Class name must contain 1 to 120 characters");
    }

    for (let attempt = 0; attempt < INVITATION_CODE_ATTEMPTS; attempt += 1) {
      const invitationCode = randomInt(100000, 1000000).toString();
      if (await this.classRepository.invitationCodeExists(invitationCode))
        continue;

      try {
        return await this.classRepository.createClass({
          className: normalizedName,
          invitationCode,
          adminId,
        });
      } catch (error) {
        if (!isUniqueViolation(error)) throw error;
      }
    }

    throw new AppError(409, "Unable to generate a unique invitation code");
  }

  async getClassList({ userId, role, page, limit }: ClassListReq) {
    const offset = (page - 1) * limit;
    switch (role) {
      case "ADMIN":
        return this.classRepository.getAllClassRecord({ offset, limit });
      case "TA":
        return this.classRepository.getClassForTeachersRecord({
          userId,
          offset,
          limit,
        });
      case "STU":
        return this.classRepository.getClassForStudentRecord({
          userId,
          offset,
          limit,
        });
    }
  }

  async getClassDetail({
    classId,
    userId,
    role,
  }: ClassDetailReq): Promise<ClassRes> {
    const classRecord = await this.classRepository.getClassById(classId);
    if (!classRecord) throw new AppError(404, "Class not found");

    const mayRead =
      role === "ADMIN" ||
      (role === "TA" &&
        (await this.classRepository.isActiveTa(classId, userId))) ||
      (role === "STU" &&
        (await this.classRepository.isActiveStudent(classId, userId)));

    if (!mayRead) throw new AppError(404, "Class not found");
    return classRecord;
  }

  async assignTa(request: AssignTaReq): Promise<MembershipRes> {
    await this.requireClass(request.classId);
    await this.requireEligibleUser(request.taUserId, "TA");
    return this.classRepository.assignTa(request);
  }

  async enrollStudent(
    request: EnrollStudentReq & { actorRole: "ADMIN" | "TA" },
  ) {
    await this.requireClass(request.classId);

    if (
      request.actorRole === "TA" &&
      !(await this.classRepository.isActiveTa(
        request.classId,
        request.joinedByUserId ?? "",
      ))
    ) {
      throw new AppError(404, "Class not found");
    }

    await this.requireEligibleUser(request.studentUserId, "STU");
    return this.classRepository.enrollStudent(request);
  }

  async joinByCode({
    invitationCode,
    studentUserId,
  }: JoinByCodeReq): Promise<ClassRes> {
    const classRecord =
      await this.classRepository.getClassByInvitationCode(invitationCode);
    if (!classRecord) throw new AppError(404, "Class not found");

    await this.classRepository.enrollStudent({
      classId: classRecord.classId,
      studentUserId,
      joinedByUserId: null,
    });

    return classRecord;
  }

  private async requireClass(classId: string): Promise<void> {
    if (!(await this.classRepository.getClassById(classId))) {
      throw new AppError(404, "Class not found");
    }
  }

  private async requireEligibleUser(
    userId: string,
    requiredRole: "TA" | "STU",
  ): Promise<void> {
    const [role, status] = await Promise.all([
      this.userProvider.getUserRole(userId),
      this.userProvider.getUserStatus(userId),
    ]);

    if (role === null || status === null)
      throw new AppError(404, "User not found");
    if (status !== "ACTIVE" || role !== requiredRole) {
      throw new AppError(422, "User is not eligible for this class action");
    }
  }
}
