import { describe, expect, it, mock } from "bun:test";
import { Elysia } from "elysia";
import { createLabModule } from "../src/modules/lab";
import type { LabService } from "../src/modules/lab/service";
import { createJwtPlugins } from "../src/plugins/jwt.plugin";

const classId = "64d0d19a-73e8-4d19-bae2-1d6c0f10f397";
const labId = "64d0d19e-73e8-4d19-bae2-1d6c0f10f397";
const lab = {
  labId,
  classId,
  title: "Sorting lab",
  statement: "Implement merge sort.",
  status: "scheduled",
  opensAt: "2026-11-20T00:00:00.000Z",
  deadlineAt: "2026-11-25T12:00:00.000Z",
  constraints: [{ id: "C1", text: "Use merge sort.", deduction: 3 }],
  limits: { cpuSeconds: 1, memoryMb: 256 },
  createdAt: "2026-11-18T10:00:00.000Z",
  updatedAt: "2026-11-18T10:00:00.000Z",
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
  const labService = {
    create: mock(async () => lab),
    listByClass: mock(async () => [lab]),
    getById: mock(async () => lab),
  };
  const app = new Elysia().use(
    createLabModule({
      labService: labService as unknown as LabService,
      jwtAuth: jwtPlugins.jwtAuth,
    }),
  );
  return { app, labService };
};

const request = (
  app: ReturnType<typeof makeApp>["app"],
  path: string,
  token: string,
  method = "GET",
  body?: unknown,
) =>
  app.handle(
    new Request(`http://localhost${path}`, {
      method,
      headers: {
        authorization: `Bearer ${token}`,
        ...(body ? { "content-type": "application/json" } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    }),
  );

describe("lab routes", () => {
  it("lets an assigned-role TA create a lab and returns its resource location", async () => {
    const { app, labService } = makeApp();
    const taToken = await tokenFor("ta-id", "TA");
    const response = await request(
      app,
      `/classes/${classId}/labs`,
      taToken,
      "POST",
      {
        title: "Sorting lab",
        statement: "Implement merge sort.",
        opensAt: "2026-11-20T00:00:00.000Z",
        deadlineAt: "2026-11-25T12:00:00.000Z",
        constraints: [{ id: "C1", text: "Use merge sort.", deduction: 3 }],
        tests: [{ input: "3 1 2", expectedOutput: "1 2 3" }],
      },
    );

    expect(response.status).toBe(201);
    expect(response.headers.get("location")).toBe(`/labs/${labId}`);
    expect(await response.json()).toMatchObject({ lab: { labId, title: "Sorting lab" } });
    expect(labService.create).toHaveBeenCalledWith(
      expect.objectContaining({ classId, userId: "ta-id", role: "TA" }),
    );
  });

  it("blocks students from creating labs", async () => {
    const { app, labService } = makeApp();
    const studentToken = await tokenFor("student-id", "STU");
    const response = await request(
      app,
      `/classes/${classId}/labs`,
      studentToken,
      "POST",
      {
        title: "Sorting lab",
        statement: "Implement merge sort.",
        opensAt: "2026-11-20T00:00:00.000Z",
        deadlineAt: "2026-11-25T12:00:00.000Z",
        constraints: [{ id: "C1", text: "Use merge sort.", deduction: 3 }],
        tests: [{ input: "3 1 2", expectedOutput: "1 2 3" }],
      },
    );

    expect(response.status).toBe(403);
    expect(labService.create).not.toHaveBeenCalled();
  });

  it("lists labs with the documented pagination defaults", async () => {
    const { app, labService } = makeApp();
    const studentToken = await tokenFor("student-id", "STU");
    const response = await request(
      app,
      `/classes/${classId}/labs`,
      studentToken,
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ labs: [lab], page: 1, limit: 20 });
    expect(labService.listByClass).toHaveBeenCalledWith({
      classId,
      userId: "student-id",
      role: "STU",
      page: 1,
      limit: 20,
    });
  });

  it("serves lab detail through the documented path", async () => {
    const { app, labService } = makeApp();
    const taToken = await tokenFor("ta-id", "TA");
    const response = await request(app, `/labs/${labId}`, taToken);

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ lab: { labId } });
    expect(labService.getById).toHaveBeenCalledWith({
      labId,
      userId: "ta-id",
      role: "TA",
    });
  });
});
