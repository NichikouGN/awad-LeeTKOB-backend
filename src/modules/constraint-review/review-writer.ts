import { randomUUID } from "node:crypto";
import type { ReviewWriter } from "./contract";

// The judge owns the transaction. Review data is committed with the judge result,
// after the lease is fenced, so redelivery cannot create another stored result set.
export class PostgresReviewWriter implements ReviewWriter {
  async save(
    transaction: Parameters<ReviewWriter["save"]>[0],
    input: Parameters<ReviewWriter["save"]>[1],
  ): Promise<void> {
    const revisions = await transaction.query<{
      lab_id: string;
      constraint_id: string;
      constraint_revision_id: string;
    }>(
      `SELECT c.lab_id, c.constraint_id, c.current_revision_id AS constraint_revision_id
       FROM submissions s JOIN lab_constraints c ON c.lab_id = s.lab_id
       WHERE s.submission_id = $1 AND c.is_active = true`,
      [input.submissionId],
    );
    const byId = new Map(revisions.rows.map((row) => [row.constraint_id, row]));
    if (
      byId.size !== input.verdicts.length ||
      new Set(input.verdicts.map((v) => v.constraint)).size !==
        input.verdicts.length ||
      input.verdicts.some(
        (v) => !byId.get(v.constraint)?.constraint_revision_id,
      )
    )
      throw new Error("Review constraints do not match the lab revision");
    const runId = randomUUID();
    const hasModel = input.verdicts.some((v) => v.method === "model");
    const hasHard = input.verdicts.some((v) => v.method === "hard_rule");
    await transaction.query(
      `INSERT INTO review_runs
       (review_run_id, submission_id, attempt_number, status, method_summary, started_at, completed_at, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $6, $6)`,
      [
        runId,
        input.submissionId,
        input.attemptNumber,
        input.verdicts.some((v) => v.verdict === "unsure")
          ? "partial"
          : "completed",
        hasModel ? (hasHard ? "mixed" : "model") : "hard_rule",
        input.now,
      ],
    );
    // These are provisional proposals. The TA queue must select counted
    // submissions and sample passes across the whole lab (FAQ-02/FAQ-10).
    // Until that workflow exists, do not auto-resolve any proposal.
    for (const verdict of input.verdicts) {
      const revision = byId.get(verdict.constraint);
      if (!revision) throw new Error("Missing constraint revision");
      await transaction.query(
        `INSERT INTO review_items
         (review_item_id, review_run_id, submission_id, lab_id, constraint_id, constraint_revision_id,
          proposed_verdict, proposal_reason, evidence, queue_status, sampled_pass, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,$11,$12)`,
        [
          randomUUID(),
          runId,
          input.submissionId,
          revision.lab_id,
          verdict.constraint,
          revision.constraint_revision_id,
          verdict.verdict,
          verdict.reason ?? null,
          JSON.stringify(verdict.evidence),
          "pending",
          false,
          input.now,
        ],
      );
    }
  }
}
