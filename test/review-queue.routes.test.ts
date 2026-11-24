import { Elysia } from "elysia";
import { expect, it, mock } from "bun:test";
import { createReviewModule } from "../src/modules/constraint-review/queue.index";
import { createJwtPlugins } from "../src/plugins/jwt.plugin";
import { ReviewService } from "../src/modules/constraint-review/queue.service";
import { AppError } from "../src/libs/errors/app-error";
const labId = "64d0d19e-73e8-4d19-bae2-1d6c0f10f397";
const itemId = "64d0d19e-73e8-4d19-bae2-1d6c0f10f398";
it("enforces verified TA authentication, class ownership, and decision schema on routes", async () => {
  const jwt = createJwtPlugins({
    accessSecret: "queue-test-access",
    refreshSecret: "queue-test-refresh",
  });
  const repo = { list: mock(async () => []), decide: mock(async () => {}) };
  const labs = {
    getById: mock(async (actor: { userId: string }) => {
      if (actor.userId !== "owner") throw new AppError(404, "Lab not found");
      return {} as never;
    }),
  };
  const app = new Elysia().use(
    createReviewModule({
      service: new ReviewService(repo, labs),
      jwtAuth: jwt.jwtAuth,
    }),
  );
  async function token(userId: string, role: string) {
    const issuer = new Elysia()
      .use(jwt.accessJwt)
      .get("/token", ({ access }) =>
        access.sign({ userId, role, type: "access" }),
      );
    return (await issuer.handle(new Request("http://localhost/token"))).text();
  }
  async function request(auth?: string, body?: unknown) {
    return app.handle(
      new Request(
        "http://localhost/labs/" +
          labId +
          "/reviews" +
          (body ? `/${itemId}/decisions` : ""),
        {
          method: body ? "POST" : "GET",
          headers: {
            ...(auth ? { authorization: `Bearer ${auth}` } : {}),
            ...(body ? { "content-type": "application/json" } : {}),
          },
          ...(body ? { body: JSON.stringify(body) } : {}),
        },
      ),
    );
  }
  expect((await request()).status).toBe(401);
  expect((await request("not-a-jwt")).status).toBe(401);
  expect((await request(await token("student", "STU"))).status).toBe(403);
  expect((await request(await token("other", "TA"))).status).toBe(404);
  expect(repo.list).not.toHaveBeenCalled();
  const owner = await token("owner", "TA");
  expect((await request(owner)).status).toBe(200);
  expect(
    (
      await request(owner, {
        verdict: "unsure",
        reason: "x",
        version: 0,
        evidence: [],
      })
    ).status,
  ).toBe(400);
  expect(repo.decide).not.toHaveBeenCalled();
  expect(
    (
      await request(owner, {
        verdict: "pass",
        reason: "Checked",
        version: 0,
        evidence: [],
      })
    ).status,
  ).toBe(200);
  expect(repo.decide).toHaveBeenCalledTimes(1);
});
