# LeeTKOB API Contracts — Proposed Product API

**Status:** detailed planning contract for team alignment. The approved PA2 publish contract is [`../contract/post-lab-publish.md`](../contract/post-lab-publish.md); the final-product publish contract is [`../contract/post-lab-publish-v2.md`](../contract/post-lab-publish-v2.md). Proposed endpoints below need review/approval as product contracts before implementation. Examples use illustrative IDs/timestamps and must be reflected in schemas and contract tests.

## 1. Global rules

### 1.1 Transport and identity

- Base path: `/api/v1`; HTTPS in deployed environments.
- JSON requests use `Content-Type: application/json`; JSON responses use `application/json; charset=utf-8` unless an error, which uses `application/problem+json`.
- Protected requests send `Authorization: Bearer <token>`. The server validates it and resolves user ID and role. Header presence alone is never authentication.
- IDs are positive base-10 integers. Times are UTC ISO-8601 with milliseconds, e.g. `2026-11-10T12:00:00.000Z`.
- List routes use opaque keyset cursors with a default page size of 50 and maximum of 100. Results include `nextCursor` or `null`; ordering is stable and includes an ID tie-breaker. Invalid cursors return `400 validation`.
- All paths are shown without a trailing slash. Unknown `/api/v1` path returns `404` problem details.

### 1.2 Error format

Every error uses RFC 9457 and has `Content-Type: application/problem+json`:

```json
{
  "type": "https://leetkob.example/problems/validation",
  "title": "Invalid request",
  "status": 400,
  "detail": "One or more request fields are invalid."
}
```

`type` is the stable client discriminator; `status` equals HTTP status. `detail` is one sentence and safe to expose. Never include stack traces, SQL, table names, file paths, credentials, hidden tests, or internal provider data. Validation may include `errors`:

```json
{
  "type": "https://leetkob.example/problems/validation",
  "title": "Invalid request",
  "status": 400,
  "detail": "One or more request fields are invalid.",
  "errors": [
    { "detail": "Must be a positive integer.", "pointer": "/classId" }
  ]
}
```

Error `type` suffixes used in this planning API: `authentication-required` (401, includes `WWW-Authenticate: Bearer`), `forbidden` (403), `not-found` (404), `validation` (400), `conflict` (409), `unprocessable` (422), `submission-closed` (409), `payload-too-large` (413), `rate-limited` (429), `internal` (500), and `unavailable` (503). Endpoint sections specify which apply. Do not assume unlisted errors without documenting them.

### 1.3 Shared resources

**User (self-safe projection)**

```json
{ "id": 17, "displayName": "A. Student", "role": "student" }
```

**Class**

```json
{ "id": 7, "name": "2609-AWAD-23/3", "createdAt": "2026-10-25T09:00:00.000Z" }
```

**Constraint**

```json
{ "id": "C1", "text": "Implement merge sort; do not call std::sort.", "deduction": 3 }
```

`deduction` is a number from 0.01 through 10.00 with at most two decimal places on the lab's 10-point scale. Constraint ID is unique within its lab.

**Lab summary**

```json
{
  "id": 41,
  "classId": 7,
  "title": "Sorting lab",
  "status": "scheduled",
  "opensAt": "2026-11-01T00:00:00.000Z",
  "deadlineAt": "2026-11-10T12:00:00.000Z",
  "updatedAt": "2026-10-25T09:00:00.000Z"
}
```

`status`: `scheduled`, `open`, `closed`, `published`. `scheduled`, `open`, and `closed` derive from server time and the schedule; `published` derives from the publication record. Labs are created with a schedule, editable only while scheduled, and have no delete operation in the initial product scope.

**Submission response (student-safe)**

```json
{
  "id": 82,
  "labId": 41,
  "status": "queued",
  "receivedAt": "2026-11-09T12:00:00.000Z",
  "overallVerdict": null,
  "tests": []
}
```

`status`: `queued`, `running`, `finished`, `failed`. While unfinished, verdict fields are null/empty. Finished example:

```json
{
  "id": 82,
  "labId": 41,
  "status": "finished",
  "receivedAt": "2026-11-09T12:00:00.000Z",
  "overallVerdict": "AC",
  "tests": [
    { "testNumber": 1, "verdict": "AC", "executionMs": 12 },
    { "testNumber": 2, "verdict": "AC", "executionMs": 15 }
  ]
}
```

