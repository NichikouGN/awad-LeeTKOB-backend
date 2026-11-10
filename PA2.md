# PA2 submission evidence

Repository: [awad-LeeTKOB-backend](https://github.com/NichikouGN/awad-LeeTKOB-backend)

| Required evidence | Link or status |
|---|---|
| Protected `main` branch settings | [Branch settings](https://github.com/NichikouGN/awad-LeeTKOB-backend/settings/branches) — configured to require the `quality` status check. |
| Pull request with a red check blocking merge | [PR #1](https://github.com/NichikouGN/awad-LeeTKOB-backend/pull/1); [red quality run](https://github.com/NichikouGN/awad-LeeTKOB-backend/actions/runs/42852025942). The required `quality` check is configured on `main`. |
| Pull request/commit that turns the check green | [Fix commit `aef4811`](https://github.com/NichikouGN/awad-LeeTKOB-backend/commit/aef4811); [green quality run](https://github.com/NichikouGN/awad-LeeTKOB-backend/actions/runs/42852342456). |
| CI run for the `pa2` tag | [Quality workflow runs filtered for the `pa2` tag](https://github.com/NichikouGN/awad-LeeTKOB-backend/actions/workflows/quality.yml?query=event%3Apush+branch%3Apa2) — push the tag after this evidence update is committed. |
| Deliberate contract break | [Commit `94e2728`](https://github.com/NichikouGN/awad-LeeTKOB-backend/commit/94e2728) removes only the pending-review guard; the unchanged contract test fails with expected 409, actual 200. |

## PA2 implementation

- Repository instructions: [`AGENTS.md`](AGENTS.md).
- Permissions and secret handling: [`PERMISSIONS.md`](PERMISSIONS.md),
  [`.env.example`](.env.example), and [`.gitignore`](.gitignore).
- Identical local and CI checks: [package scripts](package.json) and
  [quality workflow](.github/workflows/quality.yml).
- Endpoint contract: [`docs/contract/post-lab-publish.md`](docs/contract/post-lab-publish.md).
- Contract tests: [`test/contract/lab-publish.test.ts`](test/contract/lab-publish.test.ts).
- Assistant prompts and decisions: [`AI-LOG.md`](AI-LOG.md).
