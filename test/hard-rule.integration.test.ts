import { describe, expect, it } from "bun:test";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";

const integration =
  process.env.HARD_RULE_INTEGRATION === "1" ? describe : describe.skip;
integration("Accepted submission review persistence", () => {
  it("stores real sandbox reviews once, hides them from students, and rolls back failed writes", async () => {
    const { db, pool } = await import("../src/db/db");
    const { DrizzleLabRepository } =
      await import("../src/modules/lab/lab.repository");
    const { LabService } = await import("../src/modules/lab/lab.service");
    const { ClassService } = await import("../src/modules/class/class.service");
    const { ClassRepository } =
      await import("../src/modules/class/class.repository");
    const { UserService } = await import("../src/modules/user/user.service");
    const { UserRepository } =
      await import("../src/modules/user/user.repository");
    const { DrizzleSubmissionRepository } =
      await import("../src/modules/submissions/submission.repository");
    const { PostgresJudgeQueueRepository } =
      await import("../src/modules/judging/judging.repository");
    const { PostgresReviewWriter } =
      await import("../src/modules/constraint-review/review-writer");
    const { ConstraintReviewService } =
      await import("../src/modules/constraint-review/service");
    const { JudgeWorker } =
      await import("../src/modules/judging/judging.service");
    const { DockerSandbox } =
      await import("../src/modules/judging/docker-sandbox");
    const fixture = (
      await pool.query<{ class_id: string; ta_id: string; student_id: string }>(
        `SELECT c.class_id,t.user_id AS ta_id,s.user_id AS student_id
       FROM classes c CROSS JOIN users t CROSS JOIN users s
       WHERE c.name='Demo Programming Class' AND t.email='seed:ta' AND s.email='seed:student' LIMIT 1`,
      )
    ).rows[0];
    if (!fixture) throw new Error("Run migrations and db:seed first");
    const now = new Date();
    const labs = new DrizzleLabRepository(db);
    const lab = await labs.create({
      classId: fixture.class_id,
      createdByUserId: fixture.ta_id,
      title: `review-integration-${randomUUID()}`,
      statement: "Sort two integers.",
      opensAt: new Date(now.getTime() - 1000),
      deadlineAt: new Date(now.getTime() + 3600_000),
      cpuSeconds: 1,
      memoryMb: 256,
      now,
      constraints: [
        { id: "C1", text: "Do not call `std::sort`.", deduction: "2.00" },
        { id: "C2", text: "Use merge sort.", deduction: "3.00" },
      ],
      tests: [
        { input: Buffer.from("9 2"), expectedOutput: Buffer.from("2 9") },
      ],
    });
    try {
      const sourceCode = await readFile(
        new URL(
          "./fixtures/hard-rule-dev/own-ban-list/solutions/direct.cpp",
          import.meta.url,
        ),
      );
      const submissions = new DrizzleSubmissionRepository(db);
      const createQueued = () =>
        submissions.createQueued({
          labId: lab.labId,
          studentUserId: fixture.student_id,
          sourceCode,
          sourceBytes: sourceCode.length,
          sourceSha256: new Bun.CryptoHasher("sha256")
            .update(sourceCode)
            .digest("hex"),
          requestSha256: "a".repeat(64),
          idempotencyKey: randomUUID(),
          receivedAt: now,
        });
      const getJobId = async (id: string) =>
        (
          await pool.query<{ judge_job_id: string }>(
            "SELECT judge_job_id FROM judge_jobs WHERE submission_id=$1",
            [id],
          )
        ).rows[0].judge_job_id;
      const submission = await createQueued();
      const reviewer = new ConstraintReviewService({ modelOff: true });
      const writer = new PostgresReviewWriter();
      const worker = new JudgeWorker(
        new PostgresJudgeQueueRepository(pool, writer),
        submissions,
        new LabService(
          labs,
          new ClassService(
            new ClassRepository(db),
            new UserService(new UserRepository(db)),
          ),
        ),
        new DockerSandbox({
          image: process.env.JUDGE_SANDBOX_IMAGE ?? "leetkob-cpp-sandbox:local",
          compileTimeoutMs: 10_000,
          outputLimitBytes: 1_048_576,
        }),
        {
          workerId: "review-integration",
          leaseMs: 30_000,
          heartbeatMs: 5_000,
          reviewer,
        },
      );
      const jobId = await getJobId(submission.submissionId);
      expect(await worker.runOne(jobId)).toBe(true);
      expect(await worker.runOne(jobId)).toBe(false);
      const stored = await pool.query(
        "SELECT constraint_id,proposed_verdict,evidence,queue_status FROM review_items WHERE submission_id=$1 ORDER BY constraint_id",
        [submission.submissionId],
      );
      expect(stored.rows).toEqual([
        {
          constraint_id: "C1",
          proposed_verdict: "violation",
          evidence: [{ line: 5, text: "  std::sort(a, a + 2);" }],
          queue_status: "pending",
        },
        {
          constraint_id: "C2",
          proposed_verdict: "unsure",
          evidence: [],
          queue_status: "pending",
        },
      ]);
      expect(
        (
          await pool.query("SELECT 1 FROM review_runs WHERE submission_id=$1", [
            submission.submissionId,
          ])
        ).rowCount,
      ).toBe(1);
      const snapshot = await submissions.findOwnedById(
        submission.submissionId,
        fixture.student_id,
      );
      expect(snapshot).toMatchObject({
        judgeStatus: "finished",
        overallVerdict: "AC",
      });
      expect(snapshot).not.toHaveProperty("reviews");
      expect(snapshot).not.toHaveProperty("evidence");
      expect(
        (await pool.query("SELECT 1 FROM grades WHERE lab_id=$1", [lab.labId]))
          .rowCount,
      ).toBe(0);

      const rollbackSubmission = await createQueued();
      const repository = new PostgresJudgeQueueRepository(pool, {
        save: async (transaction, input) => {
          await writer.save(transaction, input);
          throw new Error("simulated review-write failure");
        },
      });
      const claim = await repository.claimNext(
        "rollback-integration",
        now,
        30_000,
        await getJobId(rollbackSubmission.submissionId),
      );
      if (!claim) throw new Error("Could not claim rollback test job");
      const bundle = await labs.findById(lab.labId);
      if (!bundle) throw new Error("Missing test lab");
      const review = await reviewer.review({
        statement: lab.statement,
        sourceCode: sourceCode.toString("utf8"),
        constraints: bundle.constraints,
      });
      await expect(
        repository.completeClaim(
          claim,
          {
            overallVerdict: "AC",
            tests: [
              { testNumber: 1, verdict: "AC", executionMs: 1, memoryKb: null },
            ],
          },
          now,
          review,
        ),
      ).rejects.toThrow("simulated review-write failure");
      for (const table of ["test_results", "review_runs", "review_items"])
        expect(
          (
            await pool.query(`SELECT 1 FROM ${table} WHERE submission_id=$1`, [
              rollbackSubmission.submissionId,
            ])
          ).rowCount,
        ).toBe(0);
      expect(
        (
          await pool.query(
            "SELECT judge_status,overall_verdict FROM submissions WHERE submission_id=$1",
            [rollbackSubmission.submissionId],
          )
        ).rows[0],
      ).toEqual({ judge_status: "running", overall_verdict: null });
    } finally {
      for (const table of [
        "review_items",
        "review_runs",
        "test_results",
        "judge_jobs",
        "outbox_events",
      ]) {
        const column =
          table === "outbox_events" ? "aggregate_id" : "submission_id";
        await pool.query(
          `DELETE FROM ${table} WHERE ${column} IN (SELECT submission_id FROM submissions WHERE lab_id=$1)`,
          [lab.labId],
        );
      }
      await pool.query("DELETE FROM submissions WHERE lab_id=$1", [lab.labId]);
      await pool.query("DELETE FROM test_cases WHERE lab_id=$1", [lab.labId]);
      await pool.query(
        "UPDATE lab_constraints SET current_revision_id=NULL WHERE lab_id=$1",
        [lab.labId],
      );
      await pool.query("DELETE FROM constraint_revisions WHERE lab_id=$1", [
        lab.labId,
      ]);
      await pool.query("DELETE FROM lab_constraints WHERE lab_id=$1", [
        lab.labId,
      ]);
      await pool.query("DELETE FROM labs WHERE lab_id=$1", [lab.labId]);
    }
  }, 60_000);
});
