import { expect, it, mock } from "bun:test";
import { AuthService } from "../src/modules/auth/auth.service";
import type { UserProvider } from "../src/modules/user/interface/user-provider";
import type { TokenService } from "../src/modules/auth/token.service";
import type { UserRole, UserStatus } from "../src/modules/user/user.type";

const passwordHash = await Bun.password.hash("correct-password", {
  algorithm: "bcrypt",
  cost: 12,
});

interface UserInterface {
  userId: string;
  email: string;
  passwordHash: string;
  displayName: string;
  role: UserRole;
  status: UserStatus;
}

const user: UserInterface = {
  userId: "user-123",
  email: "student@example.com",
  passwordHash: passwordHash,
  displayName: "Lorem Ipsum",
  role: "STU",
  status: "ACTIVE",
};

const makeAuthService = (
  overrides: {
    foundUser?: typeof user | null;
  } = {},
) => {
  const provider = {
    getUserLogin: mock(async () => {
      if ("foundUser" in overrides) {
        if (!overrides.foundUser) {
          return null;
        } else return overrides.foundUser;
      } else return user;
    }),
    signUpUser: mock(async () => null),
    getUserRole: mock(async () => null),
    getUserStatus: mock(async () => null),
  } satisfies UserProvider;

  const tokens = {
    issueToken: mock(async () => ({
      accessToken: "access-test-token",
      refreshToken: "refresh-test-token",
    })),
  } as unknown as TokenService;

  return { auth: new AuthService(tokens, provider), provider, tokens };
};

it("returns tokens for a valid login", async () => {
  const { auth, tokens } = makeAuthService();

  const result = await auth.login({
    email: "student@example.com",
    password: "correct-password",
  });

  expect(result).toEqual({
    tokens: {
      accessToken: "access-test-token",
      refreshToken: "refresh-test-token",
    },
    user: user,
  });
  expect(tokens.issueToken).toHaveBeenCalledWith("user-123", "STU");
});

it("rejects an unknown email", async () => {
  const { auth, tokens, provider } = makeAuthService({ foundUser: null });

  expect(
    auth.login({
      email: "missing@example.com",
      password: "any-password",
    }),
  ).rejects.toThrow("User Not Found");

  expect(provider.getUserLogin).toHaveBeenCalledWith("missing@example.com");
  expect(tokens.issueToken).not.toHaveBeenCalled();
});

it("does not issue tokens for a wrong password", async () => {
  const { auth, tokens } = makeAuthService();

  expect(
    auth.login({ email: user.email, password: "wrong-password" }),
  ).rejects.toThrow("email or password is wrong");

  expect(tokens.issueToken).not.toHaveBeenCalled();
});

it("rejects a disabled user", async () => {
  const { auth, tokens } = makeAuthService({
    foundUser: { ...user, status: "DISABLED" },
  });

  await expect(
    auth.login({ email: user.email, password: "correct-password" }),
  ).rejects.toThrow("User Has Been Disabled");

  expect(tokens.issueToken).not.toHaveBeenCalled();
});

// it("hashes the password and creates a new account", async () => {
//   const { auth, provider } = makeAuthService({ foundUser: null });
//
//   await auth.signup({
//     email: "new-student@example.com",
//     password: "new-password",
//     displayName: "New Student",
//   });
//
//   expect(provider.signUpUser).toHaveBeenCalledTimes(1);
//   const [createdUser] = provider.signUpUser.mock.calls[0];
//   expect(createdUser.email).toBe("new-student@example.com");
//   expect(createdUser.displayName).toBe("New Student");
//   expect(createdUser.passwordHash).not.toBe("new-password");
//   expect(await Bun.password.verify("new-password", createdUser.passwordHash)).toBe(
//     true,
//   );
// });
//
it("rejects signup when the email is already registered", async () => {
  const { auth, provider } = makeAuthService();

  await expect(
    auth.signup({
      email: user.email,
      password: "new-password",
      displayName: "Duplicate Student",
    }),
  ).rejects.toThrow("This email is already used");

  expect(provider.signUpUser).not.toHaveBeenCalled();
});
