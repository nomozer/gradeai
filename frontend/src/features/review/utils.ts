/**
 * features/review/utils.ts — pure helpers for the step-3 review UI.
 *
 * No React, no component state. Two concern groups:
 *   • Transcript parsing — split a flat grade string into per-question
 *     blocks and align student work with AI comments by câu number.
 *   • deriveStepReviewData — fold a live grade + pipeline lessons into the
 *     ReviewPayload the layout renders.
 */

import {
  buildSyntheticAnnotations,
  parseCauHeader,
  splitTranscriptByCau,
} from "../../lib/grade";
import type { Grade, I18nStrings, Lesson } from "../../types";
import { MOCK_REVIEW } from "./__mocks__/review.mock";
import type {
  MockQuestion,
  MockReferencedLesson,
  QuestionPair,
  QuestionPart,
  ReviewPayload,
} from "./types";

// ---------------------------------------------------------------------------
// Parse a flat string into per-question blocks.
// Convention: "Câu 1: …\nCâu 2: …" or "Question 1: …"
// ---------------------------------------------------------------------------
export function parseIntoQuestions(
  source: string | null | undefined,
): QuestionPart[] {
  if (typeof source !== "string" || !source.trim()) return [];
  const regex = /(?=(?:Câu|Question|Câu hỏi)\s*\d+\s*[:：])/i;
  const parts = source.split(regex).filter((p) => p.trim());
  if (parts.length <= 1) {
    return [{ idx: 0, label: "", num: null, body: source.trim() }];
  }
  return parts.map((part, i) => {
    const match = part.match(/^((?:Câu|Question|Câu hỏi)\s*(\d+)\s*[:：])\s*/i);
    const label = match ? match[1] : `#${i + 1}`;
    const num = match ? parseInt(match[2], 10) : null;
    const body = match ? part.slice(match[0].length).trim() : part.trim();
    return { idx: i, label, num, body };
  });
}

