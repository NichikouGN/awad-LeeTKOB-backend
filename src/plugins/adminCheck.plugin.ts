import { Elysia } from "elysia";
import { AppError } from "../libs/errors/app-error";
import type { JwtPayload } from "../modules/auth/token.service";
import type * as AuthModel from "../modules/user/user.model";

export const adminCheck = new Elysia({ name: "plugin.adminCheck" }).macro({
  adminCheck: () => ({
    beforeHandle({
      jwtPayload,
      params,
    }: {
      jwtPayload: JwtPayload;
      params: AuthModel.UserIdSchema["Params"];
    }) {
      const adminId = jwtPayload.userId;
      const userId = params.userId;
      if (adminId === userId)
        throw new AppError(409, "Unable to update your own admin account");
    },
  }),
});
