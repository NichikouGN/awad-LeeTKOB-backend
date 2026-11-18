import { t, type UnwrapModels } from "elysia";

export const CreateClass = {
  Body: t.Object({
    className: t.String({ minLength: 1, maxLength: 120 }),
  }),
};

export type CreateClass = UnwrapModels<typeof CreateClass>;

export const GetClassListSchema = {
  Query: t.Object({
    page: t.Number({
      minimum: 1,
      default: 1,
    }),
    limit: t.Number({
      minimum: 1,
      maximum: 100,
      default: 20,
    }),
  }),
};

export type GetClassListSchema = UnwrapModels<typeof GetClassListSchema>;

export const GetClassDetailSchema = {
  Params: t.Object({
    classId: t.String({ format: "uuid" }),
  }),
};

export type GetClassDetailSchema = UnwrapModels<typeof GetClassDetailSchema>;

export const ClassUserParamsSchema = {
  Params: t.Object({
    classId: t.String({ format: "uuid" }),
    userId: t.String({ format: "uuid" }),
  }),
};

export type ClassUserParamsSchema = UnwrapModels<typeof ClassUserParamsSchema>;

export const JoinClassSchema = {
  Body: t.Object({
    invitationCode: t.String({ minLength: 6, maxLength: 255 }),
  }),
};

export type JoinClassSchema = UnwrapModels<typeof JoinClassSchema>;
