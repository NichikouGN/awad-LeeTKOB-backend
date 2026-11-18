import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { JudgeBundle, JudgeResult, SandboxRunner } from "./judging.type";

type DockerSandboxOptions = {
  image: string;
  compileTimeoutMs: number;
  outputLimitBytes: number;
  dockerBinary?: string;
};
type CommandResult = {
  code: number | null;
  signal: NodeJS.Signals | null;
  stdout: Buffer;
  stderr: Buffer;
  timedOut: boolean;
  outputLimited: boolean;
  elapsedMs: number;
};

const MAX_SOURCE_BYTES = 64 * 1024;
const MAX_TESTS = 200;

export class DockerSandbox implements SandboxRunner {
  private readonly docker: string;

  constructor(private readonly options: DockerSandboxOptions) {
    this.docker = options.dockerBinary ?? "docker";
    if (
      !options.image ||
      options.compileTimeoutMs <= 0 ||
      options.outputLimitBytes <= 0
    ) {
      throw new Error("Invalid sandbox configuration");
    }
  }

  async judge(input: {
    sourceCode: Buffer;
    bundle: JudgeBundle;
  }): Promise<JudgeResult> {
    const { sourceCode, bundle } = input;
    validateInput(sourceCode, bundle);
    const memoryMb = Math.min(512, Math.max(64, bundle.limits.memoryMb));
    const cpuSeconds = Math.min(5, Math.max(1, bundle.limits.cpuSeconds));
    const root = await mkdtemp(join(tmpdir(), "leetkob-judge-"));
    const sourcePath = join(root, "main.cpp");
    await writeFile(sourcePath, sourceCode, { mode: 0o600 });
    let containerId: string | undefined;
    try {
      const created = await this.runDocker([
        "create",
        "--network",
        "none",
        "--memory",
        `${memoryMb}m`,
        "--memory-swap",
        `${memoryMb}m`,
        "--cpus",
        "1",
        "--pids-limit",
        "16",
        "--read-only",
        "--tmpfs",
        "/work:rw,exec,nosuid,size=64m,uid=10001,gid=10001",
        "--tmpfs",
        "/tmp:rw,nosuid,nodev,size=64m,uid=10001,gid=10001",
        "--cap-drop",
        "ALL",
        "--security-opt",
        "no-new-privileges:true",
        "--user",
        "10001:10001",
        "--workdir",
        "/work",
        "--env",
        "PATH=/usr/bin:/bin",
        "--env",
        "TMPDIR=/work",
        this.options.image,
        "sleep",
        "infinity",
      ]);
      if (created.code !== 0) {
        throw new Error(
          `docker create failed: ${created.stderr.toString("utf8")}`,
        );
      }
      containerId = created.stdout.toString("utf8").trim();
      if (!containerId) throw new Error("Docker did not return a container id");
      const runningContainerId = containerId;
      const started = await this.runDocker(["start", containerId]);
      if (started.code !== 0) {
        throw new Error(
          `docker start failed: ${started.stderr.toString("utf8")}`,
        );
      }
      const copied = await this.runDocker(
        ["exec", "-i", containerId, "sh", "-c", "cat > /work/main.cpp"],
        5_000,
        MAX_SOURCE_BYTES,
        await readFile(sourcePath),
      );
      if (copied.code !== 0) {
        throw new Error(`docker cp failed: ${copied.stderr.toString("utf8")}`);
      }
      const compile = await this.runDocker(
        [
          "exec",
          containerId,
          "g++",
          "-std=c++17",
          "-O2",
          "-pipe",
          "-o",
          "/work/main",
          "/work/main.cpp",
        ],
        this.options.compileTimeoutMs,
        this.options.outputLimitBytes,
        undefined,
        () => this.killContainer(runningContainerId),
      );
      if (compile.timedOut || compile.code !== 0) {
        return {
          overallVerdict: "CE",
          tests: bundle.tests.map((test) => ({
            testNumber: test.testNumber,
            verdict: "CE",
            executionMs: compile.elapsedMs,
            memoryKb: null,
          })),
        };
      }
      const executable = await this.runDocker([
        "exec",
        containerId,
        "chmod",
        "700",
        "/work/main",
      ]);
      if (executable.code !== 0) {
        throw new Error(
          `could not prepare compiled program: ${executable.stderr.toString("utf8")}`,
        );
      }

      const results: JudgeResult["tests"] = [];
      for (const test of bundle.tests) {
        const run = await this.runDocker(
          [
            "exec",
            "-i",
            containerId,
            "sh",
            "-c",
            `ulimit -t ${cpuSeconds}; exec /work/main`,
          ],
          cpuSeconds * 3 * 1000,
          this.options.outputLimitBytes,
          Buffer.from(test.input),
          () => this.killContainer(runningContainerId),
        );
        let verdict: JudgeResult["overallVerdict"];
        const oomKilled =
          run.code === 137 && (await this.wasOomKilled(containerId));
        if (oomKilled) verdict = "MLE";
        else if (
          run.timedOut ||
          run.signal === "SIGXCPU" ||
          run.code === 137 ||
          run.code === 152
        )
          verdict = "TLE";
        else if (run.outputLimited) verdict = "RE";
        else if (run.signal === "SIGKILL" && run.code === null) verdict = "MLE";
        else if (run.code !== 0) verdict = "RE";
        else {
          const actual = normalizeOutput(run.stdout);
          const expected = normalizeOutput(Buffer.from(test.expectedOutput));
          verdict = actual === expected ? "AC" : "WA";
        }
        results.push({
          testNumber: test.testNumber,
          verdict,
          executionMs: run.elapsedMs,
          memoryKb: null,
        });
        if (run.timedOut) {
          for (const remaining of bundle.tests.slice(results.length)) {
            results.push({
              testNumber: remaining.testNumber,
              verdict: "TLE",
              executionMs: run.elapsedMs,
              memoryKb: null,
            });
          }
          break;
        }
      }
      const overallVerdict =
        results.find((result) => result.verdict !== "AC")?.verdict ?? "AC";
      return { overallVerdict, tests: results };
    } finally {
      if (containerId) {
        await this.runDocker(["rm", "--force", containerId]).catch(
          () => undefined,
        );
      }
      await rm(root, { recursive: true, force: true });
    }
  }

