import { t, type UnwrapModels } from "elysia";

const ConstraintSchema = t.Object({
  id: t.String({ minLength: 1, maxLength: 40 }),
  text: t.String({ minLength: 1, maxLength: 8192 }),
  deduction: t.Number({ minimum: 0.01, maximum: 10, multipleOf: 0.01 }),
});

const TestSchema = t.Object({
  input: t.String(),
  expectedOutput: t.String(),
});

export const CreateLabSchema = {
  Params: t.Object({ classId: t.String({ format: "uuid" }) }),
  Body: t.Object({
    title: t.String({ minLength: 1, maxLength: 160 }),
    statement: t.String({ minLength: 1, maxLength: 262144 }),
    opensAt: t.String({ format: "date-time" }),
    deadlineAt: t.String({ format: "date-time" }),
    constraints: t.Array(ConstraintSchema, { minItems: 1, maxItems: 100 }),
    limits: t.Optional(
      t.Object({
        cpuSeconds: t.Optional(t.Integer({ minimum: 1, maximum: 5 })),
        memoryMb: t.Optional(t.Integer({ minimum: 64, maximum: 512 })),
      }),
    ),
    tests: t.Array(TestSchema, { minItems: 1, maxItems: 100 }),
  }),
};

export type CreateLabSchema = UnwrapModels<typeof CreateLabSchema>;

export const ClassLabsSchema = {
  Params: t.Object({ classId: t.String({ format: "uuid" }) }),
  Query: t.Object({
    page: t.Integer({ minimum: 1, default: 1 }),
    limit: t.Integer({ minimum: 1, maximum: 100, default: 20 }),
  }),
};

export type ClassLabsSchema = UnwrapModels<typeof ClassLabsSchema>;

export const LabIdSchema = {
  Params: t.Object({ labId: t.String({ format: "uuid" }) }),
};

export type LabIdSchema = UnwrapModels<typeof LabIdSchema>;
