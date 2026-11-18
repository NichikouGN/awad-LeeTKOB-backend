import { Elysia, ParseError, ValidationError } from "elysia";
import { ClassService } from "./class.service";
import { jwtAuth } from "../../plugins/jwt.plugin";
import { rbac } from "../../plugins/role.plugin";
import { AppError } from "../../libs/errors/app-error";
import * as ClassModel from "./class.model";

export const createClassModule = (classService: ClassService) => {
  return new Elysia({ prefix: "/classes" })
    .use(jwtAuth)
    .use(rbac)
    .decorate("classService", classService)
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

      set.status = 500;
      return {
        success: false,
        message: error,
      };
    })
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
          message: "Class created successfully",
          class: {
            classId: result.classId,
            className: result.className,
          },
        };
      },
    );
};
