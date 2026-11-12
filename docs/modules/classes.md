# Classes and Membership Module

## Purpose and scope

Own classes, TA assignments, student memberships, and invite-code lifecycle. Enforce which users belong to or staff each class. Course policy permits one TA to serve multiple classes, multiple TAs per class, and a student to join multiple classes (FAQ-01).

## Responsibilities

- Create classes and assign eligible TA accounts (admin action).
- Enroll an eligible student by supported staff action or invite code.
- Generate/rotate class invite codes; return plaintext only on creation and never log it.
- Provide ownership/membership query capabilities to Labs and Submissions.
- Record class/assignment/membership changes in audit history.

## Exclusions

Does not create labs, decide lab permissions beyond class membership/assignment, authenticate credentials, or expose general user administration unless an endpoint is approved.

## Public API contracts

Proposed endpoints are in [`planning/api-contracts.md`](../planning/api-contracts.md#2-admin-and-class-endpoints): create class, assign TA, enroll student, create/rotate invite, and join by invite. They remain proposals until individually ratified. Assignment, enrollment, and repeated join behavior must remain idempotent as described there; invalid invite responses must not disclose class data.

## Internal service interfaces

Expose focused capabilities such as `isAssignedTa({ userId, classId })`, `isStudentMember({ userId, classId })`, and `getClassForInvite(code)` to authorized callers. Do not expose a broad class repository or invite secrets. Submissions may ask whether a student belongs to the lab's class; Labs may ask whether a TA is assigned.

## Data and rules

Own `classes`, `class_tas`, `class_students`, and `invite_codes` (see [`db_design.md`](../database/db_design.md)). Membership joins are unique. Invite codes are high-entropy secrets stored as keyed hashes, expire after 30 days, and are returned only at creation. Only one invite is active per class; rotating it revokes the prior code immediately.

## Acceptance criteria

- Admin can create a class and assign multiple eligible TAs; repeated assignment creates no duplicate.
- An assigned TA can perform only supported class-level enrollment/invite actions for that class.
- Student join requires a verified student principal and a valid invite; repeating join is safe.
- Invalid/expired invite does not reveal class existence or private membership.
- Downstream callers can check membership/assignment through the interface without reading these tables.
