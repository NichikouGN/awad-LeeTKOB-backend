import { describe, expect, it, mock } from "bun:test";
import { Elysia } from "elysia";
import { AppError } from "../src/libs/errors/app-error";
import { mapApiError } from "../src/libs/errors/problem-details";
import { createClassModule } from "../src/modules/class/class.index";
import type { ClassService } from "../src/modules/class/class.service";
import { createUserModule } from "../src/modules/user/user.index";
import type { UserService } from "../src/modules/user/user.service";
import type { UserProvider } from "../src/modules/user/interface/user-provider";
import { createJwtPlugins } from "../src/plugins/jwt.plugin";

const classId = "64d0d19c-73e8-4d19-bae2-1d6c0f10f397";
const userId = "9b7bdf70-9740-48a1-a7bb-0875a9103a73";
const classRecord = { classId, className: "Intro to Programming" };

const jwtPlugins = createJwtPlugins({
  accessSecret: "test-access-secret",
  refreshSecret: "test-refresh-secret",
});

const tokenFor = async (id: string, role: "ADMIN" | "TA" | "STU") => {
  const issuer = new Elysia()
    .use(jwtPlugins.accessJwt)
    .get("/token", ({ access }) =>
      access.sign({ userId: id, role, type: "access" }),
    );
  const response = await issuer.handle(new Request("http://localhost/token"));
  return response.text();
};

const makeApp = () => {
  const userService = {
    getUsers: mock(async () => [
      {
        userId,
        email: "ta@example.edu",
        displayName: "A. TA",
        role: "TA" as const,
        status: "ACTIVE" as const,
      },
    ]),
    getUserProfile: mock(async () => ({
      userId,
      email: "ta@example.edu",
      displayName: "A. TA",
      role: "TA" as const,
      status: "ACTIVE" as const,
    })),
    patchUserProfile: mock(async () => ({
      userId,
      email: "ta@example.edu",
      displayName: "Updated",
      role: "TA" as const,
      status: "ACTIVE" as const,
    })),
    updateUserRole: mock(async () => ({
      userId,
      email: "ta@example.edu",
      displayName: "A. TA",
      role: "TA" as const,
      status: "ACTIVE" as const,
    })),
    updateUserStatus: mock(async () => ({
      userId,
      email: "ta@example.edu",
      displayName: "A. TA",
      role: "TA" as const,
      status: "DISABLED" as const,
    })),
  };

  const classService = {
    createClass: mock(async () => ({
      ...classRecord,
      invitationCode: "384201",
    })),
    getClassList: mock(async () => [classRecord]),
    getClassDetail: mock(async () => classRecord),
    assignTa: mock(async () => ({
      classId,
      userId,
      changedAt: new Date("2026-11-18T10:00:00.000Z"),
    })),
    enrollStudent: mock(async () => ({
      classId,
      userId,
      changedAt: new Date("2026-11-18T10:00:00.000Z"),
    })),
    joinByCode: mock(async () => classRecord),
  };

  const app = new Elysia()
    .use(
      createUserModule({
        userService: userService as unknown as UserService,
        jwtAuth: jwtPlugins.jwtAuth,
      }),
    )
    .use(
      createClassModule({
        classService: classService as unknown as ClassService,
        jwtAuth: jwtPlugins.jwtAuth,
      }),
    );

  return { app, userService, classService };
};

type TestApp = ReturnType<typeof makeApp>["app"];

