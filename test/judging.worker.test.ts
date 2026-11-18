import { describe, expect, it, mock } from "bun:test";
import { JudgeWorker } from "../src/modules/judging/judging.service";
import type {
  JudgeBundle,
  JudgeClaim,
  JudgeQueueRepository,
  JudgeResult,
} from "../src/modules/judging/judging.type";
import type { SubmissionJudgeSourceProvider } from "../src/modules/submissions/submission.type";
import type { LabJudgeProvider } from "../src/modules/lab/lab.type";
import type { SandboxRunner } from "../src/modules/judging/judging.type";

const submissionId = "64d0d19e-73e8-4d19-bae2-1d6c0f10f397";
const labId = "64d0d19a-73e8-4d19-bae2-1d6c0f10f397";
const claim: JudgeClaim = {
  judgeJobId: "64d0d19c-73e8-4d19-bae2-1d6c0f10f397",
  submissionId,
  leaseOwner: "worker-test",
  attemptCount: 1,
};
const bundle: JudgeBundle = {
  labId,
  classId: "9b7bdf70-9740-48a1-a7bb-0875a9103a73",
  statement: "Add two numbers",
  limits: { cpuSeconds: 1, memoryMb: 256 },
  constraints: [],
  tests: [
    { testNumber: 1, input: "2 3\n", expectedOutput: "5\n" },
    { testNumber: 2, input: "1 1\n", expectedOutput: "2\n" },
  ],
};
const result: JudgeResult = {
  overallVerdict: "AC",
  tests: [
    { testNumber: 1, verdict: "AC", executionMs: 4, memoryKb: null },
    { testNumber: 2, verdict: "AC", executionMs: 3, memoryKb: null },
  ],
};

const makeWorker = (
  options: {
    nextClaim?: JudgeClaim | null;
    source?: { labId: string; sourceCode: Buffer } | null;
    judgeResult?: JudgeResult;
    runError?: Error;
  } = {},
) => {
  const repository = {
    claimNext: mock(async () =>
      options.nextClaim === undefined ? claim : options.nextClaim,
    ),
    renewLease: mock(async () => true),
    completeClaim: mock(async () => true),
    failClaim: mock(async () => undefined),
  };
  const sourceProvider = {
    getJudgeSource: mock(async () =>
      options.source === undefined
        ? { labId, sourceCode: Buffer.from("int main() {}") }
        : options.source,
    ),
  };
  const labProvider = {
    getJudgeBundle: mock(async () => bundle),
  };
  const runner = {
    judge: mock(async () => {
      if (options.runError) throw options.runError;
      return options.judgeResult ?? result;
    }),
  };
  const worker = new JudgeWorker(
    repository as unknown as JudgeQueueRepository,
    sourceProvider as unknown as SubmissionJudgeSourceProvider,
    labProvider as unknown as LabJudgeProvider,
    runner as unknown as SandboxRunner,
    { workerId: "worker-test", leaseMs: 30_000, heartbeatMs: 30_000 },
  );
  return { worker, repository, sourceProvider, labProvider, runner };
};

describe("judge worker orchestration", () => {
  it("returns idle when no durable judge work is available", async () => {
    const { worker, sourceProvider, runner } = makeWorker({ nextClaim: null });

    expect(await worker.runOne()).toBe(false);
    expect(sourceProvider.getJudgeSource).not.toHaveBeenCalled();
    expect(runner.judge).not.toHaveBeenCalled();
  });

  it("loads source and private tests, then persists one normalized result set", async () => {
    const { worker, repository, sourceProvider, labProvider, runner } =
      makeWorker();

    expect(await worker.runOne()).toBe(true);
    expect(sourceProvider.getJudgeSource).toHaveBeenCalledWith(submissionId);
    expect(labProvider.getJudgeBundle).toHaveBeenCalledWith(labId);
    expect(runner.judge).toHaveBeenCalledWith({
      sourceCode: Buffer.from("int main() {}"),
      bundle,
    });
    expect(repository.completeClaim).toHaveBeenCalledWith(
      claim,
      result,
      expect.any(Date),
    );
    expect(repository.failClaim).not.toHaveBeenCalled();
  });

  it("does not accept results for another lab's work", async () => {
    const { worker, runner, repository } = makeWorker({
      source: { labId: "other-lab", sourceCode: Buffer.from("int main() {}") },
    });

    expect(await worker.runOne()).toBe(true);
    expect(runner.judge).not.toHaveBeenCalled();
    expect(repository.failClaim).toHaveBeenCalledWith(
      claim,
      "judge-input-invalid",
      expect.any(Date),
      3,
    );
  });

  it("rejects malformed runner results instead of persisting them", async () => {
    const { worker, repository } = makeWorker({
      judgeResult: { overallVerdict: "AC", tests: [] },
    });

    expect(await worker.runOne()).toBe(true);
    expect(repository.completeClaim).not.toHaveBeenCalled();
    expect(repository.failClaim).toHaveBeenCalledWith(
      claim,
      "judge-result-invalid",
      expect.any(Date),
      3,
    );
  });

  it("schedules runner failures for a bounded retry", async () => {
    const { worker, repository } = makeWorker({
      runError: new Error("private Docker diagnostic"),
    });

    expect(await worker.runOne()).toBe(true);
    expect(repository.failClaim).toHaveBeenCalledWith(
      claim,
      "sandbox-unavailable",
      expect.any(Date),
      3,
    );
    expect(repository.completeClaim).not.toHaveBeenCalled();
  });
});
