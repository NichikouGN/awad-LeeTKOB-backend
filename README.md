# LeeTKOB backend

Backend starter for LeeTKOB, built with Bun, TypeScript, and Elysia 2.0 RC. The
PA2 implementation focuses on the lab-publish endpoint contract; authentication
and persistence are replaceable seams and are not production integrations yet.

## Requirements

- Bun 1.4 or newer.
- Git.

## Setup

```sh
bun install --frozen-lockfile
cp .env.example .env
bun run dev
```

The server listens on port 3000 by default. `PORT` is reserved for runtime
configuration; do not commit `.env` or put real credentials in `.env.example`.

## Checks

Run these same checks locally and in pull-request CI:

```sh
bun run lint
bun run format:check
bun run typecheck
bun test
```

To format supported source files, run `bun run format`. CI calls each of the four
check commands above and fails the pull request if any command fails. The
repository's `main` branch must require the `quality` status check in branch
protection for a red check to block a merge.

## Endpoint contract

See [`docs/contract/post-lab-publish.md`](docs/contract/post-lab-publish.md).
The handler is available at `POST /api/v1/labs/{labId}/publish`. It fails closed
until a real authenticator and persistent lab repository are wired in; tests
inject deterministic fakes to exercise authorization, ownership, deadline,
review, and repeated-publish behavior.

## Secrets and model spending

No model API key is used and no model calls are made in PA2. The planned hard
budget is **USD 1.00 per lab**. Before model calls are enabled, configure a
provider-side spend limit of USD 1.00 per lab (or lower) and enforce the same cap
in the application. The model provider and model are not selected yet. Never
pass model credentials into the C++ sandbox.

See [`PERMISSIONS.md`](PERMISSIONS.md) for assistant permissions and
[`AI-LOG.md`](AI-LOG.md) for implementation decisions.

## Product-owner FAQ

The [`FAQ.md`](FAQ.md) records product-owner answers for behavior the brief
leaves open. Ask questions under the class group's pinned LeeTKOB post and cite
the relevant FAQ item in code or documentation when relying on it. The class
brief takes precedence if it conflicts with the FAQ.

## Project rules

[`AGENTS.md`](AGENTS.md) is the repository instruction file. Contract changes
must be made separately from implementation changes, and tests/evaluation data
must not be edited to make a check pass.
