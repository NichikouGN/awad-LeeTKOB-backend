# Labs and Constraints Module

## Purpose and scope

Own lab authoring, schedule and lifecycle policy, constraints/revisions, private tests, and per-lab execution limits. A lab belongs to exactly one class; only an assigned TA may manage it.

## Responsibilities

- Validate title, statement, schedule, constraint IDs/text/deductions, tests, and supported runner limits.
- Provide student-safe lab view from opening and TA management view with private tests.
- Allow free authoring edits before opening. For this project's reduced scope, freeze the statement, constraints/deductions, private tests, and execution limits once the lab opens. This deliberately omits FAQ-07's permitted post-open constraint edits; see the project scope decision in [`project-proposal.md`](../planning/project-proposal.md#9-project-scope-decisions).
- Provide current lab policy and authorized judge bundle capabilities to other modules without exposing private tests to student-facing callers.

## Public API contracts

Proposed create/list/get/edit operations appear under [lab endpoints](../planning/api-contracts.md#3-lab-endpoints). Status is scheduled/open/closed/published, with schedule-derived open and closed states; only scheduled labs are editable, and the initial product has no delete route. Student view must omit tests; TA view may include them only after ownership check. Any proposed route behavior must be reconciled with the final publish contract before implementation.

## Internal service interfaces

Expose separate capabilities rather than one broad service: student-safe lab projection, TA management operations, submission policy lookup, and judge-only test bundle. Caller identity/role and class ownership are explicit inputs or verified principal data. Consumers never query lab tables directly.

## Data

Own `labs`, `lab_constraints`, immutable `constraint_revisions`, and `test_cases`. See [`db_design.md`](../database/db_design.md). Store enough revision identity to associate every review proposal and final deduction with the rule version used.

## Acceptance criteria

- Only TA assigned to the owning class creates/edits the lab.
- Invalid time ordering or out-of-range runner settings are rejected with field-specific validation errors.
- Students see constraints/deductions and required review notice from opening, but never test content.
- Once open, grading inputs cannot be edited through the application. Pre-open edits are auditable.
- Published lab constraints cannot be changed; score correction uses an approved adjustment flow.
