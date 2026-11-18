import { expect, it, mock } from "bun:test";
import { AuthService } from "../src/modules/auth/auth.service";
import type { UserProvider } from "../src/modules/user/interface/user-provider";
import type { UserSignupReq } from "../src/modules/user/user.type";
import type { TokenService } from "../src/modules/auth/token.service";

it("normalizes email before checking and creating an account", async () => {
  const getUserLogin = mock(async (_email: string) => null);
  const signUpUser = mock(async (_user: UserSignupReq) => null);
  const provider = {
    getUserLogin,
    signUpUser,
  } as unknown as UserProvider;
  const auth = new AuthService({} as TokenService, provider);

  await auth.signup({
    email: "  New.User@Example.edu ",
    password: "temporary-password",
    displayName: "New User",
  });

  expect(getUserLogin).toHaveBeenCalledWith("new.user@example.edu");
  expect(signUpUser).toHaveBeenCalledTimes(1);
  const savedUser = signUpUser.mock.calls[0]?.[0];
  expect(savedUser).toBeDefined();
  expect(savedUser).toMatchObject({
    email: "new.user@example.edu",
    displayName: "New User",
  });
  expect(savedUser?.passwordHash).not.toBe("temporary-password");
});
