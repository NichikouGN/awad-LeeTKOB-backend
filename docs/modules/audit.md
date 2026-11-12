# Audit Module

## Purpose and scope

Provide append-only recording for consequential domain actions and a controlled query capability if an audit endpoint is later approved. Audit is not a general application log and must not become an alternate store for unrestricted student source or secrets.

## Required events

Record actor, timestamp, entity type/ID, action, and relevant safe before/after values for:

- user role/account state and class staffing/membership changes;
- lab and constraint revisions;
- TA review decisions and verdict changes;
- publication;
- appeal decisions and grade changes/manual corrections;
- administrative invite-code lifecycle where useful, without storing the code itself.

Workers use explicit system actor identities. Each event should carry request/correlation and workflow IDs where available.

## Internal interface and data

Expose a narrow `record(event)` capability to modules. Audit writes that are required for a successful decision should be in the same transaction or reliable outbox workflow as that decision. Own `audit_events`; application behavior is append-only. Do not expose direct table writes to other modules.

## Public API

No public audit-query route is currently approved. Administrative/TA audit visibility, filters, retention, and export permissions are open decisions and must be documented before a route is added.

## Acceptance criteria

- Each required event captures actor, time, entity, action, and before/after details appropriate to the operation.
- Required audit failure cannot silently leave an untraceable decision or score change.
- Invite codes, auth tokens, model keys, hidden tests, and unnecessary source are excluded from event payloads.
- Audit history preserves prior decisions/grades rather than overwriting the only record.
- Query access, if added, is separately authorized and scoped.
