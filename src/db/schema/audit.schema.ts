import { sql } from "drizzle-orm";
import {
  check,
  index,
  jsonb,
  pgTable,
  smallint,
  varchar,
} from "drizzle-orm/pg-core";
import { identity, instant } from "./_helpers";
import { users } from "./users.schema";
import { uuid } from "drizzle-orm/cockroach-core";

export const auditEvents = pgTable(
  "audit_events",
  {
    auditEventId: identity("audit_event_id"),
    actorUserId: uuid("actor_user_id").references(
      () => users.userId,
      {
        onDelete: "restrict",
      },
    ),
    actorKind: varchar("actor_kind", { length: 16 }).notNull(),
    entityType: varchar("entity_type", { length: 64 }).notNull(),
    entityId: varchar("entity_id", { length: 128 }).notNull(),
    action: varchar("action", { length: 64 }).notNull(),
    beforeState: jsonb("before_state"),
    afterState: jsonb("after_state"),
    requestId: varchar("request_id", { length: 128 }),
    workflowId: varchar("workflow_id", { length: 128 }),
    createdAt: instant("created_at").notNull(),
  },
  (t) => [
    check(
      "audit_events_actor_consistent",
      sql`(${t.actorKind} = 'user' AND ${t.actorUserId} IS NOT NULL) OR (${t.actorKind} = 'system' AND ${t.actorUserId} IS NULL)`,
    ),
    check(
      "audit_events_actor_kind_check",
      sql`${t.actorKind} IN ('user', 'system')`,
    ),
    index("audit_events_entity_created_idx").on(
      t.entityType,
      t.entityId,
      t.createdAt,
    ),
    index("audit_events_actor_created_idx").on(t.actorUserId, t.createdAt),
    index("audit_events_action_created_idx").on(t.action, t.createdAt),
    index("audit_events_request_id_idx").on(t.requestId),
    index("audit_events_workflow_id_idx").on(t.workflowId),
  ],
);

export const outboxEvents = pgTable(
  "outbox_events",
  {
    outboxEventId: identity("outbox_event_id"),
    eventKey: varchar("event_key", { length: 160 }).notNull().unique(),
    jobType: varchar("job_type", { length: 32 }).notNull(),
    aggregateId: uuid("aggregate_id").notNull(),
    status: varchar("status", { length: 16 }).notNull(),
    attemptCount: smallint("attempt_count").notNull().default(0),
    availableAt: instant("available_at").notNull(),
    createdAt: instant("created_at").notNull(),
    dispatchedAt: instant("dispatched_at"),
    lastFailureCode: varchar("last_failure_code", { length: 64 }),
  },
  (t) => [
    check(
      "outbox_events_job_type_check",
      sql`${t.jobType} IN ('judge_submission', 'review_submission')`,
    ),
    check(
      "outbox_events_status_check",
      sql`${t.status} IN ('pending', 'dispatched')`,
    ),
    check("outbox_events_attempt_count_check", sql`${t.attemptCount} >= 0`),
    check(
      "outbox_events_dispatch_time_consistent",
      sql`(${t.status} = 'pending' AND ${t.dispatchedAt} IS NULL) OR (${t.status} = 'dispatched' AND ${t.dispatchedAt} IS NOT NULL)`,
    ),
    index("outbox_events_pending_idx")
      .on(t.availableAt, t.outboxEventId)
      .where(sql`${t.status} = 'pending'`),
  ],
);
