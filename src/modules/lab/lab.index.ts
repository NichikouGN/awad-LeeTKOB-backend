import { Elysia } from "elysia";
import { mapApiError } from "../../libs/errors/problem-details";
import { rbac } from "../../plugins/role.plugin";
import type { JwtPlugins } from "../../plugins/jwt.plugin";
import type { LabService } from "./lab.service";
import * as LabModel from "./lab.model";

export const createLabModule = (deps: {
  labService: LabService;
  jwtAuth: JwtPlugins["jwtAuth"];
}) =>
  new Elysia({ prefix: "/" })
    .use(deps.jwtAuth)
    .use(rbac)
    .onError(({ error, set }) => mapApiError(error, set))
    .post(
      "/classes/:classId/labs",
      {
        jwtAuth: "access",
        rbac: ["TA"],
        params: LabModel.CreateLabSchema.Params,
        body: LabModel.CreateLabSchema.Body,
      },
      async ({ jwtPayload, params, body, set }) => {
        const lab = await deps.labService.create({
          ...body,
          classId: params.classId,
          userId: jwtPayload.userId,
          role: jwtPayload.role,
        });
        set.status = 201;
        set.headers.location = `/labs/${lab.labId}`;
        return { lab };
      },
    )
    .get(
      "/classes/:classId/labs",
      {
        jwtAuth: "access",
        params: LabModel.ClassLabsSchema.Params,
        query: LabModel.ClassLabsSchema.Query,
      },
      async ({ jwtPayload, params, query }) => ({
        labs: await deps.labService.listByClass({
          classId: params.classId,
          userId: jwtPayload.userId,
          role: jwtPayload.role,
          page: query.page,
          limit: query.limit,
        }),
        page: query.page,
        limit: query.limit,
      }),
    )
    .get(
      "/labs/:labId",
      {
        jwtAuth: "access",
        params: LabModel.LabIdSchema.Params,
      },
      async ({ jwtPayload, params }) => ({
        lab: await deps.labService.getById({
          labId: params.labId,
          userId: jwtPayload.userId,
          role: jwtPayload.role,
        }),
      }),
    );
