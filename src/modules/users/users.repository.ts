import type { Database } from "../../db/db";

export class UserRepository {
  constructor(private readonly db: Database) {}
}
