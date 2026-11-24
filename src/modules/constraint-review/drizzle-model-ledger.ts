import { and, eq, sql } from "drizzle-orm";
import type { Database } from "../../db/db";
import { modelBudgets, modelCalls } from "../../db/schema/model-calls.schema";
import type { ModelLedger } from "./contract";
import { validateReservation } from "./model-ledger";
import { GEMINI_MODEL } from "./gemini-model";

// This ledger intentionally commits outside the judge-result transaction: an
// API call can incur cost even when judging loses its lease or is retried.
export class DrizzleModelLedger implements ModelLedger {
  constructor(private readonly db: Database) {}
  async reserve(
    input: Parameters<ModelLedger["reserve"]>[0],
  ): Promise<string | null> {
    validateReservation(input);
    return this.db.transaction(async (tx) => {
      await tx
        .insert(modelBudgets)
        .values({ scope: input.scope, limitMicros: input.limitMicros })
        .onConflictDoNothing();
      const [account] = await tx
        .select()
        .from(modelBudgets)
        .where(eq(modelBudgets.scope, input.scope))
        .for("update");
      const limit = Math.min(account.limitMicros, input.limitMicros);
      if (limit < account.limitMicros)
        await tx
          .update(modelBudgets)
          .set({ limitMicros: limit })
          .where(eq(modelBudgets.scope, input.scope));
      const [usage] = await tx
        .select({
          used: sql<string>`coalesce(sum(coalesce(${modelCalls.accountedMicros}, ${modelCalls.reservedMicros})), 0)`,
        })
        .from(modelCalls)
        .where(eq(modelCalls.scope, input.scope));
      if (Number(usage.used) + input.amountMicros > limit) return null;
      const [call] = await tx
        .insert(modelCalls)
        .values({
          scope: input.scope,
          submissionId: input.submissionId ?? null,
          attemptNumber: input.attemptNumber ?? null,
          constraintId: input.constraintId,
          reservedMicros: input.amountMicros,
          provider: "gemini",
          requestedModel: GEMINI_MODEL,
          prompt: input.prompt,
          status: "reserved",
        })
        .returning({ id: modelCalls.callId });
      return call.id;
    });
  }
  async finish(
    id: string,
    result: Parameters<ModelLedger["finish"]>[1],
  ): Promise<void> {
    const updated = await this.db
      .update(modelCalls)
      .set({
        status: result.usage ? "completed" : "uncertain",
        usage: result.usage ?? null,
        accountedMicros: result.usage?.estimatedCostMicros ?? null,
        output: result.output,
        reason: result.reason ?? null,
        completedAt: new Date(),
      })
      .where(and(eq(modelCalls.callId, id), eq(modelCalls.status, "reserved")))
      .returning({ id: modelCalls.callId });
    if (updated.length !== 1)
      throw new Error("Model reservation is not pending");
  }
}
