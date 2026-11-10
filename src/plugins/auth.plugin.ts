import { Elysia } from "elysia";

export const jwtAuth = new Elysia().macro({
  jwtAuth: {
    derive: ({ headers, status }) => {
      const header = headers.authorization;

      if (!header) return status(401, "Unauthorized");

      return { userId: "abc" };
    },
  },
});
