import {
  apiDelete,
  apiGet,
  apiPatch,
  apiPost,
  apiPut,
  type RequestOptions,
} from "./client";

/** A class (lớp) owned by the logged-in teacher. */
export interface ClassRoom {
  id: number;
  name: string;
  note: string | null;
  created_at: string | null;
  /** Roster size — present on list/get responses. */
  student_count?: number;
}

/** A student row in a class roster. */
export interface Student {
  id: number;
  class_id: number;
  full_name: string;
  student_code: string | null;
  order_index: number;
  created_at: string | null;
}

export interface StudentBulkRow {
  full_name: string;
  student_code?: string | null;
}

// ---- classes --------------------------------------------------------------

export function listClasses(
  options?: RequestOptions,
): Promise<{ classes: ClassRoom[] }> {
  return apiGet<{ classes: ClassRoom[] }>("/classes", {}, options);
}

export function createClass(
  name: string,
  note?: string | null,
  options?: RequestOptions,
): Promise<ClassRoom> {
  return apiPost<{ name: string; note: string | null }, ClassRoom>(
    "/classes",
    { name, note: note ?? null },
    options,
  );
}

export function updateClass(
  classId: number,
  body: { name?: string; note?: string | null },
  options?: RequestOptions,
): Promise<{ ok: boolean }> {
  return apiPatch<typeof body, { ok: boolean }>(
    `/classes/${classId}`,
    body,
    options,
  );
}

export function deleteClass(
  classId: number,
  options?: RequestOptions,
): Promise<{ ok: boolean }> {
  return apiDelete<{ ok: boolean }>(`/classes/${classId}`, options);
}

// ---- students -------------------------------------------------------------

export function listStudents(
  classId: number,
  options?: RequestOptions,
): Promise<{ students: Student[] }> {
  return apiGet<{ students: Student[] }>(
    `/classes/${classId}/students`,
    {},
    options,
  );
}

export function addStudent(
  classId: number,
  fullName: string,
  studentCode?: string | null,
  options?: RequestOptions,
): Promise<Student> {
  return apiPost<{ full_name: string; student_code: string | null }, Student>(
    `/classes/${classId}/students`,
    { full_name: fullName, student_code: studentCode ?? null },
    options,
  );
}

export function addStudentsBulk(
  classId: number,
  students: StudentBulkRow[],
  options?: RequestOptions,
): Promise<{ inserted: number }> {
  return apiPost<{ students: StudentBulkRow[] }, { inserted: number }>(
    `/classes/${classId}/students/bulk`,
    { students },
    options,
  );
}

export function updateStudent(
  studentId: number,
  body: { full_name?: string; student_code?: string | null },
  options?: RequestOptions,
): Promise<{ ok: boolean }> {
  return apiPatch<typeof body, { ok: boolean }>(
    `/classes/students/${studentId}`,
    body,
    options,
  );
}

export function deleteStudent(
  studentId: number,
  options?: RequestOptions,
): Promise<{ ok: boolean }> {
  return apiDelete<{ ok: boolean }>(`/classes/students/${studentId}`, options);
}

// ---- gradebook ------------------------------------------------------------

/** A student's current grade — per-câu scores keyed by câu number (string). */
export interface StudentGrade {
  scores: Record<string, number>;
  total: number;
  run_id: number | null;
  graded_at: string | null;
}

/** A roster row enriched with the student's grade (null if not yet graded). */
export interface GradebookRow extends Student {
  grade: StudentGrade | null;
}

export function getGradebook(
  classId: number,
  options?: RequestOptions,
): Promise<{ students: GradebookRow[] }> {
  return apiGet<{ students: GradebookRow[] }>(
    `/classes/${classId}/gradebook`,
    {},
    options,
  );
}

/** Upsert a student's grade (called from the grading desk on finalize). */
export function upsertStudentGrade(
  studentId: number,
  scores: Record<number, number>,
  runId?: number | null,
  options?: RequestOptions,
): Promise<StudentGrade> {
  return apiPut<{ scores: Record<number, number>; run_id: number | null }, StudentGrade>(
    `/classes/students/${studentId}/grade`,
    { scores, run_id: runId ?? null },
    options,
  );
}
