# PA2 self-assessment

Score based on the current PA2 branch, protected-branch configuration, and PR
checks. The `pa2` tag workflow link is recorded in [`PA2.md`](PA2.md).

| Criterion | Claimed points | Evidence |
|---|---:|---|
| 1. Rules file | 15/15 | [`AGENTS.md`](AGENTS.md) has the four required sections; F-01 and F-02 in [`AI-LOG.md`](AI-LOG.md) trace two product-specific rules to problems in the starter commit. |
| 2. Permissions and secrets | 8/10 | [`PERMISSIONS.md`](PERMISSIONS.md) defines allowed / ask first / never; [`.env.example`](.env.example) lists configuration variables without values; `.env` is ignored, and a common-key-pattern scan found no committed credentials. README documents the USD 1.00 per-lab budget. Provider-side enforcement is not configured because no model provider is selected or used in PA2. |
| 3. One command for every check | 10/10 | [`package.json`](package.json) commands are documented in [`README.md`](README.md) and run by [`.github/workflows/quality.yml`](.github/workflows/quality.yml); a frozen install and all four checks pass locally and in PR CI. |
| 4. CI that blocks a merge | 20/20 | `main` requires `quality` with admin enforcement; [PR #1](https://github.com/NichikouGN/awad-LeeTKOB-backend/pull/1) has a red run and then a green fix run. No commits were pushed directly to `main` after protection was enabled. Evidence links are in [`PA2.md`](PA2.md). |
| 5. Endpoint contract | 25/25 | [`docs/contract/post-lab-publish.md`](docs/contract/post-lab-publish.md) specifies role, class ownership, request/response, RFC 9457 errors, deadline/review rules, repeat behavior, and versioning. |
| 6. Contract tests that bite | 15/15 | [`test/contract/lab-publish.test.ts`](test/contract/lab-publish.test.ts) covers success, every documented error type, class ownership, and repeated publishing. The pending-review test caught commit [`94e2728`](https://github.com/NichikouGN/awad-LeeTKOB-backend/commit/94e2728); the fix is [`aef4811`](https://github.com/NichikouGN/awad-LeeTKOB-backend/commit/aef4811). Both CI runs are linked in [`PA2.md`](PA2.md). |
| 7. AI-LOG.md | 5/5 | [`AI-LOG.md`](AI-LOG.md) records the implementation prompt and real changed/rejected decisions, including the contract-test regression fix. |
| **Total** | **98/100** | |

## What we did not manage yet

- Select a model provider and set its actual USD 1.00 per-lab spending limit;
  PA2 makes no model calls, and the README records this as a precondition for
  enabling model integration.
