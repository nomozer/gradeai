import { apiPost, type RequestOptions } from "./client";
import { emitMemoryChanged } from "../lib/memoryBus";
import type { BackendSubject, FinalizeGradeResponse, StagedLesson } from "../types";

export interface FinalizeGradeRequest {
  task: string;
  lang?: string;
  ai_overall: number | null;
  teacher_overall: number | null;
  /** Per-câu AI scores keyed by câu number as string ("1","2",...).
   *  Backend computes per-câu deltas — the path 100% of teacher edits
   *  flow through under the current Pattern B UI. */
  ai_per_question?: Record<string, number>;
  /** Per-câu teacher overrides, same shape as ai_per_question. */
  teacher_per_question?: Record<string, number>;
  /** Pattern B per-câu per-criterion AI points. Nested by câu number
   *  string then criterion label (e.g. ``{"1": {"Đặt vấn đề": 1.0,
   *  "Biến đổi": 0.5}}``). When present, backend computes per-step
   *  deltas — the finest-grained learning signal the UI captures. */
  ai_per_step?: Record<string, Record<string, number>>;
  /** Per-câu per-criterion teacher overrides, same shape as ai_per_step. */
  teacher_per_step?: Record<string, Record<string, number>>;
  approved_grade_json: string;
  run_id: number | null;
  subject?: BackendSubject | null;
  comment?: string;
  staged_lessons?: StagedLesson[];
}

export function finalizeGrade(
  req: FinalizeGradeRequest,
  options?: RequestOptions,
): Promise<FinalizeGradeResponse> {
  // /finalize-grade may or may not create a delta lesson (depends on
  // threshold), but it always writes an approved_grade row and may
  // back-fill correct_code on prior lessons — either way the panel's
  // stats and rows can shift, so we refresh regardless.
  return apiPost<FinalizeGradeRequest, FinalizeGradeResponse>("/finalize-grade", req, options).then(
    (res) => {
      emitMemoryChanged();
      return res;
    },
  );
}