Overall/test verdicts: `AC`, `WA`, `TLE`, `MLE`, `RE`, `CE`. Student responses never contain source for another user, test input/output, expected output, review verdicts, sampling status, or hidden TA notes.

## 2. Admin and class endpoints

### 2.1 Create class — `POST /api/v1/classes`

Admin only. Request:

```json
{ "name": "2609-AWAD-23/3" }
```

`name`: trimmed string, 1–120 characters.

- `201 Created`, `Location: /api/v1/classes/7`:

```json
{ "id": 7, "name": "2609-AWAD-23/3", "createdAt": "2026-10-25T09:00:00.000Z" }
```

- `400 validation`: invalid JSON or field; problem `errors` points to `/name`.
- `401 authentication-required`; `403 forbidden`; `500 internal`.

### 2.2 Assign TA — `PUT /api/v1/classes/{classId}/tas/{userId}`

Admin only; idempotent assignment. No body.

- `200 OK`:

```json
{ "classId": 7, "userId": 22, "role": "ta", "assignedAt": "2026-10-25T09:05:00.000Z" }
```

- `400 validation` for malformed IDs; `401`; `403`; `404 not-found` if class or user does not exist; `422 unprocessable` if target is not an eligible TA account; `500`.

### 2.3 Enroll student — `PUT /api/v1/classes/{classId}/students/{userId}`

Admin or TA assigned to class; idempotent. No body.

- `200 OK`:

```json
{ "classId": 7, "userId": 31, "role": "student", "joinedAt": "2026-10-25T09:10:00.000Z" }
```

- `400`, `401`, `403`, `404` for invalid IDs/class/user; `422` if target is not a student; `500`.

### 2.4 Create/rotate invite code — `POST /api/v1/classes/{classId}/invite-codes`

Admin or assigned TA. No body. Generate a random 128-bit code encoded as 32 hexadecimal characters, with a 30-day expiry. Only one active code per class; rotation immediately revokes the prior code. The code is a secret credential and is returned only at creation; never log it.

- `201 Created`:

```json
{ "classId": 7, "inviteCode": "A13F9C20D8B64571A2E04C9B7F3D6E85", "createdAt": "2026-10-25T09:15:00.000Z", "expiresAt": "2026-11-24T09:15:00.000Z" }
```

- `401`, `403`, `404`, `500`.

### 2.5 Join class — `POST /api/v1/classes/join`

Student only. Request:

```json
{ "inviteCode": "K7M4Q2X9" }
```

- `200 OK` (already member is safe retry):

```json
{ "class": { "id": 7, "name": "2609-AWAD-23/3", "createdAt": "2026-10-25T09:00:00.000Z" }, "joinedAt": "2026-10-25T09:20:00.000Z" }
```

- `400 validation`; `401`; `403` for non-student; `404 not-found` for invalid/expired code without revealing other class data; `500`.

## 3. Lab endpoints

### 3.1 Create lab — `POST /api/v1/classes/{classId}/labs`

TA assigned to class. Request:

```json
{
  "title": "Sorting lab",
  "statement": "Implement merge sort for the given input.",
  "opensAt": "2026-11-01T00:00:00.000Z",
  "deadlineAt": "2026-11-10T12:00:00.000Z",
  "constraints": [
    { "id": "C1", "text": "Implement merge sort; do not call std::sort.", "deduction": 3 }
  ],
  "limits": { "cpuSeconds": 1, "memoryMb": 256 },
  "tests": [
    { "input": "5\n5 4 3 2 1\n", "expectedOutput": "1 2 3 4 5\n" }
  ]
}
```

Rules: title 1–160 chars; statement 1–256 KiB; `opensAt < deadlineAt`; constraints array; each deduction is 0.01–10.00 with at most two decimal places; `cpuSeconds` 1–5, `memoryMb` 64–512; default 1 CPU second and 256 MB. Compile command/timeout, wall ratio, process and output caps are fixed per FAQ-05. Tests are TA-private, with at most 100 tests, 256 KiB combined input/output per test, and 10 MiB total test payload. These bounded defaults apply before the lab opens; grading inputs freeze at opening.

- `201 Created`, `Location: /api/v1/labs/41`:

