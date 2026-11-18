import { AppError } from "../../libs/errors/app-error";
import type { UserRepository } from "./user.repository";
import type { UserProvider } from "./interface/user-provider";
import type {
  UserRes,
  UserRole,
  UserSignupReq,
  UserStatus,
  UserLogin,
} from "./user.type";

export class UserService implements UserProvider {
  constructor(private readonly userRepository: UserRepository) {}

  // ===================================
  // || User Provider Implementations ||
  // ===================================
  async getUserRole(userId: string): Promise<string | null> {
    const userRole = this.userRepository.getUserRole(userId);

    if (!userRole) return null;
    return userRole;
  }

  async getUserStatus(userId: string): Promise<string | null> {
    const userStatus = this.userRepository.getUserStatus(userId);

    if (!userStatus) return null;
    return userStatus;
  }

  async getUserLogin(email: string): Promise<UserLogin | null> {
    const user = await this.userRepository.getUserForLogin(email);
    if (!user) return null;
    return user;
  }

  async signUpUser({
    email,
    passwordHash,
    displayName,
  }: UserSignupReq): Promise<UserRes | null> {
    const user = await this.userRepository.insertUser({
      email,
      passwordHash,
      displayName,
    });
    if (!user) return null;
    return user;
  }

  // ===================================
  // ||        User Services          ||
  // ===================================
  async updateUserRole(userId: string, role: UserRole): Promise<UserRes> {
    const result = await this.userRepository.updateUserRoleRecord(userId, role);
    if (!result) throw new AppError(404, "User doesn't exist");

    return result;
  }
  async updateUserStatus(userId: string, status: UserStatus): Promise<UserRes> {
    const result = await this.userRepository.updateUserStatusRecord(
      userId,
      status,
    );
    if (!result) throw new AppError(404, "User doesn't exist");

    return result;
  }

  async getUserProfile(userId: string): Promise<UserRes> {
    const result = await this.userRepository.getUserProfileRecord(userId);

    if (!result) {
      throw new AppError(404, "User not found");
    }

    return result;
  }

  async getUsers(page: number, limit: number): Promise<UserRes[]> {
    const offset = (page - 1) * limit;
    return this.userRepository.getUsersRecord({ offset, limit });
  }

  async patchUserProfile(
    userId: string,
    displayName: string,
  ): Promise<UserRes> {
    const result = await this.userRepository.patchUserProfileRecord(
      userId,
      displayName,
    );

    if (!result) {
      throw new AppError(404, "User not found");
    }

    return result;
  }
}
