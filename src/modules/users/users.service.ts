import { UserRepository } from "./users.repository";
import { UserLogin, UserProvider } from "./interfaces/users-provider";

export class UserService implements UserProvider {
  constructor(private readonly UserRepository: UserRepository) {}
  async getUserRole(userId: string): Promise<string> {
    return "test";
  }
  async getUserStatus(userId: string): Promise<string> {
    return "test";
  }
  async getUserLogin(email: string): Promise<UserLogin> {
    return null;
    // return {
    //   userId: "1",
    //   email: "120",
    //   passwordHash: "1",
    //   status: "ACTIVE",
    //   role: "ADMIN",
    // };
  }
}
