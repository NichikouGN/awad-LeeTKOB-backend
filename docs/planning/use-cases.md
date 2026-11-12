# LeeTKOB Use Cases

## 1. Purpose and conventions

This document describes actor goals and observable outcomes. Requirements use the stable IDs in [`project-proposal.md`](project-proposal.md) and the acceptance criteria in [`requirement_specification.md`](../requirements/requirement_specification.md); proposed route shapes are in [`api-contracts.md`](api-contracts.md). Actors must be authenticated where stated. The system derives identity and role from validated credentials, never merely from header presence. Internal module calls are direct function calls through narrow service interfaces, as defined in [`module_boundaries.md`](../architecture/module_boundaries.md).

## 2. Student use cases

### UC-S1 Join a class

**Primary actor:** Student. **Supporting actors:** Admin/TA. **Preconditions:** Student account exists; for self-join, invite code is valid. **Trigger:** Student enters invite code or staff enrolls student. **Related requirements:** FR-1–FR-5.

**Main flow**

1. Student sends the invite code to the join endpoint.
2. System validates identity, student role, code validity and class state.
3. System adds membership and returns class identity and join time.
4. Student can list labs in that class.

**Alternates:** Invalid/expired code returns a safe not-found response without leaking class data. A repeated join is idempotent. Staff enrollment follows UC-A2. A non-student cannot self-join.

**Postconditions:** Membership exists once; an audit event identifies the actor/source of membership.

### UC-S2 Read a lab

**Primary actor:** Student. **Precondition:** Enrolled in the class. **Related:** FR-7, FR-9.

1. Student lists class labs and opens one.
2. System verifies class membership and returns statement, schedule, constraints and deductions.
3. System explains the hard-rule/model review, de-identification, and TA publication gate.
4. System does not return hidden tests or other students' data.

**Alternate:** A lab in another class is not disclosed; return the same not-found behavior as unknown lab where appropriate.

### UC-S3 Submit and receive a judge result

**Primary actor:** Student. **Supporting actor:** Judge worker/sandbox. **Preconditions:** Student is enrolled, lab is open, current server time is before deadline. **Related:** FR-10–FR-15.

1. Student sends source code to the submission endpoint.
2. System validates role/membership, source presence, 64 KB limit, and lab window.
3. System records server receipt time and creates a durable queued submission.
4. System immediately returns submission ID, `queued` status, and receipt timestamp.
5. Worker compiles using the configured C++17 command, then runs every test inside the restricted sandbox.
6. System persists compile/run status, overall verdict, per-test verdicts and safe execution metadata.
7. Student opens an SSE stream and receives queued/running updates and then the finished judge result. On reconnect, the stream begins with the current snapshot.
8. Student sees no test input, expected output, hidden grader data, constraint verdicts or TA notes.

**Alternates:** Before opening or at/after deadline, reject with `submission-closed`. Source over 64 KB is rejected and does not count as a submission. If queue is unavailable, do not return success for work that was not durably recorded. Compile/runtime failure becomes an appropriate verdict, not a lost submission.

**Postconditions:** Submission receipt time is fixed; every valid resubmission is separately judged; newest received before deadline is counted even when its verdict is worse.

### UC-S4 View published grade

**Primary actor:** Student. **Preconditions:** Enrolled in lab class. **Related:** FR-25–FR-27.

1. Student requests results.
2. If lab is not published, system returns the documented not-published response without score or review details.
3. If published, system returns only the caller's score and confirmed deduction records.
4. Each deduction includes constraint text/ID, amount, reason and evidence lines.

**Excluded data:** Other students' identities/results; rejected proposals; unsure verdicts; whether a pass was sampled; hidden tests.

### UC-S5 Appeal a deduction

**Primary actor:** Student. **Supporting actor:** Assigned TA. **Preconditions:** Lab published; appeal is for the student's own confirmed deduction; within 7 days of publication; deduction has not already been appealed. **Related:** FR-28.

