import { CreateClassReq, CreateClassRes } from "../class.type";

export interface ClassProvider {
  createClass({ className, adminId }: CreateClassReq): Promise<CreateClassRes>;
}
