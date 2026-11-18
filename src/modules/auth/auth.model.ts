import { t, type UnwrapModels } from "elysia";

export const LoginSchema = {
  Body: t.Object({ email: t.String(), password: t.String() }),
};
export type LoginSchema = UnwrapModels<typeof LoginSchema>;

export const SignUpSchema = {
  Body: t.Object({
    email: t.String(),
    password: t.String(),
    displayName: t.String(),
  }),
};
export type SignUpSchema = UnwrapModels<typeof SignUpSchema>;
