# Constraint Review Module

## Purpose and scope

Own the deterministic-first review pipeline and advisory model integration for the counted Accepted submission. It creates proposals and review-queue candidates; it never makes final grading decisions.

## Responsibilities

1. Run supported syntax-aware hard rules first; do not invoke the model when a hard rule decides the constraint.
2. Process only the latest pre-deadline submission after the lab deadline for final review. Early review is allowed only as provisional work; queue/grade state uses the final counted submission (FAQ-02).
3. Build minimal model input: lab statement, declared constraint, and source stripped of comments and student name/ID.
4. Enforce structured output, allowed verdicts, timeouts, exact line correspondence, and per-lab spend cap (USD 1.00 or lower selected limit).
5. Turn model unsure, malformed output, mismatched evidence, timeout, provider failure, or budget exhaustion into `unsure` with reason for TA.
6. Select every violation and unsure plus random 10% of pass results rounded up; include at least one pass when any pass exists.

## Internal interface and external provider

Expose a review request/result capability to worker orchestration and a queue-item query/update capability to Reviews and Grades. The model adapter is replaceable and accepts only sanitized DTOs; it has no persistence or grade-writing access. Record usage/cost without recording secrets or unnecessary full source.

## Data

Own `review_runs` and `review_items`; final TA decision records are owned by Reviews and Grades. Associate each proposal with submission ID, the constraint revision frozen when the lab opened, method (`hard_rule` or `model`), proposed verdict, evidence, and safe uncertainty reason. Since this project does not permit post-open grading-input changes, the counted submission's review uses the fixed opening revision.

## Public API

Review queue and decision endpoints are proposed in [review and grade endpoints](../planning/api-contracts.md#5-review-and-grade-endpoints). They remain subject to approval; student APIs must not expose these proposals.

## Acceptance criteria

- Non-Accepted or non-counted submissions do not produce final review items.
- Hard-rule decisions do not call the model.
- De-identification and comment removal happen before adapter invocation; model credentials remain outside sandbox.
- Every accepted model evidence line exactly matches the submitted code line under the selected line-numbering convention.
- Invalid/uncertain/provider-failure/budget-exhausted cases become unsure, not violations or deductions.
- Sampling is random, auditable, and meets the FAQ minimum/rounding rule; sampling status is hidden from students.
- CI evaluation is deterministic/model-free and does not call this production adapter.
