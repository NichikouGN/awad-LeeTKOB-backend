# PA3 hard-rule integration audit

Scope: hard rules and their integration with the existing judge. Reviewed against
the class brief and PA3 rubric supplied on 2026-11-24. This is an engineering audit,
not a self-assessed PA3 total or evidence of a public deployment.

## What existed

- Submission intake commits the source, a PostgreSQL judge job and an outbox event
  atomically. It does not compile inside an HTTP handler.
- `src/worker.ts` is a separate process. The outbox dispatcher notifies BullMQ and
  reconciles PostgreSQL after missed notifications or Redis loss.
- Job claims use PostgreSQL leases and fenced completion. The existing real
  PostgreSQL/Redis restart test passed locally on 2026-11-24.
- `Dockerfile.judge` and `DockerSandbox` compile and execute C++ in a separate
  container. Nine attack submissions already exist in `test/sandbox/attacks`.
- Constraint-review source files were empty; no checker ran after `AC`.

## Changes in this slice

1. `checkHardRules(sourceCode, constraints)` parses C++ with Tree-sitter WASM. It
   classifies ban-list constraints from their text, rather than problem IDs.
   Comments, string literals and header inclusion are not calls. Qualified names,
   namespace aliases, scoped imports, and template references are considered.
   Evidence uses the original source, one-based lines, with CRLF supported.
2. `ConstraintReviewService.review` returns hard decisions first. Only semantic
   constraints can reach the injected adapter. `MODEL_OFF=1` prevents adapter
   calls. A missing adapter returns `unsure`, never a fabricated model result.
3. Fake-adapter tests cover schema failures, invented evidence, attempts to assign
   deductions, and timeouts. These tests never call a hosted model. A real adapter
   still requires complete identity redaction, cost controls and provider usage
   logging before it can be wired in production.
4. The worker reviews only `AC` results. `ReviewWriter` is an explicit transaction
   capability: the judge transaction owns the lease fence and commits judge and
   review results together. Persistence does not read or write grades.
5. All proposals remain pending and provisional. There is currently no review
   HTTP API. That workflow must select counted submissions (FAQ-02), keep every
   violation/unsure pending, and sample passes across the whole lab (FAQ-10).
   This slice does not auto-resolve pass proposals or claim sampling is complete.
6. The CLI writes prediction JSONL and an adjacent per-pair decision log. Our five
   custom solutions are separate from the unavailable lecturer dataset. The
   Dockerfile supports running the checker without a database, Redis, Docker
   socket, model credentials, or network access at runtime.
7. CORS is enabled for the configured frontend origins and required request
   headers, including `Idempotency-Key`. Authentication is still required by
   protected endpoints.

## Sandbox evidence to verify

| Minimum | Configuration / attack |
| --- | --- |
| No network | `--network none`; `network.cpp` |
| CPU time | `ulimit -t`; `cpu-limit.cpp` |
| Container wall-clock kill | timeout callback invokes `docker kill`; `wall-limit.cpp` |
| Memory including swap | equal `--memory` and `--memory-swap`; read/write allocation in `memory-limit.cpp` |
| Processes | `--pids-limit 16`; `process-limit.cpp` |
| Output | bounded stdout/stderr collection; `output-limit.cpp` |
| Non-root | UID/GID 10001; `non-root.cpp` |
| No host mounts/socket | only isolated tmpfs mounts; `host-access.cpp` |
| No model secrets | explicit non-secret environment only; `secret-access.cpp` |

Pre-commit validation on 2026-11-24: **97 tests passed, 0 failed**, with all opt-in
integration tests enabled. This includes all nine attacks plus the positive
sandbox case, real sandbox-to-review persistence, rollback on review-write
failure, and PostgreSQL/Redis restart recovery. The run used Bun 1.4.5 on Windows,
an isolated PostgreSQL 16 test database, Redis 7 and the freshly built GCC 12 judge
image. CI is configured to use PostgreSQL 18; no remote CI run is claimed here.

The current suite also checks that Accepted work cannot finish with missing,
partial, duplicate or unrelated constraint proposals, and that JSON verdicts
must be strings (an array such as `["pass"]` becomes `unsure`). Focused checker,
model-guardrail, CLI, CORS and integration tests were restored before committing
because the earlier versions were no longer present in the working tree.

The checker image also built successfully and ran with `--network none`,
`--memory 512m`, `--pids-limit 64`, and `MODEL_OFF=1`. All 10 custom predictions
matched the local CLI output. This is custom-case evidence, not the lecturer's
official evaluation. Real HTTP preflight and database-backed demo-admin login
also passed with the frontend Origin header.

Full local verification (POSIX syntax; PowerShell uses `$env:NAME='value'`):

```sh
DOCKER_SANDBOX_TESTS=1 HARD_RULE_INTEGRATION=1 JUDGE_QUEUE_INTEGRATION=1 \
  MODEL_OFF=1 bun test --timeout 30000
```

The outer test timeout accommodates Docker command startup. The sandbox's CPU,
wall-clock and output limits are unchanged. Lint, formatting, TypeScript and
`git diff --check` also passed. Temporary verification containers were removed
afterward; the reusable checker and judge images remain available locally.

## Remaining PA3 integration work

- Obtain the original dev set, check its input schema, run its unmodified
  `eval.mjs`, and retain the exact corpus and published hashes.
- Expand hard-rule preprocessing/name resolution coverage where required. Macros,
  conditional compilation, parse failures and ambiguous overload resolution
  currently become `unsure`. This does not meet the top-band promise to decide
  every ban-list pair until measured on the published dataset.
- Wire the teammate's real model adapter: strip identities as well as comments,
  enforce the per-lab budget, and store request IDs, usage, latency and cost.
  Record one genuine dev-set run and the 80-submission cost arithmetic.
- Implement the TA-only review queue API with class ownership and latest counted
  submission selection (FAQ-02) and lab-wide pass sampling (FAQ-10). Students
  must not see proposals (FAQ-08).
- Keep publication blocked until required reviews are resolved (FAQ-12). The
  old publish contract test file is currently commented out and its route is not
  mounted; its presence is not evidence of a working publish gate.
- Create the public deployment and verify the three required solution types via
  actual TA/student accounts. Seed TA/student password hashes are placeholders;
  those rows are not usable public test accounts as they stand.
- Complete `PA3.md`, `SELF_ASSESSMENT_REPORT.md`, the recording, real CI run and
  model eval evidence before selecting the submission commit/tag. No tag,
  release, remote setting, or public deployment was changed in this slice.

References: [FAQ-02](../../FAQ.md#faq-02), [FAQ-08](../../FAQ.md#faq-08),
[FAQ-10](../../FAQ.md#faq-10), [FAQ-12](../../FAQ.md#faq-12).
