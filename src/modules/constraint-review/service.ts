import type {
  ConstraintReviewer,
  ConstraintVerdict,
  ReviewInput,
  SemanticModel,
  ModelLedger,
  ModelUsage,
} from "./contract";
import { checkHardRules } from "./hard-rules";
import { sanitizeModelInput } from "./privacy";
import { ModelProviderError } from "./gemini-model";

type DecisionLog = {
  submission?: string;
  constraint: string;
  method: ConstraintVerdict["method"];
  verdict: ConstraintVerdict["verdict"];
  modelCalled: boolean;
  reason?: string;
};
type ReviewOptions = {
  model?: SemanticModel;
  modelOff?: boolean;
  timeoutMs?: number;
  onDecision?: (decision: DecisionLog) => void;
  ledger?: ModelLedger;
  labBudgetMicros?: number;
};

function validOutput(
  value: unknown,
  sourceCode: string,
): value is Pick<ConstraintVerdict, "verdict" | "evidence"> {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  if (
    Object.keys(record).some((key) => key !== "verdict" && key !== "evidence")
  )
    return false;
  if (
    typeof record.verdict !== "string" ||
    !["pass", "violation", "unsure"].includes(record.verdict) ||
    !Array.isArray(record.evidence) ||
    record.evidence.length > 12
  )
    return false;
  if (record.verdict === "violation" && record.evidence.length === 0)
    return false;
  const lines = sourceCode.split(/\r?\n/);
  return record.evidence.every((item: unknown) => {
    if (!item || typeof item !== "object") return false;
    const evidence = item as Record<string, unknown>;
    return (
      Object.keys(evidence).every((key) => key === "line" || key === "text") &&
      typeof evidence.line === "number" &&
      Number.isInteger(evidence.line) &&
      evidence.line >= 1 &&
      evidence.line <= lines.length &&
      typeof evidence.text === "string" &&
      evidence.text.trim().length > 0 &&
      evidence.text === lines[evidence.line - 1]
    );
  });
}

export class ConstraintReviewService implements ConstraintReviewer {
  constructor(private readonly options: ReviewOptions = {}) {
    const cap = options.labBudgetMicros ?? 1_000_000;
    if (!Number.isSafeInteger(cap) || cap <= 0 || cap > 1_000_000)
      throw new Error(
        "Model budget must be greater than zero and at most USD 1.00 per lab",
      );
    if (
      options.model?.invoke &&
      (!options.ledger || !options.model.estimateCostMicros)
    )
      throw new Error(
        "A real model requires a budget ledger and cost estimate",
      );
    if (
      options.timeoutMs !== undefined &&
      (!Number.isFinite(options.timeoutMs) || options.timeoutMs <= 0)
    )
      throw new Error("Invalid model timeout");
  }

  async review(input: ReviewInput): Promise<ConstraintVerdict[]> {
    const results = await checkHardRules(input.sourceCode, input.constraints);
    const modelOff = this.options.modelOff ?? process.env.MODEL_OFF === "1";
    let sanitized: Awaited<ReturnType<typeof sanitizeModelInput>> | undefined;
    for (const [index, result] of results.entries()) {
      let modelCalled = false;
      if (result.method === "semantic") {
        if (modelOff) result.reason = "model-off";
        else if (!this.options.model) result.reason = "model-not-configured";
        else {
          const controller = new AbortController();
          let timer: ReturnType<typeof setTimeout> | undefined;
          let reservation: string | null = null;
          let usage: ModelUsage | undefined;
          let reservedMicros = 0;
          let auditOutput: Pick<ConstraintVerdict, "verdict" | "evidence"> = {
            verdict: "unsure",
            evidence: [],
          };
          try {
            sanitized ??= await sanitizeModelInput(input);
            const prompt = {
              statement: sanitized.statement,
              constraint: sanitized.constraints[index],
              sourceCode: sanitized.sourceCode,
            };
            if (this.options.ledger) {
              if (!input.labId)
                throw new ModelProviderError("model-budget-scope-missing");
              const amountMicros =
                this.options.model.estimateCostMicros?.(prompt);
              if (!amountMicros)
                throw new ModelProviderError("model-cost-estimate-missing");
              reservedMicros = amountMicros;
              reservation = await this.options.ledger.reserve({
                scope: input.labId,
                submissionId: input.submissionId,
                attemptNumber: input.attemptNumber,
                constraintId: result.constraint,
                amountMicros,
                limitMicros: this.options.labBudgetMicros ?? 1_000_000,
                prompt,
              });
              if (!reservation)
                throw new ModelProviderError("model-budget-exhausted");
            }
            const deadline = new Promise<never>((_, reject) => {
              timer = setTimeout(() => {
                controller.abort();
                reject(new Error("model-timeout"));
              }, this.options.timeoutMs ?? 10_000);
            });
            modelCalled = true;
            result.method = "model";
            const request = { ...prompt, signal: controller.signal };
            const invocation = await Promise.race([
              this.options.model.invoke
                ? this.options.model.invoke(request)
                : this.options.model
                    .review(request)
                    .then((output) => ({ output, usage: undefined })),
              deadline,
            ]);
            usage = invocation.usage;
            const output = invocation.output;
            if (
              usage &&
              reservation &&
              usage.estimatedCostMicros > reservedMicros
            ) {
              result.reason = "model-cost-reservation-exceeded";
            } else if (validOutput(output, sanitized.sourceCode)) {
              result.verdict = output.verdict;
              auditOutput = output;
              const originalLines = input.sourceCode.split(/\r?\n/);
              result.evidence = output.evidence.map(({ line }) => ({
                line,
                text: originalLines[line - 1],
              }));
              delete result.reason;
            } else result.reason = "model-output-invalid";
          } catch (error) {
            result.reason = controller.signal.aborted
              ? "model-timeout"
              : error instanceof ModelProviderError
                ? error.reason
                : "model-unavailable";
          } finally {
            if (timer) clearTimeout(timer);
            if (reservation && this.options.ledger) {
              try {
                await this.options.ledger.finish(reservation, {
                  usage,
                  output: auditOutput,
                  reason: result.reason,
                });
              } catch {
                result.verdict = "unsure";
                result.evidence = [];
                result.reason = "model-audit-unavailable";
              }
            }
          }
        }
      }
      this.options.onDecision?.({
        ...(input.submissionId ? { submission: input.submissionId } : {}),
        constraint: result.constraint,
        method: result.method,
        verdict: result.verdict,
        modelCalled,
        ...(result.reason ? { reason: result.reason } : {}),
      });
    }
    return results;
  }
}
