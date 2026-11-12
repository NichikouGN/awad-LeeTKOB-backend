# LeeTKOB Project Proposal

## 1. Purpose and authority

LeeTKOB is a course system for authoring C++ labs, accepting and sandboxing student submissions, reviewing possible violations of lab constraints, publishing grades with a TA decision gate, and handling appeals.

This proposal uses the LeeTKOB brief, `FAQ.md`, `AGENTS.md`, `AI-LOG.md`, `PERMISSIONS.md`, and the approved publish contracts. `IA#3_CONTRACT.md` belongs to another assignment and is not a source for this proposal. Where brief and FAQ conflict, the brief wins. The PA2 v1 contract remains documented for compatibility; the final product follows the v2 publish contract.

## 2. Goals and boundaries

### 2.1 Goals

- Reduce TA time spent manually inspecting Accepted C++ submissions for declared constraints.
- Keep incorrect deductions under human control: the checker proposes, the TA decides, then the TA publishes.
- Give students clear lab rules, fast test results, their own published grade evidence, and a bounded appeal path.
- Make the sandbox, model review, evaluation, and deployment measurable and auditable.

### 2.2 In scope

Accounts and roles; class membership; TA lab authoring; C++17 submission and judging; deterministic hard rules; model-assisted semantic review; TA review queue; grade computation and lab-wide publication; appeals; evaluation gate; 80-arrival load demonstration; public deployment and operational evidence.

### 2.3 Out of scope

Additional programming languages, online IDE, contest rankings, plagiarism or AI-authorship detection, model-generated tests, model-selected deductions, and RAG/vector databases.

## 3. Actors

| Actor | Goal and permissions |
|---|---|
| Student | Join classes; read their labs and constraints; submit code; see their own judge results; after publication see their own grade/deductions; appeal an eligible deduction. |
| Teaching assistant (TA) | Work only in assigned classes; create/manage labs; inspect submissions and review items; decide verdicts; publish after gates pass; resolve appeals and correct individual scores with reasons. |
| Administrator | Create classes, assign TAs, manage accounts/membership and invite codes. |
| Judge worker | Claim jobs, compile/run submissions in isolated sandbox, persist result and job status. System actor. |
| Constraint-review worker | Run hard checks, call model adapter only when needed, validate result/evidence, select review sample. System actor. |
| Model provider | Return structured advisory verdicts; cannot set deductions, alter grades, or publish. External actor. |
| Sandbox/Judge0 | Compile/run untrusted C++ under the required restrictions and return execution result. External infrastructure actor. |

## 4. Functional requirements

Each requirement has a stable identifier for discussion, implementation, and acceptance criteria. `M` means mandatory from the brief/FAQ/contract; `O` means explicitly optional.

### Identity, roles, and classes

- **FR-1 (M) Authentication:** The system shall validate credentials and resolve a stable user identity and role before authorizing an operation. A present or malformed Authorization header shall not establish identity.
- **FR-2 (M) Role enforcement:** The system shall support `admin`, `ta`, and `student` roles and reject operations not permitted to that role.
- **FR-3 (M) Class creation and staffing:** An admin shall create classes and assign one or more TAs to each class; a TA may serve multiple classes.
- **FR-4 (M) Student enrollment:** The system shall allow a student to join by invite code and/or staff enrollment. Membership may span multiple classes.
- **FR-5 (M) Data isolation:** TAs shall access only assigned-class labs, submissions, queues, appeals, and results. Students shall access only their own submissions and grades and labs in their classes.

### Labs and constraints

- **FR-6 (M) Lab authoring:** An assigned TA shall create a lab containing class, title, statement, opening time, deadline, tests, constraints, deduction values, and execution limits.
- **FR-7 (M) Constraint visibility:** From lab opening, students shall see every constraint and deduction and notice that code is reviewed using hard rules and a model, that identifying information/comments are removed from model input, and that a TA decides before publication.
- **FR-8 (M) Lab grading-input freeze:** Before opening, a TA may freely edit the lab. Once open, the project freezes all grading inputs (statement, constraints/deductions, tests, and execution limits) through publication. No post-open edits are implemented in this project scope; this is a deliberate scope reduction from the edit permissions in FAQ-07, which remains the course reference.
- **FR-9 (M) Lab access:** A student shall see only labs belonging to their classes; an assigned TA shall see labs for their assigned classes.

