import { AppError } from "../../libs/errors/app-error";
import type { LabService } from "../lab/lab.service";

export type Evidence = { line: number; text: string };
export type Decision = {
  verdict: "pass" | "violation";
  reason: string;
  evidence: Evidence[];
  version: number;
};
export type ReviewRow = {
  id: string;
  submissionId: string;
  studentName: string;
  source: string;
  constraintId: string;
  constraintText: string;
  deduction: string;
  proposedVerdict: string;
  proposalReason: string | null;
  evidence: Evidence[];
  decision: null | { verdict: string; reason: string; evidence: Evidence[] };
  version: number;
  required: boolean;
  sampledPass: boolean;
};
export interface ReviewRepository {
  list(labId: string): Promise<ReviewRow[]>;
  decide(
    labId: string,
    itemId: string,
    actorId: string,
    input: Decision,
  ): Promise<void>;
}
export function selectQueue(rows: ReviewRow[]): ReviewRow[] {
  const passes = rows
    .filter((r) => r.proposedVerdict === "pass")
    .sort((a, b) => a.id.localeCompare(b.id));
  const sample = new Set(
    passes.slice(0, Math.ceil(passes.length / 10)).map((r) => r.id),
  );
  return rows.map((row) => ({
    ...row,
    sampledPass: sample.has(row.id),
    required: row.proposedVerdict !== "pass" || sample.has(row.id),
  }));
}
export function validateDecision(input: Decision, source: string) {
  if (
    !["pass", "violation"].includes(input.verdict) ||
    !input.reason.trim() ||
    input.reason.length > 4000
  )
    throw new AppError(422, "Choose a verdict and provide a reason");
  const lines = source.split(/\r?\n/);
  if (
    input.evidence.length > 100 ||
    (input.verdict === "violation" && !input.evidence.length) ||
    (input.verdict === "pass" && input.evidence.length) ||
    input.evidence.some(
      (e) =>
        !Number.isInteger(e.line) ||
        e.line < 1 ||
        !e.text.trim() ||
        lines[e.line - 1] !== e.text,
    )
  )
    throw new AppError(422, "Evidence must match original source lines");
}
export class ReviewService {
  constructor(
    private readonly repository: ReviewRepository,
    private readonly labs: Pick<LabService, "getById">,
  ) {}
  private async authorize(
    labId: string,
    userId: string,
    role: "TA" | "STU" | "ADMIN",
  ) {
    if (role !== "TA")
      throw new AppError(403, "Only a TA may review submissions");
    await this.labs.getById({ labId, userId, role });
  }
  async list(
    actor: { labId: string; userId: string; role: "TA" | "STU" | "ADMIN" },
    page = 1,
    limit = 20,
    view = "queue",
  ) {
    await this.authorize(actor.labId, actor.userId, actor.role);
    const rows = await this.repository.list(actor.labId);
    const filtered = rows.filter(
      (r) => view === "all" || (r.required && !r.decision),
    );
    return {
      items: filtered.slice((page - 1) * limit, page * limit),
      total: filtered.length,
      page,
      limit,
      requiredPending: rows.filter((r) => r.required && !r.decision).length,
    };
  }
  async decide(
    actor: { labId: string; userId: string; role: "TA" | "STU" | "ADMIN" },
    itemId: string,
    input: Decision,
  ) {
    await this.authorize(actor.labId, actor.userId, actor.role);
    await this.repository.decide(actor.labId, itemId, actor.userId, input);
    return { success: true };
  }
}
