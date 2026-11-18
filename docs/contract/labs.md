# Lab authoring and discovery contract

This contract defines the PA3 lab setup surface. IDs are UUIDs and roles use
the database values `ADMIN`, `TA`, and `STU`. A lab belongs to exactly one
class. Only an active TA assigned to that class may create or manage its labs.
Students who are active members of the class may read lab instructions and
constraints, but never private tests.

## Shared behavior

Protected routes require a valid access JWT and re-check the account's active
status and current role. Class and lab IDs must be UUIDs. A resource that does
not exist or is outside the caller's class scope returns the same `404` shape.
Errors use RFC 9457 `application/problem+json` with `type`, `title`, `status`,
and safe `detail`; unexpected failures do not expose internal data.

Stable errors used by these endpoints are `validation` (400),
`authentication-required` (401), `forbidden` (403), `not-found` (404),
`conflict` (409), `unprocessable` (422), and `internal` (500).

Times are UTC ISO-8601 strings. A lab is `scheduled` before `opensAt`, `open`
from `opensAt` until `deadlineAt`, and `closed` at or after `deadlineAt`.
Publication is a later lifecycle transition and is not exposed by this
contract.

Constraints have a lab-local ID, text, and deduction on a 10-point scale.
Deduction is between 0.01 and 10.00 inclusive, with at most two decimal
places. Tests are private to assigned TAs. CPU limit is 1–5 seconds and memory
limit is 64–512 MB; defaults are 1 second and 256 MB. Other runner limits and
the compile command are fixed by FAQ-05.

## `POST /classes/{classId}/labs`

Create a lab in the given class. Caller must be an active TA assigned to that
class. The class ID must identify a non-archived class. The create operation is
not idempotent; retrying it creates another lab.

Request JSON:

```json
{
  "title": "Sorting lab",
  "statement": "Implement merge sort for the given input.",
  "opensAt": "2026-11-20T00:00:00.000Z",
  "deadlineAt": "2026-11-25T12:00:00.000Z",
  "constraints": [
    { "id": "C1", "text": "Implement merge sort.", "deduction": 3 }
  ],
  "limits": { "cpuSeconds": 1, "memoryMb": 256 },
  "tests": [
    { "input": "3\n3 1 2\n", "expectedOutput": "1 2 3\n" }
  ]
}
```

Rules:

- `title` is trimmed and 1–160 characters.
- `statement` is non-empty and at most 256 KiB in UTF-8.
- `opensAt` must be earlier than `deadlineAt`.
- `constraints` contains 1–100 entries. Each ID is unique within the lab,
  1–40 characters; text is non-empty and at most 8 KiB.
- `tests` contains 1–100 entries. Each input and expected output is UTF-8,
  combined size at most 256 KiB per test and 10 MiB for the complete test set.
- Limits are optional; omitted fields receive the defaults above.
- Creation stores the initial constraint revision and private tests atomically.

`201 Created`, with `Location: /labs/{labId}`:

```json
{
  "lab": {
    "labId": "64d0d19e-73e8-4d19-bae2-1d6c0f10f397",
    "classId": "64d0d19a-73e8-4d19-bae2-1d6c0f10f397",
    "title": "Sorting lab",
    "statement": "Implement merge sort for the given input.",
    "status": "scheduled",
    "opensAt": "2026-11-20T00:00:00.000Z",
    "deadlineAt": "2026-11-25T12:00:00.000Z",
    "constraints": [
      { "id": "C1", "text": "Implement merge sort.", "deduction": 3 }
    ],
    "limits": { "cpuSeconds": 1, "memoryMb": 256 },
    "createdAt": "2026-11-18T10:00:00.000Z",
    "updatedAt": "2026-11-18T10:00:00.000Z"
  }
}
```

Errors: `400 validation` with field pointers for invalid input; `401`;
`403 forbidden` when the caller is not a TA; `404 not-found` for a missing
class or a class not assigned to the caller; `422 unprocessable` for a
semantically invalid lab (including invalid time ordering or aggregate test
limits); `500 internal`.

## `GET /classes/{classId}/labs`

List labs for a class. The class must be visible to the caller: an assigned TA
or an enrolled student. Admins may list any non-archived class. Results are
ordered by `createdAt` descending, then `labId` descending. `page` defaults
to 1; `limit` defaults to 20 and has a maximum of 100.

`200 OK`:

```json
{
  "labs": [
    {
      "labId": "64d0d19e-73e8-4d19-bae2-1d6c0f10f397",
      "classId": "64d0d19a-73e8-4d19-bae2-1d6c0f10f397",
      "title": "Sorting lab",
      "status": "open",
      "opensAt": "2026-11-20T00:00:00.000Z",
      "deadlineAt": "2026-11-25T12:00:00.000Z",
      "updatedAt": "2026-11-18T10:00:00.000Z"
    }
  ],
  "page": 1,
  "limit": 20
}
```

Errors: `400`, `401`, `404` for a missing or invisible class, `500`.

## `GET /labs/{labId}`

Read a lab visible to the caller: an assigned TA, an enrolled student, or an
admin. The response includes statement, constraints, schedule, and limits.
Private tests are omitted for every caller on this route. A separate
judge-only service capability returns tests only to trusted backend workers;
it is not an HTTP endpoint.

`200 OK`:

```json
{
  "lab": {
    "labId": "64d0d19e-73e8-4d19-bae2-1d6c0f10f397",
    "classId": "64d0d19a-73e8-4d19-bae2-1d6c0f10f397",
    "title": "Sorting lab",
    "statement": "Implement merge sort for the given input.",
    "status": "open",
    "opensAt": "2026-11-20T00:00:00.000Z",
    "deadlineAt": "2026-11-25T12:00:00.000Z",
    "constraints": [
      { "id": "C1", "text": "Implement merge sort.", "deduction": 3 }
    ],
    "limits": { "cpuSeconds": 1, "memoryMb": 256 },
    "createdAt": "2026-11-18T10:00:00.000Z",
    "updatedAt": "2026-11-18T10:00:00.000Z"
  }
}
```

Errors: `400` for malformed ID; `401`; `404` for unknown or invisible lab;
`500`.

## Lab service capabilities for downstream modules

The lab module exposes in-process capabilities, not HTTP calls:

- A submission policy lookup returns lab ID, class ID, `opensAt`,
  `deadlineAt`, and current schedule status. The submissions module remains
  responsible for checking class membership and server receipt time.
- A judge bundle lookup returns statement, execution limits, ordered private
  tests, and active constraints. Only trusted worker orchestration may call it;
  HTTP student projections never include test data.

Labs are immutable after creation for this PA3 slice. Editing, deletion, and
post-open constraint revisions require a later contract change.
