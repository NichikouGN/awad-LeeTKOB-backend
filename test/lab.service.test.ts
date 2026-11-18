import { describe, expect, it, mock } from "bun:test";
import { AppError } from "../src/libs/errors/app-error";
import { LabService } from "../src/modules/lab/service";
import type { LabRepository } from "../src/modules/lab/repository";
import type { ClassProvider } from "../src/modules/class/interface/class-provider";

const classId = "64d0d19a-73e8-4d19-bae2-1d6c0f10f397";
const labId = "64d0d19e-73e8-4d19-bae2-1d6c0f10f397";
const actor = {
  userId: "9b7bdf70-9740-48a1-a7bb-0875a9103a73",
  role: "TA" as const,
};
const request = {
  ...actor,
  classId,
  title: " Sorting lab ",
  statement: "Implement merge sort.",
  opensAt: "2026-11-20T00:00:00.000Z",
  deadlineAt: "2026-11-25T12:00:00.000Z",
  constraints: [{ id: "C1", text: "Use merge sort.", deduction: 3 }],
  limits: { cpuSeconds: 1, memoryMb: 256 },
  tests: [{ input: "3\n3 1 2\n", expectedOutput: "1 2 3\n" }],
};

const savedLab = {
  labId,
  classId,
  title: "Sorting lab",
  statement: "Implement merge sort.",
  opensAt: new Date("2026-11-20T00:00:00.000Z"),
  deadlineAt: new Date("2026-11-25T12:00:00.000Z"),
  cpuSeconds: 1,
  memoryMb: 256,
  constraints: [{ id: "C1", text: "Use merge sort.", deduction: "3.00" }],
  tests: [
    {
      testNumber: 1,
      input: Buffer.from("3\n3 1 2\n"),
      expectedOutput: Buffer.from("1 2 3\n"),
    },
  ],
  createdAt: new Date("2026-11-18T10:00:00.000Z"),
  updatedAt: new Date("2026-11-18T10:00:00.000Z"),
};

const makeService = (
  options: { classError?: Error; lab?: typeof savedLab | null } = {},
) => {
  const classProvider = {
    getClassDetail: mock(async () => {
      if (options.classError) throw options.classError;
      return { classId, className: "Intro" };
    }),
  };
  const repository = {
    create: mock(async () => savedLab),
    findById: mock(async () =>
      options.lab === undefined ? savedLab : options.lab,
    ),
    listByClass: mock(async () => [savedLab]),
  };
  return {
    classProvider,
    repository,
    service: new LabService(
      repository as unknown as LabRepository,
      classProvider as unknown as ClassProvider,
      () => new Date("2026-11-18T10:00:00.000Z"),
    ),
  };
};

describe("lab authoring service", () => {
  it("normalizes the title and creates all lab inputs for the assigned TA", async () => {
    const { service, repository, classProvider } = makeService();

    const created = await service.create(request);

    expect(classProvider.getClassDetail).toHaveBeenCalledWith({
      classId,
      userId: actor.userId,
      role: "TA",
    });
    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Sorting lab",
        createdByUserId: actor.userId,
      }),
    );
    expect(created.title).toBe("Sorting lab");
    expect(created.constraints).toEqual([
      { id: "C1", text: "Use merge sort.", deduction: 3 },
    ]);
  });

  it("rejects invalid time ordering and duplicate constraint IDs before persistence", async () => {
    const { service, repository } = makeService();

    await expect(
      service.create({ ...request, opensAt: request.deadlineAt }),
    ).rejects.toMatchObject({ status: 422 });
    await expect(
      service.create({
        ...request,
        constraints: [request.constraints[0], request.constraints[0]],
      }),
    ).rejects.toMatchObject({ status: 422 });
    expect(repository.create).not.toHaveBeenCalled();
  });

  it("requires assigned class visibility before creating a lab", async () => {
    const { service, repository } = makeService({
      classError: new AppError(404, "Class not found"),
    });

    await expect(service.create(request)).rejects.toMatchObject({
      status: 404,
    });
    expect(repository.create).not.toHaveBeenCalled();
  });

  it("returns lab details without exposing private tests", async () => {
    const { service } = makeService();

    const lab = await service.getById({ ...actor, labId });

    expect(lab).toMatchObject({ labId, title: "Sorting lab" });
    expect(lab).not.toHaveProperty("tests");
  });

  it("provides private tests only through the worker judge bundle capability", async () => {
    const { service } = makeService();

    const bundle = await service.getJudgeBundle(labId);

    expect(bundle.tests[0]).toMatchObject({
      input: "3\n3 1 2\n",
      expectedOutput: "1 2 3\n",
    });
  });
});