1. Student submits one appeal for one deduction with a non-empty explanation.
2. System validates ownership, deadline and one-appeal rule, records a pending appeal, and returns its ID.
3. Assigned TA reviews the appeal and relevant authorized evidence.
4. TA accepts or rejects with a reason.
5. System records decision and actor/time. If accepted, remove that deduction and update score; if rejected, preserve score.
6. Student reads the final decision and reason.

**Alternates:** Appeal received after the inclusive `publishedAt + 7 days` boundary, against a test verdict, for another student, or a second appeal of the same deduction is rejected. Rejected appeal cannot be reopened. Later TA correction uses a separate audited adjustment path.

## 3. Teaching assistant use cases

### UC-T1 Create and open a lab

**Primary actor:** TA. **Precondition:** TA assigned to class. **Related:** FR-6–FR-9, FR-15.

1. TA submits title, statement, open/deadline, tests, constraints/deductions and permitted limits.
2. System validates time ordering, constraint and deduction data, and resource ranges.
3. System saves lab and test data as TA-private; returns lab resource.
4. TA checks instructions and opens the lab according to schedule.
5. At opening, students can view statement and declared constraints/deductions.

**Alternates:** Non-assigned TA receives forbidden; invalid ranges return field-level validation errors; invalid class ID returns not-found.

### UC-T2 Author lab before opening and freeze grading inputs

**Primary actor:** Assigned TA. **Related:** FR-8.

1. Before lab opens, TA may edit the statement, constraints/deductions, tests, and execution limits.
2. When the lab opens, the system freezes those grading inputs through publication.
3. The application rejects attempts to edit frozen grading inputs.
4. This is a deliberate project scope reduction: it does not implement the post-open constraint edits allowed by FAQ-07.

### UC-T3 Monitor judging and constraint review

**Primary actor:** Assigned TA. **Supporting actors:** Judge and review workers. **Related:** FR-11–FR-22.

1. TA views submission/job progress for the assigned class.
2. Once deadline passes, system fixes the latest pre-deadline submission per student as counted.
3. Only counted Accepted submissions are eligible for constraint review.
4. Hard rules evaluate applicable constraints first; decided constraints do not call the model.
5. Review worker sends de-identified/comment-stripped inputs only for unresolved semantic constraints.
6. Worker validates schema, verdict enum, and exact evidence lines. Invalid output, timeout, model unsure, or budget exhaustion is marked unsure with a TA-visible reason.
7. System queues all violations and unsure results plus random 10% of pass results rounded up (minimum one pass if any pass exists).
8. TA sees queue counts and safe details; no model credentials/provider secrets are exposed.

### UC-T4 Resolve a review item

**Primary actor:** Assigned TA. **Precondition:** Review item belongs to assigned lab and remains unresolved. **Related:** FR-21–FR-22.

1. TA opens item and sees submission source, constraint, deduction, proposal/evidence, and unsure reason if applicable.
2. TA chooses `pass` or `violation`; there is no unsure final decision.
3. For violation, TA enters at least one exact source line as evidence and a reason.
4. System validates evidence and records final decision, TA identity, time, prior proposal and changes.
5. Item leaves pending queue and contributes to publish gate.

**Alternate:** Stale item or already published lab rejects change. TA can inspect/change non-sampled verdicts before publication; audit each change.

### UC-T5 Publish lab grades

**Primary actor:** Assigned TA. **Preconditions:** Server time at/after deadline; every valid submission has a successful judge result; counted Accepted submissions have completed hard-rule/model review; no required review item is pending. **Related:** FR-23–FR-27; exact endpoint behavior in `post-lab-publish-v2.md`.

1. TA invokes publish with empty request body.
2. System authenticates; verifies TA role, lab/class ownership and body; preserves contract's exact evaluation order.
3. System checks deadline and completion of judging and constraint review. Pending or failed judging blocks publication until a successful retry.
4. System computes accepted score as max(0, 10 minus confirmed deductions), applying each constraint at most once. Non-AC and no-submission cases receive zero; there is no manual non-AC score feature.
5. System records first publication timestamp and makes lab results visible to students.
6. TA receives 200 response with lab ID, published status and timestamp.

