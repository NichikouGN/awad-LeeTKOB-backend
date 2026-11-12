# Appeals Module

## Purpose and scope

Own student appeals against one confirmed constraint deduction and the TA decision workflow. An appeal does not cover test verdicts or manual grade corrections (FAQ-04 and FAQ-13). The final product omits TA-entered non-AC scores.

## Rules

- A student may appeal only their own confirmed deduction after publication and through the inclusive instant `publishedAt + 7 days`.
- Each deduction may be appealed once. Request requires a non-empty explanation.
- Assigned TA accepts or rejects with a reason. Accepted appeal removes the deduction and updates the student's score; rejected appeal leaves score unchanged and cannot be reopened.
- A later TA correction is a separate audited adjustment, not reopening an appeal.

## Public API contracts

Create/get/decide routes are proposed in [appeal endpoints](../planning/api-contracts.md#6-appeal-endpoints) and require final review for ownership, timing, and errors before approval. The routes must not imply appeal rights for test results or manual scores.

## Internal interfaces and data

Expose create/read student appeal and resolve-assigned-class appeal capabilities. Call Reviews and Grades through its deduction/adjustment interface; never update grade tables directly. Own `appeals`; enforce unique appeal per deduction and retain immutable decision history. Audit events are written through the Audit interface.

## Acceptance criteria

- Another student's deduction, an unconfirmed deduction, or an unpublished grade cannot be appealed.
- A submission at exactly `publishedAt + 7 days` is eligible; a later receipt is rejected.
- Second appeal and reopening a rejected appeal are rejected.
- TA decision requires a reason. Acceptance changes only the relevant deduction/score and is applied once.
- Student can read their appeal status/reason but not another student's appeal.
- Every appeal creation and decision is auditable.
