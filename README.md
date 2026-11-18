# LeeTKOB backend

LeeTKOB backend built with Bun, TypeScript, Elysia 2.0 RC, Drizzle, and
PostgreSQL. The current application mounts authentication, user, class, and
initial lab-authoring routes. Its persistence and auth code are real
implementations, not just replaceable stubs: users authenticate with
email/password and JWTs, and the
database stores bcrypt password hashes. See [current implementation status](docs/architecture/system_design.md#current-implementation-status).

The PA2 publish endpoint exists as a contract, but its handler is not mounted
in `src/app.ts`. Lab authoring, durable submission intake, outbox dispatch,
BullMQ judging, and Docker sandbox execution are implemented. Model review,
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
implemented. The planned hard budget is **USD 1.00 per lab**. Before model calls are enabled, configure a
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

## Product-owner FAQ

[`FAQ.md`](FAQ.md) is the developer's working reference to product-owner
decisions for implementing LeeTKOB. It is not end-user support content. Use it
to resolve product behavior the class brief leaves open; the brief takes
precedence if they conflict.

## Project rules

[`AGENTS.md`](AGENTS.md) is the repository instruction file. Contract changes
must be made separately from implementation changes, and tests/evaluation data
must not be edited to make a check pass.
