export type UserLogin = {
  userId: string;
  email: string;
  passwordHash: string;
  status: "ACTIVE" | "INACTIVE";
  role: "ADMIN" | "TA" | "STU";
} | null;

export interface UserProvider {
  getUserLogin(email: string): Promise<UserLogin>;
  getUserRole(userId: string): Promise<string>;
  getUserStatus(userId: string): Promise<string>;
}
