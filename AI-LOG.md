# AI use log

This log records project-specific prompts, changes kept, and suggestions rejected.
Add each follow-up prompt that asks for a fix; refer to a contract section and a
failing test, never paste or edit test code to direct a fix.

## Tool

- OpenAI Codex in the project workspace.

## Prompts

### P-00 — Select the endpoint and contract shape

> the rubric mentioned IA3 with contract.md so i also supplied it can you check and see? as for a single endpoint that will be focused on maybe we can pick one of the ones that they suggested. can you now plan for me first

Scope: compare the rubric's suggested LeeTKOB endpoints and use the IA3 contract
as a specificity/structure reference.

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

### F-05 — CI regression proof

- **Found:** PR #1 failed the unchanged `rejects publishing while any review
  is pending` test; the endpoint returned 200 instead of the contract's 409.
- **Changed:** kept the failing implementation in its own commit, configured
  GitHub Actions to run on branch pushes and pull requests, then added a separate
  repair commit. After the red result, `main` was protected with `quality` as a
  required check. PR #1 passed on fix commit `aef4811`.
- **Rejected:** changing the test or the contract to hide the implementation bug.

See F-01 through F-04 for the earlier implementation findings and decisions.
