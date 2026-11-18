import type { LabJudgeProvider } from "../lab/lab.type";
import type { SubmissionJudgeSourceProvider } from "../submissions/submission.type";

export type JudgeVerdict = "AC" | "WA" | "TLE" | "MLE" | "RE" | "CE";
export type JudgeBundle = NonNullable<
  Awaited<ReturnType<LabJudgeProvider["getJudgeBundle"]>>
>;
export type JudgeClaim = {
  judgeJobId: string;
  submissionId: string;
  leaseOwner: string;
  attemptCount: number;
};
export type TestJudgeResult = {
  testNumber: number;
  verdict: JudgeVerdict;
  executionMs: number;
  memoryKb: number | null;
};
export type JudgeResult = {
  overallVerdict: JudgeVerdict;
  tests: TestJudgeResult[];
};
export interface JudgeQueueRepository {
  claimNext(
    workerId: string,
    now: Date,
    leaseMs: number,
    judgeJobId?: string,
  ): Promise<JudgeClaim | null>;
  renewLease(claim: JudgeClaim, now: Date, leaseMs: number): Promise<boolean>;
  completeClaim(
    claim: JudgeClaim,
    result: JudgeResult,
    now: Date,
  ): Promise<boolean>;
  failClaim(
    claim: JudgeClaim,
    category: string,
    now: Date,
    maxAttempts: number,
  ): Promise<void>;
}
export type SandboxRunner = {
  judge(input: {
    sourceCode: Buffer;
    bundle: JudgeBundle;
  }): Promise<JudgeResult>;
};
export type JudgeWorkerOptions = {
  workerId: string;
  leaseMs: number;
  heartbeatMs: number;
  maxAttempts?: number;
  clock?: () => Date;
};
export type JudgeSource = Awaited<
  ReturnType<SubmissionJudgeSourceProvider["getJudgeSource"]>
>;
