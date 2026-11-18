# Basic class and user management contract

This contract defines the minimum account discovery and class membership flow
for the current Bun/Elysia implementation. IDs are UUIDs and roles use the
current database values `ADMIN`, `TA`, and `STU`. Invitation codes are stored
on the class row, returned to staff when the class is created, and do not
expire in this simplified scope. No separate invitation-code table is used.

## Shared error format

Errors use RFC 9457 `application/problem+json` with `type`, `title`, `status`,
and safe `detail`. Responses must not contain SQL errors, stack traces, or
credentials. Stable types used here are `validation` (400),
`authentication-required` (401), `forbidden` (403), `not-found` (404),
`conflict` (409), and `internal` (500).

All protected routes require a valid access JWT. The server verifies the token
and confirms that its user still exists, is `ACTIVE`, and has the role in the
token. Disabled accounts and tokens with a stale role return `401`. The server
derives the actor ID and role from this verified state; request fields never
select the actor.

## Existing account routes

These routes are part of the same minimum account/class setup surface. Signup
is self-service and always creates a `STU`; an admin promotes accounts to
`TA` through the role route below. The first admin account is provisioned by
deployment/seed configuration.

- `POST /auth/signup` accepts `{ "email", "password", "displayName" }` and
  creates a student account. Email is trimmed and lowercased before lookup and
  storage. Returns `201` with a success message. Duplicate email returns
  `409`.
- `POST /auth/login` accepts `{ "email", "password" }`; returns access and
  refresh tokens plus the safe user projection. Email is trimmed and
  lowercased before lookup. Invalid credentials return `401`; disabled
  accounts return `403`.
- `GET /auth/refresh` requires a valid refresh JWT and returns a new access
  token. Invalid or expired refresh credentials return `401`.
- `GET /profile` returns the caller's safe profile. It never returns a
  password hash.
- `PATCH /users/{userId}/edit` updates only the authenticated user's display
  name. A caller cannot edit another user's profile; mismatch returns `403`.
- `PATCH /users/{userId}/role` is admin-only, cannot change the admin's own
  role, and accepts `TA` or `STU`.
- `PATCH /users/{userId}/status` is admin-only and cannot disable the current
  admin account. It accepts `ACTIVE` or `DISABLED`.

These routes use the shared RFC 9457 error format above. All user-facing
projections omit password hashes and authentication secrets.

## `GET /users`

Admin only. Returns a paginated user list so an administrator can promote a
registered student to TA and assign that account to a class.

Query parameters: `page` (one-based, default 1) and `limit` (default 20,
maximum 100). Results are ordered by user ID ascending.

`200 OK`:

```json
{
  "success": true,
  "users": [
    {
      "userId": "64d0d19c-73e8-4d19-bae2-1d6c0f10f397",
      "email": "ta@example.edu",
      "displayName": "A. TA",
      "role": "TA",
      "status": "ACTIVE"
    }
  ],
  "page": 1,
  "limit": 20
}
```

Password hashes are never returned. Errors: `400`, `401`, `403`, `500`.

## `GET /classes`

Any active account. Admins see all non-archived classes; TAs see classes with
their active assignment; students see classes with their active membership.
Results use `page` and `limit` (default 1 and 20, maximum 100), ordered by
class ID ascending. Empty results return an empty array.

`200 OK`: `{ "success": true, "classes": [], "page": 1, "limit": 20 }`.

Errors: `400`, `401`, `500`.

## `GET /classes/{classId}`

An admin may read any class. A TA must have an active assignment; a student
must have an active membership. Other callers receive `404` to avoid disclosing
class existence. `classId` must be a UUID.

`200 OK`:

```json
{
  "success": true,
  "class": {
    "classId": "64d0d19c-73e8-4d19-bae2-1d6c0f10f397",
    "className": "Intro to Programming"
  }
}
```

Invitation codes are not included in this response. Errors: `400`, `401`,
`404`, `500`.

## `POST /classes`

Admin only. Request: `{ "className": "Intro to Programming" }`.
`className` is trimmed and must contain 1–120 characters. The service creates
the class and a unique six-digit invitation code. If a code collision occurs,
the service generates another code before inserting the class.

`201 Created`:

```json
{
  "success": true,
  "class": {
    "classId": "64d0d19c-73e8-4d19-bae2-1d6c0f10f397",
    "className": "Intro to Programming",
    "invitationCode": "384201"
  }
}
```

Only the create response reveals the code to the admin. Errors: `400`, `401`,
`403`, `500`.

## `PUT /classes/{classId}/tas/{userId}`

Admin only. Both IDs are UUIDs. The target account must exist, be active, and
have role `TA`; otherwise return `404` for a missing resource or `422` for an
ineligible target. Repeating an active assignment is safe and does not create
a duplicate.

`200 OK`:

```json
{
  "success": true,
  "assignment": {
    "classId": "64d0d19c-73e8-4d19-bae2-1d6c0f10f397",
    "userId": "9b7bdf70-9740-48a1-a7bb-0875a9103a73",
    "assignedAt": "2026-11-18T10:00:00.000Z"
  }
}
```

Errors: `400`, `401`, `403`, `404`, `422`, `500`.

## `PUT /classes/{classId}/students/{userId}`

Admin or TA actively assigned to the class. The target account must exist, be
active, and have role `STU`; otherwise return `404` or `422`. Repeating an
active enrollment is safe and does not create a duplicate.

`200 OK`:

```json
{
  "success": true,
  "membership": {
    "classId": "64d0d19c-73e8-4d19-bae2-1d6c0f10f397",
    "userId": "48f15cb2-01b2-47a0-bec0-127b101c8943",
    "joinedAt": "2026-11-18T10:00:00.000Z"
  }
}
```

Errors: `400`, `401`, `403`, `404`, `422`, `500`.

## `POST /classes/join`

Student only. Request: `{ "invitationCode": "384201" }`. The server finds the
class by its current code and adds the authenticated student. Joining a class
the student already belongs to is safe and returns `200`. No expiration or
rotation endpoint is included in this basic scope; an admin may share the code
from the class creation response.

`200 OK`:

```json
{
  "success": true,
  "class": {
    "classId": "64d0d19c-73e8-4d19-bae2-1d6c0f10f397",
    "className": "Intro to Programming"
  }
}
```

An invalid code returns `404` without revealing class data. Errors: `400`,
`401`, `403`, `404`, `500`.
