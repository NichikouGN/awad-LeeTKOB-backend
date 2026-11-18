import type { UserRole } from "../user/user.type";

export interface CreateClassReq {
  className: string;
  adminId: string;
}

export interface CreateClassRecord extends CreateClassReq {
  invitationCode: string;
}

export interface ClassRes {
  classId: string;
  className: string;
}

export interface ClassResWithCode extends ClassRes {
  invitationCode: string;
}

export interface ClassListReq {
  userId: string;
  role: UserRole;
  page: number;
  limit: number;
}

export interface ClassDetailReq {
  classId: string;
  userId: string;
  role: UserRole;
}

export interface OffsetLimit {
  offset: number;
  limit: number;
}

export interface ClassListReqRecord extends OffsetLimit {
  userId: string;
}

export interface AssignTaReq {
  classId: string;
  taUserId: string;
  assignedByUserId: string;
}

export interface EnrollStudentReq {
  classId: string;
  studentUserId: string;
  joinedByUserId: string | null;
}

export interface MembershipRes {
  classId: string;
  userId: string;
  changedAt: Date;
}

export interface JoinByCodeReq {
  invitationCode: string;
  studentUserId: string;
}