```json
{
  "id": 41,
  "classId": 7,
  "title": "Sorting lab",
  "status": "scheduled",
  "opensAt": "2026-11-01T00:00:00.000Z",
  "deadlineAt": "2026-11-10T12:00:00.000Z",
  "constraints": [{ "id": "C1", "text": "Implement merge sort; do not call std::sort.", "deduction": 3 }],
  "createdAt": "2026-10-25T10:00:00.000Z",
  "updatedAt": "2026-10-25T10:00:00.000Z"
}
```

- `400 validation` with all invalid field pointers; `401`; `403`; `404` class not found/not assigned; `500`.

### 3.2 List labs — `GET /api/v1/classes/{classId}/labs`

Class member. No body. Uses global cursor pagination, with at most 100 items per page.

- `200 OK`:

```json
{ "items": [{ "id": 41, "classId": 7, "title": "Sorting lab", "status": "open", "opensAt": "2026-11-01T00:00:00.000Z", "deadlineAt": "2026-11-10T12:00:00.000Z", "updatedAt": "2026-10-25T10:00:00.000Z" }], "nextCursor": null }
```

- `400`; `401`; `403`; `404` class unknown; `500`.

### 3.3 Get lab — `GET /api/v1/labs/{labId}`

Student in owning class or assigned TA. Response excludes test cases for students; TA receives tests through authorized lab-management projection.

- `200 OK` student:

```json
{
  "id": 41, "classId": 7, "title": "Sorting lab",
  "statement": "Implement merge sort for the given input.", "status": "open",
  "opensAt": "2026-11-01T00:00:00.000Z", "deadlineAt": "2026-11-10T12:00:00.000Z",
  "constraints": [{ "id": "C1", "text": "Implement merge sort; do not call std::sort.", "deduction": 3 }],
  "reviewNotice": "Accepted code is checked against these constraints; identifying information and comments are removed before model review. A TA reviews decisions before grades are published."
}
```

- `400` invalid ID; `401`; `403`; `404` unknown or not in caller's class (same response to avoid disclosure); `500`.

### 3.4 Edit lab — `PATCH /api/v1/labs/{labId}`

Assigned TA. Partial JSON fields: `title`, `statement`, `opensAt`, `deadlineAt`, `constraints`, `limits`, `tests`. Example:

```json
{ "title": "Sorting lab — revised instructions", "constraints": [{ "id": "C1", "text": "Implement merge sort; do not call std::sort.", "deduction": 2 }] }
```

For this project's reduced scope, the lab statement, constraints/deductions, tests, and execution limits are frozen when the lab opens and cannot be edited afterward. This intentionally omits the post-open constraint edits permitted by FAQ-07; see the project scope decision in [`project-proposal.md`](project-proposal.md#9-project-scope-decisions). Assigned TAs may edit these fields only while the lab is scheduled. No lab delete route is included.

- `200 OK`: full updated Lab resource (same shape as 3.3) plus `updatedAt`.
- `400 validation`; `401`; `403`; `404`; `409 conflict` for published/illegal lifecycle edit; `500`.

## 4. Submission endpoints

### 4.1 Submit source — `POST /api/v1/labs/{labId}/submissions`

Student in class. `Content-Type: application/json`. Request:

```json
{ "source": "#include <iostream>\nint main() { return 0; }\n" }
```

Source is UTF-8 C++ source, max 65,536 bytes (64 KB). Server records receipt time before queueing. Accept only if open and receipt time is strictly before deadline. Unlimited valid resubmissions; latest receipt before deadline counts. Require an `Idempotency-Key` of 1–128 visible ASCII characters, scoped to the authenticated student and lab: retrying the same key with the same source returns the original submission response, while reusing the key with different source returns `409 conflict`. An intentional resubmission uses a new key.

- `202 Accepted`, `Location: /api/v1/submissions/82`:

```json
{ "id": 82, "labId": 41, "status": "queued", "receivedAt": "2026-11-09T12:00:00.000Z", "overallVerdict": null, "tests": [] }
```

- `400 validation`: malformed JSON/missing or empty source.
- `401 authentication-required`; `403 forbidden` for non-student/not class member; `404 not-found` lab hidden from caller; `409 submission-closed` if before open or at/after deadline; `409 conflict` if an idempotency key is reused with a different source; `413 payload-too-large` over 64 KB; `429 rate-limited` if protective request throttling is enabled; `503 unavailable` if PostgreSQL/outbox transaction cannot durably accept work; `500 internal`.

