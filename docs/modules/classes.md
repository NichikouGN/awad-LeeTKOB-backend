# Classes and Membership Module

## Purpose and scope

Own classes, TA assignments, student memberships, and invite-code lifecycle. Enforce which users belong to or staff each class. Course policy permits one TA to serve multiple classes, multiple TAs per class, and a student to join multiple classes (FAQ-01).

## Current implementation status

`src/modules/class/` implements the basic class setup flow: admin class
creation, paged class listing/detail, TA assignment, staff enrollment, and
student join by invitation code. Class creation returns the generated
six-digit code to the admin; one code is stored on the class row, with no
expiry or separate invitation table. Listings filter archived classes and
inactive TA/student links. Class detail checks admin access or current TA
assignment/student membership. TA assignment and enrollment validate target
role/status, are idempotent, and enrollment by TA checks class assignment.

Code rotation, assignment removal, membership removal, and class audit routes
remain unimplemented. See the current contract for the implemented route
shapes and the proposed API inventory for broader final-product behavior.

## Responsibilities

- Create classes and assign eligible TA accounts (admin action).
- Enroll an eligible student by supported staff action or invite code.
- Generate/rotate the current class invite code stored on the `classes` row; reveal it only to authorized staff and never log it.
- Provide ownership/membership query capabilities to Labs and Submissions.
- Record class/assignment/membership changes in audit history.

## Exclusions

Does not create labs, decide lab permissions beyond class membership/assignment, authenticate credentials, or expose general user administration unless an endpoint is approved.

## Public API contracts

Proposed endpoints are in [`planning/api-contracts.md`](../planning/api-contracts.md#2-admin-and-class-endpoints): create class, assign TA, enroll student, create/rotate invite, and join by invite. They remain proposals until individually ratified. Assignment, enrollment, and repeated join behavior must remain idempotent as described there; invalid invite responses must not disclose class data.

## Internal service interfaces

Expose focused capabilities such as `isAssignedTa({ userId, classId })`, `isStudentMember({ userId, classId })`, and `getClassForInvite(code)` to authorized callers. Do not expose a broad class repository or invite secrets. Submissions may ask whether a student belongs to the lab's class; Labs may ask whether a TA is assigned.

## Data and rules

Own `classes`, `class_tas`, and `class_students` (see [`db_design.md`](../database/db_design.md)). Membership joins are unique. The current schema stores one invitation code on each class row; rotation can replace that value, so a separate `invite_codes` table is not needed for the current policy. The proposed invite-code API contract adds a 30-day expiry, but the PA2/PA3 rubrics and FAQ do not require one. If that proposed behavior remains in scope, add an expiry field to `classes`; otherwise remove it from the approved contract. Enforce uniqueness, protect code generation/storage/disclosure, and rate-limit join attempts in the class service.

## Acceptance criteria

- Admin can create a class and assign multiple eligible TAs; repeated assignment creates no duplicate.
- An assigned TA can perform only supported class-level enrollment/invite actions for that class.
- Student join requires a verified student principal and a valid invite; repeating join is safe.
- Invalid/expired invite does not reveal class existence or private membership.
- Downstream callers can check membership/assignment through the interface without reading these tables.