### Submission and judging

- **FR-10 (M) Submission intake:** A student shall submit C++ source while the lab is open and before its deadline. The system shall use server receipt time, reject late submissions, and reject code over 64 KB without recording a submission.
- **FR-11 (M) Resubmission and counted work:** Students may submit repeatedly before deadline. Each submission is judged; the latest submission received before deadline counts regardless of verdict. Only the counted submission is used for final constraint review. Students with no valid pre-deadline submission, including students enrolled after the deadline, receive zero.
- **FR-12 (M) Asynchronous judging:** The system shall durably queue accepted submissions through a PostgreSQL transactional outbox and BullMQ/Redis workers, and expose queued/running/finished state and a submission identifier without waiting for compilation in the request. SSE streams submission-state updates; a snapshot endpoint remains available for initial state and reconnect recovery.
- **FR-13 (M) C++ judging:** The judge shall compile with `g++ -std=c++17 -O2`, run all TA-authored tests, and record overall and per-test verdicts (`AC`, `WA`, `TLE`, `MLE`, `RE`, `CE` as supported by sandbox).
- **FR-14 (M) Hidden tests:** Students shall receive their overall and per-test verdicts but never test input or expected output.
- **FR-15 (M) Execution limits:** Apply FAQ-05 defaults: compile timeout 10 seconds where supported; CPU 1 second/test (TA may set 1–5); wall time 3× CPU; memory 256 MB (TA may set 64–512); process/thread maximum 16; output maximum 1 MB/test. Preserve the brief's mandatory isolation controls.

### Constraint review and grade publication

- **FR-16 (M) Review eligibility:** Only Accepted counted submissions shall undergo constraint review. Non-Accepted submissions receive zero by default and no constraint review.
- **FR-17 (M) Hard checks before model:** Run syntax-aware hard rules first. Do not call the model for a constraint decided by a hard rule. Use model review only for unresolved semantic constraints.
- **FR-18 (M) De-identification:** Model input shall contain only lab statement, declared constraints, and code stripped of comments, student name and ID. No model credential may enter sandbox environment or files.
- **FR-19 (M) Guardrails:** Require structured output schema and exact evidence-line correspondence with submitted code. Model `unsure`, malformed output, evidence mismatch, timeout, or exhausted lab budget shall become `unsure` with a reason for TA.
- **FR-20 (M) Cost ceiling:** Enforce application and provider spend ceiling of USD 1.00 per lab or lower; stop further model calls at the cap and route unresolved items to TA as unsure.
- **FR-21 (M) Review queue:** Queue every `violation`, every `unsure`, and a random 10% of `pass` verdicts rounded up; if at least one pass exists, include at least one pass. A verdict is per counted submission/constraint.
- **FR-22 (M) TA decisions:** TA shall make a final `pass` or `violation` decision for queue items. A violation requires at least one exact code-line evidence item. Unsure shall never create a deduction automatically. TA may inspect and change any verdict before publication; audit all changes.
- **FR-23 (M) Score calculation:** Accepted score shall be max(0, 10 minus confirmed deductions). A constraint deduction is applied once per submission even if multiple evidence locations exist. Model never chooses deduction value.
- **FR-24 (O, omitted) Manual non-AC score:** The final product omits TA-entered manual scores for non-AC work. Non-AC and no-submission cases receive zero; no partial score based on test count.
- **FR-25 (M) Publish gate:** Publish whole lab only after deadline, successful judging of every valid pre-deadline submission, completed hard-rule/model review for counted Accepted submissions, and final TA decisions for every required review item. Pending or failed judging blocks publication until a successful retry. Follow `docs/contract/post-lab-publish-v2.md` evaluation order and exact responses. Repeat publish returns original result/timestamp; no unpublish.
- **FR-26 (M) Grade visibility:** Before publication, students shall not see constraint results. After publication, students see only their own score and confirmed deductions, including constraint, amount, evidence lines, and reason. Never reveal rejected proposals, unsure status, or pass-sampling selection.
- **FR-27 (M) Post-publication correction:** TA may correct individual grades after publication through an appeal or manual adjustment with reason; preserve old grade and audit history and show affected student updated score/reason.

