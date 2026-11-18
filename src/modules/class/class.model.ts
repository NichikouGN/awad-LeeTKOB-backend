import { t, type UnwrapModels } from "elysia";

export const CreateClass = {
  Body: t.Object({
    className: t.String(),
  }),
};

export type CreateClass = UnwrapModels<typeof CreateClass>;
