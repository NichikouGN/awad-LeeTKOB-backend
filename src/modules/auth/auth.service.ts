import { AppError } from "../../libs/errors/app-error";
import { hashPassword, verifyPassword } from "./auth.utils";
import type * as AuthModel from "./auth.model";
import type { UserProvider } from "../user/interface/user-provider";
import type { TokenService } from "./token.service";
import type { UserRes, UserRole } from "../user/user.type";

const normalizeEmail = (email: string) => email.trim().toLowerCase();

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "23505"
  );
}

export class AuthService {
  constructor(
    private readonly tokens: TokenService,
    private readonly userProvider: UserProvider,
  ) {}

  async login({ email, password }: AuthModel.LoginSchema["Body"]): Promise<{
    tokens: { accessToken: string; refreshToken: string };
    user: UserRes;
  }> {
    const user = await this.userProvider.getUserLogin(normalizeEmail(email));

    if (!user) throw new AppError(401, "User Not Found");
    if (user.status === "DISABLED")
      throw new AppError(403, "User Has Been Disabled");

    if (!(await verifyPassword(password, user.passwordHash))) {
      throw new AppError(401, "email or password is wrong");
    }

    const issuedTokenObj = await this.tokens.issueToken(user.userId, user.role);
    return {
      tokens: issuedTokenObj,
      user: user,
    };
  }

  async signup({
    email,
    password,
    displayName,
  }: AuthModel.SignUpSchema["Body"]) {
    const normalizedEmail = normalizeEmail(email);
    const user = await this.userProvider.getUserLogin(normalizedEmail);
    if (user) throw new AppError(409, "This email is already used");

    const passwordHash = await hashPassword(password);
    try {
      await this.userProvider.signUpUser({
        email: normalizedEmail,
        passwordHash,
        displayName,
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new AppError(409, "This email is already used");
      }
      throw error;
    }
  }

  async issueNewAccessToken({
    userId,
    role,
  }: {
    userId: string;
    role: UserRole;
  }) {
    return await this.tokens.generateAccessToken(userId, role);
  }
}
