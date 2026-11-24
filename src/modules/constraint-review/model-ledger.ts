import { randomUUID } from "node:crypto";
import type { ModelCallRecord, ModelLedger } from "./contract";
import { GEMINI_MODEL } from "./gemini-model";

export function validateReservation(
  input: Parameters<ModelLedger["reserve"]>[0],
) {
  if (
    !input.scope ||
    !Number.isSafeInteger(input.amountMicros) ||
    input.amountMicros <= 0 ||
    !Number.isSafeInteger(input.limitMicros) ||
    input.limitMicros <= 0 ||
    input.limitMicros > 1_000_000
  )
    throw new Error("Invalid model budget reservation");
}

export class MemoryModelLedger implements ModelLedger {
  private readonly calls = new Map<string, ModelCallRecord>();
  constructor(
    private readonly options: {
      onRecord?: (record: ModelCallRecord) => Promise<void>;
    } = {},
  ) {}
  async reserve(
    input: Parameters<ModelLedger["reserve"]>[0],
  ): Promise<string | null> {
    validateReservation(input);
    const used = [...this.calls.values()]
      .filter((call) => call.scope === input.scope)
      .reduce(
        (total, call) =>
          total + (call.usage?.estimatedCostMicros ?? call.reservedMicros),
        0,
      );
    if (used + input.amountMicros > input.limitMicros) return null;
    const id = randomUUID();
    this.calls.set(id, {
      id,
      provider: "gemini",
      model: GEMINI_MODEL,
      scope: input.scope,
      submissionId: input.submissionId ?? null,
      attemptNumber: input.attemptNumber ?? null,
      constraintId: input.constraintId,
      reservedMicros: input.amountMicros,
      prompt: structuredClone(input.prompt),
      status: "reserved",
      usage: null,
      output: null,
      reason: null,
      createdAt: new Date().toISOString(),
      completedAt: null,
    });
    const record = this.calls.get(id);
    if (record) await this.options.onRecord?.(structuredClone(record));
    return id;
  }
  async finish(id: string, result: Parameters<ModelLedger["finish"]>[1]) {
    const call = this.calls.get(id);
    if (call?.status !== "reserved")
      throw new Error("Model reservation is not pending");
    call.status = result.usage ? "completed" : "uncertain";
    call.usage = result.usage ?? null;
    call.output = structuredClone(result.output);
    call.reason = result.reason ?? null;
    call.completedAt = new Date().toISOString();
    await this.options.onRecord?.(structuredClone(call));
  }
  records(): ModelCallRecord[] {
    return structuredClone([...this.calls.values()]);
  }
}
