# LeeTKOB Requirements Specification

## 1. Purpose and authority

LeeTKOB helps teaching assistants (TAs) create C++ labs, accept and judge submissions, review possible constraint violations, publish grades after human review, and handle appeals. This specification expands the stable FR/NFR identifiers in [`project-proposal.md`](../planning/project-proposal.md); it does not create a second set of identifiers. Use the authority order in [`docs/README.md`](../README.md). The separate IA#3 assignment and its menu API are excluded.

## 2. Scope

### In scope

- Verified accounts and `admin`, `ta`, and `student` roles; class staffing and membership.
- Lab authoring with private tests, visible constraints, deductions, and C++ execution limits.
- Repeated student submissions, durable asynchronous judging, and student-safe judge results.
- Deterministic hard checks followed by bounded, advisory model review for unresolved cases.
- TA review and audit, lab-wide grade publication, student grade views, and deduction appeals.
- A model-free evaluation command and CI quality gate, sandbox security evidence, 80-arrival load evidence, deployment, and operations.

### Out of scope

Additional languages, an online IDE, contest rankings, plagiarism/AI-authorship detection, model-generated tests, model-selected deductions, and RAG/vector databases.

## 3. Actors and trust boundaries

| Actor | Allowed purpose | Trust boundary |
|---|---|---|
| Student | Join classes, read their labs, submit code, view own judge results and published grade, appeal an eligible deduction. | Untrusted caller; never receives tests, other users' data, or pre-publication review details. |
| TA | Manage labs in assigned classes, inspect submissions/review items, decide verdicts, publish, resolve appeals, and make audited corrections. | Authenticated identity is not sufficient: class ownership is checked for every operation. |
| Admin | Create classes, assign TAs, manage accounts/membership and invite codes as supported. | Cannot publish a lab under the approved publish contract. |
| Judge worker | Compile/run accepted submissions and persist results. | System identity; executes untrusted source only in the isolated runner. |
| Constraint-review worker | Run hard rules, invoke replaceable model adapter when needed, validate results, and select sample items. | System identity; model result is advisory and cannot alter grades or publish. |
| Sandbox and model provider | Execute code or return structured advisory output. | External, replaceable dependencies; each receives only the minimum data needed. |

## 4. Functional requirements and acceptance criteria

The full normative statements are FR-1 through FR-32 in the project proposal. The following criteria make their observable outcomes explicit.

| ID | Acceptance criteria |
|---|---|
| FR-1–FR-2 | Missing, invalid, expired, or malformed credentials do not establish identity. Protected operations use a verified user ID and server-resolved role; wrong roles are denied. |
| FR-3–FR-5 | Admin can create a class and assign multiple TAs. A TA may serve multiple classes; students may join multiple classes. A TA cannot read or mutate an unassigned class's resources; students cannot read another student's submissions or grades. |
| FR-6–FR-9 | Assigned TA can author a lab with schedule, tests, constraints, deductions, and permitted limits. Students see rules and deductions from opening, but never receive private tests. This project freezes all grading inputs at opening as a documented scope reduction from FAQ-07's permitted post-open constraint edits. |
| FR-10–FR-15 | Valid UTF-8 source up to 64 KB is durably accepted only while open and before the deadline, using server receipt time and a scoped idempotency key. PostgreSQL submission/outbox writes are atomic; BullMQ/Redis workers judge asynchronously. The latest pre-deadline submission counts even if it is not Accepted. A student with no valid pre-deadline submission, including one enrolled after the deadline, receives zero. Students receive updates through SSE and can fetch a snapshot; responses omit test inputs/expected outputs. Runner settings satisfy FAQ-05 and the brief's isolation minimums. |
| FR-16–FR-20 | Only the counted Accepted submission is constraint-reviewed. Hard rules precede model calls. The model receives only the lab statement, constraints, and de-identified/comment-stripped code. Invalid, mismatched, uncertain, timed-out, or over-budget responses become TA-visible `unsure`; no model output sets a deduction. Per-lab model spend never exceeds USD 1.00 (or a lower selected cap). |
| FR-21–FR-22 | Queue every violation and unsure plus a random 10% of pass verdicts rounded up, with at least one pass if any exist. TA can inspect and change verdicts before publication, including non-sampled verdicts. A final violation requires exact evidence lines. Every decision/change is audited. |
| FR-23–FR-24 | Accepted score is `max(0, 10 - sum(confirmed constraint deductions))`; each constraint is deducted once per submission. Non-AC and no-submission scores are zero; TA-entered manual non-AC scoring and test-count partial scoring are omitted. |
| FR-25–FR-27 | Publish is unavailable before deadline, while any valid submission is pending/failed judging, while counted Accepted submissions lack completed hard-rule/model review, or while a required review lacks a TA decision. First publish records one timestamp; retry returns that original result. No unpublish or per-student publish. Before publication, students see no constraint review outcomes; after publication, each sees only their own score and confirmed deductions. Individual corrections retain audit history and a reason. |
| FR-28–FR-29 | A student may appeal each confirmed deduction once, from publication through the inclusive instant `publishedAt + 7 days`, with an explanation. TA accepts/rejects with a reason. Acceptance removes the deduction and recalculates the score; rejection cannot be reopened. Required decisions and membership/role changes are auditable. |
| FR-30 | The documented evaluator command emits one JSONL prediction per solution/constraint and the dev-set gate fails on any wrongful deduction or other stated threshold failure. Unit/contract tests do not call a real model. |
| FR-31–FR-32 | Repeatable evidence covers 80 simultaneous submission arrivals and reports latency, throughput, errors, and drain time. The public deployment is reachable by the lecturer/red team; production secrets are held outside the repository and sandbox. |

