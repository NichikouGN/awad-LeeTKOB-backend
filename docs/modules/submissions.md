# Submissions Module

## Purpose and scope

Own student source intake, receipt time, submission identity/status, selection of the counted submission, and the student-safe submission projection. Judging is asynchronous and is owned by the Judging module.

## Responsibilities

- Verify caller is a student enrolled in the lab's class and the lab accepts submissions.
- Reject source larger than 64 KB without creating a submission; use server receipt time and reject at/after the deadline.
- Persist submission and PostgreSQL outbox work atomically before returning acknowledgement; a dispatcher enqueues the stable job ID in BullMQ/Redis.
- Allow repeated submissions before deadline; each is judged. Count the latest accepted pre-deadline submission regardless of verdict.
- Return only the caller's own submission and safe overall/per-test verdicts; never tests, expected outputs, other students' source, or review proposals.

## Public API contracts

Proposed `POST /api/v1/labs/{labId}/submissions`, snapshot `GET /api/v1/submissions/{submissionId}`, and SSE `GET /api/v1/submissions/{submissionId}/events` are in [submission endpoints](../planning/api-contracts.md#4-submission-endpoints). The successful create response is asynchronous. Submission requests require an idempotency key scoped to student and lab; same key/source replays the original response, and same key/different source conflicts. The final endpoint contract still needs approval before implementation.

## Internal service interfaces

Expose separate operations for accepting a student submission, listing the authorized TA view, selecting the counted submission, and providing a judge-only source reference. A student-read projection must not expose the judge bundle. Call Classes and Labs interfaces for membership and schedule policy; write a PostgreSQL outbox row in the same transaction as the submission, then dispatch through the BullMQ adapter.

## Data

Own `submissions`; Judging owns job and test-result state. Store source in a protected database column or object store only after the storage decision. Store receipt time once. Define deterministic tie handling if timestamps can be equal.

## Acceptance criteria

- Oversize or late source creates no submission record and does not advance the counted submission.
- Accepted submissions have server timestamp and durable judge work before acknowledgement.
- Latest pre-deadline submission is counted even when its result is WA/TLE/CE; earlier Accepted work does not remain counted.
- Students can fetch only their own results; per-test verdicts may be shown, but input/output are never returned.
- Queue outage does not produce a success response for unrecorded work.
