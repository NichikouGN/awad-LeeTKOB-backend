import {
  readdir,
  readFile,
  mkdir,
  writeFile,
  appendFile,
} from "node:fs/promises";
import { basename, dirname, join, relative, resolve } from "node:path";
import { createConfiguredReviewer } from "./config";
import { MemoryModelLedger } from "./model-ledger";
import { GEMINI_MODEL } from "./gemini-model";
import type { ConstraintInput } from "./contract";

async function problemFolders(root: string): Promise<string[]> {
  const entries = await readdir(root, { withFileTypes: true });
  if (
    entries.some((entry) => entry.isFile() && entry.name === "statement.md") &&
    entries.some((entry) => entry.isFile() && entry.name === "constraints.json")
  )
    return [root];
  const folders: string[] = [];
  for (const entry of entries) {
    if (
      entry.isDirectory() &&
      !entry.name.startsWith(".") &&
      entry.name !== "node_modules"
    )
      folders.push(...(await problemFolders(join(root, entry.name))));
  }
  return folders.sort();
}

function readConstraints(value: unknown): ConstraintInput[] {
  const list = Array.isArray(value)
    ? value
    : value && typeof value === "object" && "constraints" in value
      ? value.constraints
      : undefined;
  if (
    !Array.isArray(list) ||
    !list.length ||
    list.some(
      (item) =>
        !item ||
        typeof item.id !== "string" ||
        !item.id ||
        typeof item.text !== "string",
    )
  )
    throw new Error(
      "constraints.json must contain an array of { id, text } constraints",
    );
  if (new Set(list.map((item) => item.id)).size !== list.length)
    throw new Error("Duplicate constraint id");
  return list.map(({ id, text }) => ({ id, text }));
}

export async function runChecker(
  dataset: string,
  output: string,
): Promise<number> {
  const root = resolve(dataset);
  const problems = await problemFolders(root);
  if (!problems.length)
    throw new Error("No statement.md + constraints.json problem folders found");
  const predictions: string[] = [];
  const decisions: string[] = [];
  let solutionId = "";
  await mkdir(dirname(resolve(output)), { recursive: true });
  await writeFile(`${output}.calls.jsonl`, "", { mode: 0o600 });
  const ledger = new MemoryModelLedger({
    onRecord: async (record) => {
      await appendFile(`${output}.calls.jsonl`, `${JSON.stringify(record)}\n`, {
        mode: 0o600,
      });
    },
  });
  const reviewer = createConfiguredReviewer({
    ledger,
    onDecision: (decision) =>
      decisions.push(JSON.stringify({ solution: solutionId, ...decision })),
  });

  for (const folder of problems) {
    const statement = await readFile(join(folder, "statement.md"), "utf8");
    const constraints = readConstraints(
      JSON.parse(await readFile(join(folder, "constraints.json"), "utf8")),
    );
    const solutionDir = join(folder, "solutions");
    const solutions = (await readdir(solutionDir, { withFileTypes: true }))
      .filter((entry) => entry.isFile() && entry.name.endsWith(".cpp"))
      .sort((a, b) => a.name.localeCompare(b.name));
    if (!solutions.length)
      throw new Error(`No C++ solutions in ${relative(root, solutionDir)}`);

    for (const solution of solutions) {
      solutionId = `${basename(folder)}/${basename(solution.name, ".cpp")}`;
      const sourceCode = await readFile(
        join(solutionDir, solution.name),
        "utf8",
      );

      const verdicts = await reviewer.review({
        labId: `eval:${basename(folder)}`,
        statement,
        constraints,
        sourceCode,
      });

      for (const result of verdicts)
        predictions.push(
          JSON.stringify({
            solution: solutionId,
            constraint: result.constraint,
            verdict: result.verdict,
            evidence: result.evidence,
          }),
        );
    }
  }

  await mkdir(dirname(resolve(output)), { recursive: true });
  await writeFile(output, `${predictions.join("\n")}\n`);
  await writeFile(`${output}.decisions.jsonl`, `${decisions.join("\n")}\n`);
  const calls = ledger.records();
  await writeFile(
    `${output}.cost-summary.json`,
    `${JSON.stringify(
      {
        model: GEMINI_MODEL,
        calls: calls.length,
        completed: calls.filter((call) => call.status === "completed").length,
        estimatedCostUsd:
          calls.reduce((sum, call) => sum + (call.usage?.costMicros ?? 0), 0) /
          1_000_000,
        paidEquivalentBudgetAccountedUsd:
          calls.reduce(
            (sum, call) =>
              sum + (call.usage?.estimatedCostMicros ?? call.reservedMicros),
            0,
          ) / 1_000_000,
        uncertainCharges: calls.filter((call) => !call.usage).length,
      },
      null,
      2,
    )}\n`,
  );

  return predictions.length;
}

if (import.meta.main) {
  const [dataset, output, ...extra] = process.argv.slice(2);
  if (!dataset || !output || extra.length) {
    console.error(
      "Usage: bun run checker <dataset-folder> <predictions.jsonl>",
    );
    process.exitCode = 2;
  } else {
    try {
      const count = await runChecker(dataset, output);
      console.error(`Wrote ${count} predictions to ${output}`);
    } catch (error) {
      console.error(error instanceof Error ? error.message : "Checker failed");
      process.exitCode = 2;
    }
  }
}
