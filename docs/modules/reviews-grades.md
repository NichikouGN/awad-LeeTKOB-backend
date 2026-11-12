# Reviews and Grades Module

## Purpose and scope

Own TA final review decisions, confirmed deductions, grade calculation, lab-wide publication, student grade projections, and audited per-student corrections. Model proposals remain owned by Constraint Review and are never treated as final decisions.

## Responsibilities

- Present all TA work for labs in assigned classes, including non-sampled verdicts that a TA may inspect/change before publication (FAQ-10).
- Require final `pass` or `violation` for each required queue item; `unsure` is never a final choice. A violation needs at least one exact source line and reason.
- Record every decision/override and preserve superseded values.
- Calculate Accepted score as `max(0, 10 - sum(confirmed deductions))`; apply each constraint deduction once per submission, regardless of evidence count. The model never selects deduction amount.
- Assign zero to non-AC and no-submission cases. TA-entered manual non-AC scores are omitted.
- At publication, give every student in the class roster a result. Students without a valid pre-deadline submission, including students enrolled after the deadline, receive zero.
- Publish the whole lab only after the deadline, successful judging of every valid pre-deadline submission, completed hard-rule/model review for counted Accepted submissions, and zero pending required TA decisions. A pending or failed judge job blocks publication until a successful retry. Follow the final [v2 publish contract](../contract/post-lab-publish-v2.md); the v1 contract is retained for PA2 compatibility.
- Preserve first publication timestamp and return the original result for retries.
- Keep constraint outcomes hidden before publication; after publication provide only the student's own score and confirmed deductions/evidence/reason.
- Support audited individual post-publication correction without unpublishing the lab.

## Public API contracts

Review list/decision and results routes are proposed in [section 5 of api-contracts.md](../planning/api-contracts.md#5-review-and-grade-endpoints). Publish v1 is retained for PA2 compatibility; the full product uses [`POST /api/v2/labs/{labId}/publish`](../contract/post-lab-publish-v2.md). Follow its exact evaluation order, problem responses, and replay behavior.

## Internal interfaces and data

Consume Constraint Review proposal/queue interfaces and Labs constraint-value queries; use Submissions for counted/Accepted state. Own final decisions, grades, deductions, publication, and adjustments. A service should expose a student-safe grade projection separately from TA management data.

## Acceptance criteria

- An unresolved unsure or sampled pass blocks publication until a TA records a final decision.
- Wrong role or TA without class ownership cannot decide or publish.
- A repeated publish returns the same publication timestamp and causes no second transition.
- Rejected proposals create no deduction; only confirmed violation uses the lab's deduction value.
- Deductions are applied once per constraint and score never falls below zero.
- Before publish, student grade lookup returns no review/score details; after publish it returns only caller's data.
- Every decision, publication, and correction has actor/time/reason and before/after audit data.
