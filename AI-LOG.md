# AI use log

## P-09 — Repair local demo TA login (2026-11-25)

- **Request:** enable login as `seed:ta`.
- **Changed:** replace its invalid plaintext password placeholder with bcrypt for
  the local demo password `1234`. Seeding repairs only the original `123`
  placeholder and preserves passwords already changed by the user.
- **Validation:** applied local seeds; TypeScript, lint and file formatting passed.
  Local HTTP login returned 200 with role TA. No access token was printed.

## P-08 — Gemini constraint review (2026-11-25)

- **Request:** implement real Gemini AI checks; the user will add the key later.
  The user then requested removal of the local fake Gemini setup while retaining
  the real API integration.
- **Changed:** added the Gemini Flash-Lite REST adapter, strict schema/evidence
  validation, abortable timeout, comment/account-identity redaction, worker and
  checker configuration, and a Drizzle ledger enforcing the per-lab budget across
  workers. Calls log actual provider IDs, usage, latency and cost estimates.
  Review proposals remain pending and hidden from students.
- **Removed:** the newly added fake HTTP Gemini server tests and test-only endpoint
  override. Existing offline service guardrail tests remain. No credentials were
  added and no hosted model call was made; live Gemini behavior and official
  evaluation remain unverified until a key and dataset are available.
- **Validation:** 104 tests passed with PostgreSQL, Redis and all Docker sandbox
  attacks enabled, including concurrent persistent-budget enforcement. This was
  an offline/model-off run, not evidence of a real provider evaluation.
- **Local signup diagnosis:** the backend's configured PostgreSQL port 5432 was
  unavailable (`ECONNREFUSED`). Started cached PostgreSQL 16 with a persistent
  local volume after the Compose PostgreSQL 18 download stalled, migrated and
  seeded the database. Real local signup returned 201 and login 200 with the
  frontend Origin allowed. Removed the temporary diagnostic account afterward.

## P-07 — Review and commit the changes (2026-11-24)

- **Found / Changed:** CI referenced an absent hard-rule integration test. Restored
  focused syntax-trap, fake-model guardrail, CLI, CORS and real integration tests
  so the committed commands refer to files that exist. Custom `.in`/`.out` files
  removed during the discussion were left removed; these tests do not need them.
- **Found / Changed:** schema validation coerced a model verdict with `String()`,
  accepting an invalid array such as `["pass"]`. A new regression test failed
  first; validation now requires an actual string before checking allowed values.
- **Validation:** the current complete suite passed **97 tests, zero failures**
  with all Docker/PostgreSQL/Redis integration flags enabled. The checker image
  built and wrote 10 custom predictions with networking disabled and memory/PID
  limits. No real model was called and no official eval result is claimed.
- **History:** the user requested commits after the implementation work. These
  commits group the existing formatter, CORS and hard-rule integration changes;
  they are not evidence of a tests-first Git history and no history was rewritten.

## P-06 — Make completion reviews explicit (2026-11-24)

- **Changed:** made `completeClaim`'s review array required. Non-Accepted results
  pass `[]`; Accepted results with constraints require a reviewer and exactly one
  proposal for each declared constraint. Missing, duplicate, partial or unrelated
  proposals fail the job for retry before completion is persisted.
- **Rejected:** merely removing `?` while silently substituting an empty array
  for missing Accepted reviews. Added regression cases before implementation;
  updated the existing completion expectation to assert the required fourth argument.

## P-05 — PA3 hard rules and integration (2026-11-24)

User scope: read the attached class brief and PA3 rubric, verify the claimed
sandbox flow, implement hard-rule checks and check their integration. Tool:
OpenAI Codex with local Bun, TypeScript, Tree-sitter WASM and Docker. No hosted
model calls, charges, deployment changes or official eval results were made.

### Changed / Rejected

- **Changed:** wrote hard-rule tests before implementation (the first run failed
  because the module did not exist); added namespace/string/comment/include
  traps, aliases, templates, exact evidence and model-off checks. Added fake-model
  timeout/schema tests before the service implementation. No existing test,
  official corpus or label was loosened to make code pass.
