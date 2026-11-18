import { Elysia } from "elysia";
import { jwt } from "@elysia/jwt";
import "dotenv/config";
import { AppError } from "../libs/errors/app-error";

const JWT_ACCESS_TOKEN = process.env.JWT_ACCESS_TOKEN;
const JWT_REFRESH_TOKEN = process.env.JWT_REFRESH_TOKEN;

if (!JWT_ACCESS_TOKEN || !JWT_REFRESH_TOKEN)
  throw new Error("JWT env not supplied");

export const accessJwt = jwt({
  name: "access",
  secret: JWT_ACCESS_TOKEN,
  exp: "15m",
});

export const refreshJwt = jwt({
  name: "refresh",
  secret: JWT_REFRESH_TOKEN,
  exp: "7d",
});

const isUserRole = (role: unknown): role is "ADMIN" | "TA" | "STU" =>
  role === "ADMIN" || role === "TA" || role === "STU";

// Reusable Plugin to perform jwt check
export const jwtAuth = new Elysia({ name: "plugin.auth" })
  .use(accessJwt)
  .use(refreshJwt)
  .macro({
    jwtAuth: (tokenType: "access" | "refresh") => ({
      derive: async ({ headers, status, access, refresh }) => {
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

        const jwtPayload = {
          userId: payload.userId,
          role: payload.role,
        };

        return { jwtPayload };
      },
    }),
  });