const request = (
  app: TestApp,
  path: string,
  token: string,
  method = "GET",
  body?: unknown,
) =>
  app.handle(
    new Request(`http://localhost${path}`, {
      method,
      headers: {
        authorization: `Bearer ${token}`,
        ...(body ? { "content-type": "application/json" } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    }),
  );

describe("basic user and class routes", () => {
  it("lets only admins list users and never exposes credentials", async () => {
    const { app, userService } = makeApp();
    const adminToken = await tokenFor("admin-id", "ADMIN");
    const studentToken = await tokenFor("student-id", "STU");

    const response = await request(app, "/users", adminToken);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      success: true,
      users: [{ userId, role: "TA" }],
      page: 1,
      limit: 20,
    });
    expect(userService.getUsers).toHaveBeenCalledWith(1, 20);

    const denied = await request(app, "/users", studentToken);
    expect(denied.status).toBe(403);
    expect(denied.headers.get("content-type")).toContain(
      "application/problem+json",
    );
  });

  it("returns the generated invitation code when an admin creates a class", async () => {
    const { app, classService } = makeApp();
    const adminToken = await tokenFor("admin-id", "ADMIN");

    const response = await request(app, "/classes", adminToken, "POST", {
      className: "Intro to Programming",
    });

    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({
      success: true,
      class: { classId, invitationCode: "384201" },
    });
    expect(classService.createClass).toHaveBeenCalledWith({
      className: "Intro to Programming",
      adminId: "admin-id",
    });
  });

  it("lets an admin assign a TA and blocks other roles", async () => {
    const { app, classService } = makeApp();
    const adminToken = await tokenFor("admin-id", "ADMIN");
    const studentToken = await tokenFor("student-id", "STU");
    const path = `/classes/${classId}/tas/${userId}`;

    const response = await request(app, path, adminToken, "PUT");
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      success: true,
      assignment: { classId, userId },
    });
    expect(classService.assignTa).toHaveBeenCalledWith({
      classId,
      taUserId: userId,
      assignedByUserId: "admin-id",
    });

    const denied = await request(app, path, studentToken, "PUT");
    expect(denied.status).toBe(403);
    expect(classService.assignTa).toHaveBeenCalledTimes(1);
  });

  it("uses the authenticated identity for class detail authorization", async () => {
    const { app, classService } = makeApp();
    const taToken = await tokenFor("ta-id", "TA");

    const response = await request(app, `/classes/${classId}`, taToken);

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      success: true,
      class: classRecord,
    });
    expect(classService.getClassDetail).toHaveBeenCalledWith({
      classId,
      userId: "ta-id",
      role: "TA",
    });
  });

  it("lists only the caller's classes through the canonical path", async () => {
    const { app, classService } = makeApp();
    const taToken = await tokenFor("ta-id", "TA");

    const response = await request(app, "/classes?page=2&limit=10", taToken);

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      success: true,
      classes: [classRecord],
      page: 2,
      limit: 10,
    });
    expect(classService.getClassList).toHaveBeenCalledWith({
      userId: "ta-id",
      role: "TA",
      page: 2,
      limit: 10,
    });
  });

  it("prevents one user from editing another user's profile", async () => {
    const { app, userService } = makeApp();
    const taToken = await tokenFor("ta-id", "TA");

    const response = await request(
      app,
      `/users/${userId}/edit`,
      taToken,
      "PATCH",
      { displayName: "Changed by someone else" },
    );

    expect(response.status).toBe(403);
    expect(response.headers.get("content-type")).toContain(
      "application/problem+json",
    );
    expect(userService.patchUserProfile).not.toHaveBeenCalled();
  });

  it("allows an authenticated student to join by invitation code", async () => {
    const { app, classService } = makeApp();
    const studentToken = await tokenFor("student-id", "STU");

    const response = await request(app, "/classes/join", studentToken, "POST", {
      invitationCode: "384201",
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      success: true,
      class: classRecord,
    });
    expect(classService.joinByCode).toHaveBeenCalledWith({
      invitationCode: "384201",
      studentUserId: "student-id",
    });
  });

  it("allows a TA to enroll a student and forwards the actor identity", async () => {
    const { app, classService } = makeApp();
    const taToken = await tokenFor("ta-id", "TA");

    const response = await request(
      app,
      `/classes/${classId}/students/${userId}`,
      taToken,
      "PUT",
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      success: true,
      membership: { classId, userId },
    });
    expect(classService.enrollStudent).toHaveBeenCalledWith({
      classId,
      studentUserId: userId,
      joinedByUserId: "ta-id",
      actorRole: "TA",
    });
  });

  it("rejects an invalid join code without leaking an internal error", async () => {
    const { app, classService } = makeApp();
    classService.joinByCode.mockRejectedValueOnce(
      new AppError(404, "Class not found"),
    );
    const studentToken = await tokenFor("student-id", "STU");

    const response = await request(app, "/classes/join", studentToken, "POST", {
      invitationCode: "000000",
    });
    const problem = await response.json();

    expect(response.status).toBe(404);
    expect(response.headers.get("content-type")).toContain(
      "application/problem+json",
    );
    expect(problem).toMatchObject({
      type: "https://leetkob.example/problems/not-found",
      status: 404,
    });
    expect(problem).not.toHaveProperty("stack");
  });

  it("rejects a token after its account is disabled", async () => {
    const provider = {
      getUserRole: mock(async () => "STU"),
      getUserStatus: mock(async () => "DISABLED"),
    } as unknown as UserProvider;
    const guardedPlugins = createJwtPlugins({
      accessSecret: "guarded-access-secret",
      refreshSecret: "guarded-refresh-secret",
      userProvider: provider,
    });
    const guardedApp = new Elysia()
      .use(guardedPlugins.jwtAuth)
      .onError(({ error, set }) => mapApiError(error, set))
      .get("/private", { jwtAuth: "access" }, () => ({ success: true }));
    const issuer = new Elysia()
      .use(guardedPlugins.accessJwt)
      .get("/token", ({ access }) =>
        access.sign({ userId: "disabled-id", role: "STU", type: "access" }),
      );
    const tokenResponse = await issuer.handle(
      new Request("http://localhost/token"),
    );
    const token = await tokenResponse.text();

    const response = await guardedApp.handle(
      new Request("http://localhost/private", {
        headers: { authorization: `Bearer ${token}` },
      }),
    );

    expect(response.status).toBe(401);
    expect(provider.getUserStatus).toHaveBeenCalledWith("disabled-id");
  });
});
