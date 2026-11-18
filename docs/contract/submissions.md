# Student submission contract

This contract defines submission acceptance and student status lookup for
PA3. IDs are UUIDs. A student may submit only to a lab in a class where they
have active membership. The server derives the student identity from the
verified access token; request data never chooses the student.

## Shared behavior

Protected routes require a valid access JWT and re-check active account status
and current role. Errors use RFC 9457 `application/problem+json` with `type`,
`title`, `status`, and safe `detail`. Responses never expose SQL errors, stack
traces, source hashes, queue internals, private tests, or expected output.

Stable errors: `validation` (400), `authentication-required` (401),
`forbidden` (403), `not-found` (404), `conflict` (409),
`submission-closed` (409), `payload-too-large` (413), `unavailable` (503),
and `internal` (500).

Submission state is `queued`, `running`, `finished`, or `failed`. Test verdicts
are `AC`, `WA`, `TLE`, `MLE`, `RE`, or `CE`. Before judging completes,
`overallVerdict` is `null` and `tests` is an empty array. Student projections
never include code, test input, expected output, or constraint-review
proposals.

## `POST /labs/{labId}/submissions`

Student only, for an active member of the lab's class. Request JSON:

```json
{ "source": "#include <iostream>\nint main() { return 0; }\n" }
```

The `source` must be non-empty UTF-8 C++ source, at most 65,536 bytes. The
server records `receivedAt` before checking the submission window. The lab
must be open at that instant (`opensAt <= receivedAt < deadlineAt`). Oversized,
empty, malformed, or late submissions create no submission, judge job, or
outbox event.

`Idempotency-Key` is required and must contain 1–128 visible ASCII characters.
It is scoped to the authenticated student and lab. Repeating the same key and
same source returns the current representation of the original submission and
does not create additional work. Reusing a key with different source returns
`409 conflict`. An intentional resubmission uses a new key. Distinct valid
submissions are all judged; the latest pre-deadline submission is selected for
later grading, regardless of its verdict.

The submission row, judge job, and pending outbox event are committed
atomically before acknowledgement. Compilation is asynchronous and does not
run in the request handler. The outbox event key is stable for that submission,
so dispatch can be retried without creating another job.

`202 Accepted`, `Location: /submissions/{submissionId}`:

```json
{
  "submission": {
    "id": "64d0d19e-73e8-4d19-bae2-1d6c0f10f397",
    "labId": "64d0d19a-73e8-4d19-bae2-1d6c0f10f397",
    "status": "queued",
    "receivedAt": "2026-11-22T10:00:00.000Z",
    "overallVerdict": null,
    "tests": []
  }
}
```

Errors: `400 validation` for malformed JSON, missing/empty source, or invalid
idempotency key; `401 authentication-required`; `403 forbidden` for a
non-student role; `404 not-found` for an unknown lab or a lab outside the
student's active class membership; `409 submission-closed` before opening or
at/after the deadline; `409 conflict` for an idempotency key reused with
different source; `413 payload-too-large` over 65,536 UTF-8 bytes; `503
unavailable` if the database cannot durably commit all three records; `500
internal` for other unexpected failures.

## `GET /submissions/{submissionId}`

Student only, and only for the authenticated student's own submission. An
unknown submission and another student's submission both return `404`.

`200 OK`:

```json
{
  "submission": {
    "id": "64d0d19e-73e8-4d19-bae2-1d6c0f10f397",
    "labId": "64d0d19a-73e8-4d19-bae2-1d6c0f10f397",
    "status": "finished",
    "receivedAt": "2026-11-22T10:00:00.000Z",
    "overallVerdict": "AC",
    "tests": [
      { "testNumber": 1, "verdict": "AC", "executionMs": 12 }
    ]
  }
}
```

When the job is queued or running, verdict remains `null` and tests is empty.
When finished, the response includes completed per-test verdicts and execution
time when available. When judging fails, status is `failed`, verdict remains
`null`, and tests is empty; internal diagnostics are not returned.

Errors: `400 validation` for malformed ID; `401 authentication-required`;
`403 forbidden` for a non-student role; `404 not-found` for unknown or
non-owned submission; `500 internal`.

## Current implementation boundary

The submission service validates membership and lab schedule, accepts source,
and stores a durable judge job plus outbox event. A separate dispatcher and
worker, sandbox execution, and updates from running to a final verdict are
subsequent work. Until those are connected, accepted submissions remain
`queued`.
