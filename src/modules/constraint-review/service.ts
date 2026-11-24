import type {
  ConstraintReviewer,
  ConstraintVerdict,
  ReviewInput,
  SemanticModel,
} from "./contract";
import { nodes, parseCpp } from "./cpp-parser";
import { checkHardRules } from "./hard-rules";

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
};

async function withoutComments(source: string): Promise<string> {
  const tree = await parseCpp(source);
  try {
    if (tree.rootNode.hasError())
      throw new Error("Cannot sanitize invalid C++");
    let result = source;
    const comments = nodes(tree.rootNode).filter(
      (node) => node.type === "comment",
    );
    for (const comment of comments.reverse()) {
      result =
        result.slice(0, comment.startIndex) +
        comment.text.replace(/[^\r\n]/g, " ") +
        result.slice(comment.endIndex);
    }
    return result;
  } finally {
    tree.delete();
  }
}

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
    !Array.isArray(record.evidence)
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
      evidence.text === lines[evidence.line - 1]
    );
  });
}

export class ConstraintReviewService implements ConstraintReviewer {
  constructor(private readonly options: ReviewOptions = {}) {
    if (
      options.timeoutMs !== undefined &&
      (!Number.isFinite(options.timeoutMs) || options.timeoutMs <= 0)
    )
      throw new Error("Invalid model timeout");
  }

  async review(input: ReviewInput): Promise<ConstraintVerdict[]> {
    const results = await checkHardRules(input.sourceCode, input.constraints);
    const modelOff = this.options.modelOff ?? process.env.MODEL_OFF === "1";
    let sanitized: string | undefined;
    for (const [index, result] of results.entries()) {
      let modelCalled = false;
      if (result.method === "semantic") {
        if (modelOff) result.reason = "model-off";
        else if (!this.options.model) result.reason = "model-not-configured";
        else {
          const controller = new AbortController();
          let timer: ReturnType<typeof setTimeout> | undefined;
          try {
            sanitized ??= await withoutComments(input.sourceCode);
            // An adapter must finish de-identification using the product's
            // privacy policy before enabling real model calls. No real adapter
            // is wired by this hard-rule slice.
            const deadline = new Promise<never>((_, reject) => {
              timer = setTimeout(() => {
                controller.abort();
                reject(new Error("model-timeout"));
              }, this.options.timeoutMs ?? 10_000);
            });
            modelCalled = true;
            result.method = "model";
            const output = await Promise.race([
              this.options.model.review({
                statement: input.statement,
                constraint: input.constraints[index],
                sourceCode: sanitized,
                signal: controller.signal,
              }),
              deadline,
            ]);
            if (validOutput(output, input.sourceCode)) {
              result.verdict = output.verdict;
              result.evidence = output.evidence;
              delete result.reason;
            } else result.reason = "model-output-invalid";
          } catch {
            result.reason = controller.signal.aborted
              ? "model-timeout"
              : "model-unavailable";
          } finally {
            if (timer) clearTimeout(timer);
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
