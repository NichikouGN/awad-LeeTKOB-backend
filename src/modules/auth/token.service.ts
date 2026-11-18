import { UserRole } from "../user/user.type";
import type { JWTPayloadSpec } from "@elysia/jwt";

export type JwtPayload = {
  userId: string;
  type: "access" | "refresh";
  role: UserRole;
};

export type jwtSigner = {
  sign(payload: JwtPayload): Promise<string>;
  // verify(token: string): Promise<JwtPayload | false>;
};

export class TokenService {
  constructor(
    private readonly access: jwtSigner,
    private readonly refresh: jwtSigner,
  ) {}

  async issueToken(
    userId: string,
    role: UserRole,
  ): Promise<{ accessToken: string; refreshToken: string }> {
    const accessToken = await this.access.sign({
      userId: userId,
      role: role,
      type: "access",
    });
    const refreshToken = await this.refresh.sign({
      userId: userId,
      role: role,
      type: "refresh",
    });

    return { accessToken, refreshToken };
  }

  generateAccessToken(userId: string, role: UserRole): Promise<string> {
    return this.access.sign({
      userId: userId,
      role: role,
      type: "access",
    });
  }

  generateRefreshToken(userId: string, role: UserRole): Promise<string> {
    return this.refresh.sign({
      userId: userId,
      role: role,
      type: "refresh",
    });
  }
}
