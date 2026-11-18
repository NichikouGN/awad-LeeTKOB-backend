import { users } from "../../db/schema/users.schema";
import { asc, eq } from "drizzle-orm";
import type { Database } from "../../db/db";
import type {
  UserLogin,
  UserListReq,
  UserRes,
  UserRole,
  UserSignupReq,
  UserStatus,
} from "./user.type";

export class UserRepository {
  constructor(private readonly db: Database) {}
  // ===================================
  // || User Provider Implementations ||
  // ===================================
  async getUserRole(userId: string): Promise<string | null> {
    const [user] = await this.db
      .select()
      .from(users)
      .where(eq(users.userId, userId))
      .limit(1);

    if (!user) return null;

    return user.role;
  }

  async getUserStatus(userId: string): Promise<string | null> {
    const [result] = await this.db
      .select()
      .from(users)
      .where(eq(users.userId, userId))
      .limit(1);

    if (!result) return null;
    return result.userStatus;
  }

  async getUserForLogin(email: string): Promise<UserLogin | null> {
    const [result] = await this.db
      .select()
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    if (!result) return null;

    return {
      userId: result.userId,
      email: result.email,
      passwordHash: result.passwordHash,
      displayName: result.displayName,
      role: result.role,
      status: result.userStatus,
    };
  }

  async insertUser({
    email,
    passwordHash,
    displayName,
  }: UserSignupReq): Promise<UserRes | null> {
    const [result] = await this.db
      .insert(users)
      .values({
        email: email,
        passwordHash: passwordHash,
        displayName: displayName,
      })
      .returning({
        userId: users.userId,
        email: users.email,
        displayName: users.displayName,
        role: users.role,
        status: users.userStatus,
      });

    if (!result) return null;
    return result;
  }

  // ===================================
  // ||        User Services          ||
  // ===================================
  async updateUserRoleRecord(
    userId: string,
    role: UserRole,
  ): Promise<UserRes | null> {
    const [result] = await this.db
      .update(users)
      .set({ role: role })
      .where(eq(users.userId, userId))
      .returning({
        userId: users.userId,
        email: users.email,
        displayName: users.displayName,
        role: users.role,
        status: users.userStatus,
      });

    if (!result) return null;
    return result;
  }

  async updateUserStatusRecord(
    userId: string,
    status: UserStatus,
  ): Promise<UserRes | null> {
    const [result] = await this.db
      .update(users)
      .set({ userStatus: status })
      .where(eq(users.userId, userId))
      .returning({
        userId: users.userId,
        email: users.email,
        displayName: users.displayName,
        role: users.role,
        status: users.userStatus,
      });

    if (!result) return null;
    return result;
  }

  async getUserProfileRecord(userId: string): Promise<UserRes | null> {
    const [result] = await this.db
      .select()
      .from(users)
      .where(eq(users.userId, userId))
      .limit(1);

    if (!result) return null;

    return {
      userId: result.userId,
      email: result.email,
      displayName: result.displayName,
      role: result.role,
      status: result.userStatus,
    };
  }

  async getUsersRecord({ offset, limit }: UserListReq): Promise<UserRes[]> {
    return this.db
      .select({
        userId: users.userId,
        email: users.email,
        displayName: users.displayName,
        role: users.role,
        status: users.userStatus,
      })
      .from(users)
      .orderBy(asc(users.userId))
      .offset(offset)
      .limit(limit);
  }

  async patchUserProfileRecord(
    userId: string,
    displayName: string,
  ): Promise<UserRes | null> {
    const [result] = await this.db
      .update(users)
      .set({ displayName: displayName })
      .where(eq(users.userId, userId))
      .returning({
        userId: users.userId,
        email: users.email,
        displayName: users.displayName,
        role: users.role,
        status: users.userStatus,
      });

    if (!result) return null;
    return result;
  }
}
