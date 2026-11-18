export interface CreateClassReq {
  className: string;
  adminId: string;
}

export interface CreateClassRes {
  classId: string;
  className: string;
  invitationCode: string;
}

export interface CreateClassRecord extends CreateClassReq {
  invitationCode: string;
}
