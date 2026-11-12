# Module Specifications

The specifications below define module scope and in-process service boundaries. Each module exposes only the operations needed by its callers; its service implements those interfaces. Internal calls are direct function calls in one application, not HTTP requests. Public routes remain subject to [`../planning/api-contracts.md`](../planning/api-contracts.md) until approved as endpoint contracts.

| Module | Specification |
|---|---|
| Auth and identity | [auth.md](auth.md) |
| Classes and membership | [classes.md](classes.md) |
| Labs and constraints | [labs.md](labs.md) |
| Submissions | [submissions.md](submissions.md) |
| Judging | [judging.md](judging.md) |
| Constraint review | [constraint-review.md](constraint-review.md) |
| Reviews and grades | [reviews-grades.md](reviews-grades.md) |
| Appeals | [appeals.md](appeals.md) |
| Audit | [audit.md](audit.md) |

Acceptance criteria here are product-facing outcomes. Contract test details belong in each approved endpoint contract and test suite; these documents do not authorize changing tests or evaluation labels.
