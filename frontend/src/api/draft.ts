import { apiGet, apiPost, type RequestOptions } from "./client";
import type { SelectionAnnotation } from "../types";

export interface SaveDraftRequest {
  run_id: number;
  /** Per-câu teacher scores keyed by câu number (serialised to string keys
   *  over JSON). */
  scores: Record<number, number>;
  /** đối-soát annotations, round-tripped verbatim. */
  annotations: SelectionAnnotation[];
}

export interface DraftGradeData {
  run_id: number;
  /** String-keyed over the wire (JSON object keys); caller coerces to câu
   *  numbers when applying to finalScores. */
  scores: Record<string, number>;
  annotations: SelectionAnnotation[];
  updated_at: number | null;
}

export interface GetDraftResponse {
  draft: DraftGradeData | null;
}

/**
 * Save the teacher's in-progress grading ("Lưu nháp"). This is NOT a learning
 * signal (unlike finalizeGrade) — it only persists scores + comments so the
 * work survives a reload. Saving again overwrites the run's draft.
 */
export function saveDraft(
  req: SaveDraftRequest,
  options?: RequestOptions,
): Promise<{ ok: boolean }> {
  return apiPost<SaveDraftRequest, { ok: boolean }>("/draft-grade", req, options);
}

/** Fetch the saved draft for a run (scoped to the teacher), or `{ draft: null }`. */
export function getDraft(
  runId: number,
  options?: RequestOptions,
): Promise<GetDraftResponse> {
  return apiGet<GetDraftResponse>(`/draft-grade/${runId}`, {}, options);
}
