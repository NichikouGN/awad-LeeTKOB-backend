import { TokenService } from "./token.service";
import { UserProvider } from "../users/interfaces/users-provider";
import type * as AuthModel from "./auth.model";
import { AppError } from "../../libs/errors/app-error";

export class AuthService {
  constructor(
    private readonly tokens: TokenService,
    private readonly userProvider: UserProvider,
  ) {}

  async login({ email, password }: AuthModel.Login["Body"]) {
    try {
      const userInfo = await this.userProvider.getUserLogin(email);
      if (!userInfo) throw new AppError(404, "User Not Found");
    } catch (error) {
      if (error instanceof AppError) return error;

      throw error;
    }
  }
}
