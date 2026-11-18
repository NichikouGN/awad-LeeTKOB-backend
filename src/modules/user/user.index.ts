import { Elysia } from "elysia";
import { UserService } from "./user.service";
import { jwtAuth } from "../../plugins/jwt.plugin";
import { rbac } from "../../plugins/role.plugin";
import { AppError } from "../../libs/errors/app-error";
import { ValidationError, ParseError } from "elysia";
import * as UserModel from "./user.model";
import { adminCheck } from "../../plugins/adminCheck.plugin";

export const createUserModule = (userService: UserService) =>
  new Elysia({ prefix: "/users" })
    .use(jwtAuth)
    .use(rbac)
    .use(adminCheck)
    .decorate("userService", userService)
    .onError(({ error, set }) => {
      if (error instanceof AppError) {
        set.status = error.status;
        return {
          success: false,
          message: error.message,
        };
      }

      if (error instanceof ValidationError) {
        set.status = 422;
        return {
          success: false,
          message: error.errors,
        };
      }

      if (error instanceof ParseError) {
        set.status = 400;
        return {
          success: false,
          message: error,
        };
      }

      // Remember to remove these error in message
      set.status = 500;
      return {
        success: false,
        message: error,
      };
    })
    .group("/", { jwtAuth: "access" }, (app) =>
      app

        // ===================================
        // ||        TA, STU Route          ||
        // ===================================
        .get(
          "/:userId",
          {
            rbac: ["TA", "STU"],
            params: UserModel.UserParamsSchema.Params,
          },

          async ({ params, set }) => {
            const result = await userService.getUserProfile(params.userId);

            set.status = 200;

            return {
              success: true,
              message: "User Found",
              user: result,
            };
          },
        )
        .patch(
          "/:userId/edit",
          {
            rbac: ["TA", "STU"],
            params: UserModel.UserParamsSchema.Params,
            body: UserModel.EditUserSchema.Body,
          },
          async ({ params, body, set }) => {
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
          ({ params, body, set }) => {
            const userId = params.userId;
            const status = body.status;

            const result = userService.updateUserStatus(userId, status);
            set.status = 200;
            return {
              success: true,
              message: "User status updated successfully",
              user: result,
            };
          },
        ),
    );
