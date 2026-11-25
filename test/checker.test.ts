import { expect, it } from "bun:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

it("runs the MODEL_OFF CLI and writes predictions without model calls", async () => {
  const root = await mkdtemp(join(tmpdir(), "leetkob-checker-"));
  try {
    const output = join(root, "predictions.jsonl");
    const child = Bun.spawn(
      [
        Bun.argv[0],
        "run",
        "src/modules/constraint-review/checker.ts",
        "test/fixtures/hard-rule-dev",
        output,
      ],
      {
        env: { ...Bun.env, MODEL_OFF: "1" },
        stdout: "pipe",
        stderr: "pipe",
      },
    );
    const errors = await new Response(child.stderr).text();
    expect(await child.exited, errors).toBe(0);
    const predictions = (await readFile(output, "utf8"))
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));
    expect(predictions).toHaveLength(10);
    for (const name of ["own-function", "string-trap"])
      expect(
        predictions.find(
          (r) => r.solution === `own-ban-list/${name}` && r.constraint === "C1",
        ).verdict,
      ).toBe("pass");
    for (const name of ["direct", "alias", "injection"])
      expect(
        predictions.find(
          (r) => r.solution === `own-ban-list/${name}` && r.constraint === "C1",
        ).verdict,
      ).toBe("violation");
    expect(
      predictions
        .filter((r) => r.constraint === "C2")
        .every((r) => r.verdict === "unsure"),
    ).toBe(true);
    const decisions = (await readFile(`${output}.decisions.jsonl`, "utf8"))
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));
    expect(decisions.every((r) => r.modelCalled === false)).toBe(true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
