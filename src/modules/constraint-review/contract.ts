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
  review(input: {
    statement: string;
    constraint: ConstraintInput;
    sourceCode: string;
    signal: AbortSignal;
  }): Promise<unknown>;
}