### Appeals and operations

- **FR-28 (M) Appeals:** Student may appeal an individual confirmed deduction only, from publication through the inclusive instant `publishedAt + 7 days`, with an explanation. Each deduction may be appealed once. TA must accept/reject with a reason. Accepted appeals remove the deduction and update score; rejected appeals cannot be reopened. Test verdicts/manual scores are outside in-system appeal.
- **FR-29 (M) Audit:** Record actor, timestamp, entity, action, and relevant before/after values for decisions, constraint edits, score changes, publication, appeal decisions, and membership/role changes.
- **FR-30 (M) Evaluation output:** Provide a command that emits one JSONL prediction per (solution, constraint) in the course-required format. CI evaluates the dev set and fails on any wrongful deduction or threshold failure.
- **FR-31 (M) Capacity evidence:** Demonstrate behavior for 80 simultaneous submission arrivals with a repeatable load test and publish the result.
- **FR-32 (M) Deployment:** Deploy a public instance reachable by lecturer and assigned red team; keep production secrets in deployment secret storage.

## 5. Non-functional requirements

- **NFR-1 Security — sandbox:** Untrusted code shall run without network, as non-root, with no host mounts, Docker socket, or secrets, and with CPU, wall, memory, process/thread, and output limits. Repository attack tests shall demonstrate refusal.
- **NFR-2 Security — identity:** Every protected request shall use verified authentication and server-derived identity/role; authorization shall be checked on resource ownership at service boundaries.
- **NFR-3 Privacy:** Only minimized, de-identified data goes to the model. Do not expose source, grades, hidden tests, credentials, or internal errors to unauthorized users. Logs must avoid secrets and unnecessary code content.
- **NFR-4 Correctness — evaluation:** Dev evaluation shall achieve zero wrongful deductions, at least 90% violations caught with correct evidence, and no more than 20% unsure verdicts. The evaluation command and CI gate shall be reproducible.
- **NFR-5 Human oversight:** No grade publication while required TA reviews remain unresolved. No model output directly changes a score.
- **NFR-6 Reliability:** Submission intake and job execution shall be separate; PostgreSQL submission and outbox rows commit atomically; Redis/BullMQ jobs are dispatched idempotently and can be reconstructed from durable state. Job retries shall not create duplicate submissions or duplicate final decisions.
- **NFR-7 Capacity:** Support an arrival burst of 80 submissions through bounded queues and worker concurrency; load test shall report throughput, latency percentiles, error rate, and queue drain time.
- **NFR-8 Performance:** Submission acknowledgement shall not wait for compile/run. Publish judge status updates over SSE and keep a snapshot endpoint for reconnects. Establish numerical result latency targets from the load-test baseline before production acceptance.
- **NFR-9 Maintainability:** Use modular monolith boundaries and interfaces for persistence, auth, clock, queue, sandbox, and model provider. Modules shall depend on application contracts rather than directly manipulating another module's storage.
- **NFR-10 API quality:** Versioned JSON API, endpoint contracts before behavior changes, schema validation, RFC 9457 error responses, stable error `type`, and no internal detail leakage.
- **NFR-11 Observability:** Structured logs and metrics/traces shall correlate a submission through queue, judge, constraint review, and publication without leaking secrets. Track queue depth/age, verdict counts, model spend, timeouts, and sandbox failures.
- **NFR-12 Testability:** Unit/contract tests use deterministic fakes for auth, persistence, time, queue, judge, and model. No real model call in tests. Quality commands must execute real tools and fail on violations.
- **NFR-13 Cost control:** Model spend is capped per lab in both application logic and provider settings; record model/provider and actual usage/cost.
- **NFR-14 Recoverability:** Persist sufficient job state to retry transient worker failures and identify terminal failures. Define backups and restoration procedure for the selected database before public deployment.

## 6. Architecture and technology

### 6.1 Architecture

Use one deployable Bun/Elysia application organized as a modular monolith. Keep judging and model review asynchronous behind queue interfaces. Initially workers may run alongside the API, but must not execute C++ inside the API process.

