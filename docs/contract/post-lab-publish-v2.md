# `POST /api/v2/labs/{labId}/publish` contract, version 2

This document is the client-facing contract for publishing one LeeTKOB lab.
The implementation and tests must follow it. If the contract changes, update it
in a separate commit before changing implementation or tests.

## 1. Conventions

- The endpoint is under `/api/v2`.
- Requests and successful responses use UTF-8 JSON. This endpoint has no request
  body; clients send an empty body.
- `labId` is a positive base-10 integer with no sign or leading zeroes.
- Timestamps are ISO 8601 UTC strings with millisecond precision.
- Clients decide what to do from the RFC 9457 problem `type`, not `title` or
  `detail`.
- A review is pending until a TA has recorded a final `pass` or `violation`
  decision. This includes `unsure` verdicts and the sampled `pass` verdicts in
  the review queue (FAQ-09 and FAQ-10).
- Grading is complete only after every valid pre-deadline submission has
  finished judging successfully, counted Accepted submissions have completed
  hard-rule and model review (where needed), and required review items have
  final TA decisions. An unfinished or failed judge job blocks publication and
  must be retried to a successful judge result.

## 2. Authentication and ownership

- The caller sends `Authorization: Bearer <token>`.
- The server authenticates the bearer token and resolves it to a user and role.
  A nonempty or malformed bearer value is not proof of identity.
- Only a `ta` may publish. Students and admins receive `403 forbidden`.
- The TA must be assigned to the class that owns the lab. If the lab does not
  exist or belongs to another class, return the same `404 lab-not-found` response
  so the endpoint does not disclose another class's labs (FAQ-01).
- A TA belonging to several classes may publish labs in any of those classes.

## 3. Errors

Every error response from this endpoint is an RFC 9457 problem details object
with `Content-Type: application/problem+json`:

```json
{
  "type": "https://leetkob.example/problems/reviews-pending",
  "title": "Reviews are still pending",
  "status": 409,
  "detail": "Resolve every review queue item before publishing."
}
```

| Type suffix | Status | Title | When |
|---|---:|---|---|
| `authentication-required` | 401 | Authentication required | Bearer credentials are missing, invalid, expired, or not accepted. Includes `WWW-Authenticate: Bearer`. |
| `forbidden` | 403 | Forbidden | The authenticated user is not a TA. |
| `lab-not-found` | 404 | Lab not found | The ID is invalid or no lab exists for this TA's classes. |
| `validation` | 400 | Invalid request | The request body is not empty. |
| `deadline-not-passed` | 409 | Submission deadline has not passed | The submission deadline is later than the current server time. |
| `grading-incomplete` | 409 | Grading is not complete | At least one valid submission is still being judged, has a failed judge job, or has not completed constraint review. |
| `reviews-pending` | 409 | Reviews are still pending | At least one review queue item has no TA decision. |
| `internal` | 500 | Internal error | An unexpected server failure occurred. `detail` is generic and never contains internals. |

All problem objects have `type`, `title`, `status`, and a one-sentence `detail`.
The `status` member equals the HTTP status. The server does not return stack
traces, SQL messages, table names, or filesystem paths.

## 4. Resource

The success body is a `PublishedLab`:

```json
{
  "labId": 41,
  "status": "published",
  "publishedAt": "2026-11-10T12:00:00.000Z"
}
```

| Field | Rule |
|---|---|
| `labId` | Positive integer identifying the lab. |
| `status` | Always `published` for this response. |
| `publishedAt` | UTC timestamp when the lab was first published. Replays retain the original timestamp. |

## 5. Endpoint

### `POST /api/v2/labs/{labId}/publish`

No request body is accepted or required. The caller must send a valid bearer
token as described in section 2.

The server evaluates these conditions in order:

1. Authenticate the caller; otherwise return `401 authentication-required`.
2. Require role `ta`; otherwise return `403 forbidden`.
3. Resolve the positive `labId` and verify class ownership; otherwise return
   `404 lab-not-found`.
4. Require an empty request body; otherwise return `400 validation`.
5. If already published, return the original successful response unchanged.
6. Require server time to be at or after the submission deadline; otherwise
   return `409 deadline-not-passed`.
7. Require successful judging for every valid pre-deadline submission and
   completed hard-rule/model review for each counted Accepted submission;
   otherwise return `409 grading-incomplete`.
8. Require zero pending review queue items; otherwise return `409 reviews-pending`.
9. Atomically verify the completion conditions, record publication once, and
   return `200` with the `PublishedLab` body. A concurrent state change must not
   allow publication against an incomplete grading pipeline.

Publishing is idempotent: repeating the request for a published lab returns
`200` with the same `labId`, `status`, and original `publishedAt`, and does not
publish it again. The first publication is the only one that changes state.
There is no unpublish operation (FAQ-12).

The server uses its clock for both the deadline comparison and `publishedAt`.
Equality counts as past the deadline. Publishing is only available after the
deadline, successful judging and constraint-review completion, and all required
TA decisions (FAQ-12). A model proposal is not a TA decision; the TA records a
final `pass` or `violation`.

## 6. Versioning

This version adds the complete grading-pipeline gate required by the final
product. The PA2 `/api/v1` contract remains documented separately for its
compatibility lifetime. Changes to this contract that alter fields, error
semantics, or publication rules require a later API version.

## References

- Class project brief, sections 3–4.
- FAQ-01 (class ownership), FAQ-09 and FAQ-10 (review decisions), FAQ-12
  (publishing): <https://github.com/tkob-team/LeeTKOB-FAQ/blob/main/FAQ.md>
