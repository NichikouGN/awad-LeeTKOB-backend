import { and, desc, eq, lt } from "drizzle-orm";
import type { Database } from "../../db/db";
import {
  labs,
  labConstraints,
  constraintRevisions,
} from "../../db/schema/labs.schema";
import {
  submissions,
  reviewRuns,
  reviewItems,
  reviewDecisions,
} from "../../db/schema/submissions.schema";
import { labPublications } from "../../db/schema/grades.schema";
import { users } from "../../db/schema/users.schema";
import { AppError } from "../../libs/errors/app-error";
import {
  selectQueue,
  validateDecision,
  type ReviewRepository,
  type ReviewRow,
  type Decision,
  type Evidence,
} from "./queue.service";

type Reader = Pick<Database, "select">;
async function load(db: Reader, labId: string): Promise<ReviewRow[]> {
  const candidates = await db
    .select({
      id: submissions.submissionId,
      student: submissions.studentUserId,
    })
    .from(submissions)
    .innerJoin(labs, eq(labs.labId, submissions.labId))
    .where(
      and(
        eq(submissions.labId, labId),
        lt(submissions.receivedAt, labs.deadlineAt),
      ),
    )
    .orderBy(desc(submissions.receivedAt), desc(submissions.submissionId));
  const latest = new Set<string>();
  const students = new Set<string>();
  for (const c of candidates)
    if (!students.has(c.student)) {
      students.add(c.student);
      latest.add(c.id);
    }
  const rows = await db
    .select({
      item: reviewItems,
      source: submissions.sourceCode,
      studentName: users.displayName,
      text: constraintRevisions.text,
      deduction: constraintRevisions.deduction,
      currentRevision: labConstraints.currentRevisionId,
      active: labConstraints.isActive,
      runCreated: reviewRuns.createdAt,
      decision: reviewDecisions,
    })
    .from(reviewItems)
    .innerJoin(
      submissions,
      eq(submissions.submissionId, reviewItems.submissionId),
    )
    .innerJoin(users, eq(users.userId, submissions.studentUserId))
    .innerJoin(reviewRuns, eq(reviewRuns.reviewRunId, reviewItems.reviewRunId))
    .innerJoin(
      constraintRevisions,
      eq(
        constraintRevisions.constraintRevisionId,
        reviewItems.constraintRevisionId,
      ),
    )
    .innerJoin(
      labConstraints,
      and(
        eq(labConstraints.labId, reviewItems.labId),
        eq(labConstraints.constraintId, reviewItems.constraintId),
      ),
    )
    .leftJoin(
      reviewDecisions,
      and(
        eq(reviewDecisions.reviewItemId, reviewItems.reviewItemId),
        eq(reviewDecisions.isCurrent, true),
      ),
    )
    .where(eq(reviewItems.labId, labId))
    .orderBy(
      desc(reviewRuns.attemptNumber),
      desc(reviewRuns.createdAt),
      desc(reviewItems.reviewItemId),
    );
  const seen = new Set<string>();
  return selectQueue(
    rows
      .filter((r) => {
        const key = `${r.item.submissionId}:${r.item.constraintId}`;
        if (
          !latest.has(r.item.submissionId) ||
          !r.active ||
          r.currentRevision !== r.item.constraintRevisionId ||
          seen.has(key)
        )
          return false;
        seen.add(key);
        return true;
      })
      .map((r) => ({
        id: r.item.reviewItemId,
        submissionId: r.item.submissionId,
        studentName: r.studentName,
        source: r.source.toString("utf8"),
        constraintId: r.item.constraintId,
        constraintText: r.text,
        deduction: r.deduction,
        proposedVerdict: r.item.proposedVerdict,
        proposalReason: r.item.proposalReason,
        evidence: r.item.evidence as Evidence[],
        decision: r.decision
          ? {
              verdict: r.decision.verdict,
              reason: r.decision.reason,
              evidence: r.decision.evidence as Evidence[],
            }
          : null,
        version: r.decision?.sequenceNumber ?? 0,
        required: false,
        sampledPass: false,
      })),
  );
}
export class DrizzleReviewRepository implements ReviewRepository {
  constructor(private readonly db: Database) {}
  list(labId: string) {
    return load(this.db, labId);
  }
  async decide(
    labId: string,
    itemId: string,
    actorId: string,
    input: Decision,
  ) {
    await this.db.transaction(async (tx) => {
      await tx.select().from(labs).where(eq(labs.labId, labId)).for("update");
      const [published] = await tx
        .select()
        .from(labPublications)
        .where(eq(labPublications.labId, labId));
      if (published) throw new AppError(409, "Lab is already published");
      const row = (await load(tx, labId)).find((r) => r.id === itemId);
      if (!row) {
        const [existing] = await tx
          .select({ id: reviewItems.reviewItemId })
          .from(reviewItems)
          .where(
            and(
              eq(reviewItems.labId, labId),
              eq(reviewItems.reviewItemId, itemId),
            ),
          );
        throw new AppError(
          existing ? 409 : 404,
          existing ? "Review is no longer current" : "Review not found",
        );
      }
      if (row.version !== input.version)
        throw new AppError(409, "Review changed; refresh before deciding");
      validateDecision(input, row.source);
      await tx
        .update(reviewDecisions)
        .set({ isCurrent: false })
        .where(
          and(
            eq(reviewDecisions.reviewItemId, itemId),
            eq(reviewDecisions.isCurrent, true),
          ),
        );
      await tx.insert(reviewDecisions).values({
        reviewItemId: itemId,
        sequenceNumber: row.version + 1,
        verdict: input.verdict,
        reason: input.reason.trim(),
        evidence: input.evidence,
        decidedByUserId: actorId,
        decidedAt: new Date(),
        isCurrent: true,
      });
      await tx
        .update(reviewItems)
        .set({ queueStatus: "resolved" })
        .where(eq(reviewItems.reviewItemId, itemId));
    });
  }
}
