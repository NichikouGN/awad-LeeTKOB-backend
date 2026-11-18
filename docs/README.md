# LeeTKOB system documentation

This directory documents the LeeTKOB lab grading system. All product documentation is written in English. The documents describe one Bun/Elysia modular monolith; the TicketBox documents are a formatting and depth reference only.

## Authority and status

Use the brief for mandatory product requirements; the FAQ clarifies behavior the brief leaves open, and the brief wins if those two conflict. For a specific public endpoint, its approved endpoint contract is the source of truth for client-visible behavior. If that contract appears inconsistent with a mandatory product rule, resolve the discrepancy explicitly by revising the contract before changing implementation behavior; do not silently choose one interpretation. Planning and architecture documents describe intended design and cannot override either source.

The approved [`POST /api/v1/labs/{labId}/publish`](contract/post-lab-publish.md) contract documents the PA2 milestone behavior. The final-product contract is [`POST /api/v2/labs/{labId}/publish`](contract/post-lab-publish-v2.md), which adds the complete judging/review gate; preserve v1 for its compatibility lifetime. The other routes in [`planning/api-contracts.md`](planning/api-contracts.md) are proposed until approved as endpoint contracts. `IA#3_CONTRACT.md` and its rubric describe a separate individual assignment and are not LeeTKOB product requirements.

## Document map

| Document | Purpose |
|---|---|
| [Requirements specification](requirements/requirement_specification.md) | Scope, requirements, acceptance criteria, and traceability to existing FR/NFR IDs. |
| [Use cases](planning/use-cases.md) | Actor workflows and alternate outcomes. |
| [RBAC](requirements/rbac.md) | Role permissions, class ownership, and resource visibility. |
| [System design](architecture/system_design.md) | Runtime topology, major components, workflows, and technology decisions. |
| [Module boundaries](architecture/module_boundaries.md) | Module ownership, dependency rules, and internal service interfaces. |
| [Security and protection](architecture/security_and_protection.md) | Authentication, privacy, sandbox, model, and API protections. |
| [Operations](architecture/operations.md) | Queues, observability, recovery, capacity evidence, and deployment requirements. |
| [Database design](database/db_design.md) | Review of the current Drizzle schema against final-system workflows, including gaps to resolve before adopting it as final. |
| [Module specifications](modules/) | Scope, interfaces, API links, dependencies, and acceptance criteria by module. |
| [API contract inventory](planning/api-contracts.md) | Proposed public API surface and contract decisions still to resolve. |
| [Publish contract](contract/post-lab-publish.md) | Approved client contract for lab publication. |
| [Final publish contract](contract/post-lab-publish-v2.md) | Final-product publish gate requiring successful judging and completed review before publication. |
| [Lab authoring contract](contract/labs.md) | PA3 lab creation, discovery, visibility, and downstream policy capabilities. |
| [Basic auth, user, and class contract](contract/class-and-user-management.md) | Account lifecycle and the minimum class setup/membership routes implemented for PA3 preparation. |
| [Project proposal](planning/project-proposal.md) | Product summary, original FR/NFR identifiers, architecture choice, and open decisions. |

## Change discipline

For a public endpoint, update and review its endpoint contract in a separate commit before changing implementation behavior. Keep acceptance criteria tied to requirement IDs. If a brief or FAQ rule changes, update affected requirements, module specifications, database notes, and contracts together, while retaining the required contract-first commit order.

PostgreSQL, BullMQ/Redis, the transactional outbox, Docker-based judging, and SSE are selected for the final product design. Some integration choices remain open, including the identity provider, exact Docker runner profile, and model provider. The API inventory remains proposed until each endpoint has an approved contract.

## Milestone and implementation status

The PA2 and PA3 rubric PDFs at the repository root are milestone evaluation
criteria, not evidence that a feature is implemented. The current app composes
auth, user, class, and initial lab-authoring routes; see [system design](architecture/system_design.md)
for concrete route and behavior gaps. The final-system documents remain the
target architecture, with current implementation choices and deviations called
out where relevant. [`FAQ.md`](../FAQ.md) is the developer's product-decision
reference, not student-facing support content.
