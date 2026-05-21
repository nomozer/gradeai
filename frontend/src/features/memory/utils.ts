/**
 * features/memory/utils.ts — source/tier model for the HITL Memory panel.
 *
 * Derives a 5-bucket source tag from a lesson's feedback_score plus a probe
 * of lesson_text. Mirrors how the backend produces lessons:
 *
 *   reject  (5.0) → REJECT
 *   revise  (4.0) → REVISE  (free-form correction note)
 *   delta   (4.0) → Δ-GRADE (numeric-correction lesson, ``format_delta_lesson``)
 *   per-q   (3.5) → PER-CÂU (distilled per-question rule)
 *   approve (3.0) → APPROVE (aggregate comment on approve)
 *
 * Δ-GRADE lessons share score 4.0 with REVISE — they are disambiguated by
 * the Vietnamese prefix that ``backend/grading/scoring.py`` writes into
 * ``lesson_text``. Keep DELTA_LESSON_PREFIX in sync if the prompt changes.
 */

import { T } from "../../theme/tokens";
import type { Lesson } from "../../types";

const DELTA_LESSON_PREFIX = "Hiệu chỉnh điểm";

export type SourceTag = "REJECT" | "Δ-GRADE" | "REVISE" | "PER-CÂU" | "APPROVE";
export type SourceFilter = "" | SourceTag;
// "" = "Mọi môn"; any other string is a subject code returned by the backend
// (e.g. "math", "cs", "phys", "chem", …). Pills are derived from
// stats.by_subject so adding a subject on the backend requires no frontend
// change.
export type SubjectFilter = string;

export interface SourceMeta {
  label: SourceTag;
  /** Score that defines this bucket — used by the distribution chart. */
  score: number;
  /** Display label for the score column in the table. */
  scoreLabel: string;
  color: string;
}

export const SOURCE_META: Record<SourceTag, SourceMeta> = {
  REJECT:    { label: "REJECT",   score: 5.0, scoreLabel: "5.0", color: T.red },
  "Δ-GRADE": { label: "Δ-GRADE",  score: 4.0, scoreLabel: "4.0", color: T.amber },
  REVISE:    { label: "REVISE",   score: 4.0, scoreLabel: "4.0", color: T.amber },
  "PER-CÂU": { label: "PER-CÂU",  score: 3.5, scoreLabel: "3.5", color: T.accent },
  APPROVE:   { label: "APPROVE",  score: 3.0, scoreLabel: "3.0", color: T.green },
};

export function sourceFromLesson(
  lesson: Pick<Lesson, "feedback_score" | "lesson_text">,
): SourceTag {
  const s = lesson.feedback_score;
  if (s >= 5.0) return "REJECT";
  if (s >= 4.0) {
    return lesson.lesson_text.startsWith(DELTA_LESSON_PREFIX) ? "Δ-GRADE" : "REVISE";
  }
  if (s >= 3.5) return "PER-CÂU";
  return "APPROVE";
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  // 2026-05-12 — short ISO so the column lines up under a mono font.
  return d.toISOString().slice(0, 10);
}

export function formatLessonId(id: number): string {
  return `L-${id.toString().padStart(4, "0")}`;
}

export interface TaggedLesson {
  lesson: Lesson;
  source: SourceTag;
}