### 4.2 Get submission — `GET /api/v1/submissions/{submissionId}`

Owner student or TA assigned to lab class. No body.

- `200 OK`: student-safe Submission response from §1.3. TA may additionally receive `studentId`, source, and `isCounted`; never expose hidden test input/output via this endpoint.
- `401`; `403`; `404` unknown or not visible; `500`.

### 4.3 Stream submission updates — `GET /api/v1/submissions/{submissionId}/events`

The submission owner or a TA assigned to the lab's class may open an SSE stream. Authenticate and authorize before sending stream headers. The server emits a `submission.snapshot` event with the current student-safe projection, followed by `submission.updated` events whenever status or judge results change. Events contain the submission ID, a monotonically increasing version, status, and completed overall/per-test verdicts. They never contain source, tests, expected output, or internal diagnostics.

Send heartbeat comments every 15 seconds and close the stream when the authenticated session expires. Event replay is not required: after reconnect, the server emits a fresh snapshot before subsequent updates. Clients may also use `GET /api/v1/submissions/{submissionId}` as a snapshot without opening a stream.

- `200 OK`, `Content-Type: text/event-stream` while the stream is open.
- `401 authentication-required`; `403 forbidden`; `404 not-found` if the submission is unknown or not visible; `500 internal` before stream establishment.

## 5. Review and grade endpoints

### 5.1 List review queue — `GET /api/v1/labs/{labId}/review-queue`

Assigned TA. No body. Return pending review items first, then resolved items only if explicitly requested (`?state=pending|resolved|all`, default `pending`). Uses global cursor pagination, capped at 100 items per page.

- `200 OK`:

```json
{
  "items": [{
    "id": 501, "submissionId": 82, "studentId": 31, "constraintId": "C1",
    "constraintText": "Implement merge sort; do not call std::sort.", "deduction": 3,
    "proposal": "violation", "proposalReason": "A call to std::sort was found.",
    "evidence": [{ "line": 12, "text": "std::sort(a, a + n);" }],
    "source": "...full source for TA review...", "state": "pending", "decision": null
  }],
  "counts": { "pending": 1, "resolved": 4 },
  "nextCursor": null
}
```

For unsure, `proposal` is `unsure` and `proposalReason` uses safe reason codes such as `model-unsure`, `invalid-schema`, `evidence-mismatch`, `timeout`, `budget-exceeded`. Do not return API credentials/provider secrets. Sampling status should not be exposed to students.

- `400` invalid query; `401`; `403`; `404`; `500`.

### 5.2 Record final review decision — `PUT /api/v1/review-items/{reviewId}/decision`

Assigned TA. Request for pass:

```json
{ "verdict": "pass", "reason": "Reviewed source; constraint is satisfied." }
```

Request for violation:

```json
{ "verdict": "violation", "reason": "The implementation calls the prohibited library function.", "evidence": [{ "line": 12, "text": "std::sort(a, a + n);" }] }
```

`reason` required 1–2000 chars. `evidence` required for violation, at least one item; line is 1-based and text must match exact source line. Decision `unsure` is forbidden.

- `200 OK`:

```json
{ "id": 501, "state": "resolved", "decision": "violation", "reason": "The implementation calls the prohibited library function.", "evidence": [{ "line": 12, "text": "std::sort(a, a + n);" }], "decidedBy": 22, "decidedAt": "2026-11-10T13:00:00.000Z" }
```

- `400 validation`; `401`; `403`; `404`; `409 conflict` if lab is already published; `422 unprocessable` for missing/incorrect evidence; `500`.

### 5.3 Publish lab — `POST /api/v2/labs/{labId}/publish`

No body. **Use the exact evaluation order, errors, response, idempotency, and auth rules in [`../contract/post-lab-publish-v2.md`](../contract/post-lab-publish-v2.md).** Success is `200 OK` with `{ "labId": 41, "status": "published", "publishedAt": "2026-11-10T12:00:00.000Z" }`. This planning doc does not supersede that contract.

### 5.4 Get results — `GET /api/v1/labs/{labId}/results`

Assigned TA or enrolled student. Before publish: TA may inspect provisional totals; students receive `409 results-not-published` and no grades/review data. After publish, student receives only own result; TA receives the cursor-paginated class result list.

