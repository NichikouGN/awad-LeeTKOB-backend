import { Elysia } from "elysia";
import { UserService } from "./users.service";

export const createUserModule = (userService: UserService) =>
  new Elysia({ prefix: "/users" }).decorate("userService", userService);
