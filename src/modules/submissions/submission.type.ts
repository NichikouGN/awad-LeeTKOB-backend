export type SubmissionStatus = "queued" | "running" | "finished" | "failed";
export type JudgeVerdict = "AC" | "WA" | "TLE" | "MLE" | "RE" | "CE";

export interface SubmissionSnapshotRecord {
  submissionId: string;
  labId: string;
  studentUserId: string;
  requestSha256: string;
  sourceSha256: string;
  receivedAt: Date;
  judgeStatus: SubmissionStatus;
  overallVerdict: JudgeVerdict | null;
  tests: Array<{
    testNumber: number;
    verdict: JudgeVerdict;
    executionMs: number | null;
  }>;
}

export interface QueueSubmissionRecord {
  labId: string;
  studentUserId: string;
  idempotencyKey: string;
  requestSha256: string;
  sourceSha256: string;
  sourceCode: Buffer;
  sourceBytes: number;
  receivedAt: Date;
}

export interface SubmissionJudgeSourceProvider {
  getJudgeSource(submissionId: string): Promise<{
    labId: string;
    sourceCode: Buffer;
  } | null>;
}
