import { describe, expect, it, mock } from "bun:test";
import { Elysia } from "elysia";
import { accessJwt } from "../src/plugins/jwt.plugin";
import { createUserModule } from "../src/modules/user/user.index";
import type { UserService } from "../src/modules/user/user.service";

const targetUserId = "target-user-123";
const adminId = "admin-user-123";

//Temp route to issue a token
const tokenIssuer = new Elysia()
  .use(accessJwt)
  .get("/token", async ({ access, query }) =>
    access.sign({
      userId: query.userId,
      role: query.role as "ADMIN" | "TA" | "STU",
      type: "access",
    }),
  );

//Use Elysia's handle() to call the route
async function makeToken(userId: string, role: "ADMIN" | "TA" | "STU") {
  const response = await tokenIssuer.handle(
    new Request(
      `http://localhost/token?userId=${encodeURIComponent(userId)}&role=${role}`,
    ),
  );
  return response.text();
}

const service = {
  updateUserRole: mock(async (userId: string, role: "TA" | "STU") => ({
    userId,
    email: "target@example.com",
    displayName: "Target",
    role,
    status: "ACTIVE" as const,
  })),
  updateUserStatus: mock(
    async (userId: string, status: "ACTIVE" | "DISABLED") => ({
      userId,
      email: "target@example.com",
      displayName: "Target",
      role: "STU" as const,
      status,
    }),
  ),
};

//Create app with a single user route, inject with the mock user service
const app = new Elysia().use(
  createUserModule(service as unknown as UserService),
);

//Helper functions
function roleUpdateRequest(userId: string, token: string) {
  return app.handle(
    new Request(`http://localhost/users/${userId}/role`, {
      method: "PATCH",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ role: "TA" }),
    }),
  );
}

describe("admin user routes", () => {
  it("denies a student from changing a user's role", async () => {
    const token = await makeToken("student-123", "STU");

    const response = await roleUpdateRequest(targetUserId, token);

    expect(response.status).toBe(403);
    expect(service.updateUserRole).not.toHaveBeenCalled();
  });

  it("allows an admin to change another user's role", async () => {
    const token = await makeToken(adminId, "ADMIN");

    const response = await roleUpdateRequest(targetUserId, token);

    expect(response.status).toBe(200);
    expect(service.updateUserRole).toHaveBeenCalledWith(targetUserId, "TA");
  });

  it("prevents an admin from changing their own role", async () => {
    const token = await makeToken(adminId, "ADMIN");

    const response = await roleUpdateRequest(adminId, token);

    expect(response.status).toBe(409);
    expect(service.updateUserRole).not.toHaveBeenCalledWith(adminId, "TA");
  });
});
