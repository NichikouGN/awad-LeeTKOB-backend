# Auth and Identity Module

## Purpose and scope

Authenticate credentials through a replaceable adapter and provide a verified principal (user ID, role, active status) to controllers and services. The module does not infer identity from headers and does not implement class ownership rules.

## Owned data and rules

Own the user identity projection and account status/role linkage; credential verification may be delegated to an external identity provider. Do not store plaintext passwords or tokens. Role changes and account-state changes must be auditable. A role is server-derived, never accepted from request bodies for authorization.

## Internal interface

Expose a narrow authentication capability such as `authenticateBearer(token): Promise<Principal | AuthenticationFailure>` and a minimal principal projection. The HTTP plugin extracts the bearer token and calls the adapter/service; module services receive the principal or explicit user ID/role values. No module imports Elysia context types.

## Public API

Login, account provisioning, token issuance, and account-administration endpoints are not finalized in the proposed API inventory. Resolve identity provisioning before adding those routes. Protected resource APIs use bearer authentication; see global conventions in [`planning/api-contracts.md`](../planning/api-contracts.md).

## Dependencies

All protected HTTP modules depend on the principal capability. Auth does not depend on business modules. The selected identity provider is an adapter.

## Acceptance criteria

- Missing, invalid, expired, or malformed credentials fail closed.
- A nonempty Authorization header alone never produces a principal.
- Principal role and ID come from verified server-side state.
- Tests inject deterministic authenticators; no production identity provider is called in unit/contract tests.
- Authentication failures map to safe RFC 9457 responses and do not reveal whether a credential/account exists beyond the contract.
