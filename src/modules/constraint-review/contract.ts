import type { PoolClient } from "pg";

export type Evidence = { line: number; text: string };
export type ConstraintInput = { id: string; text: string };
export type ConstraintVerdict = {
  constraint: string;
  verdict: "pass" | "violation" | "unsure";
  evidence: Evidence[];
  method: "hard_rule" | "semantic" | "model";
  reason?: string;
};
export type ReviewInput = {
  labId?: string;
  attemptNumber?: number;
  identityValues?: string[];
  submissionId?: string;
  statement: string;
  sourceCode: string;
  constraints: ConstraintInput[];
};
export interface ConstraintReviewer {
  review(input: ReviewInput): Promise<ConstraintVerdict[]>;
}
export interface ReviewWriter {
  save(
    transaction: Pick<PoolClient, "query">,
    input: {
      submissionId: string;
      attemptNumber: number;
      verdicts: ConstraintVerdict[];
      now: Date;
    },
  ): Promise<void>;
}

// The model adapter never receives submission/user IDs, deductions, or private tests.
export interface SemanticModel {
  estimateCostMicros?(input: ModelPrompt): number;
  invoke?(input: ModelRequest): Promise<{ output: unknown; usage: ModelUsage }>;
  review(input: {
    statement: string;
    constraint: ConstraintInput;
    sourceCode: string;
    signal: AbortSignal;
  }): Promise<unknown>;
}

export type ModelPrompt = {
  statement: string;
  constraint: ConstraintInput;
  sourceCode: string;
};
export type ModelRequest = ModelPrompt & { signal: AbortSignal };
export type ModelUsage = {
  provider: "gemini";
  model: string;
  modelVersion: string;
  responseId: string;
  requestId: string | null;
  inputTokens: number;
  outputTokens: number;
  thinkingTokens: number;
  totalTokens: number;
  durationMs: number;
  estimatedCostMicros: number;
  billingTier: "free" | "paid";
  costMicros: number;
};
export type ModelCallRecord = {
  provider: "gemini";
  model: string;
  id: string;
  scope: string;
  submissionId: string | null;
  attemptNumber: number | null;
  constraintId: string;
  reservedMicros: number;
  prompt: ModelPrompt;
  status: "reserved" | "completed" | "uncertain";
  usage: ModelUsage | null;
  output: Pick<ConstraintVerdict, "verdict" | "evidence"> | null;
  reason: string | null;
  createdAt: string;
  completedAt: string | null;
};
export interface ModelLedger {
  reserve(input: {
    scope: string;
    submissionId?: string;
    attemptNumber?: number;
    constraintId: string;
    amountMicros: number;
    limitMicros: number;
    prompt: ModelPrompt;
  }): Promise<string | null>;
  finish(
    id: string,
    result: {
      usage?: ModelUsage;
      output: Pick<ConstraintVerdict, "verdict" | "evidence">;
      reason?: string;
    },
  ): Promise<void>;
}
