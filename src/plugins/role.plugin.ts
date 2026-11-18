import { Elysia } from "elysia";
import { AppError } from "../libs/errors/app-error";
import { JwtPayload } from "../modules/auth/token.service";

export const rbac = new Elysia({ name: "plugin.rbac" }).macro({
  rbac: (allowedRoles: JwtPayload["role"][]) => ({
    beforeHandle({ jwtPayload }: { jwtPayload: JwtPayload }) {
      if (!allowedRoles.includes(jwtPayload.role)) {
        throw new AppError(403, "Not allowed");
      }
    },
  }),
});
