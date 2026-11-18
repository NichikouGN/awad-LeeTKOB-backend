import { Elysia } from "elysia";
import { mapApiError } from "../../libs/errors/problem-details";
import type { JwtPlugins } from "../../plugins/jwt.plugin";
import { rbac } from "../../plugins/role.plugin";
import * as SubmissionModel from "./submission.model";
import type { SubmissionService } from "./submission.service";

export const createSubmissionModule = (deps: {
  submissionService: SubmissionService;
  jwtAuth: JwtPlugins["jwtAuth"];
}) =>
  new Elysia({ prefix: "/" })
    .use(deps.jwtAuth)
    .use(rbac)
    .onError(({ error, set }) => mapApiError(error, set))
    .post(
      "/labs/:labId/submissions",
      {
        jwtAuth: "access",
        rbac: ["STU"],
        params: SubmissionModel.CreateSubmissionSchema.Params,
        body: SubmissionModel.CreateSubmissionSchema.Body,
      },
      async ({ jwtPayload, params, body, request, set }) => {
        const submission = await deps.submissionService.submit({
          labId: params.labId,
          studentUserId: jwtPayload.userId,
          role: jwtPayload.role,
          source: body.source,
          idempotencyKey: request.headers.get("idempotency-key"),
        });
        set.status = 202;
        set.headers.location = `/submissions/${submission.id}`;
        return { submission };
      },
    )
    .get(
      "/submissions/:submissionId",
      {
        jwtAuth: "access",
        rbac: ["STU"],
        params: SubmissionModel.GetSubmissionSchema.Params,
      },
      async ({ jwtPayload, params }) => ({
        submission: await deps.submissionService.getOwn({
          submissionId: params.submissionId,
          studentUserId: jwtPayload.userId,
        }),
      }),
    );