  private runDocker(
    args: string[],
    timeoutMs = 30_000,
    outputLimitBytes = 64 * 1024,
    stdin?: Buffer,
    onTimeout?: () => void,
  ): Promise<CommandResult> {
    return new Promise((resolve, reject) => {
      const startedAt = Date.now();
      const child = spawn(this.docker, args, {
        stdio: ["pipe", "pipe", "pipe"],
      });
      const stdout: Buffer[] = [];
      const stderr: Buffer[] = [];
      let size = 0;
      let outputLimited = false;
      let timedOut = false;
      let settled = false;
      const timer = setTimeout(() => {
        timedOut = true;
        onTimeout?.();
        child.kill("SIGKILL");
      }, timeoutMs);
      const collect = (target: Buffer[]) => (chunk: Buffer) => {
        size += chunk.length;
        if (size > outputLimitBytes) {
          outputLimited = true;
          child.kill("SIGKILL");
          return;
        }
        target.push(Buffer.from(chunk));
      };
      child.stdout.on("data", collect(stdout));
      child.stderr.on("data", collect(stderr));
      child.on("error", (error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(error);
      });
      child.on("close", (code, signal) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve({
          code,
          signal,
          stdout: Buffer.concat(stdout),
          stderr: Buffer.concat(stderr),
          timedOut,
          outputLimited,
          elapsedMs: Date.now() - startedAt,
        });
      });
      child.stdin.end(stdin);
    });
  }

  private killContainer(containerId: string): void {
    const child = spawn(this.docker, ["kill", containerId], {
      stdio: "ignore",
    });
    child.on("error", () => undefined);
  }

  private async wasOomKilled(containerId: string): Promise<boolean> {
    const inspected = await this.runDocker([
      "inspect",
      "--format",
      "{{.State.OOMKilled}}",
      containerId,
    ]);
    return (
      inspected.code === 0 &&
      inspected.stdout.toString("utf8").trim() === "true"
    );
  }
}

function validateInput(source: Buffer, bundle: JudgeBundle): void {
  if (
    !Buffer.isBuffer(source) ||
    source.byteLength === 0 ||
    source.byteLength > MAX_SOURCE_BYTES
  ) {
    throw new Error("Source code size is outside the allowed range");
  }
  if (
    !bundle ||
    typeof bundle.labId !== "string" ||
    !bundle.limits ||
    !Number.isFinite(bundle.limits.cpuSeconds) ||
    !Number.isFinite(bundle.limits.memoryMb) ||
    !Array.isArray(bundle.tests) ||
    bundle.tests.length === 0 ||
    bundle.tests.length > MAX_TESTS ||
    bundle.tests.some(
      (test, index) =>
        test.testNumber !== index + 1 ||
        typeof test.input !== "string" ||
        typeof test.expectedOutput !== "string",
    )
  ) {
    throw new Error("Invalid judge bundle");
  }
}

function normalizeOutput(value: Buffer): string {
  return value.toString("utf8").trim().split(/\s+/).join(" ");
}
