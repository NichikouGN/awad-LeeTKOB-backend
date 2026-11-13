import { t, type UnwrapModels } from "elysia";

export const Login = {
  Body: t.Object({ email: t.String(), password: t.String() }),
};

export type Login = UnwrapModels<typeof Login>;
