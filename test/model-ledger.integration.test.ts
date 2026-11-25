import { describe, expect, it } from "bun:test";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { DrizzleModelLedger } from "../src/modules/constraint-review/drizzle-model-ledger";
import { modelBudgets, modelCalls } from "../src/db/schema/model-calls.schema";

const integration =
  process.env.HARD_RULE_INTEGRATION === "1" ? describe : describe.skip;
integration("persistent model budget", () => {
  it("enforces the cap across concurrent ledger instances and survives unknown-cost failures", async () => {
    const { db } = await import("../src/db/db");
    const scope = `ledger-test:${randomUUID()}`;
    const input = {
      scope,
      constraintId: "C1",
      amountMicros: 70,
      limitMicros: 100,
      prompt: {
        statement: "",
        constraint: { id: "C1", text: "Use recursion." },
        sourceCode: "int main(){}",
      },
    };
    try {
      const ids = await Promise.all(
        Array.from({ length: 10 }, () =>
          new DrizzleModelLedger(db).reserve(input),
        ),
      );
      expect(ids.filter(Boolean)).toHaveLength(1);
      const id = ids.find((value) => value !== null);
      if (!id) throw new Error("Missing reservation");
      await new DrizzleModelLedger(db).finish(id, {
        output: { verdict: "unsure", evidence: [] },
        reason: "model-timeout",
      });
      expect(
        await new DrizzleModelLedger(db).reserve({
          ...input,
          amountMicros: 40,
        }),
      ).toBeNull();
      const [call] = await db
        .select()
        .from(modelCalls)
        .where(eq(modelCalls.callId, id));
      expect(call).toMatchObject({
        status: "uncertain",
        accountedMicros: null,
        reservedMicros: 70,
      });
      expect(
        await db.select().from(modelCalls).where(eq(modelCalls.scope, scope)),
      ).toHaveLength(1);
    } finally {
      await db.delete(modelCalls).where(eq(modelCalls.scope, scope));
      await db.delete(modelBudgets).where(eq(modelBudgets.scope, scope));
    }
  });
});
