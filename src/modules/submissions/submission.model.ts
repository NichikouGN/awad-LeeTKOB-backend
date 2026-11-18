import { t, type UnwrapModels } from "elysia";

export const CreateSubmissionSchema = {
  Params: t.Object({ labId: t.String({ format: "uuid" }) }),
  Body: t.Object({ source: t.String({ minLength: 1 }) }),
};

export type CreateSubmissionSchema = UnwrapModels<
  typeof CreateSubmissionSchema
>;

export const GetSubmissionSchema = {
  Params: t.Object({ submissionId: t.String({ format: "uuid" }) }),
};

export type GetSubmissionSchema = UnwrapModels<typeof GetSubmissionSchema>;
