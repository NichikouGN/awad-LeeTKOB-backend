import type { ModelLedger, ConstraintVerdict } from "./contract";
import { GEMINI_MODEL, GeminiModel } from "./gemini-model";
import { ConstraintReviewService } from "./service";

export function createConfiguredReviewer(options: {
  ledger: ModelLedger;
  env?: Record<string, string | undefined>;
  onDecision?: (decision: {
    constraint: string;
    method: ConstraintVerdict["method"];
    verdict: ConstraintVerdict["verdict"];
    modelCalled: boolean;
    reason?: string;
    submission?: string;
  }) => void;
}) {
  const env = options.env ?? process.env;
  if (env.MODEL_OFF !== "0")
    return new ConstraintReviewService({
      modelOff: true,
      onDecision: options.onDecision,
    });
  if ((env.GEMINI_MODEL ?? GEMINI_MODEL) !== GEMINI_MODEL)
    throw new Error(
      `Only ${GEMINI_MODEL} has a verified pricing configuration`,
    );
  if (
    env.GEMINI_BILLING_TIER &&
    !["free", "paid"].includes(env.GEMINI_BILLING_TIER)
  )
    throw new Error("GEMINI_BILLING_TIER must be free or paid");
  const dollars = Number(env.MODEL_LAB_BUDGET_USD ?? "1.00");
  const timeoutMs = Number(env.MODEL_TIMEOUT_MS ?? "10000");
  if (
    !Number.isFinite(dollars) ||
    dollars <= 0 ||
    dollars > 1 ||
    !Number.isSafeInteger(Math.round(dollars * 1_000_000))
  )
    throw new Error("Invalid per-lab model budget");
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 60_000)
    throw new Error("Invalid model timeout");
  return new ConstraintReviewService({
    model: new GeminiModel({
      apiKey: env.GEMINI_API_KEY ?? "",
      billingTier: env.GEMINI_BILLING_TIER === "paid" ? "paid" : "free",
    }),
    ledger: options.ledger,
    modelOff: false,
    timeoutMs,
    labBudgetMicros: Math.round(dollars * 1_000_000),
    onDecision: options.onDecision,
  });
}
