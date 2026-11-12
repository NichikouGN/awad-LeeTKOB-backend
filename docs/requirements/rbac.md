# LeeTKOB Role-Based Access Control

## 1. Identity rules

Authentication resolves an immutable user ID and active role from credentials verified by the configured authentication adapter. Authorization uses that identity, role, and resource ownership. A present, non-empty, malformed, or expired `Authorization` header is not authentication. See FR-1, FR-2, FR-5 and NFR-2 in [`project-proposal.md`](../planning/project-proposal.md).

## 2. Permission matrix

| Action | Student | TA | Admin | Ownership constraint |
|---|---:|---:|---:|---|
| Create class | — | — | Yes | Admin account. |
| Assign TA to class | — | — | Yes | Target must be eligible TA. |
| Enroll student | — | Assigned TA or admin | Yes | Class in TA's assignment for TA action; target must be student. |
| Create/rotate invite code | — | Assigned TA or admin | Yes | Class in TA's assignment for TA action. |
| Join by invite code | Yes | — | — | Caller must resolve to student; invalid/expired code reveals no class data. |
| Create/edit lab | — | Assigned TA | — | Lab's class is assigned to caller; lifecycle rules apply. |
| Read student lab view | Enrolled class | Assigned TA (management view) | No general content access implied | Student membership or TA assignment; unknown and unauthorized lab IDs are safely concealed where specified. |
| Submit source/read own submission | Own | — | — | Submission student ID matches caller; lab class membership required. |
| Read submissions/review queue | — | Assigned TA | — | Lab belongs to a class assigned to TA. |
| Decide review/publish | — | Assigned TA | — | Publish role/ownership behavior is fixed by the approved publish contract. |
| Read published result | Own result only | Assigned TA's class | Not implied | Student sees own result only and only after publication. |
| Create/read appeal | Own deduction | Assigned TA resolves | Not implied | Appeal concerns one confirmed deduction in caller's own published submission. |
| Audit query | Not generally available | Scoped operational access only if specified | Administrative access only if specified | No public audit API is currently approved. |

This matrix consolidates FAQ-01 and the approved publish contract. Rows marked “not implied” are not permission grants; add an operation only through an approved endpoint contract.

## 3. Denial and disclosure rules

- Check authenticated identity and role before invoking module operations.
- Check class ownership at the domain-service boundary, not only in the route handler.
- For resources whose existence is sensitive, return the same not-found response for unknown and out-of-scope identifiers, as specified by the relevant contract. The publish contract requires this for labs outside the TA's classes.
- Never use caller-supplied user IDs as the identity for student-owned operations. Derive the student ID from authenticated context.
- An administrator does not implicitly gain TA abilities. In particular, the approved publish endpoint returns `403 forbidden` to admins.
- Worker identities are service actors, not browser roles. Restrict their operations to job claim/result persistence and review tasks; they cannot publish grades.

## 4. Scope checks by resource

| Resource | Required check |
|---|---|
| Class | Admin privilege or membership/assignment appropriate to the operation. |
| Lab | Student membership for student view; TA assignment for TA view/mutation. |
| Submission | Student owns it for student reads; TA assignment to its lab's class for TA reads. |
| Test case | TA management permission only; never include in student projection. |
| Review item/evidence | Assigned TA of owning class; student cannot access proposal or pending decision. |
| Published grade/deduction | Student owns submission and lab is published; TA is assigned to owning class. |
| Appeal | Student owns deduction to create/read; assigned TA resolves. |

## 5. Acceptance criteria

- Every protected route rejects missing, invalid, and unverified credentials with its contract-defined 401 problem.
- Student A cannot access Student B's submission, grade, or appeal, even by guessing an ID.
- TA A cannot access another class's labs, source, review queue, decisions, appeals, or results.
- A student cannot obtain test data or constraint proposals before publication.
- A valid role without resource ownership does not pass authorization.
- Authorization tests use deterministic authenticated identities; tests never treat a non-empty header as verified identity.
