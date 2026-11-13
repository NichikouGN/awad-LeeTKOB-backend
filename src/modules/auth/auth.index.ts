import { Elysia, t } from "elysia";
import { TokenService } from "./token.service";
import { AuthService } from "./auth.service";
import { jwtAuth } from "../../plugins/jwt.plugin";
import { accessJwt, refreshJwt } from "../../plugins/jwt.plugin";
import { UserProvider } from "../users/interfaces/users-provider";
import * as AuthModel from "./auth.model";
import { AppError } from "../../libs/errors/app-error";

export const createAuthModule = (userProvider: UserProvider) => {
  return new Elysia({ prefix: "/auth" })
    .use(jwtAuth)
    .use(accessJwt)
    .use(refreshJwt)
    .decorate((deps) => {
      const tokens = new TokenService(deps.access, deps.refresh);
      return {
        ...deps,
        auth: new AuthService(tokens, userProvider),
      };
    })
    .post("/login", { body: AuthModel.Login.Body }, async ({ auth, body }) => {
      return await auth.login(body);
    })
    .onError(({ error, status }) => {
      if (error instanceof AppError) {
        return status(error.status as any, error.message);
      }

      return status(500, "Internal Server Errors");
    });
};
