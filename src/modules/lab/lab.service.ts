import { AppError } from "../../libs/errors/app-error";
import type { ClassProvider } from "../class/interface/class-provider";
import type { ClassDetailReq } from "../class/class.type";
import type { LabRepository } from "./lab.repository";
import type {
  CreateLabInput,
  LabActor,
  LabRecord,
  LabRole,
  LabSubmissionProvider,
} from "./lab.type";

const MAX_STATEMENT_BYTES = 256 * 1024;
const MAX_CONSTRAINT_BYTES = 8 * 1024;
const MAX_TEST_BYTES = 256 * 1024;
const MAX_ALL_TEST_BYTES = 10 * 1024 * 1024;

export type LabStatus = "scheduled" | "open" | "closed";

const scheduleStatus = (
  opensAt: Date,
  deadlineAt: Date,
  now: Date,
): LabStatus =>
  now < opensAt ? "scheduled" : now < deadlineAt ? "open" : "closed";

function formatLab(record: LabRecord, now: Date) {
  return {
    labId: record.labId,
    classId: record.classId,
    title: record.title,
    statement: record.statement,
    status: scheduleStatus(record.opensAt, record.deadlineAt, now),
    opensAt: record.opensAt.toISOString(),
    deadlineAt: record.deadlineAt.toISOString(),
    constraints: record.constraints.map((constraint) => ({
      id: constraint.id,
      text: constraint.text,
      deduction: Number(constraint.deduction),
    })),
    limits: { cpuSeconds: record.cpuSeconds, memoryMb: record.memoryMb },
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

function validateInput(input: CreateLabInput): {
  opensAt: Date;
  deadlineAt: Date;
  title: string;
} {
  const title = input.title.trim();
  const opensAt = new Date(input.opensAt);
  const deadlineAt = new Date(input.deadlineAt);
  if (!title || title.length > 160)
    throw new AppError(422, "Lab title must contain 1 to 160 characters");
  if (
    !input.statement.trim() ||
    Buffer.byteLength(input.statement, "utf8") > MAX_STATEMENT_BYTES
  )
    throw new AppError(
      422,
      "Lab statement must be non-empty and at most 256 KiB",
    );
  if (
    !Number.isFinite(opensAt.getTime()) ||
    !Number.isFinite(deadlineAt.getTime()) ||
    opensAt >= deadlineAt
  )
    throw new AppError(
      422,
      "Lab opening time must be earlier than its deadline",
    );
  if (input.constraints.length < 1 || input.constraints.length > 100)
    throw new AppError(422, "A lab must have between 1 and 100 constraints");
  const constraintIds = new Set<string>();
  for (const constraint of input.constraints) {
    if (constraintIds.has(constraint.id))
      throw new AppError(422, "Constraint IDs must be unique within a lab");
    constraintIds.add(constraint.id);
    if (
      !constraint.text.trim() ||
      Buffer.byteLength(constraint.text, "utf8") > MAX_CONSTRAINT_BYTES
    )
      throw new AppError(
        422,
        "Constraint text must be non-empty and at most 8 KiB",
      );
    if (
      constraint.deduction < 0.01 ||
      constraint.deduction > 10 ||
      Math.abs(
        constraint.deduction * 100 - Math.round(constraint.deduction * 100),
      ) > 1e-8
    ) {
      throw new AppError(
        422,
        "Constraint deduction must be 0.01 to 10.00 with at most two decimals",
      );
    }
  }
  if (input.tests.length < 1 || input.tests.length > 100)
    throw new AppError(422, "A lab must have between 1 and 100 tests");
  let totalTestBytes = 0;
  for (const test of input.tests) {
    const testBytes =
      Buffer.byteLength(test.input, "utf8") +
      Buffer.byteLength(test.expectedOutput, "utf8");
    if (testBytes > MAX_TEST_BYTES)
      throw new AppError(
        422,
        "Each test input and output must total at most 256 KiB",
      );
    totalTestBytes += testBytes;
  }
  if (totalTestBytes > MAX_ALL_TEST_BYTES)
    throw new AppError(422, "The complete test set must total at most 10 MiB");
  if (
    input.limits?.cpuSeconds !== undefined &&
    (input.limits.cpuSeconds < 1 || input.limits.cpuSeconds > 5)
  )
    throw new AppError(422, "CPU limit must be between 1 and 5 seconds");
  if (
    input.limits?.memoryMb !== undefined &&
    (input.limits.memoryMb < 64 || input.limits.memoryMb > 512)
  )
    throw new AppError(422, "Memory limit must be between 64 and 512 MB");
  return { title, opensAt, deadlineAt };
}

export class LabService implements LabSubmissionProvider {
  constructor(
    private readonly repository: LabRepository,
    private readonly classProvider: ClassProvider,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async create(input: CreateLabInput) {
    if (input.role !== "TA")
      throw new AppError(403, "Only a TA may create a lab");
    await this.requireClassAccess(input.classId, input.userId, input.role);
    const validated = validateInput(input);
    const now = this.now();
    const record = await this.repository.create({
      classId: input.classId,
      title: validated.title,
      statement: input.statement,
      opensAt: validated.opensAt,
      deadlineAt: validated.deadlineAt,
      cpuSeconds: input.limits?.cpuSeconds ?? 1,
      memoryMb: input.limits?.memoryMb ?? 256,
      createdByUserId: input.userId,
      constraints: input.constraints.map((constraint) => ({
        ...constraint,
        deduction: constraint.deduction.toFixed(2),
      })),
      tests: input.tests.map((test) => ({
        input: Buffer.from(test.input, "utf8"),
        expectedOutput: Buffer.from(test.expectedOutput, "utf8"),
      })),
      now,
    });
    return formatLab(record, now);
  }

  async listByClass(request: {
    classId: string;
    userId: string;
    role: LabRole;
    page: number;
    limit: number;
  }) {
    await this.requireClassAccess(
      request.classId,
      request.userId,
      request.role,
    );
    const records = await this.repository.listByClass(
      request.classId,
      (request.page - 1) * request.limit,
      request.limit,
    );
    const now = this.now();
    return records.map((record) => ({
      ...record,
      status: scheduleStatus(record.opensAt, record.deadlineAt, now),
      opensAt: record.opensAt.toISOString(),
      deadlineAt: record.deadlineAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
    }));
  }

  async getById(actor: LabActor & { labId: string }) {
    const record = await this.repository.findById(actor.labId);
    if (!record) throw new AppError(404, "Lab not found");
    await this.requireClassAccess(record.classId, actor.userId, actor.role);
    return formatLab(record, this.now());
  }

  async getSubmissionPolicy(labId: string) {
    const record = await this.repository.findSubmissionPolicy(labId);
    if (!record) throw new AppError(404, "Lab not found");
    return {
      labId: record.labId,
      classId: record.classId,
      opensAt: record.opensAt,
      deadlineAt: record.deadlineAt,
      status: scheduleStatus(record.opensAt, record.deadlineAt, this.now()),
    };
  }

  async getJudgeBundle(labId: string) {
    const record = await this.repository.findById(labId);
    if (!record) throw new AppError(404, "Lab not found");
    return {
      labId: record.labId,
      classId: record.classId,
      statement: record.statement,
      limits: { cpuSeconds: record.cpuSeconds, memoryMb: record.memoryMb },
      constraints: record.constraints,
      tests: record.tests.map((test) => ({
        testNumber: test.testNumber,
        input: test.input.toString("utf8"),
        expectedOutput: test.expectedOutput.toString("utf8"),
      })),
    };
  }

  private async requireClassAccess(
    classId: string,
    userId: string,
    role: LabRole,
  ) {
    const request: ClassDetailReq = { classId, userId, role };
    await this.classProvider.getClassDetail(request);
  }
}

export type { LabRole };