- **Found / Changed:** additional tests exposed a false violation for a nested
  student namespace named `std`, a missed imported function reference, and a
  using-directive leaking backward into earlier code. Fixed namespace binding,
  reference traversal and lexical scope snapshots; retained the regression tests.
- **Rejected:** raw-text matching and pretending Tree-sitter is a full C++
  preprocessor/compiler. Unsupported macros, conditional compilation, parse
  failures and ambiguous overloads remain explicit `unsure` outcomes. Full
  published-dev-set ban-list coverage is not claimed.
- **Changed:** wired Accepted worker results into hard-rule review, persisted
  proposals in the fenced judge transaction, and added an opt-in real
  database/sandbox integration test. Student snapshots and grades are not given
  proposal data. Added a model-off CLI/Dockerfile and five custom tagged cases.
- **Rejected:** marking the whole PA3 flow complete merely because sandbox files
  existed. Real semantic calls, the TA review API, deployment and official eval
  evidence are still missing. The detailed audit records those gaps.
- **Rejected:** rounding pass sampling independently for each submission; FAQ-10
  specifies the lab-wide population. Proposals stay pending and provisional until
  the TA queue workflow implements counted-submission selection and sampling.
- **Changed:** completed the earlier CORS fix for Vite origins, JSON/bearer-token
  requests and `Idempotency-Key`, with preflight/error-response tests.
- **Found / Changed:** the local format check flagged 68 unchanged files because
  Git checked them out with CRLF. `endOfLine: auto` makes the existing formatter
  work on both Windows and Linux without a repository-wide formatting rewrite.
- **Validation so far:** the real PostgreSQL/Redis stop/restart test passed.
  Unit tests, lint, format and type checks passed. Docker image downloads were
  slow; final sandbox/checker container results will be appended after completion.
- **Final validation:** 104 tests passed with all sandbox, PostgreSQL/Redis and
  hard-rule integration flags enabled; zero failed. The real judge image compiled
  an Accepted fixture and its hard-rule evidence was stored exactly once while
  remaining absent from the student snapshot. A simulated failure after review
  inserts rolled the entire completion transaction back. All nine attack tests
  passed. The network-disabled, 512 MiB checker container produced the same 10
  custom predictions as the host CLI. Real HTTP CORS preflight and demo-admin
  login passed too. No official dev-set score or public CI run is claimed.


This log records project-specific prompts, changes kept, and suggestions rejected.
Add each follow-up prompt that asks for a fix; refer to a contract section and a
failing test, never paste or edit test code to direct a fix.

## Tool

- OpenAI Codex in the project workspace.

## Prompts

### P-01 — PA2 implementation request

> ok everything seem good can you now help me with the actual implementation. the rubric also ask for a self-assetments and some code push to test out the CI block too so can you help me with those too

Scope: implement the PA2 harness and quality gate, prepare the requested evidence,
and use the previously selected lab-publish endpoint.

## Findings and decisions

### F-01 — Starter test command did not run tests

- **Found:** `package.json`'s original `test` script printed “Error: no test
  specified” and exited nonzero.
- **Changed:** replace it with Bun's test runner and add real endpoint contract
  tests.
- **Rejected:** treating a script named `test` as evidence of a test gate when
  it executes no tests.

### F-02 — Starter auth plugin trusted header presence

- **Found:** `src/plugins/auth.plugin.ts` originally returned the same `userId`
  for every nonempty Authorization header.
- **Changed:** remove that behavior and use an injectable authenticator that
  fails closed by default; contract tests supply deterministic identities.
- **Rejected:** preserving the placeholder as if it verified a bearer token.

### F-03 — Endpoint selection

- **Changed:** selected `POST /api/v1/labs/{labId}/publish`, one of the PA2
  rubric's suggested endpoints. Its contract covers TA class ownership, review
  completion, the deadline, and repeat-safe publishing.
- **Rejected:** the initially suggested `POST /labs` endpoint, which did not
  exercise the rubric's ownership and idempotency cases as directly.

### F-04 — Checks must run as documented

- **Found:** the first Biome format-check script used an unsupported `--check`
  flag, and the starter TypeScript config used `moduleResolution: node`, which
  TypeScript 7 had removed.
