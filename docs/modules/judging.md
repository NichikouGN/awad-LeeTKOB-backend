# Judging Module

## Purpose and scope

Own durable judge-job lifecycle, worker claims, sandbox adapter invocation, verdict normalization, and per-test results. It does not accept HTTP submissions or run C++ in an Elysia handler.

The current PA2 implementation does not include this queue/worker workflow. The
final product uses BullMQ backed by Redis with PostgreSQL outbox dispatch. The
queue and worker consumer are not implemented in PA2; preserve the queue
adapter boundary and make PostgreSQL job state sufficient to reconstruct work
after Redis loss.

## Responsibilities

- Claim queued jobs with lease/state checks and retry transient infrastructure failures safely.
- Obtain source, test bundle, and runner settings through restricted module capabilities.
- Invoke the selected isolated C++ runner with FAQ-05 settings and mandatory security controls.
- Persist compile status, per-test verdicts, overall verdict, execution metadata, and safe failure category once.
- Normalize runner-specific statuses while preserving the documented limitations (for example, a runner may map memory exhaustion to RE rather than MLE).

## Public API

No direct client-facing worker API is specified. Students receive live status/result updates through the authorized SSE stream and can fetch a submission snapshot; authorized TA status/queue views are described in proposed endpoints. A worker transport, if needed for deployment, is operational and must not be exposed as a student API.

## Internal service interfaces

Expose queue/job claim, completion, and safe failure operations to the worker loop. Depend on a judge bundle capability that is unavailable to student routes. The sandbox adapter accepts explicit source/test/limit data and returns a normalized result; no model key or general application environment is passed through.

## Data

Own `judge_jobs` and `test_results`; Submissions owns submission identity/source and its public status projection. Keep raw compiler output and sandbox diagnostics private and bounded. Do not persist student-facing raw output unless the contract explicitly defines safe output behavior.

## Acceptance criteria

- Runner invocation has no network, root, host mounts, Docker socket, or secrets and enforces every required resource cap.
- Every test result is associated with the correct submission/test ordinal and duplicate worker delivery does not create duplicate final results.
- Accepted submissions are not lost on worker/API restart; terminal failure is distinguishable from a student verdict.
- Student projection exposes verdict and allowed execution time only, not test input/expected output or TA-private diagnostics.
- The worker never invokes a model and never publishes grades.
