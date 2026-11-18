import { describe, expect, it, mock } from "bun:test";
import { createHash } from "node:crypto";
import { AppError } from "../src/libs/errors/app-error";
import type { ClassProvider } from "../src/modules/class/interface/class-provider";
import type { LabService } from "../src/modules/lab/lab.service";
import type { SubmissionRepository } from "../src/modules/submissions/submission.repository";
import { SubmissionService } from "../src/modules/submissions/submission.service";

const labId = "64d0d19a-73e8-4d19-bae2-1d6c0f10f397";
const submissionId = "64d0d19e-73e8-4d19-bae2-1d6c0f10f397";
const classId = "64d0d19c-73e8-4d19-bae2-1d6c0f10f397";
const studentId = "9b7bdf70-9740-48a1-a7bb-0875a9103a73";
const receivedAt = new Date("2026-11-22T10:00:00.000Z");
const source = "#include <iostream>\nint main() { return 0; }\n";
const sourceSha256 = createHash("sha256").update(source).digest("hex");
const queued = {
  submissionId,
  labId,
  studentUserId: studentId,
  sourceSha256,
  requestSha256: sourceSha256,
  receivedAt,
  judgeStatus: "queued" as const,
  overallVerdict: null,
  tests: [],
};

const makeService = (
  options: {
    policy?: {
      classId: string;
      opensAt: Date;
      deadlineAt: Date;
      status: string;
    };
    classError?: Error;
    existing?: typeof queued | null;
    owned?: typeof queued | null;
    createError?: Error;
  } = {},
) => {
  const policy = options.policy ?? {
    classId,
    opensAt: new Date("2026-11-20T00:00:00.000Z"),
    deadlineAt: new Date("2026-11-25T12:00:00.000Z"),
    status: "open",
  };
  const labProvider = {
    getSubmissionPolicy: mock(async () => ({ labId, ...policy })),
  };
  const classProvider = {
    getClassDetail: mock(async () => {
      if (options.classError) throw options.classError;
      return { classId, className: "Intro" };
    }),
  };
  const repository = {
    findByIdempotencyKey: mock(async () => options.existing ?? null),
    createQueued: mock(async () => {
      if (options.createError) throw options.createError;
      return queued;
    }),
    findOwnedById: mock(async () => options.owned ?? queued),
  };
  return {
    labProvider,
    classProvider,
    repository,
    service: new SubmissionService(
      repository as unknown as SubmissionRepository,
      labProvider as unknown as Pick<LabService, "getSubmissionPolicy">,
      classProvider as unknown as Pick<ClassProvider, "getClassDetail">,
      () => receivedAt,
    ),
  };
};

const submit = (overrides: Record<string, unknown> = {}) =>
  ({
    labId,
    studentUserId: studentId,
    role: "STU" as const,
    source,
    idempotencyKey: "attempt-1",
    ...overrides,
  }) as Parameters<SubmissionService["submit"]>[0];

describe("submission service", () => {
  it("records a valid submission with the server receipt time", async () => {
    const { service, repository, classProvider } = makeService();

    const result = await service.submit(submit());

    expect(classProvider.getClassDetail).toHaveBeenCalledWith({
      classId,
      userId: studentId,
      role: "STU",
    });
    expect(repository.createQueued).toHaveBeenCalledWith(
      expect.objectContaining({
        labId,
        studentUserId: studentId,
        sourceCode: Buffer.from(source),
        receivedAt,
      }),
    );
    expect(result).toMatchObject({
      id: submissionId,
      labId,
      status: "queued",
      overallVerdict: null,
      tests: [],
    });
    expect(result).not.toHaveProperty("source");
  });

  it("does not persist a submission for a student outside the class", async () => {
    const { service, repository } = makeService({
      classError: new AppError(404, "Class not found"),
    });

    await expect(service.submit(submit())).rejects.toMatchObject({
      status: 404,
    });
    expect(repository.createQueued).not.toHaveBeenCalled();
  });

  it("rejects submissions before opening and at the deadline", async () => {
    const beforeOpen = makeService({
      policy: {
        classId,
        opensAt: new Date("2026-11-23T00:00:00.000Z"),
        deadlineAt: new Date("2026-11-25T12:00:00.000Z"),
        status: "scheduled",
      },
    });
    await expect(beforeOpen.service.submit(submit())).rejects.toMatchObject({
      status: 409,
    });

    const atDeadline = makeService({
      policy: {
        classId,
        opensAt: new Date("2026-11-20T00:00:00.000Z"),
        deadlineAt: receivedAt,
        status: "closed",
      },
    });
    await expect(atDeadline.service.submit(submit())).rejects.toMatchObject({
      status: 409,
    });
    expect(beforeOpen.repository.createQueued).not.toHaveBeenCalled();
    expect(atDeadline.repository.createQueued).not.toHaveBeenCalled();
  });

  it("rejects empty and oversized source before persistence", async () => {
    const { service, repository } = makeService();

    await expect(service.submit(submit({ source: "" }))).rejects.toMatchObject({
      status: 400,
    });
    await expect(
      service.submit(submit({ source: "x".repeat(65_537) })),
    ).rejects.toMatchObject({ status: 413 });
    expect(repository.createQueued).not.toHaveBeenCalled();
  });

  it("replays the same idempotency key and source even after the deadline", async () => {
    const { service, repository } = makeService({
      policy: {
        classId,
        opensAt: new Date("2026-11-20T00:00:00.000Z"),
        deadlineAt: new Date("2026-11-21T00:00:00.000Z"),
        status: "closed",
      },
      existing: queued,
    });

    const result = await service.submit(submit());

    expect(result.id).toBe(submissionId);
    expect(repository.createQueued).not.toHaveBeenCalled();
  });

  it("rejects a reused idempotency key when the source differs", async () => {
    const { service, repository } = makeService({ existing: queued });

    await expect(
      service.submit(submit({ source: "different source" })),
    ).rejects.toMatchObject({ status: 409 });
    expect(repository.createQueued).not.toHaveBeenCalled();
  });

  it("returns 404 when a student requests another user's submission", async () => {
    const { service, repository } = makeService({ owned: null });

    await expect(
      service.getOwn({ submissionId, studentUserId: "someone-else" }),
    ).rejects.toMatchObject({ status: 404 });
    expect(repository.findOwnedById).toHaveBeenCalledWith(
      submissionId,
      "someone-else",
    );
  });
});
