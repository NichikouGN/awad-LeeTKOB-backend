# Module Boundaries and Internal Interfaces

## 1. Purpose

This document defines in-process boundaries for the modular monolith. Public HTTP endpoints are documented separately in [`planning/api-contracts.md`](../planning/api-contracts.md) and approved endpoint contracts. An internal module interface is not an HTTP API and does not create a microservice boundary.

## 2. Required dependency rules

1. A module owns its domain rules and write access to its data.
2. A consumer imports a small `contract.ts` (or equivalent) interface and calls the provider's service implementation directly.
3. The consumer must not import the provider's repository, ORM/table schema, route plugin, or private model types.
4. Share primitives only when they are genuinely cross-cutting (IDs, clock, Result/error vocabulary); do not create a common module that accumulates business rules.
5. Avoid cyclic dependencies. If two modules need each other, extract the shared policy into an owning module or make one side call a workflow coordinator.
6. Calls are synchronous function calls unless an operation is explicitly durable/asynchronous. Do not hide network or queue behavior inside an ordinary service call.
7. Pass explicit values, not Elysia context, HTTP Request, headers, or cookies.
8. A service interface returns domain data/outcomes. The controller maps these to the endpoint's exact HTTP status and RFC 9457 problem contract.

## 3. Interface shape

Illustrative TypeScript shape; names are not finalized API commitments:

```ts
export interface LabQueries {
  getSubmissionPolicy(input: { labId: LabId; studentId: UserId }): Promise<SubmissionPolicy>;
  getJudgeBundle(input: { submissionId: SubmissionId }): Promise<JudgeBundle>;
}

export class LabService implements LabQueries {
  // Domain rules and owned repositories remain inside the Labs module.
}
```

Keep interfaces role-appropriate and minimal. Avoid a broad `LabService` exposing every operation to every caller. For example, student routes should not receive a method returning private test cases; only the judge worker's capability should expose the judge bundle.

## 4. Dependency direction

| Caller | Provider interface | Purpose |
|---|---|---|
| Submissions | Classes membership query; Labs submission policy | Confirm ownership, membership and window before accepting source. |
| Judging worker | Submissions job/result operations; Labs judge bundle capability | Claim work, retrieve private judge input, record normalized outcome. |
| Constraint Review | Labs current constraint revision; Submissions counted submission/source; Review queue port | Review the correct submission/revision and enqueue proposals. |
| Reviews and Grades | Review proposal/queue operations; Labs constraint values; Submissions counted status | Finalize TA outcomes and calculate scores. |
| Appeals | Published grade/deduction operations; Audit | Validate appeal target and update score upon accepted appeal. |
| HTTP controllers | One or more module public service interfaces | Translate validated transport input and principal into service calls. |

The table describes allowed collaboration, not permission to access backing tables. If consistency requires multiple writes, define the transaction owner and compensation/retry behavior in the relevant workflow.

## 5. Errors, transactions, and composition

- Domain failures use stable typed outcomes or domain errors, not raw SQL errors or provider exceptions.
- The API adapter maps outcomes to contract-defined statuses and safe RFC 9457 details. Internal identifiers may be retained for logs/traces but never returned as implementation data.
- Each service receives replaceable dependencies explicitly at the composition root. Singleton database/queue clients are created once; per-request identity is passed as data.
- Use transaction boundaries for invariants such as submission plus durable job creation, final review decision plus audit, and first publication plus visibility state. Exact SQL mechanics depend on the selected persistence adapter.
- Job handlers are idempotent by job identity and expected state. Do not rely on “exactly once” delivery from an unspecified queue.

## 6. Acceptance criteria

- A code review can identify each module's owned data and public service interface.
- Cross-module imports do not reach into another module's persistence implementation.
- Every interface has explicit input/output types and a single responsibility.
- Service unit tests instantiate the service with deterministic fakes without an Elysia app or real database/provider.
- API contract tests exercise HTTP mapping through `app.handle()` and do not invoke real model calls.
