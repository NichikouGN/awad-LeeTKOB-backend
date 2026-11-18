import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { DockerSandbox } from "../../src/modules/judging/docker-sandbox";

const dockerTestsEnabled = process.env.DOCKER_SANDBOX_TESTS === "1";
const sandboxDescribe = dockerTestsEnabled ? describe : describe.skip;
const sandbox = new DockerSandbox({
  image: process.env.JUDGE_SANDBOX_IMAGE ?? "leetkob-cpp-sandbox:local",
  compileTimeoutMs: 10_000,
  outputLimitBytes: 1_048_576,
});
const attack = (name: string) =>
  readFileSync(new URL(`./attacks/${name}`, import.meta.url));
const bundleFor = (input = "", expectedOutput = "") => ({
  labId: "test-lab",
  classId: "test-class",
  statement: "Sandbox boundary test",
  limits: { cpuSeconds: 1, memoryMb: 256 },
  constraints: [],
  tests: [{ testNumber: 1, input, expectedOutput }],
});

sandboxDescribe("Docker sandbox security attacks", () => {
  it("compiles inside the container and compares a test's output", async () => {
    const result = await sandbox.judge({
      sourceCode: Buffer.from(
        "#include <iostream>\nint main(){int a,b;if(!(std::cin>>a>>b))return 1;std::cout<<a+b<<'\\n';}\n",
      ),
      bundle: bundleFor("2 3\n", "5\n"),
    });

    expect(result.overallVerdict).toBe("AC");
    expect(result.tests).toHaveLength(1);
    expect(result.tests[0]?.verdict).toBe("AC");
  });

  it("runs as a non-root user", async () => {
    const result = await sandbox.judge({
      sourceCode: attack("non-root.cpp"),
      bundle: bundleFor(),
    });

    expect(result.overallVerdict).toBe("AC");
  });

  it("cannot reach the network", async () => {
    const result = await sandbox.judge({
      sourceCode: attack("network.cpp"),
      bundle: bundleFor(),
    });

    expect(result.overallVerdict).toBe("AC");
  });

  it("cannot see a host path or Docker socket", async () => {
    const result = await sandbox.judge({
      sourceCode: attack("host-access.cpp"),
      bundle: bundleFor(),
    });

    expect(result.overallVerdict).toBe("AC");
  });

  it("does not receive the worker's model API key", async () => {
    const prior = process.env.MODEL_API_KEY;
    process.env.MODEL_API_KEY = "sandbox-secret-canary";
    try {
      const result = await sandbox.judge({
        sourceCode: attack("secret-access.cpp"),
        bundle: bundleFor(),
      });
      expect(result.overallVerdict).toBe("AC");
    } finally {
      if (prior === undefined) delete process.env.MODEL_API_KEY;
      else process.env.MODEL_API_KEY = prior;
    }
  });

  it("enforces the process limit", async () => {
    const result = await sandbox.judge({
      sourceCode: attack("process-limit.cpp"),
      bundle: bundleFor(),
    });

    expect(result.overallVerdict).toBe("AC");
  });

  it("enforces CPU time", async () => {
    const result = await sandbox.judge({
      sourceCode: attack("cpu-limit.cpp"),
      bundle: bundleFor(),
    });

    expect(result.overallVerdict).toBe("TLE");
  });

  it("kills the container when wall time expires", async () => {
    const result = await sandbox.judge({
      sourceCode: attack("wall-limit.cpp"),
      bundle: bundleFor(),
    });

    expect(result.overallVerdict).toBe("TLE");
  });

  it("enforces memory including swap", async () => {
    const result = await sandbox.judge({
      sourceCode: attack("memory-limit.cpp"),
      bundle: bundleFor(),
    });

    expect(["MLE", "RE"]).toContain(result.overallVerdict);
  });

  it("caps per-test output", async () => {
    const result = await sandbox.judge({
      sourceCode: attack("output-limit.cpp"),
      bundle: bundleFor(),
    });

    expect(result.overallVerdict).toBe("RE");
  });
});
