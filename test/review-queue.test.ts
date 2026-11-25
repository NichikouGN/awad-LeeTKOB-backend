import { expect, it, mock } from "bun:test";
import {
  ReviewService,
  selectQueue,
  validateDecision,
  type ReviewRow,
} from "../src/modules/constraint-review/queue.service";
import { AppError } from "../src/libs/errors/app-error";
const actor = { labId: "lab", userId: "ta", role: "TA" as const };
const row = (id: string, verdict = "pass"): ReviewRow => ({
  id,
  submissionId: "s",
  studentName: "Student",
  source: "int main(){}",
  constraintId: "C1",
  constraintText: "Rule",
  deduction: "2.00",
  proposedVerdict: verdict,
  proposalReason: null,
  evidence: [],
  decision: null,
  version: 0,
  required: false,
  sampledPass: false,
});
it("samples ceil ten percent across all lab passes and includes every violation/unsure", () => {
  const rows = Array.from({ length: 11 }, (_, i) =>
    row(String(i).padStart(2, "0")),
  );
  const result = selectQueue([
    ...rows,
    row("v", "violation"),
    row("u", "unsure"),
  ]);
  expect(result.filter((r) => r.sampledPass)).toHaveLength(2);
  expect(result.filter((r) => r.required)).toHaveLength(4);
  expect(
    selectQueue([...rows].reverse())
      .filter((r) => r.sampledPass)
      .map((r) => r.id)
      .sort(),
  ).toEqual(
    result
      .filter((r) => r.sampledPass)
      .map((r) => r.id)
      .sort(),
  );
});
it("requires original source evidence and an explicit reason for violations", () => {
  const decision = {
    verdict: "violation" as const,
    reason: "Uses banned call",
    version: 0,
    evidence: [{ line: 2, text: "  std::sort(a,a+2);" }],
  };
  expect(() =>
    validateDecision(decision, "int main(){\r\n  std::sort(a,a+2);\r\n}"),
  ).not.toThrow();
  expect(() => validateDecision({ ...decision, evidence: [] }, "")).toThrow();
  expect(() =>
    validateDecision(
      { ...decision, evidence: [{ line: 2, text: "invented" }] },
      "x\ny",
    ),
  ).toThrow();
  expect(() => validateDecision({ ...decision, reason: " " }, "")).toThrow();
  expect(() =>
    validateDecision({ ...decision, verdict: "pass" }, ""),
  ).toThrow();
});
it("blocks students/admins and other-class TAs before reading any review source", async () => {
  const list = mock(async () => []);
  const repo = { list, decide: mock(async () => {}) };
  const labs = {
    getById: mock(async () => {
      throw new AppError(404, "Lab not found");
    }),
  };
  const service = new ReviewService(repo, labs);
  for (const role of ["STU", "ADMIN"] as const)
    await expect(service.list({ ...actor, role })).rejects.toMatchObject({
      status: 403,
    });
  await expect(service.list(actor)).rejects.toMatchObject({ status: 404 });
  expect(list).not.toHaveBeenCalled();
  expect(repo.decide).not.toHaveBeenCalled();
});
it("shows pending required items in queue but permits all-view overrides", async () => {
  const rows = selectQueue([row("a", "unsure"), row("b"), row("c")]);
  rows[0].decision = { verdict: "pass", reason: "Checked", evidence: [] };
  const repo = { list: async () => rows, decide: mock(async () => {}) };
  const service = new ReviewService(repo, {
    getById: mock(async () => ({}) as never),
  });
  const queue = await service.list(actor);
  expect(queue.items.map((r) => r.id)).toEqual(["b"]);
  expect(queue.requiredPending).toBe(1);
  expect((await service.list(actor, 1, 20, "all")).total).toBe(3);
  await service.decide(actor, "c", {
    verdict: "pass",
    reason: "Reviewed",
    evidence: [],
    version: 0,
  });
  expect(repo.decide).toHaveBeenCalledWith("lab", "c", "ta", expect.anything());
});
