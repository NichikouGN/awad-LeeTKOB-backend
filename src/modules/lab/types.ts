export type LabRole = "ADMIN" | "TA" | "STU";

export interface CreateLabInput {
  userId: string;
  role: LabRole;
  classId: string;
  title: string;
  statement: string;
  opensAt: string;
  deadlineAt: string;
  constraints: Array<{ id: string; text: string; deduction: number }>;
  limits?: { cpuSeconds?: number; memoryMb?: number };
  tests: Array<{ input: string; expectedOutput: string }>;
}

export interface LabCreateRecord {
  classId: string;
  title: string;
  statement: string;
  opensAt: Date;
  deadlineAt: Date;
  cpuSeconds: number;
  memoryMb: number;
  createdByUserId: string;
  constraints: Array<{ id: string; text: string; deduction: string }>;
  tests: Array<{ input: Buffer; expectedOutput: Buffer }>;
  now: Date;
}

export interface LabRecord {
  labId: string;
  classId: string;
  title: string;
  statement: string;
  opensAt: Date;
  deadlineAt: Date;
  cpuSeconds: number;
  memoryMb: number;
  constraints: Array<{ id: string; text: string; deduction: string }>;
  tests: Array<{ testNumber: number; input: Buffer; expectedOutput: Buffer }>;
  createdAt: Date;
  updatedAt: Date;
}

export interface LabSummaryRecord {
  labId: string;
  classId: string;
  title: string;
  opensAt: Date;
  deadlineAt: Date;
  updatedAt: Date;
}

export interface LabActor {
  userId: string;
  role: LabRole;
}
