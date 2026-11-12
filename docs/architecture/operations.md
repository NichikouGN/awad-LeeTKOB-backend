# Operations and Runtime Requirements

## 1. Process model

The target application is a modular monolith exposing HTTP/SSE and bounded workers. PostgreSQL stores domain state and the transactional outbox; an outbox dispatcher publishes jobs to BullMQ on Redis. API intake, C++ execution, and model calls are separate workload stages. The current PA2 project does not yet include the outbox dispatcher, BullMQ/Redis integration, SSE endpoint, or worker consumers. Workers may initially run alongside the API, but request handlers must not compile code or wait for judging/model review.

## 2. Submission and review jobs

- Persist the submission and outbox job in the same PostgreSQL transaction before acknowledging a submission. A dispatcher publishes committed outbox records to BullMQ and marks them delivered; if Redis is unavailable or loses data, replay undelivered records and reconcile jobs from PostgreSQL.
- Track job state, attempt count, lease/claim time, last safe failure category, and completion time. Do not expose internal failure payloads to students.
- Give each logical job a stable idempotency key. Duplicate outbox delivery or worker execution must not duplicate a submission, verdict, decision, or deduction.
- Retry transient judge/worker failures for five total attempts with backoff delays of 1 second, 5 seconds, 30 seconds, and 2 minutes. After exhaustion, mark the judge job failed and require an operator-triggered retry using the same logical job identity; publication remains blocked until judging succeeds. Permanent student verdicts such as compile error are completed judge results, not infrastructure failures.
- Define bounded concurrency and queue capacity after measuring the target deployment. Do not drop accepted jobs silently when the queue is unavailable.
- Use a separate review-workflow state so judge completion does not imply constraint review or grade completion.

For constraint-review provider failures, retry transient failures up to five total attempts with the same backoff. If review still cannot produce a valid verdict, record `unsure`; the TA must decide before publication. Redis persistence is configured with AOF enabled and periodic snapshots, but PostgreSQL outbox/domain state remains authoritative and must support queue reconstruction. Bound worker concurrency and queue capacity using the deployment load test.

## 3. Observability

Use structured logs and metrics/traces with correlation identifiers for request, submission, job, lab, review, and publication workflows. Avoid logging source code, tests, tokens, invite codes, model credentials, or full prompts/provider responses.

Track at least:

- HTTP request count, error count, and latency by route;
- judge/review queue depth and oldest job age;
- job attempts, run duration, terminal failures, and per-verdict totals;
- sandbox timeout/resource-limit outcomes;
- review outcomes, unsure reasons, and pending TA-review count;
- model requests, token/usage cost where available, and per-lab accumulated spend;
- publish attempts/failures and audit persistence failures.
- outbox age/backlog, dispatch attempts, Redis connection/restore events, and SSE connection count/disconnects.

SSE carries submission status and safe judge results to the submission owner and authorized class TAs. Workers publish a Redis status notification only after committing the new state to PostgreSQL. It never carries source code, hidden tests, or internal diagnostics. Authenticate and authorize, subscribe to notifications, then read and emit a PostgreSQL snapshot before flushing later updates; this avoids a gap between snapshot and subscription. Clients reconnect by fetching a fresh snapshot. Send heartbeat comments every 15 seconds and close streams when the authenticated session expires.

Define alert thresholds after a baseline is measured; the brief does not prescribe numerical SLOs.

## 4. Capacity and load evidence

The required scenario is 80 submissions arriving simultaneously near a deadline. The report should identify deployment size/configuration, test source mix, worker concurrency, database/queue setup, throughput, p50/p95/p99 acknowledgement and completion latency, error rate, and queue drain time. Separate fast submission acknowledgement from total judge completion time. State whether dependencies were local or hosted and include the repeatable invocation/configuration.

Do not claim a performance target until this baseline is recorded and accepted. The requirement is to demonstrate the burst and publish the result, not to assert an invented latency bound.

## 5. Recovery, backup, and deployment

- Document backup schedule/retention and perform a restore exercise before public deployment.
- On startup, validate configuration and fail clearly without exposing secret values.
- Keep production secrets in the deployment secret manager. Sandbox jobs receive none.
- Public deployment must be reachable by the lecturer and assigned red team over HTTPS.
- Record deployment version, migration state, health/readiness behavior, and rollback/recovery steps.
- Maintain an incident record/post-mortem for the required operational milestone.
- Retain full submission source until 90 days after the seven-day appeal window closes (97 days after publication). Do not purge source while a lab remains unpublished or an eligible appeal is unresolved. Keep grade and decision records after source removal; source-excerpt evidence retention follows the course-record policy.

## 6. Acceptance criteria

- Restarting the API/worker does not lose durably accepted work; retries do not duplicate final outcomes.
- Queue saturation/unavailability produces a safe error and does not falsely acknowledge unrecorded work.
- A trace can follow one submission from request to judge result, review, and publication without including source or secrets.
- The 80-arrival report includes the measurements listed above.
- Backup restoration and public reachability are demonstrated and recorded.
