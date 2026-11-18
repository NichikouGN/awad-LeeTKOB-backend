import { randomInt } from "node:crypto";

import { ClassRepository } from "./class.repository";
import { ClassProvider } from "./interface/class-provider";
import { CreateClassReq, CreateClassRes } from "./class.type";

export class ClassService implements ClassProvider {
  constructor(private readonly classRepository: ClassRepository) {}

  async createClass({
    className,
    adminId,
  }: CreateClassReq): Promise<CreateClassRes> {
    const invitationCode = randomInt(100000, 1000000).toString();
    const result = await this.classRepository.createClass({
      className,
      invitationCode,
      adminId,
    });

    return result;
  }
}