export function normalizeAiAnalysisText(
  value: string | null | undefined,
  t: I18nStrings,
): string {
  const trimmed = String(value || "").trim();
  const fallback = String(
    t.aiAnalyzeFallback ?? "AI chưa phân tích được nhận xét này. Vui lòng thử lại.",
  );
  if (!trimmed) return fallback;
  // Reject obvious broken JSON fragments such as `{`, `"`, `{ "`.
  if (/^[\s{}[\]",:]+$/.test(trimmed)) return fallback;
  return trimmed;
}

export function clipText(
  value: string | null | undefined,
  maxLen: number,
): string {
  const normalized = String(value || "")
    .replace(/\s+/g, " ")
    .trim();
  if (!normalized) return "";
  if (normalized.length <= maxLen) return normalized;
  return `${normalized.slice(0, Math.max(0, maxLen - 1)).trimEnd()}…`;
}

export function buildAnalyzeQuestionContext(
  task: string | null | undefined,
  pair: QuestionPair | undefined,
): string {
  const parts: string[] = [];
  const taskLine = clipText(task, 180);
  const questionLabel = clipText(pair?.student?.label || pair?.ai?.label || "", 60);
  const aiSummary = clipText(pair?.ai?.body, 500);

  if (taskLine) parts.push(`Bối cảnh bài: ${taskLine}`);
  if (questionLabel) parts.push(`Câu đang xét: ${questionLabel}`);
  if (aiSummary) parts.push(`Nhận xét AI hiện tại: ${aiSummary}`);

  return parts.join("\n");
}

// ---------------------------------------------------------------------------
// Align transcript parts with AI comment parts BY QUESTION NUMBER.
// ---------------------------------------------------------------------------
export function alignByQuestionNumber(
  studentParts: QuestionPart[],
  commentParts: QuestionPart[],
): QuestionPair[] {
  const studentNumbered = studentParts.length > 0 && studentParts.every((p) => p.num !== null);
  const commentNumbered = commentParts.length > 0 && commentParts.every((p) => p.num !== null);

  if (!studentNumbered || !commentNumbered) {
    const count = Math.max(studentParts.length, commentParts.length, 1);
    return Array.from({ length: count }, (_, i) => ({
      num: i + 1,
      student: studentParts[i] || { idx: i, label: "", num: null, body: "" },
      ai: commentParts[i] || { idx: i, label: "", num: null, body: "" },
    }));
  }

  const byNum = (parts: QuestionPart[]) => {
    const map = new Map<number, QuestionPart>();
    for (const p of parts) if (p.num !== null && !map.has(p.num)) map.set(p.num, p);
    return map;
  };
  const studentMap = byNum(studentParts);
  const commentMap = byNum(commentParts);
  const nums = Array.from(new Set([...studentMap.keys(), ...commentMap.keys()])).sort(
    (a, b) => a - b,
  );

  return nums.map((num) => ({
    num,
    student: studentMap.get(num) || {
      idx: num - 1,
      label: `Câu ${num}`,
      num,
      body: "",
    },
    ai: commentMap.get(num) || {
      idx: num - 1,
      label: `Câu ${num}`,
      num,
      body: "",
    },
  }));
}

/** Build the review payload (ReviewPayload shape) from a live grade +
 *  pipeline state. Falls through to MOCK_REVIEW when the grade has no
 *  scored per-câu data, so dev runs and salvaged grades still render.
 *
 *  Fields with no data source:
 *    - studentName / studentClass — returned empty; the paper identity is
 *      not extracted or entered anywhere, so PaperHead shows a neutral
 *      placeholder instead of a fake name.
 *    - durationSec — pipeline doesn't measure VLM call time yet.
 *    - similarity — backend doesn't expose semantic-distance per lesson.
 *  When those sources land, replace the placeholders here without
 *  changing the layout. */
export function deriveStepReviewData(
  grade: Grade | null,
  lessonsUsed: Lesson[],
  runNumber: number,
): ReviewPayload {
  const pqf = grade?.per_question_feedback ?? [];
  const hasReal =
    pqf.length > 0 && pqf.some((q) => typeof q.score === "number");
  if (!hasReal) return { ...MOCK_REVIEW, studentName: "", studentClass: "" };

  const linesByCau = splitTranscriptByCau(grade?.transcript ?? "");
  const questions: MockQuestion[] = pqf.map((q, i) => {
    const parsed = parseCauHeader(q.question ?? "", i + 1);
    const lines = linesByCau.get(parsed.num) ?? [];
    const max =
      typeof q.max_points === "number" && isFinite(q.max_points)
        ? q.max_points
        : 0;
    const earned =
      typeof q.score === "number" && isFinite(q.score) ? q.score : 0;
    return {
      num: parsed.num,
      earned,
      max,
      summary: q.good_points || q.errors || parsed.prompt || "",
      lines: lines.length > 0 ? lines : [`Câu ${parsed.num}.`],
      annotations: buildSyntheticAnnotations(q, lines.length),
    };
  });

  const overallMax = questions.reduce((s, q) => s + q.max, 0) || 10;
  const correctCount = questions.filter(
    (q) => q.max > 0 && Math.abs(q.earned - q.max) < 0.001,
  ).length;
  const needsReviewCount = questions.length - correctCount;

  const referencedLessons: MockReferencedLesson[] = lessonsUsed.map((l) => ({
    id: `L-${String(l.id).padStart(4, "0")}`,
    subject: l.subject || "—",
    score: l.feedback_score,
    text: l.lesson_text,
    similarity: 0, // Backend doesn't expose semantic distance yet.
    date: l.timestamp ? l.timestamp.slice(0, 10) : "—",
  }));

  return {
    studentName: "", // No identity source — PaperHead renders a placeholder.
    studentClass: "",
    runNumber,
    lessonsUsed: lessonsUsed.length,
    modelName: "gemini-3-flash-preview",
    durationSec: 0, // Not measured by pipeline yet.
    overallScore: typeof grade?.overall === "number" ? grade.overall : 0,
    overallMax,
    correctCount,
    needsReviewCount,
    initialActiveQuestionNum: questions[0]?.num ?? 1,
    referencedLessons,
    questions,
  };
}
