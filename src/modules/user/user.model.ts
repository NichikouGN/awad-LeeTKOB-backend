import { t, type UnwrapModels } from "elysia";

export const UserIdSchema = {
  Params: t.Object({ userId: t.String() }),
};
export type UserIdSchema = UnwrapModels<typeof UserIdSchema>;

export const UserParamsSchema = { Params: t.Object({ userId: t.String() }) };
export type UserParamsSchema = UnwrapModels<typeof UserParamsSchema>;

export const EditUserSchema = { Body: t.Object({ displayName: t.String() }) };
export type EditUserSchema = UnwrapModels<typeof EditUserSchema>;

export const UpdateUserRoleSchema = {
  Params: t.Object({ userId: t.String() }),
  Body: t.Object({ role: t.Union([t.Literal("TA"), t.Literal("STU")]) }),
};
export type UpdateUserRoleSchema = UnwrapModels<typeof UpdateUserRoleSchema>;

export const UpdateUserStatusSchema = {
  Params: t.Object({ userId: t.String() }),
  Body: t.Object({
    status: t.Union([t.Literal("ACTIVE"), t.Literal("DISABLED")]),
  }),
};

export type UpdateUserStatusSchema = UnwrapModels<
  typeof UpdateUserStatusSchema
>;

export const GetUserListSchema = {
  Query: t.Object({
    page: t.Number({ minimum: 1, default: 1 }),
    limit: t.Number({ minimum: 1, maximum: 100, default: 20 }),
  }),
};

export type GetUserListSchema = UnwrapModels<typeof GetUserListSchema>;
