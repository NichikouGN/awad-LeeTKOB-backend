import { describe, expect, it, mock } from "bun:test";
import { Elysia } from "elysia";
import { createSubmissionModule } from "../src/modules/submissions/submission.index";
import type { SubmissionService } from "../src/modules/submissions/submission.service";
import { createJwtPlugins } from "../src/plugins/jwt.plugin";

const labId = "64d0d19a-73e8-4d19-bae2-1d6c0f10f397";
const submissionId = "64d0d19e-73e8-4d19-bae2-1d6c0f10f397";
const submission = {
  id: submissionId,
  labId,
  status: "queued",
  receivedAt: "2026-11-22T10:00:00.000Z",
  overallVerdict: null,
  tests: [],
};

const jwtPlugins = createJwtPlugins({
  accessSecret: "test-access-secret",
  refreshSecret: "test-refresh-secret",
});

const tokenFor = async (userId: string, role: "ADMIN" | "TA" | "STU") => {
  const issuer = new Elysia()
    .use(jwtPlugins.accessJwt)
    .get("/token", ({ access }) =>
      access.sign({ userId, role, type: "access" }),
    );
  const response = await issuer.handle(new Request("http://localhost/token"));
  return response.text();
};

const makeApp = () => {
  const submissionService = {
    submit: mock(async () => submission),
    getOwn: mock(async () => submission),
  };
  const app = new Elysia().use(
    createSubmissionModule({
      submissionService: submissionService as unknown as SubmissionService,
      jwtAuth: jwtPlugins.jwtAuth,
    }),
  );
  return { app, submissionService };
};

const request = (
  app: ReturnType<typeof makeApp>["app"],
  path: string,
  token: string,
  method = "GET",
  body?: unknown,
  idempotencyKey?: string,
) =>
  app.handle(
    new Request(`http://localhost${path}`, {
      method,
      headers: {
        authorization: `Bearer ${token}`,
        ...(body ? { "content-type": "application/json" } : {}),
        ...(idempotencyKey ? { "idempotency-key": idempotencyKey } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    }),
  );

describe("submission routes", () => {
  it("accepts a student's source with an idempotency key", async () => {
    const { app, submissionService } = makeApp();
    const studentToken = await tokenFor("student-id", "STU");
    const response = await request(
      app,
      `/labs/${labId}/submissions`,
      studentToken,
      "POST",
      { source: "int main() {}" },
      "attempt-1",
    );

    expect(response.status).toBe(202);
    expect(response.headers.get("location")).toBe(
      `/submissions/${submissionId}`,
    );
    expect(await response.json()).toMatchObject({ submission });
    expect(submissionService.submit).toHaveBeenCalledWith({
      labId,
      studentUserId: "student-id",
      role: "STU",
      source: "int main() {}",
      idempotencyKey: "attempt-1",
    });
  });

  it("blocks non-students from submitting", async () => {
    const { app, submissionService } = makeApp();
    const taToken = await tokenFor("ta-id", "TA");
    const response = await request(
      app,
      `/labs/${labId}/submissions`,
      taToken,
      "POST",
      { source: "int main() {}" },
      "attempt-1",
    );

    expect(response.status).toBe(403);
    expect(submissionService.submit).not.toHaveBeenCalled();
  });

  it("lets a student fetch their own submission snapshot", async () => {
    const { app, submissionService } = makeApp();
    const studentToken = await tokenFor("student-id", "STU");
    const response = await request(
      app,
      `/submissions/${submissionId}`,
      studentToken,
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ submission });
    expect(submissionService.getOwn).toHaveBeenCalledWith({
      submissionId,
      studentUserId: "student-id",
    });
  });
});
