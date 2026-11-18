import { TokenService } from "./token.service";
import type * as AuthModel from "./auth.model";
import { AppError } from "../../libs/errors/app-error";
import { hashPassword, verifyPassword } from "./auth.utils";
import { UserProvider } from "../user/interface/user-provider";
import { UserRes, UserRole } from "../user/user.type";

export class AuthService {
  constructor(
    private readonly tokens: TokenService,
    private readonly userProvider: UserProvider,
  ) {}

  async login({ email, password }: AuthModel.LoginSchema["Body"]): Promise<{
    tokens: { accessToken: string; refreshToken: string };
    user: UserRes;
  }> {
    const user = await this.userProvider.getUserLogin(email);

    if (!user) throw new AppError(404, "User Not Found");
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
    const user = await this.userProvider.getUserLogin(email);
    if (user) throw new AppError(409, "This email is already used");

    const passwordHash = await hashPassword(password);
    await this.userProvider.signUpUser({ email, passwordHash, displayName });
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