- `200 OK` student:

```json
{
  "labId": 41, "publishedAt": "2026-11-10T12:00:00.000Z",
  "result": {
    "submissionId": 82, "score": 7, "baseScore": 10,
    "deductions": [{ "constraintId": "C1", "constraintText": "Implement merge sort; do not call std::sort.", "amount": 3, "reason": "Confirmed by TA.", "evidence": [{ "line": 12, "text": "std::sort(a, a + n);" }] }]
  }
}
```

- TA result list:

```json
{ "labId": 41, "publishedAt": "2026-11-10T12:00:00.000Z", "items": [{ "studentId": 31, "submissionId": 82, "score": 7, "status": "published" }, { "studentId": 32, "submissionId": null, "score": 0, "status": "published" }], "nextCursor": null }
```

Every class student receives a grade. A student without a valid pre-deadline submission, including one enrolled after the deadline or after publication, receives zero and has no `submissionId` in the result projection.

- `401`; `403`; `404`; `409 results-not-published` for student before publish; `500`.

## 6. Appeal endpoints

### 6.1 Create appeal — `POST /api/v1/submissions/{submissionId}/deductions/{constraintId}/appeals`

Owner student, after publication, through the inclusive instant `publishedAt + 7 days`. Each deduction may be appealed once. Request:

```json
{ "explanation": "I implemented the required algorithm and believe this evidence was misinterpreted." }
```

Explanation 1–4000 chars.

- `201 Created`, `Location: /api/v1/appeals/901`:

```json
{ "id": 901, "submissionId": 82, "constraintId": "C1", "status": "pending", "explanation": "I implemented the required algorithm and believe this evidence was misinterpreted.", "createdAt": "2026-11-11T09:00:00.000Z", "decision": null }
```

- `400 validation`; `401`; `403`; `404` submission/deduction not owned or absent; `409 conflict` before publication, past 7-day window, or already appealed; `500`.

### 6.2 Get appeal — `GET /api/v1/appeals/{appealId}`

Appealing student or assigned TA. No body.

- `200 OK`:

```json
{ "id": 901, "submissionId": 82, "constraintId": "C1", "status": "accepted", "explanation": "...", "createdAt": "2026-11-11T09:00:00.000Z", "decision": { "verdict": "accepted", "reason": "The evidence does not establish a violation.", "decidedBy": 22, "decidedAt": "2026-11-12T10:00:00.000Z" }, "scoreBefore": 7, "scoreAfter": 10 }
```

Only participant or assigned TA can read; hide other students' data.
- `401`; `403`; `404`; `500`.

### 6.3 Decide appeal — `PUT /api/v1/appeals/{appealId}/decision`

Assigned TA. Request:

```json
{ "verdict": "accepted", "reason": "The submitted evidence does not demonstrate a violation." }
```

`verdict`: `accepted` or `rejected`; reason required 1–2000 chars. No reopen/redecision through this route.

- `200 OK`:

```json
{ "id": 901, "status": "accepted", "decision": { "verdict": "accepted", "reason": "The submitted evidence does not demonstrate a violation.", "decidedBy": 22, "decidedAt": "2026-11-12T10:00:00.000Z" }, "scoreBefore": 7, "scoreAfter": 10 }
```

- `400`; `401`; `403`; `404`; `409 conflict` if not pending; `422` invalid verdict/reason; `500`.

## 7. Contract decisions required before implementation

1. Identity provisioning/login/token issuance contract (the current starter has no production auth integration).
2. The SSE event schema needs its own approved submission contract before implementation; proposed behavior is in §4.3.
3. Runner-specific status mapping and selected Docker image/runtime must be documented after sandbox attack evidence is available.
4. Source encoding is UTF-8; preserve source bytes and line count through sanitization so model evidence maps to original lines. Final comment/identity redaction rules need implementation review.
5. Provider/model selection remains open; preserve the USD 1.00 per-lab cap and model-free CI requirement.

## 8. Versioning and implementation discipline

Within `/api/v1`, changes are additive. Removing/renaming fields, changing types/meaning, error type/status, validation rules, or lifecycle behavior requires a new version. Finalize each endpoint contract before coding it and add contract tests using deterministic fakes. Never call a real model in unit/contract tests. The lab-publish contract must be changed in its own commit before implementation behavior changes, per repository guidance.
