import { describe, expect, it } from "bun:test";
import { createApp } from "../../src/app";
import { InMemoryLabRepository, type Lab } from "../../src/repositories/lab.repository";
import type { Principal } from "../../src/plugins/auth.plugin";

const now = new Date("2026-11-10T12:00:00.000Z");
const lab: Lab = {
  id: 41,
  classId: 7,
  deadline: "2026-11-09T22:00:00.000Z",
  pendingReviews: 0,
  publishedAt: null,
};

const ta: Principal = { userId: "ta-1", role: "ta", classIds: [7] };
const student: Principal = { userId: "student-1", role: "student", classIds: [7] };

function makeApp(options: { principal?: Principal | null; seededLab?: Lab } = {}) {
  const repository = new InMemoryLabRepository([options.seededLab ?? lab]);
  const app = createApp({
    authenticate: (header) => (header === "Bearer good-token" ? (options.principal ?? ta) : null),
    labs: repository,
    now: () => now,
  });

  return { app, repository };
}

function request(
  app: ReturnType<typeof createApp>,
  labId: number | string = 41,
  token?: string,
  body?: string,
) {
  return app.handle(
    new Request(`http://localhost/api/v1/labs/${labId}/publish`, {
      method: "POST",
      headers: token ? { authorization: token } : {},
      body,
    }),
  );
}

async function expectProblem(response: Response, status: number, slug: string) {
  expect(response.status).toBe(status);
  expect(response.headers.get("content-type")).toContain("application/problem+json");
  const body = await response.json();
  expect(body).toMatchObject({
    type: `https://leetkob.example/problems/${slug}`,
    status,
  });
  expect(typeof body.title).toBe("string");
  expect(typeof body.detail).toBe("string");
}

describe("POST /api/v1/labs/{labId}/publish contract", () => {
  it("requires valid bearer credentials", async () => {
    const { app } = makeApp();
    const response = await request(app, 41, "Bearer invalid");

    await expectProblem(response, 401, "authentication-required");
    expect(response.headers.get("www-authenticate")).toBe("Bearer");
  });

  it("allows only TAs", async () => {
    const { app } = makeApp({ principal: student });
    const response = await request(app, 41, "Bearer good-token");

    await expectProblem(response, 403, "forbidden");
  });

  it("hides labs owned by a different class", async () => {
    const otherClassTa: Principal = {
      userId: "ta-2",
      role: "ta",
      classIds: [8],
    };
    const { app } = makeApp({ principal: otherClassTa });
    const response = await request(app, 41, "Bearer good-token");

    await expectProblem(response, 404, "lab-not-found");
  });

  it("returns not found for an unknown lab", async () => {
    const { app } = makeApp();
    const response = await request(app, 999, "Bearer good-token");

    await expectProblem(response, 404, "lab-not-found");
  });

  it("returns not found for a malformed lab ID", async () => {
    const { app } = makeApp();
    const response = await request(app, "01", "Bearer good-token");

    await expectProblem(response, 404, "lab-not-found");
  });

  it("rejects a non-empty request body", async () => {
    const { app } = makeApp();
    const response = await request(app, 41, "Bearer good-token", "{}");

    await expectProblem(response, 400, "validation");
  });

  it("rejects publishing before the submission deadline", async () => {
    const { app } = makeApp({
      seededLab: { ...lab, deadline: "2026-11-11T22:00:00.000Z" },
    });
    const response = await request(app, 41, "Bearer good-token");

    await expectProblem(response, 409, "deadline-not-passed");
  });

  it("allows publishing exactly at the deadline", async () => {
    const { app } = makeApp({
      seededLab: { ...lab, deadline: now.toISOString() },
    });
    const response = await request(app, 41, "Bearer good-token");

    expect(response.status).toBe(200);
  });

  it("rejects publishing while any review is pending", async () => {
    const { app } = makeApp({ seededLab: { ...lab, pendingReviews: 1 } });
    const response = await request(app, 41, "Bearer good-token");

    await expectProblem(response, 409, "reviews-pending");
  });

  it("publishes a reviewed lab and returns its timestamp", async () => {
    const { app, repository } = makeApp();
    const response = await request(app, 41, "Bearer good-token");

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(await response.json()).toEqual({
      labId: 41,
      status: "published",
      publishedAt: now.toISOString(),
    });
    expect(repository.findById(41)?.publishedAt).toBe(now.toISOString());
  });

  it("makes repeated publish requests safe and returns the original timestamp", async () => {
    const { app } = makeApp();
    const first = await request(app, 41, "Bearer good-token");
    const firstBody = await first.json();
    const second = await request(app, 41, "Bearer good-token");

    expect(second.status).toBe(200);
    expect(await second.json()).toEqual(firstBody);
  });

  it("returns a generic RFC 9457 response if the repository fails", async () => {
    const app = createApp({
      authenticate: () => ta,
      labs: {
        findById() {
          throw new Error("database connection string must not leak");
        },
        publish() {
          return null;
        },
      },
      now: () => now,
    });
    const response = await request(app, 41, "Bearer good-token");
    const bodyText = await response.clone().text();

    await expectProblem(response, 500, "internal");
    expect(bodyText).not.toContain("database connection string");
  });
});
