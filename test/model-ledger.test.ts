import { expect, it } from "bun:test";
import { MemoryModelLedger } from "../src/modules/constraint-review/model-ledger";
import { createConfiguredReviewer } from "../src/modules/constraint-review/config";

const reservation = {
  scope: "lab",
  constraintId: "C1",
  amountMicros: 70,
  limitMicros: 100,
  prompt: {
    statement: "",
    constraint: { id: "C1", text: "Use recursion." },
    sourceCode: "int main(){}",
  },
};

it("counts in-flight and unknown-cost calls against the per-lab budget", async () => {
  const ledger = new MemoryModelLedger();
  const ids = await Promise.all(
    Array.from({ length: 10 }, () => ledger.reserve(reservation)),
  );
  expect(ids.filter(Boolean)).toHaveLength(1);
  const id = ids.find((value) => value !== null);
  if (!id) throw new Error("Missing reservation");
  await ledger.finish(id, {
    output: { verdict: "unsure", evidence: [] },
    reason: "model-timeout",
  });
  expect(await ledger.reserve({ ...reservation, amountMicros: 40 })).toBeNull();
});

it("defaults to model-off and needs no API key or provider request", async () => {
  const ledger = new MemoryModelLedger();
  const reviewer = createConfiguredReviewer({ ledger, env: {} });
  const result = await reviewer.review({
    statement: "",
    sourceCode: "int main(){}",
    constraints: [reservation.prompt.constraint],
  });
  expect(result[0]).toMatchObject({ verdict: "unsure", reason: "model-off" });
  expect(ledger.records()).toHaveLength(0);
});

it("rejects enabled configurations without a key or with an unverified model", () => {
  const ledger = new MemoryModelLedger();
  expect(() =>
    createConfiguredReviewer({ ledger, env: { MODEL_OFF: "0" } }),
  ).toThrow("GEMINI_API_KEY");
  expect(() =>
    createConfiguredReviewer({
      ledger,
      env: { MODEL_OFF: "0", GEMINI_MODEL: "unknown-model" },
    }),
  ).toThrow("verified pricing");
  expect(() =>
    createConfiguredReviewer({
      ledger,
      env: { MODEL_OFF: "0", MODEL_LAB_BUDGET_USD: "2" },
    }),
  ).toThrow("budget");
});
