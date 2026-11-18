import { Elysia } from "elysia";
import { jwt } from "@elysia/jwt";
import "dotenv/config";
import { AppError } from "../libs/errors/app-error";
import type { UserProvider } from "../modules/user/interface/user-provider";

const isUserRole = (role: unknown): role is "ADMIN" | "TA" | "STU" =>
  role === "ADMIN" || role === "TA" || role === "STU";

export const createJwtPlugins = (config: {
  accessSecret: string;
  refreshSecret: string;
  userProvider?: UserProvider;
}) => {
  const accessJwt = jwt({
    name: "access",
    secret: config.accessSecret,
    exp: "15m",
  });

  const refreshJwt = jwt({
    name: "refresh",
    secret: config.refreshSecret,
    exp: "7d",
  });

  const jwtAuth = new Elysia({ name: "plugin.auth" })
    .use(accessJwt)
    .use(refreshJwt)
    .macro({
      jwtAuth: (tokenType: "access" | "refresh" | "optional") => ({
        derive: async ({ headers, access, refresh }) => {
          const authorization = headers.authorization;

          if (!authorization?.startsWith("Bearer ")) {
            throw new AppError(401, "Unauthorized");
          }

          const token = authorization.slice(7);

          const verifier = tokenType === "access" ? access : refresh;
          const payload = await verifier.verify(token);

          if (
            !payload ||
            typeof payload.userId !== "string" ||
            payload.type !== tokenType ||
            !isUserRole(payload.role)
          ) {
            throw new AppError(401, "Invalid or Expired token");
          }

          if (config.userProvider) {
            const [currentRole, currentStatus] = await Promise.all([
              config.userProvider.getUserRole(payload.userId),
              config.userProvider.getUserStatus(payload.userId),
            ]);
            if (currentRole !== payload.role || currentStatus !== "ACTIVE") {
              throw new AppError(401, "Invalid or Expired token");
            }
          }

          const jwtPayload = {
            userId: payload.userId,
            role: payload.role,
          };

          return { jwtPayload };
        },
      }),
    });
  const optionalJwtAuth = new Elysia({ name: "plugin.auth" })
    .use(accessJwt)
    .macro({
      jwtAuth: (optionalToken: string | null) => ({
        derive: async ({ headers, access }) => {
          const authorization = headers.authorization;

          if (!authorization?.startsWith("Bearer ") || !optionalToken) {
            const jwtPayload = {
              userId: "optional",
              role: "optional",
            };

            return { jwtPayload };
          }

          const token = authorization.slice(7);
          const payload = await access.verify(token);

          if (
            !payload ||
            typeof payload.userId !== "string" ||
            payload.type !== "access" ||
            !isUserRole(payload.role)
          ) {
            throw new AppError(401, "Invalid or Expired token");
          }

          if (config.userProvider) {
            const [currentRole, currentStatus] = await Promise.all([
              config.userProvider.getUserRole(payload.userId),
              config.userProvider.getUserStatus(payload.userId),
            ]);
            if (currentRole !== payload.role || currentStatus !== "ACTIVE") {
              throw new AppError(401, "Invalid or Expired token");
            }
          }

          const jwtPayload = {
            userId: payload.userId,
            role: payload.role,
          };

          return { jwtPayload };
        },
      }),
    });
  return { accessJwt, refreshJwt, jwtAuth, optionalJwtAuth };
};

export type JwtPlugins = ReturnType<typeof createJwtPlugins>;
