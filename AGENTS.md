# Stack

- Bun runtime with TypeScript and Elysia 2.0 RC.
- API contract: `docs/contract/post-lab-publish.md`.
- Unit and contract tests use `bun test`; do not add a real model call to tests.

# Commands

- `bun run lint` — lint the repository.
- `bun run format` — format supported files.
- `bun run format:check` — verify formatting without edits.
- `bun run typecheck` — TypeScript check.
- `bun test` — run tests.
- `bun run dev` — start the development server.

# Conventions

- Treat the endpoint contract as the source of truth; change it in its own commit
  before changing implementation behavior.
- Return RFC 9457 problem details for API errors and avoid leaking internal data.
- Authentication must establish an identity and role; a present Authorization
  header alone is not authentication.
- Keep persistence, authentication, and model integrations behind replaceable
  boundaries so tests can use deterministic fakes.
- F-01 in `AI-LOG.md` records that the starter test command was a failing
  placeholder; every check must run a real tool and fail on a violation.

# Never

- Never expose model API keys or other secrets to the C++ sandbox.
- Never call a real model from a unit or contract test.
- Never edit tests, the evaluation data, or a label merely to make a check pass.
- Never treat any nonempty Authorization header as a verified user. F-02 in
  `AI-LOG.md` records that the starter auth plugin did exactly that.
- Never publish grades while required TA reviews remain unresolved.