```text
Elysia HTTP/API
  Auth | Classes | Labs | Submissions | Judge | Constraint Review
       | Grades/Publish | Appeals | Audit
               ↓ application services/domain policies
 Repository / Outbox / BullMQ / Clock / Docker Runner / Model interfaces
               ↓ adapters
 PostgreSQL + outbox | Redis/BullMQ | isolated Docker containers | model provider
```

Modules own their rules and communicate through direct in-process function calls through narrow interfaces implemented by each module's service. The interfaces prevent consumers from depending on unrelated module operations or repositories; module-to-module communication does not use HTTP or an implicit event bus. BullMQ/Redis is for asynchronous judge/review jobs, not ordinary module calls. PostgreSQL is the durable source of truth through the transactional outbox. Keep sandbox and model credentials isolated from the student-code runtime. See the detailed [system design](../architecture/system_design.md) and [module boundary rules](../architecture/module_boundaries.md).

### 6.2 Stack

| Concern | Selection |
|---|---|
| Runtime/language | Bun, TypeScript |
| HTTP | Elysia 2.0 RC |
| Application shape | Modular monolith; direct calls through narrow module interfaces |
| Persistence | PostgreSQL, with a transactional outbox table |
| Jobs | BullMQ workers backed by Redis; PostgreSQL outbox is the durable dispatch source |
| C++ runner | Docker-based isolated runner; exact runner implementation remains gated on proving all mandatory controls |
| Live updates | Server-Sent Events (SSE), with a submission snapshot endpoint for reconnect recovery |
| Model | Provider/model chosen later; structured output; timeout and cost cap; replaceable adapter |
| Tests | Bun test with deterministic fakes; eval separate and real model-free where required |
| CI checks | lint, format check, typecheck, unit/contract tests, dev-set evaluation |
| Deployment | Public reachable deployment; managed secrets; no sandbox access to secret storage |

## 7. Delivery and decision gates

1. Foundation: auth, classes, lab authoring, contracts, persistence boundary.
2. Submission: intake, async job lifecycle, sandbox integration, limits/security evidence.
3. Constraint review: hard rules, model adapter, guardrails, cost controls, TA queue/audit.
4. Evaluation and grades: export command, dev-set CI, score calculation, publish and appeal flows.
5. Operations: 80-arrival load test, logs/metrics/traces, public deployment, incident exercise/post-mortem.

## 8. Open technical decisions

- Select the authentication/identity provider and account-provisioning process; the current project has no production auth integration.
- Select the Docker image/runtime profile and verify every sandbox requirement with attack evidence before enabling submissions.
- Select the model provider/model after checking structured output, privacy, cost, and provider-side budget controls. Finalize source de-identification and line-preserving sanitization before sending submissions; record the choice and per-lab cost in README/AI log.
- Approve the proposed SSE submission event schema in a dedicated endpoint contract before implementation.
- Select the deployment target and migration tooling; configure Redis AOF/snapshots and test recovery from PostgreSQL outbox state before production.
- Set audit query permissions/retention under the course-record policy and define backup/restore schedule.
- Define numerical response latency targets from measured baseline; the brief specifies capacity but not a latency number.

## 9. Project scope decisions

- Every class student receives a result for the lab. A student with no valid pre-deadline submission receives zero, including a student enrolled after the deadline or after publication; the published result view must include that zero.
- Publication waits for the complete judge and constraint-review pipeline, not only for review queue items already materialized. Judge failures must be retried successfully before publication; a failure is not converted into a student verdict.
- This project freezes the statement, constraints/deductions, tests, and execution limits when the lab opens. That intentionally omits the post-open constraint edits FAQ-07 permits. The FAQ remains authoritative course guidance; this implementation limitation is documented to keep scope small and avoid unannounced grading changes.
- The current PA2 code has no durable queue, outbox dispatcher, SSE endpoint, or worker consumer. Later submission/judging work must persist each accepted submission and its outbox job in one PostgreSQL transaction before acknowledging it, then dispatch to BullMQ/Redis and consume jobs asynchronously. Constraint review is another worker stage after judging; the HTTP handler must not run C++ or wait for the model. These are final-product decisions, not PA2 claims.
