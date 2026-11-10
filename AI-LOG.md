# AI use log

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

Record each future implementation fix prompt here with the failing test name and
the contract section it refers to. No test code should be included in the prompt.

## Changed / Rejected

See F-01 through F-03 above. Add each later implementation decision here with a
specific explanation of what changed and what was rejected.