## 5. Non-functional requirements

The detailed NFR-1 through NFR-14 statements remain in [`project-proposal.md`](../planning/project-proposal.md). Their acceptance evidence is:

- **Security and privacy (NFR-1–3):** sandbox attack cases demonstrate no network, non-root execution, no host mounts/Docker socket, bounded resources, and no secrets; authorization tests exercise ownership boundaries; model-input tests prove de-identification; errors/logs omit secrets and internal details.
- **Evaluation and human control (NFR-4–5):** reproducible dev evaluation meets zero wrongful deductions, at least 90% violation detection with correct evidence, and no more than 20% unsure; publish remains blocked by pending reviews.
- **Reliability and capacity (NFR-6–8, NFR-14):** accepted jobs survive API restart, retries are idempotent, and the load report includes the agreed measurements. Backups and restoration are documented before public deployment. Numerical latency targets remain open until measured.
- **Maintainability and API (NFR-9–10):** modules expose narrow service interfaces; API errors use RFC 9457; public behavior is documented contract-first; integrations have replaceable adapters.
- **Observability and testing (NFR-11–12):** structured telemetry correlates request/submission/job/review/publication without secrets; deterministic fakes cover time, storage, auth, queue, sandbox, and model; checks execute real tools.
- **Cost control (NFR-13):** provider and application limits are configured; per-lab usage and actual cost are recorded; unresolved work at the cap becomes unsure.

## 6. Product rules that must stay consistent

1. Lab status may be derived from schedule and publication state; there is no independently editable “closed” state in the approved publish operation. The API inventory's status vocabulary and transition policy remain proposed and must be resolved before contracts are finalized.
2. “Latest submission” means greatest server receipt time among submissions accepted before the deadline, independent of judge verdict. Only that submission is included in the final review and grade workflow.
3. Constraint review proposals are not student-visible. Only TA-confirmed deductions are visible after publication.
4. `unsure` is a proposal state, never a final TA decision. Each required queue item must receive final `pass` or `violation` before publication. Every valid submission must also finish judging successfully; a judge failure blocks publication until a successful retry.
5. Accepted deductions come from TA-confirmed constraints and lab-authored deduction values, not from a model.
6. Non-AC manual scoring is omitted; non-AC and no-submission work receives zero, with no partial scoring.
7. At publication, students with no valid pre-deadline submission receive zero, including students enrolled after the deadline.
8. The implementation freezes statement, constraints/deductions, tests, and execution limits when a lab opens. This omits FAQ-07's permitted post-open constraint edits as a deliberate project scope reduction.

## 7. Open product/technical decisions

Resolve the remaining decisions listed in [`api-contracts.md`](../planning/api-contracts.md#7-contract-decisions-required-before-implementation), including identity provisioning, runner-specific Docker profile/status mapping, exact SSE endpoint contract, model provider/model, and measured latency targets. PostgreSQL, BullMQ/Redis, transactional outbox, Docker isolation, SSE, list pagination, retry defaults, bounded lab/test payloads, and the non-AC zero-score rule are selected design decisions.

## 8. Traceability

Use [`use-cases.md`](../planning/use-cases.md) for user/system flows, [`modules/`](../modules/) for owned behavior and service boundaries, [`planning/api-contracts.md`](../planning/api-contracts.md) for proposed public routes, and [`contract/post-lab-publish-v2.md`](../contract/post-lab-publish-v2.md) for the final-product publish gate. The v1 contract remains the PA2 compatibility artifact.
