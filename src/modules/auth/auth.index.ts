import { Elysia, ParseError, ValidationError } from "elysia";
import * as AuthModel from "./auth.model";
import { AppError } from "../../libs/errors/app-error";
import { TokenService } from "./token.service";
import { AuthService } from "./auth.service";
import type { UserProvider } from "../user/interface/user-provider";
import type { JwtPlugins } from "../../plugins/jwt.plugin";

interface AuthModuleDeps {
  userProvider: UserProvider;
  accessJwt: JwtPlugins["accessJwt"];
  refreshJwt: JwtPlugins["refreshJwt"];
  jwtAuth: JwtPlugins["jwtAuth"];
}

export const createAuthModule = ({
  userProvider,
  accessJwt,
  refreshJwt,
  jwtAuth,
}: AuthModuleDeps) => {
  return new Elysia({ prefix: "/auth" })
    .use(accessJwt)
    .use(refreshJwt)
    .use(jwtAuth)
    .decorate((deps) => {
      const tokens = new TokenService(deps.access, deps.refresh);
      return {
        ...deps,
        auth: new AuthService(tokens, userProvider),
      };
    })
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
      "/login",
      { body: AuthModel.LoginSchema.Body },
      async ({ auth, body, set }) => {
        const result = await auth.login(body);
        set.status = 200;

        return {
          success: true,
          message: "LoginSchema successfully",
          tokens: result.tokens,
          user: result.user,
        };
      },
    )
    .post(
      "/signup",
      { body: AuthModel.SignUpSchema.Body },
      async ({ auth, body, set }) => {
        await auth.signup(body);
        set.status = 201;
        return {
          success: true,
          message:
            "User created successfully. Please proceed to the login screen",
        };
      },
    )
    .get(
      "/refresh",
      { jwtAuth: "refresh" },
      async ({ auth, jwtPayload, set }) => {
        const accessToken = await auth.issueNewAccessToken(jwtPayload);

        set.status = 200;

        return {
          success: true,
          message: "Token generate successfully",
          tokens: { accessToken },
        };
      },
    );
};
