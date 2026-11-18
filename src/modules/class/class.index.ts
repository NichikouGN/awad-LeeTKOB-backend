import { Elysia } from "elysia";
import { mapApiError } from "../../libs/errors/problem-details";
import * as ClassModel from "./class.model";
import type { ClassService } from "./class.service";
import type { JwtPlugins } from "../../plugins/jwt.plugin";
import { rbac } from "../../plugins/role.plugin";

interface ClassModuleDeps {
  classService: ClassService;
  jwtAuth: JwtPlugins["jwtAuth"];
}

export const createClassModule = ({ classService, jwtAuth }: ClassModuleDeps) =>
  new Elysia({ prefix: "/classes" })
    .use(jwtAuth)
    .use(rbac)
    .decorate("classService", classService)
    .onError(({ error, set }) => mapApiError(error, set))
    .post(
      "/join",
      {
        jwtAuth: "access",
        rbac: ["STU"],
        body: ClassModel.JoinClassSchema.Body,
      },
      async ({ jwtPayload, body, set }) => {
        const result = await classService.joinByCode({
          invitationCode: body.invitationCode,
          studentUserId: jwtPayload.userId,
        });
        set.status = 200;
        return { success: true, class: result };
      },
    )
    .get(
      "/:classId",
      {
        jwtAuth: "access",
        params: ClassModel.GetClassDetailSchema.Params,
      },
      async ({ jwtPayload, params, set }) => {
        const result = await classService.getClassDetail({
          classId: params.classId,
          userId: jwtPayload.userId,
          role: jwtPayload.role,
        });
        set.status = 200;
        return { success: true, class: result };
      },
    )
    .get(
      "/",
      {
        jwtAuth: "access",
        query: ClassModel.GetClassListSchema.Query,
      },
      async ({ jwtPayload, query, set }) => {
        const classes = await classService.getClassList({
          userId: jwtPayload.userId,
          role: jwtPayload.role,
          page: query.page,
          limit: query.limit,
        });
        set.status = 200;
        return {
          success: true,
          classes,
          page: query.page,
          limit: query.limit,
        };
      },
    )
    .post(
      "/",
      {
        body: ClassModel.CreateClass.Body,
        jwtAuth: "access",
        rbac: ["ADMIN"],
      },
      async ({ jwtPayload, body, set }) => {
        const result = await classService.createClass({
          className: body.className,
          adminId: jwtPayload.userId,
        });

        set.status = 201;
        return {
          success: true,
          class: result,
        };
      },
    )
    .put(
      "/:classId/tas/:userId",
      {
        jwtAuth: "access",
        rbac: ["ADMIN"],
        params: ClassModel.ClassUserParamsSchema.Params,
      },
      async ({ jwtPayload, params, set }) => {
        const assignment = await classService.assignTa({
          classId: params.classId,
          taUserId: params.userId,
          assignedByUserId: jwtPayload.userId,
        });
        set.status = 200;
        return {
          success: true,
          assignment: {
            classId: assignment.classId,
            userId: assignment.userId,
            assignedAt: assignment.changedAt,
          },
        };
      },
    )
    .put(
      "/:classId/students/:userId",
      {
        jwtAuth: "access",
        rbac: ["ADMIN", "TA"],
        params: ClassModel.ClassUserParamsSchema.Params,
      },
      async ({ jwtPayload, params, set }) => {
        const membership = await classService.enrollStudent({
          classId: params.classId,
          studentUserId: params.userId,
          joinedByUserId: jwtPayload.userId,
          actorRole: jwtPayload.role as "ADMIN" | "TA",
        });
        set.status = 200;
        return {
          success: true,
          membership: {
            classId: membership.classId,
            userId: membership.userId,
            joinedAt: membership.changedAt,
          },
        };
      },
    );
