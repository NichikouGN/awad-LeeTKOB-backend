import type {
  AssignTaReq,
  ClassDetailReq,
  ClassListReq,
  ClassRes,
  ClassResWithCode,
  CreateClassReq,
  EnrollStudentReq,
  JoinByCodeReq,
  MembershipRes,
} from "../class.type";

export interface ClassProvider {
  createClass(request: CreateClassReq): Promise<ClassResWithCode>;
  getClassList(request: ClassListReq): Promise<ClassRes[]>;
  getClassDetail(request: ClassDetailReq): Promise<ClassRes>;
  assignTa(request: AssignTaReq): Promise<MembershipRes>;
  enrollStudent(
    request: EnrollStudentReq & { actorRole: "ADMIN" | "TA" },
  ): Promise<MembershipRes>;
  joinByCode(request: JoinByCodeReq): Promise<ClassRes>;
}
