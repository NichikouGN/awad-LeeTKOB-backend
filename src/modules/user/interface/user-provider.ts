import type { UserLogin, UserRes, UserSignupReq } from "../user.type";

export interface UserProvider {
  getUserRole(userId: string): Promise<string | null>;
  getUserStatus(userId: string): Promise<string | null>;

  getUserLogin(email: string): Promise<UserLogin | null>;
  signUpUser({
    email,
    passwordHash,
    displayName,
  }: UserSignupReq): Promise<UserRes | null>;
}
