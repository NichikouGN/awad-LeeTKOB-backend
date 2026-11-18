# Labs and Constraints Module

## Purpose and scope

Own lab authoring, schedule and lifecycle policy, constraints/revisions, private tests, and per-lab execution limits. A lab belongs to exactly one class; only an assigned TA may manage it.

## Responsibilities

- Validate title, statement, schedule, constraint IDs/text/deductions, tests, and supported runner limits.
- Provide student-safe lab view from opening and TA management view with private tests.
- Allow free authoring edits before opening. For this project's reduced scope, freeze the statement, constraints/deductions, private tests, and execution limits once the lab opens. This deliberately omits FAQ-07's permitted post-open constraint edits; see the project scope decision in [`project-proposal.md`](../planning/project-proposal.md#9-project-scope-decisions).
- Provide current lab policy and authorized judge bundle capabilities to other modules without exposing private tests to student-facing callers.

## Public API contracts

The approved PA3 create/list/get behavior is in the [lab authoring contract](../contract/labs.md). Creation, class-scoped listing, and a test-free lab detail are implemented. Editing and deletion are not part of this contract. Lab status is schedule-derived as scheduled/open/closed; publication is a later lifecycle transition.

## Internal service interfaces

Expose separate capabilities rather than one broad service: student-safe lab projection, TA creation, submission policy lookup, and judge-only test bundle. Caller identity/role and class ownership are explicit inputs or verified principal data. Consumers never query lab tables directly.

## Data

Own `labs`, `lab_constraints`, immutable `constraint_revisions`, and `test_cases`. See [`db_design.md`](../database/db_design.md). Store enough revision identity to associate every review proposal and final deduction with the rule version used.

## Acceptance criteria

- Only TA assigned to the owning class creates/edits the lab.
- Invalid time ordering or out-of-range runner settings are rejected with field-specific validation errors.
- Students see constraints/deductions and required review notice from opening, but never test content.
- Once open, grading inputs cannot be edited through the application. Pre-open edits are auditable.
- Published lab constraints cannot be changed; score correction uses an approved adjustment flow.
