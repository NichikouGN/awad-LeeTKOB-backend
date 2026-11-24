import { Elysia, t } from "elysia";
import type { JwtPlugins } from "../../plugins/jwt.plugin";
import { rbac } from "../../plugins/role.plugin";
import { mapApiError } from "../../libs/errors/problem-details";
import type { ReviewService } from "./queue.service";
export const createReviewModule = (deps: {
  service: ReviewService;
  jwtAuth: JwtPlugins["jwtAuth"];
}) =>
  new Elysia()
    .use(deps.jwtAuth)
    .use(rbac)
    .onError(({ error, set }) => mapApiError(error, set))
    .get(
      "/labs/:labId/reviews",
      {
        jwtAuth: "access",
        rbac: ["TA"],
        params: t.Object({ labId: t.String({ format: "uuid" }) }),
        query: t.Object({
          page: t.Optional(
            t.Numeric({
              minimum: 1,
              maximum: 100000,
              multipleOf: 1,
              default: 1,
            }),
          ),
          limit: t.Optional(
            t.Numeric({ minimum: 1, maximum: 100, multipleOf: 1, default: 20 }),
          ),
          view: t.Optional(t.Union([t.Literal("queue"), t.Literal("all")])),
        }),
      },
      ({ jwtPayload, params, query }) =>
        deps.service.list(
          { ...params, userId: jwtPayload.userId, role: jwtPayload.role },
          query.page ?? 1,
          query.limit ?? 20,
          query.view ?? "queue",
        ),
    )
    .post(
      "/labs/:labId/reviews/:itemId/decisions",
      {
        jwtAuth: "access",
        rbac: ["TA"],
        params: t.Object({
          labId: t.String({ format: "uuid" }),
          itemId: t.String({ format: "uuid" }),
        }),
        body: t.Object({
          verdict: t.Union([t.Literal("pass"), t.Literal("violation")]),
          reason: t.String({ minLength: 1, maxLength: 4000 }),
          version: t.Integer({ minimum: 0 }),
          evidence: t.Array(
            t.Object({
              line: t.Integer({ minimum: 1 }),
              text: t.String({ minLength: 1, maxLength: 65536 }),
            }),
            { maxItems: 100 },
          ),
        }),
      },
      ({ jwtPayload, params, body }) =>
        deps.service.decide(
          {
            labId: params.labId,
            userId: jwtPayload.userId,
            role: jwtPayload.role,
          },
          params.itemId,
          body,
        ),
    );
