# LeeTKOB backend

LeeTKOB backend built with Bun, TypeScript, Elysia 2.0 RC, Drizzle, and
PostgreSQL. The current application mounts authentication, user, class, and
initial lab-authoring routes. Its persistence and auth code are real
implementations, not just replaceable stubs: users authenticate with
email/password and JWTs, and the
database stores bcrypt password hashes. See [current implementation status](docs/architecture/system_design.md#current-implementation-status).

The PA2 publish endpoint exists as a contract, but its handler is not mounted
in `src/app.ts`. Lab authoring, durable submission intake, outbox dispatch,
BullMQ judging, Docker sandbox execution, and hard-rule review persistence are implemented. Real model review,
publication, and appeals are not end-to-end features. The database remains the
source of truth; Redis/BullMQ carries recoverable work notifications.

## Requirements

- Bun 1.4 or newer.
- Git.

## Setup

```sh
bun install --frozen-lockfile
cp .env.example .env
bun run db:start
docker build -f Dockerfile.judge -t leetkob-cpp-sandbox:local .
bun run dev
```

Start the separate judge consumer in another terminal with `bun run worker`.
`bun run db:start` resets the local Postgres and Redis volumes before applying
migrations and seeding demo data.

The server listens on port 3000 by default. `PORT` is reserved for runtime
configuration; do not commit `.env` or put real credentials in `.env.example`.

## Checks

Run these same checks locally and in pull-request CI:

```sh
bun run lint
bun run format:check
bun run typecheck
bun test
bun run test:queue:integration
```

To format supported source files, run `bun run format`. CI calls these checks
and fails the pull request if any command fails. The
repository's `main` branch must require the `quality` status check in branch
protection for a red check to block a merge.

The queue integration test uses local PostgreSQL, Redis, and the seeded demo
lab. Start those services and apply migrations with `bun run db:start` before
running it outside CI.

## Endpoint contract

The PA2 milestone contract is [`docs/contract/post-lab-publish.md`](docs/contract/post-lab-publish.md), at `POST /api/v1/labs/{labId}/publish`. The final-product contract is [`docs/contract/post-lab-publish-v2.md`](docs/contract/post-lab-publish-v2.md), at `POST /api/v2/labs/{labId}/publish`. Both are contract documents; neither route is currently mounted. Current route behavior is described in the implementation status and route modules.

## Secrets and model spending

No model API key is used by the current application and no model calls are
enabled. An injectable semantic adapter boundary has schema/evidence validation and a timeout;
the worker currently stores `unsure` for semantic constraints. The planned hard budget is **USD 1.00 per lab**. Before model calls are enabled, configure a
provider-side spend limit of USD 1.00 per lab (or lower) and enforce the same cap
in the application. The model provider and model are not selected yet. Never
pass model credentials into the C++ sandbox.

Submission intake writes the submission, judge job, and outbox event in one
PostgreSQL transaction. A trigger sends a transactional notification after
commit. The dispatcher listens for notifications, transfers pending rows to
BullMQ with stable job IDs, and periodically reconciles pending outbox events
and runnable PostgreSQL jobs in case Redis or a notification is lost. Workers
claim and complete jobs in PostgreSQL; BullMQ is not the source of truth.

See [`PERMISSIONS.md`](PERMISSIONS.md) for assistant permissions and
[`AI-LOG.md`](AI-LOG.md) for implementation decisions.

## PA3 hard rules and integration

Accepted submissions now run the C++ syntax-aware ban-list checker before any
semantic adapter. Review proposals, exact evidence, and the frozen constraint
revision are committed atomically with the judge result. They never write grades
or appear in student snapshots. A TA review HTTP API is still needed; stored
proposals alone do not complete the PA3 walkthrough. See the
[integration audit](docs/architecture/pa3-hard-rule-integration.md).

The checker reads `statement.md`, `constraints.json` (an array of `{id,text}` or
`{"constraints":[...]}`), and `solutions/*.cpp` in each problem folder. It never
reads labels, tests, or problem-specific configuration. This input layout has
been checked against our own cases; compatibility with the lecturer's published
dataset still needs verification when that dataset is available.

```sh
MODEL_OFF=1 bun run checker test/fixtures/hard-rule-dev /tmp/predictions.jsonl
docker build -f Dockerfile.checker -t leetkob-checker .
mkdir -p checker-output
docker run --rm --network none --memory 512m --pids-limit 64 \
  --user "$(id -u):$(id -g)" \
  -e MODEL_OFF=1 \
  --mount type=bind,src="$(pwd)/test/fixtures/hard-rule-dev",dst=/data,readonly \
  --mount type=bind,src="$(pwd)/checker-output",dst=/output \
  leetkob-checker /data /output/predictions.jsonl
```

On PowerShell, set `$env:MODEL_OFF='1'`, then run
`bun run checker test/fixtures/hard-rule-dev checker-output/predictions.jsonl`.
Predictions are JSONL with `solution`, `constraint`, `verdict`, and `evidence`.
The adjacent `.decisions.jsonl` file records whether each pair called a model.
With `MODEL_OFF=1`, semantic constraints become `unsure` and no model is called.

Supported hard rules begin with `Do not use` or `Do not call` and list qualified
names in backticks. The parser excludes comments, strings and includes; it
handles direct calls/references, templates, lexical using declarations and
namespace aliases. Macro/conditional preprocessing, unsupported syntax and
ambiguous name resolution produce `unsure`; this is a known coverage limitation,
not a claim that every C++ ban-list pair is decided. The original dev set and its
`eval.mjs` have not been supplied, so no official eval score or real-model run is
claimed. Five separate labelled/tagged custom solutions live under
`test/fixtures/hard-rule-dev`.

After database migrations/seeding and building `Dockerfile.judge`, run the real
Accepted-submission integration test with:

```sh
HARD_RULE_INTEGRATION=1 MODEL_OFF=1 bun test test/hard-rule.integration.test.ts
```

That test uses the real database, sandbox and worker. It checks stored proposals,
repeat-safe completion, no grade creation, and the student snapshot boundary.
The CI workflow runs it alongside all nine sandbox attacks, including on `pa3`
tag pushes.

For the frontend, `CORS_ORIGINS` is a comma-separated allowlist, defaulting to
`http://localhost:5173,http://127.0.0.1:5173`. The backend allows JSON, bearer-token,
and `Idempotency-Key` headers. Restart the API after changing this setting.

## Product-owner FAQ

[`FAQ.md`](FAQ.md) is the developer's working reference to product-owner
decisions for implementing LeeTKOB. It is not end-user support content. Use it
to resolve product behavior the class brief leaves open; the brief takes
precedence if they conflict.

## Project rules

[`AGENTS.md`](AGENTS.md) is the repository instruction file. Contract changes
must be made separately from implementation changes, and tests/evaluation data
must not be edited to make a check pass.
