import type { Database } from "../../db/db";
import { classes } from "../../db/schema/classes.schema";
import { CreateClassRes, CreateClassRecord } from "./class.type";

export class ClassRepository {
  constructor(private readonly db: Database) {}
  async createClass({
    className,
    invitationCode,
    adminId,
  }: CreateClassRecord): Promise<CreateClassRes> {
    const [result] = await this.db
      .insert(classes)
      .values({
        className: className,
        invitationCode: invitationCode,
        createdByUserId: adminId,
      })
      .returning();

    return {
      classId: result.classId,
      className: result.className,
      invitationCode: result.invitationCode,
    };
  }
}
