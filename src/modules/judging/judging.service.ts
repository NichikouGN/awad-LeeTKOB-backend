import type { LabJudgeProvider } from "../lab/lab.type";
import type { SubmissionJudgeSourceProvider } from "../submissions/submission.type";
import type {
  JudgeQueueRepository,
  JudgeResult,
  JudgeWorkerOptions,
  SandboxRunner,
} from "./judging.type";

const validVerdicts = new Set(["AC", "WA", "TLE", "MLE", "RE", "CE"]);
const validResult = (result: JudgeResult, expectedCount: number): boolean =>
  !!result &&
  validVerdicts.has(result.overallVerdict) &&
  Array.isArray(result.tests) &&
  result.tests.length === expectedCount &&
  result.tests.every(
    (test, index) =>
      test.testNumber === index + 1 &&
      validVerdicts.has(test.verdict) &&
      Number.isFinite(test.executionMs) &&
      test.executionMs >= 0 &&
      (test.memoryKb === null ||
        (Number.isFinite(test.memoryKb) && test.memoryKb >= 0)),
  );

export class JudgeWorker {
  private readonly now: () => Date;

  constructor(
    private readonly repository: JudgeQueueRepository,
    private readonly sourceProvider: SubmissionJudgeSourceProvider,
    private readonly labProvider: LabJudgeProvider,
    private readonly runner: SandboxRunner,
    private readonly options: JudgeWorkerOptions,
  ) {
    this.now = options.clock ?? (() => new Date());
    if (
      !options.workerId ||
      options.leaseMs <= 0 ||
      options.heartbeatMs <= 0 ||
      options.heartbeatMs > options.leaseMs
    ) {
      throw new Error("Invalid judge worker lease configuration");
    }
  }

  async runOne(judgeJobId?: string): Promise<boolean> {
    const claim = judgeJobId
      ? await this.repository.claimNext(
          this.options.workerId,
          this.now(),
          this.options.leaseMs,
          judgeJobId,
        )
      : await this.repository.claimNext(
          this.options.workerId,
          this.now(),
          this.options.leaseMs,
        );
    if (!claim) return false;

    let heartbeat: ReturnType<typeof setInterval> | undefined;
    let leaseLost = false;
    heartbeat = setInterval(() => {
      void this.repository
        .renewLease(claim, this.now(), this.options.leaseMs)
        .then((renewed) => {
          if (!renewed) leaseLost = true;
        })
        .catch(() => {
          leaseLost = true;
        });
    }, this.options.heartbeatMs);

    try {
      const source = await this.sourceProvider.getJudgeSource(
        claim.submissionId,
      );
      if (!source) throw new JudgeInputError();
      const bundle = await this.labProvider.getJudgeBundle(source.labId);
      if (!bundle || bundle.labId !== source.labId) throw new JudgeInputError();
      const result = await this.runner.judge({
        sourceCode: source.sourceCode,
        bundle,
      });
      if (!validResult(result, bundle.tests.length)) {
        await this.repository.failClaim(
          claim,
          "judge-result-invalid",
          this.now(),
          this.options.maxAttempts ?? 3,
        );
        return true;
      }
      if (!leaseLost)
        await this.repository.completeClaim(claim, result, this.now());
    } catch (error) {
      const category =
        error instanceof JudgeInputError
          ? "judge-input-invalid"
          : "sandbox-unavailable";
      await this.repository.failClaim(
        claim,
        category,
        this.now(),
        this.options.maxAttempts ?? 3,
      );
    } finally {
      if (heartbeat) clearInterval(heartbeat);
    }
    return true;
  }
}

class JudgeInputError extends Error {}
