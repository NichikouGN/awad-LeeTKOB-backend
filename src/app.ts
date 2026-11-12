import { Elysia } from "elysia";
import { openapi } from "@elysia/openapi";

export const app = new Elysia().use(openapi());

export type App = typeof app;
// import {
//   denyAllAuthenticator,
//   type Authenticator,
//   type Principal,
// } from "./plugins/auth.plugin";
// import {
//   InMemoryLabRepository,
//   type LabRepository,
// } from "./repositories/lab.repository";
//
// type AppDependencies = {
//   authenticate?: Authenticator;
//   labs?: LabRepository;
//   now?: () => Date;
// };
//
// type ProblemSlug =
//   | "authentication-required"
//   | "forbidden"
//   | "lab-not-found"
//   | "validation"
//   | "deadline-not-passed"
//   | "reviews-pending"
//   | "internal";
//
// const problemMetadata: Record<ProblemSlug, { status: number; title: string }> =
//   {
//     "authentication-required": {
//       status: 401,
//       title: "Authentication required",
//     },
//     forbidden: { status: 403, title: "Forbidden" },
//     "lab-not-found": { status: 404, title: "Lab not found" },
//     validation: { status: 400, title: "Invalid request" },
//     "deadline-not-passed": {
//       status: 409,
//       title: "Submission deadline has not passed",
//     },
//     "reviews-pending": { status: 409, title: "Reviews are still pending" },
//     internal: { status: 500, title: "Internal error" },
//   };
//
// function problem(slug: ProblemSlug, detail: string): Response {
//   const metadata = problemMetadata[slug];
//   return Response.json(
//     {
//       type: `https://leetkob.example/problems/${slug}`,
//       title: metadata.title,
//       status: metadata.status,
//       detail,
//     },
//     {
//       status: metadata.status,
//       headers: {
//         "content-type": "application/problem+json",
//         ...(slug === "authentication-required"
//           ? { "www-authenticate": "Bearer" }
//           : {}),
//       },
//     },
//   );
// }
//
// function publishedResponse(labId: number, publishedAt: string): Response {
//   return Response.json(
//     { labId, status: "published", publishedAt },
//     { status: 200, headers: { "content-type": "application/json" } },
//   );
// }
//
// function parseLabId(raw: string): number | null {
//   if (!/^[1-9]\d*$/.test(raw)) return null;
//   const id = Number(raw);
//   return Number.isSafeInteger(id) ? id : null;
// }
//
// function mayManageLab(principal: Principal, classId: number): boolean {
//   return principal.role === "ta" && principal.classIds.includes(classId);
// }
//
// export function createApp(dependencies: AppDependencies = {}) {
//   const authenticate = dependencies.authenticate ?? denyAllAuthenticator;
//   const labs = dependencies.labs ?? new InMemoryLabRepository();
//   const now = dependencies.now ?? (() => new Date());
//
//   return new Elysia()
//     .use(openapi())
//     .post("/api/v1/labs/:labId/publish", async ({ params, request }) => {
//       try {
//         const principal = await authenticate(
//           request.headers.get("authorization"),
//         );
//         if (!principal) {
//           return problem(
//             "authentication-required",
//             "Provide valid bearer credentials to publish this lab.",
//           );
//         }
//
//         if (principal.role !== "ta") {
//           return problem(
//             "forbidden",
//             "Only a TA assigned to the lab's class may publish it.",
//           );
//         }
//
//         const labId = parseLabId(params.labId);
//         const lab = labId === null ? null : labs.findById(labId);
//         if (!lab || !mayManageLab(principal, lab.classId)) {
//           return problem(
//             "lab-not-found",
//             "No lab is available for this TA to publish.",
//           );
//         }
//
//         if ((await request.text()).length > 0) {
//           return problem(
//             "validation",
//             "This endpoint does not accept a request body.",
//           );
//         }
//
//         if (lab.publishedAt) return publishedResponse(lab.id, lab.publishedAt);
//
//         const nowDate = now();
//         const deadline = Date.parse(lab.deadline);
//         if (!Number.isFinite(deadline)) {
//           return problem(
//             "internal",
//             "The lab could not be published. Please try again.",
//           );
//         }
//         if (nowDate.getTime() < deadline) {
//           return problem(
//             "deadline-not-passed",
//             "The lab can be published after its submission deadline.",
//           );
//         }
//
//         if (lab.pendingReviews > 0) {
//           return problem(
//             "reviews-pending",
//             "Resolve every review queue item before publishing.",
//           );
//         }
//
//         const publishedAt = nowDate.toISOString();
//         const published = labs.publish(lab.id, publishedAt);
//         if (!published) {
//           return problem(
//             "internal",
//             "The lab could not be published. Please try again.",
//           );
//         }
//         if (!published.publishedAt) {
//           return problem(
//             "internal",
//             "The lab could not be published. Please try again.",
//           );
//         }
//
//         return publishedResponse(published.id, published.publishedAt);
//       } catch {
//         return problem(
//           "internal",
//           "The lab could not be published. Please try again.",
//         );
//       }
//     });
// }
//
// // Production remains closed until a real authentication provider is configured.
// // Tests inject a deterministic authenticator and repository.
// export const app = createApp();
//
// export type App = ReturnType<typeof createApp>;
