export type jwtSigner = {
  sign(payload: {
    sub: string;
    type: "access" | "refresh";
    role: "teacher" | "admin" | "student";
  }): Promise<string>;
};

export class TokenService {
  constructor(
    private readonly access: jwtSigner,
    private readonly refresh: jwtSigner,
  ) {}

  async issueToken(
    userId: string,
  ): Promise<{ accessToken: string; refreshToken: string }> {
    const role = "teacher";
    const accessToken = await this.access.sign({
      sub: userId,
      role: role,
      type: "access",
    });
    const refreshToken = await this.refresh.sign({
      sub: userId,
      role: role,
      type: "refresh",
    });

    return { accessToken, refreshToken };
  }

  generateAccessToken(userId: string): Promise<string> {
    const role = "teacher";
    return this.access.sign({
      sub: userId,
      role: role,
      type: "access",
    });
  }

  generateRefreshToken(userId: string): Promise<string> {
    const role = "teacher";
    return this.refresh.sign({
      sub: userId,
      role: role,
      type: "refresh",
    });
  }
}
