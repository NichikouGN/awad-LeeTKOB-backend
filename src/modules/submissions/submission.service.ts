import { createHash } from "node:crypto";
import { AppError } from "../../libs/errors/app-error";
import type { ClassProvider } from "../class/interface/class-provider";
import type { LabSubmissionProvider } from "../lab/lab.type";
import type { SubmissionRepository } from "./submission.repository";
import type { SubmissionSnapshotRecord } from "./submission.type";

const MAX_SOURCE_BYTES = 65_536;
const IDEMPOTENCY_KEY_PATTERN = /^[\x21-\x7e]{1,128}$/;

function sha256(value: Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "23505"
  );
}

function toStudentProjection(record: SubmissionSnapshotRecord) {
  return {
    id: record.submissionId,
    labId: record.labId,
    status: record.judgeStatus,
    receivedAt: record.receivedAt.toISOString(),
    overallVerdict: record.overallVerdict,
    tests:
      record.judgeStatus === "finished"
        ? record.tests.map((test) => ({
            testNumber: test.testNumber,
            verdict: test.verdict,
            ...(test.executionMs === null
              ? {}
              : { executionMs: test.executionMs }),
          }))
        : [],
  };
}

export class SubmissionService {
  constructor(
    private readonly repository: SubmissionRepository,
    private readonly labProvider: LabSubmissionProvider,
    private readonly classProvider: Pick<ClassProvider, "getClassDetail">,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async submit(request: {
    labId: string;
    studentUserId: string;
    role: "ADMIN" | "TA" | "STU";
    source: string;
    idempotencyKey: string | null;
  }) {
    if (request.role !== "STU") throw new AppError(403, "Not allowed");
    if (!request.source.length)
      throw new AppError(400, "Source must not be empty");
    const sourceCode = Buffer.from(request.source, "utf8");
    if (sourceCode.toString("utf8") !== request.source)
      throw new AppError(400, "Source must be valid UTF-8 text");
    if (sourceCode.byteLength > MAX_SOURCE_BYTES)
      throw new AppError(
        413,
        "Source exceeds the 65,536-byte limit",
        "payload-too-large",
      );
    if (
      typeof request.idempotencyKey !== "string" ||
      !IDEMPOTENCY_KEY_PATTERN.test(request.idempotencyKey)
    ) {
      throw new AppError(
        400,
        "Idempotency-Key must contain 1 to 128 visible ASCII characters",
      );
    }

    const receivedAt = this.now();
    const lab = await this.labProvider.getSubmissionPolicy(request.labId);
    await this.classProvider.getClassDetail({
      classId: lab.classId,
      userId: request.studentUserId,
      role: "STU",
    });

    const sourceSha256 = sha256(sourceCode);
    const existing = await this.repository.findByIdempotencyKey(
      request.labId,
      request.studentUserId,
      request.idempotencyKey,
    );
    if (existing) {
      if (existing.sourceSha256 !== sourceSha256)
        throw new AppError(
          409,
          "Idempotency-Key was already used with different source",
        );
      return toStudentProjection(existing);
    }

    if (receivedAt < lab.opensAt || receivedAt >= lab.deadlineAt)
      throw new AppError(
        409,
        "The lab is not accepting submissions",
        "submission-closed",
      );

    const queueRecord = {
      labId: request.labId,
      studentUserId: request.studentUserId,
      idempotencyKey: request.idempotencyKey,
      requestSha256: sourceSha256,
      sourceSha256,
      sourceCode,
      sourceBytes: sourceCode.byteLength,
      receivedAt,
    };
    try {
      return toStudentProjection(
        await this.repository.createQueued(queueRecord),
      );
    } catch (error) {
      if (isUniqueViolation(error)) {
        const raced = await this.repository.findByIdempotencyKey(
          request.labId,
          request.studentUserId,
          request.idempotencyKey,
        );
        if (raced) {
          if (raced.sourceSha256 !== sourceSha256)
            throw new AppError(
              409,
              "Idempotency-Key was already used with different source",
            );
          return toStudentProjection(raced);
        }
      }
      throw new AppError(
        503,
        "The submission could not be durably queued. Please retry with the same Idempotency-Key.",
      );
    }
  }

  async getOwn(request: { submissionId: string; studentUserId: string }) {
    const record = await this.repository.findOwnedById(
      request.submissionId,
      request.studentUserId,
    );
    if (!record) throw new AppError(404, "Submission not found");
    return toStudentProjection(record);
  }
}
