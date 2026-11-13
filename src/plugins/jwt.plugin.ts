import { Elysia } from "elysia";
import { jwt } from "@elysia/jwt";
import "dotenv/config";

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

// Reusable Plugin to perform jwt check
export const jwtAuth = new Elysia({ name: "plugin.auth" })
  .use(accessJwt)
  .use(refreshJwt)
  .macro({
    jwtAuth: {
      derive: async ({ headers, status, access }) => {
        const authorization = headers.authorization;

        if (!authorization?.startsWith("Bearer ")) {
          return status(401, "Unauthorized");
        }

        const token = authorization.slice(7);
        console.log(`token extracted: ${token}`);
        const payload = await access.verify(token);

        if (
          !payload ||
          typeof payload.sub !== "string" ||
          payload.type !== "access"
        ) {
          return status(401, "Invalid or expired token");
        }

        return {
          userId: payload.sub,
        };
      },
    },
  });
