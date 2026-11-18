export type UserRole = "ADMIN" | "TA" | "STU";
export type UserStatus = "ACTIVE" | "DISABLED";

export interface UserSignupReq {
  email: string;
  passwordHash: string;
  displayName: string;
}

export interface UserRes {
  userId: string;
  email: string;
  displayName: string;
  role: UserRole;
  status: UserStatus;
}

export interface UserLogin extends UserRes {
  passwordHash: string;
}

export interface UserListReq {
  offset: number;
  limit: number;
}