**Alternates:** Contract-defined 401/403/404/400/409/500 problem details. Repeat request returns same timestamp and does not republish. No unpublish operation exists.

### UC-T6 Resolve an appeal

**Primary actor:** Assigned TA. **Preconditions:** Appeal is pending and belongs to assigned class. **Related:** FR-27–FR-29.

1. TA reads appeal explanation and associated confirmed deduction/evidence.
2. TA selects accept or reject and provides a reason.
3. System records decision and old/new score in audit history.
4. If accepted, remove the deduction, recalculate score, and expose updated score and reason to the student immediately.
5. If rejected, leave score unchanged and expose rejection reason.

**Alternate:** Already-resolved appeal cannot be decided again. TA may separately correct a grade later with a reason and audit record.

## 4. Administrator use cases

### UC-A1 Create class and assign TAs

**Primary actor:** Admin. **Related:** FR-1–FR-5.

1. Admin creates a class with a name.
2. System returns class ID and creation time.
3. Admin assigns one or more existing TA accounts.
4. System records each assignment; repeated assignment is safe/idempotent.
5. Assigned TAs may create labs for that class.

### UC-A2 Manage student membership and invite code

**Primary actor:** Admin; assigned TA may perform supported class-level enrollment. **Related:** FR-3–FR-5.

1. Staff either enrolls an existing student directly or creates/rotates a class invite code.
2. System records membership or returns invite code once.
3. Student uses invite code under UC-S1.
4. System never writes invite code to logs and does not reveal membership in unrelated classes.

## 5. System use cases

### UC-W1 Execute a judge job safely

**Primary actor:** Judge worker. **Supporting actor:** Sandbox/Judge0. **Related:** FR-12–FR-15, NFR-1, NFR-6.

1. Worker claims a queued job using a lease/idempotent claim.
2. Worker sends source and test data to an isolated runner; no model key or other secret is present.
3. Runner compiles as non-root with no network, host mounts or Docker socket and applies resource limits.
4. Runner returns compiler/run verdicts and safe metadata.
5. Worker persists the result once and marks job complete.
6. Transient failure is retried without duplicating the submission; terminal failure is visible to authorized TA/operations.

### UC-W2 Review constraints under budget

**Primary actor:** Constraint-review worker. **Supporting actor:** Model provider. **Related:** FR-16–FR-22, NFR-3, NFR-4, NFR-13.

1. Worker loads only counted Accepted submission and applicable constraint revisions.
2. Hard rules run first and resolve supported cases deterministically.
3. Worker checks per-lab remaining budget before model invocation.
4. For semantic cases, it strips comments/identity and sends only statement, constraints and sanitized code.
5. Worker enforces timeout and validates structured output and exact source evidence.
6. Unsafe/invalid/uncertain outcomes become unsure with reason; no automatic deduction is created.
7. Worker persists proposal and usage, queues violation/unsure and sampled pass items.

### UC-W3 Produce evaluation predictions and gate CI

**Primary actor:** Developer/CI. **Related:** FR-30, NFR-4, NFR-12.

1. CI runs the documented evaluator command against dev data.
2. Checker emits one JSONL record per solution/constraint in required schema.
3. Eval computes wrongful deduction, detection and unsure thresholds.
4. CI fails when any required threshold is violated; it does not call a real model during unit/contract tests.

### UC-W4 Operate and recover service

**Primary actor:** Operator/developer. **Related:** FR-31–FR-32, NFR-6–NFR-14.

1. Operator monitors API health, queue depth/age, judge failures, model cost, timeouts and sandbox failures.
2. Operator correlates work by request/submission/job IDs without logging secrets or unnecessary student source.
3. On worker restart, durable queued/leased work is recovered or retried safely.
4. Team runs 80-arrival load test and records throughput, latency, failures and drain time.
5. Team verifies backups/restoration and deploys a public endpoint for lecturer/red-team access.
