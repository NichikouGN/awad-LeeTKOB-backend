# Assistant permissions

## Allowed

- Read repository files, inspect git history, and run local lint, format checks,
  type checks, and tests.
- Edit application code, documentation, configuration, and dependency manifests
  within this repository.
- Create a task branch and push it or open a pull request when the user asks for
  PA2 CI evidence.

## Ask first

- Add a new external service, send data to a hosted model, or incur provider
  charges.
- Change repository visibility, branch protection, secrets, or other remote
  repository settings.
- Add or rotate a credential, or change production deployment configuration.
- Merge a pull request or publish a release.

## Never

- Put credentials in source, tests, fixtures, logs, screenshots, or `.env.example`.
- Pass a model API key or any other secret to the C++ execution sandbox.
- Use student submissions or identities in tests or send them to a model without
  the project’s documented privacy controls.
- Rewrite tests, evaluation examples, or labels only to make CI pass.
