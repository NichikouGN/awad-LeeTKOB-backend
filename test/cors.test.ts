import { expect, it } from "bun:test";
import { Elysia } from "elysia";
import { createCorsPlugin } from "../src/plugins/cors.plugin";

it("allows frontend preflight for bearer, JSON and idempotency headers", async () => {
  const app = new Elysia()
    .use(createCorsPlugin())
    .post("/submissions", () => "ok");
  for (const origin of ["http://localhost:5173", "http://127.0.0.1:5173"]) {
    const response = await app.handle(
      new Request("http://localhost/submissions", {
        method: "OPTIONS",
        headers: {
          Origin: origin,
          "Access-Control-Request-Method": "POST",
          "Access-Control-Request-Headers":
            "authorization,content-type,idempotency-key",
        },
      }),
    );
    expect(response.status).toBe(204);
    expect(response.headers.get("access-control-allow-origin")).toBe(origin);
    const allowed =
      response.headers.get("access-control-allow-headers")?.toLowerCase() ?? "";
    for (const name of ["authorization", "content-type", "idempotency-key"])
      expect(allowed).toContain(name);
  }
});

it("does not allow unrelated origins and preserves CORS headers on errors", async () => {
  const app = new Elysia()
    .use(createCorsPlugin())
    .get("/private", ({ status }) => status(401));
  const denied = await app.handle(
    new Request("http://localhost/private", {
      headers: { Origin: "https://unrelated.example" },
    }),
  );
  expect(denied.headers.get("access-control-allow-origin")).toBeNull();
  const response = await app.handle(
    new Request("http://localhost/private", {
      headers: { Origin: "http://localhost:5173" },
    }),
  );
  expect(response.status).toBe(401);
  expect(response.headers.get("access-control-allow-origin")).toBe(
    "http://localhost:5173",
  );
});
