# Security and Protection Design

## 1. Security goals

Protect student identity/source, TA-private tests, unpublished review proposals, grades, credentials, and host infrastructure. Security requirements are NFR-1 through NFR-3 and NFR-10 through NFR-13 in [`project-proposal.md`](../planning/project-proposal.md). This document records required controls; it does not claim that an unselected runner/provider has already passed verification.

## 2. Authentication and authorization

- A replaceable authentication adapter validates credentials and returns a verified principal with stable user ID and role.
- Header presence is never proof of identity. Fail closed when verification is unavailable.
- Check role and resource ownership for each operation. TAs are scoped to assigned classes; students are scoped to their membership and their own submissions/grades.
- Use the same not-found behavior for unknown and unauthorized resources wherever the endpoint contract requires concealment.
- See [`rbac.md`](../requirements/rbac.md) and the final-product [v2 publish contract](../contract/post-lab-publish-v2.md). The v1 publish contract is retained for PA2 compatibility.

## 3. C++ sandbox boundary

The final product uses Docker-based isolated containers for judging. The host-side runner/orchestrator may communicate with its Docker daemon, but the submission container itself must not receive the Docker socket or host mounts. The brief's mandatory sandbox minimums are:

- no network access;
- non-root execution;
- no host directory mounts and no Docker socket access;
- no model API key or other secret in the runner, its environment, filesystem, or child process;
- CPU, wall-clock, memory, process/thread, and output limits;
- compiler and run timeout enforcement and safe cleanup after completion.

FAQ-05 sets the current grading defaults: `g++ -std=c++17 -O2`; compile timeout 10 seconds where supported; 64 KB source maximum; CPU 1 second per test, TA-configurable from 1–5 seconds; wall time 3× CPU; memory 256 MB, TA-configurable from 64–512 MB; maximum 16 processes/threads; output maximum 1 MB per test. Preserve the FAQ caveat that some runners cannot distinguish MLE from RE. Mapping runner-specific statuses to public verdicts must be documented before selecting the adapter.

Prove each mandatory isolation property using repository attack cases as required by the brief. Run compilation and code execution outside HTTP request handling. Do not mount credentials or host application data into the runner. Select the base image, container runtime profile, and host orchestration details only after verifying the required attack cases; Docker is the chosen isolation mechanism, not evidence that the controls already hold.

## 4. Model-review boundary

- Run hard checks first; do not call the model for a constraint already decided by a hard rule.
- Model input is limited to the lab statement, declared constraints, and code with comments and identifying information removed.
- Model results are structured, validated proposals. Verify every cited evidence line against the submitted code. Malformed output, mismatch, timeout, model `unsure`, or exhausted budget becomes `unsure` with a reason for TA.
- The model never chooses deduction values, creates final TA decisions, alters grades, or publishes.
- Enforce a per-lab cap of USD 1.00 or a lower selected amount at the application and provider levels. On exhaustion, stop calls and route unresolved items to TA.
- Keep API credentials in deployment secret storage and unavailable to the sandbox. Do not log prompts, full source, credentials, or raw provider payloads by default.

## 5. API, data, and logging protections

- Validate request and response shapes at the HTTP boundary. Use explicit public DTOs rather than serializing database rows.
- Every API error uses RFC 9457 problem details and safe `detail`; never return stack traces, SQL, filesystem paths, credentials, hidden test data, or provider internals.
- Student projections exclude private tests, other users' submissions, pending review verdicts, sample selection, and TA notes. After publication, expose only that student's score and confirmed deductions/evidence/reason.
- Store invite codes as credentials: reveal only when created, never log, and define rotation/expiry policy in the approved contract.
- Use TLS in deployed environments. Keep production secrets out of source control and document all environment variable names without values in `.env.example`.

## 6. Required security evidence

| Risk | Evidence expected |
|---|---|
| Forged/present-only auth | Contract tests for missing/invalid tokens and an authenticated fake principal. |
| Cross-class or cross-student disclosure | Ownership tests for labs, submissions, review queue, grades and appeals. |
| Hidden test leakage | Student response projection tests and route/schema review. |
| Sandbox escape/resource abuse | Attack cases for network, root, mounts/socket/secrets, limits and cleanup. |
| Model prompt/output risk | De-identification checks, strict schema/evidence validation and budget/timeout cases. |
| Secret leakage | Repository/history review, deployment secret configuration, sandbox environment inspection, and log redaction checks. |
