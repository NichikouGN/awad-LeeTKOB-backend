import { Elysia } from "elysia";
import { AppError } from "../../libs/errors/app-error";
import { mapApiError } from "../../libs/errors/problem-details";
import * as UserModel from "./user.model";
import { adminCheck } from "../../plugins/adminCheck.plugin";
import { rbac } from "../../plugins/role.plugin";
import type { JwtPlugins } from "../../plugins/jwt.plugin";
import type { UserService } from "./user.service";

interface UserModuleDeps {
  userService: UserService;
  jwtAuth: JwtPlugins["jwtAuth"];
}

export const createUserModule = ({ userService, jwtAuth }: UserModuleDeps) =>
  new Elysia()
    .use(jwtAuth)
    .use(rbac)
    .use(adminCheck)
    .decorate("userService", userService)
    .onError(({ error, set }) => mapApiError(error, set))
    .get(
      "/profile",
      { jwtAuth: "access", rbac: ["ADMIN", "TA", "STU"] },

      async ({ jwtPayload, set }) => {
        const result = await userService.getUserProfile(jwtPayload.userId);

        set.status = 200;

        return {
          success: true,
          message: "User Found",
          user: result,
        };
      },
    )
    .group("/users", { jwtAuth: "access" }, (app) =>
      app
        .get(
          "/",
          {
            rbac: ["ADMIN"],
            query: UserModel.GetUserListSchema.Query,
          },
          async ({ query, set }) => {
            const result = await userService.getUsers(query.page, query.limit);
            set.status = 200;
            return {
              success: true,
              users: result,
              page: query.page,
              limit: query.limit,
            };
          },
        )
        // ===================================
        // ||        TA, STU Route          ||
        // ===================================
        .patch(
          "/:userId/edit",
          {
            rbac: ["ADMIN", "TA", "STU"],
            params: UserModel.UserParamsSchema.Params,
            body: UserModel.EditUserSchema.Body,
          },
          async ({ jwtPayload, params, body, set }) => {
            if (jwtPayload.userId !== params.userId) {
              throw new AppError(403, "You may only edit your own profile");
            }
            const result = await userService.patchUserProfile(
              params.userId,
              body.displayName,
            );

            set.status = 200;

            return {
              success: true,
              message: "User updated successfully",
              user: result,
            };
          },
        )
        // ===================================
        // ||         ADMIN Route           ||
        // ===================================
        .patch(
          "/:userId/role",
          {
            rbac: ["ADMIN"],
            params: UserModel.UpdateUserRoleSchema.Params,
            body: UserModel.UpdateUserRoleSchema.Body,
            adminCheck: true,
          },
          async ({ jwtPayload, params, body, set }) => {
            const userId = params.userId;
            const curRole = jwtPayload.role;

            const newRole = body.role;

            if (curRole === newRole) {
              set.status = 200;
              return {
                success: true,
                message: `User role is already ${curRole}`,
              };
            }

            const result = await userService.updateUserRole(userId, newRole);

            set.status = 200;
            return {
              success: true,
              message: "User role updated successfully",
              userId: userId,
              userRole: newRole,
              adminId: jwtPayload.userId,
              user: result,
            };
          },
        )
        .patch(
          "/:userId/status",
          {
            rbac: ["ADMIN"],
            params: UserModel.UpdateUserStatusSchema.Params,
            body: UserModel.UpdateUserStatusSchema.Body,
            adminCheck: true,
          },
          async ({ params, body, set }) => {
            const userId = params.userId;
            const status = body.status;

            const result = await userService.updateUserStatus(userId, status);
            set.status = 200;
            return {
              success: true,
              message: "User status updated successfully",
              user: result,
            };
          },
        ),
    );