- **Changed:** use Biome's check command in format-only mode and set TypeScript
  module resolution to `Bundler`; pin TypeScript as a direct dev dependency.
- **Rejected:** relying on a transitive compiler install or leaving a check
  command that fails before reading project files.

## Prompts for fixes

### P-02 — Restore review gate

> Fix the failing `rejects publishing while any review is pending` contract test to match section 5, step 7 of `docs/contract/post-lab-publish.md`. Restore the implementation guard; do not change the test.

## Changed / Rejected

- **Changed:** restored the pending-review check after the deliberate regression
  made the contract test return 200 instead of 409.
- **Rejected:** editing or weakening the test to accept publishing while reviews
  remain pending.

### P-03 — PA3 submission intake and module naming

> ok can you help me continue with the submissions flow? rename the files too so it doesnt just stay like index.ts but more like submission.index.ts. same as always check the type, tests for me would you

Scope: finalize the student submission and snapshot contract, add tests before
implementation, then implement durable asynchronous intake and run the
repository checks.

## Changed / Rejected

- **Changed:** use the lab and class service boundaries to enforce the lab
  window and active membership; persist a submission, judge job, and outbox
  event atomically; support idempotent retry and owner-only snapshots.
- **Rejected:** compiling or judging in the HTTP request handler. The request
  only records durable work; a separate worker and sandbox are the next slice.

See F-01 through F-04 for the earlier implementation findings and decisions.

### P-04 — Durable judge queue and sandbox

> ok before you said the bullMQ stuff isnt wired yet so can you help me continue with that part

Scope: connect the transactional PostgreSQL outbox to BullMQ with post-commit
notification and recovery scans, then run a separate judge consumer using the
existing worker and sandbox boundaries.

### Changed / Rejected

- **Changed:** added a PostgreSQL `NOTIFY` trigger, an outbox dispatcher that
  queues stable judge job IDs, periodic PostgreSQL reconciliation, a BullMQ
  consumer, and a separate worker entrypoint. The judge repository claims work
  with leases and commits test results with the submission status. Added an
  opt-in PostgreSQL/Redis integration test that commits a job while the
  consumer is stopped, restarts it, and asserts one stored result.
- **Rejected:** dispatching directly from the submission HTTP handler or using
  Redis as the durable source of truth. PostgreSQL remains authoritative and
  reconstructs queue work after notifications or Redis jobs are lost.

## P-10 — TA review queue (2026-11-25)

- **Request:** implement the TA review queue in backend and frontend.
- **Changed:** committed the API contract before implementation; added Drizzle
  queries for latest counted submissions/current revisions, lab-wide 10% pass
  sampling, class-authorized TA endpoints and a paginated review screen.
  Explicit pass/violation decisions require a reason and exact source evidence
  for violations, preserve append-only history, and reject stale concurrent edits.
  They do not create grades or publish anything.
- **Rejected:** showing all historical Accepted submissions in the queue, giving
  unsure a default deduction, or exposing proposals to students (FAQ-02/08/09/10).
- **History:** tests were added during implementation, after the initial code;
  no tests-first history is claimed or reconstructed.
- **Validation:** offline route/policy tests and real PostgreSQL/sandbox integration
  cover authorization, evidence validation, concurrent decisions, retained history
  and exclusion of superseded submissions. No real model call is involved.
  Final run: 109 tests passed, zero failures, with all integration flags enabled
  against an isolated PostgreSQL database. Backend TypeScript/lint/format checks
  and frontend build/ESLint/Biome passed. Tool: Codex with local shell commands.

## P-11 — Authorized live Gemini smoke test (2026-11-25)

- **Request:** test the API key the user added locally. No key was printed,
  committed, copied into frontend code or passed to the sandbox.
- **Observed:** authenticated model listing returned 200. Generation requests for
  Gemini 3.5 Flash-Lite and a minimal 2.5 Flash-Lite diagnostic returned HTTP 402,
  RESOURCE_EXHAUSTED, with Google's prepayment-credits-depleted message.
- **Outcome:** the application's semantic verdict became unsure with no evidence.
  No successful model evaluation, provider token usage, or actual charge is
  claimed. This used synthetic input, not student submissions. Google project
  billing/free-tier eligibility must be resolved before successful live validation.
