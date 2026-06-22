import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAgentPipeline } from "../../hooks/useAgentPipeline";
import { useFeedback } from "../../hooks/useFeedback";
import { ApiError, detectSubject, finalizeGrade, saveDraft, getDraft, upsertStudentGrade, type DetectConfidence } from "../../api";
import { T } from "../../theme/tokens";
import { i18n } from "../../i18n";
import { Icon } from "../../components/ui/Icon";
import { parseCauHeader, parseGrade, splitTranscriptByCau } from "../../lib/grade";
import { LoadingSpinner } from "../../components/ui/LoadingSpinner";
import { StepIndicator } from "../../components/layout/StepIndicator";
import { subjectLabelOf } from "../../lib/subject";
import { ErrorBoundary } from "../../components/ui/ErrorBoundary";
import { StepUpload } from "../upload/StepUpload";
import { StepReview } from "../review/StepReview";
import {
  buildTaskContext,
  deriveDisplayStep,
  nextStepOnPhaseChange,
  stepAfterGrade,
  taskFromPdfName,
} from "./workspace.logic";
import type {
  BackendSubject,
  EssayFile,
  FinalizedResult,
  Grade,
  SelectionAnnotation,
  StagedLesson,
  Tab,
  TabMeta,
  TaskFile,
} from "../../types";
import { readOptimizedUploadDataUrl } from "../../lib/file";

interface EssayWorkspaceProps {
  active: boolean;
  tab: Tab;
  onAddTab: (meta?: TabMeta) => void;
  onMeta: (meta: TabMeta) => void;
}

function buildAnnotationFinalizePayload(annotations: SelectionAnnotation[]): {
  stagedLessons: StagedLesson[];
  aggregateComment: string;
  skippedCount: number;
} {
  const nonEmpty = annotations.filter((a) => a.comment.trim().length > 0);
  const skipped = nonEmpty.filter(
    (a) => a.verdict === "dispute" && a.disputeDecision !== "apply",
  );
  const accepted = nonEmpty.filter(
    (a) => !(a.verdict === "dispute" && a.disputeDecision !== "apply"),
  );

  const stagedLessons: StagedLesson[] = accepted.map((a) => {
    const lesson = (a.lesson || "").trim();
    const fallback = a.quote
      ? `"${a.quote.trim()}" — ${a.comment.trim()}`
      : a.comment.trim();
    return {
      lesson_text: lesson || fallback,
      question_ref: `Câu ${a.cau}`,
    };
  });

  const aggregateComment = accepted
    .map((a) =>
      a.quote
        ? `[Câu ${a.cau}] "${a.quote.trim()}" — ${a.comment.trim()}`
        : `[Câu ${a.cau}] ${a.comment.trim()}`,
    )
    .join("\n");

  return { stagedLessons, aggregateComment, skippedCount: skipped.length };
}

// Carry the teacher's đối-soát comments across regrade rounds instead of
// wiping them: they are notes on the *student's* work, which doesn't change
// between rounds — only the AI's transcript does. Each annotation is
// re-anchored by finding its quote in the new câu's lines:
//   • quote found             → re-point lineIdx/endLineIdx to the new spot
//   • quote gone, câu present  → keep the comment, pin it to the câu (line 0)
//   • câu itself gone          → drop (nothing left to attach to)
// A genuinely different essay re-graded in the same tab self-cleans: its
// quotes won't match, so at most câu-level remnants survive (rare edge case).
function reanchorAnnotations(
  prev: SelectionAnnotation[],
  grade: Grade | null,
): SelectionAnnotation[] {
  if (prev.length === 0) return prev;
  const linesByCau = splitTranscriptByCau(grade?.transcript ?? "");
  const out: SelectionAnnotation[] = [];
  for (const a of prev) {
    const cauLines = linesByCau.get(a.cau);
    if (!cauLines || cauLines.length === 0) continue; // câu gone → drop
    const quoteLines = String(a.quote ?? "")
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter(Boolean);
    let start = -1;
    if (quoteLines.length > 0) {
      const first = quoteLines[0];
      start = cauLines.findIndex((l) => l.trim() === first);
      // Looser fallback: a line that contains the first quote line (handles
      // minor re-wording / trailing punctuation the regrade may introduce).
      if (start < 0 && first.length >= 4) {
        start = cauLines.findIndex((l) => l.includes(first));
      }
    }
    if (start >= 0) {
      const end = Math.min(
        start + Math.max(0, quoteLines.length - 1),
        cauLines.length - 1,
      );
      out.push({ ...a, lineIdx: start, endLineIdx: end });
    } else {
      // câu-level fallback — keep the comment, pin to the câu's first line
      out.push({ ...a, lineIdx: 0, endLineIdx: 0 });
    }
  }
  return out;
}

function nextFrame(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof window === "undefined" || typeof window.requestAnimationFrame !== "function") {
      resolve();
      return;
    }
    window.requestAnimationFrame(() => resolve());
  });
}

export function EssayWorkspace({
  active,
  tab,
  onAddTab,
  onMeta,
}: EssayWorkspaceProps) {
  const lang = "vi" as const;
  const t = i18n[lang];
  const pipeline = useAgentPipeline();
  const feedbackHook = useFeedback();

  const [taskPdf, setTaskPdf] = useState<TaskFile | null>(null);
  const [essayImage, setEssayImage] = useState<EssayFile | null>(null);
  const [answerKeyPdf, setAnswerKeyPdf] = useState<TaskFile | null>(null);

  // Per-tab subject state. Replaces the old App-level `selectedSubject`
  // (which was the same value across all tabs — a latent bug when the
  // teacher graded a math paper in tab 1 then a bio paper in tab 2).
  // `subject` is the value sent to the backend as the authoritative hint;
  // `detected` + `confidence` reflect the most recent /api/detect-subject
  // verdict so SubjectChip can render "Phát hiện: …" hints. `manualSubject`
  // tracks whether the teacher overrode the auto-pick — used by the chip
  // to show "Đã xác nhận" instead of "Tự phát hiện".
  const [subject, setSubject] = useState<BackendSubject | null>(null);
  const [detectedSubject, setDetectedSubject] = useState<BackendSubject | null>(null);
  const [subjectConfidence, setSubjectConfidence] = useState<DetectConfidence | null>(null);
  const [subjectDetecting, setSubjectDetecting] = useState(false);
  const [subjectDetectError, setSubjectDetectError] = useState<string | null>(null);
  const [manualSubject, setManualSubject] = useState(false);
  const onMetaRef = useRef(onMeta);

  useEffect(() => {
    onMetaRef.current = onMeta;
  }, [onMeta]);

  const [grade, setGrade] = useState<Grade | null>(null);
  const [step, setStep] = useState<number>(1);
  // High-water-mark of the step the teacher reached this session. The
  // StepIndicator uses this so steps the user walked past keep their
  // green-check state even when they navigate back (e.g. step 4 →
  // "Sửa lại" → step 3). Without it, 3 and 4 collapse back to grey,
  // which read like "you haven't done these" — a bug the teacher
  // flagged 2026-05-18.
  const [maxStepReached, setMaxStepReached] = useState<number>(1);
  const [finalizedResult, setFinalizedResult] = useState<FinalizedResult | null>(null);
  const [isFinalizing, setIsFinalizing] = useState<boolean>(false);
  const [finalizeError, setFinalizeError] = useState<string | null>(null);

  // Load initial files from tab metadata (used for batch uploads and sync)
  useEffect(() => {
    if (tab.initialEssayFile) {
      setEssayImage(tab.initialEssayFile);
    }
    if (tab.initialTaskFile) {
      setTaskPdf(tab.initialTaskFile);
    }
    if (tab.initialAnswerKeyFile) {
      setAnswerKeyPdf(tab.initialAnswerKeyFile);
    }
    if (tab.initialSubject) {
      setSubject(tab.initialSubject);
      setDetectedSubject(tab.initialSubject);
      setManualSubject(true);
    }
  }, [tab.initialEssayFile, tab.initialTaskFile, tab.initialAnswerKeyFile, tab.initialSubject]);

  // Teacher per-câu SCORE overrides only. The constraint is "sum(max) =
  // 10 (hoặc bareme)" — max per câu belongs to the đề, not the teacher;
  // AI reads it from the task PDF. Allowing teacher to override max led
  // to silent corruption (a stale {1:10} leaking from a 1-câu paper into
  // a 3-câu paper made the hero show 9.5/17 instead of 9.5/10). So we
  // dropped the maxOverrides state entirely; ``q.max_points`` from
  // pipeline output is the single source of truth.
  const [finalScores, setFinalScores] = useState<Record<number, number>>({});

  // Batch Essay Upload handler
  const handleBatchEssayUpload = useCallback(
    (files: File[]) => {
      // Snapshot AI's per-câu max from the current grade so each new tab
      // inherits the batch's scoring scheme via ``initialMaxPointsTemplate``.
      // Sourced from AI (not teacher edits) — teacher can't edit max anymore.
      const templateFromGrade: Record<number, number> = {};
      const pqf = grade?.per_question_feedback ?? [];
      for (let i = 0; i < pqf.length; i++) {
        const q = pqf[i];
        const parsed = parseCauHeader(q.question ?? "", i + 1);
        if (typeof q.max_points === "number" && Number.isFinite(q.max_points)) {
          templateFromGrade[parsed.num] = q.max_points;
        }
      }
      void (async () => {
        for (const file of files) {
          try {
            const dataUrl = await readOptimizedUploadDataUrl(file);
            if (dataUrl) {
              onAddTab({
                label: file.name.slice(0, 30),
                initialEssayFile: {
                  dataUrl,
                  name: file.name,
                  isPdf: file.type === "application/pdf" || file.name.endsWith(".pdf"),
                },
                initialTaskFile: taskPdf,
                initialAnswerKeyFile: answerKeyPdf,
                initialSubject: subject,
                maxPointsTemplate:
                  Object.keys(templateFromGrade).length > 0
                    ? { ...templateFromGrade }
                    : null,
                canRun: !!taskPdf && !!subject,
              });
            }
          } catch (err) {
            console.error("Batch essay upload failed:", err);
          }
          await nextFrame();
        }
      })();
    },
    [onAddTab, taskPdf, answerKeyPdf, subject, grade],
  );
  // Step 3 "đối soát" annotations — Word-style highlights with comments
  // anchored to specific quotes in the AI transcript. Stored as a flat
  // array (filtered by `cau` for per-câu display). Wiped on every fresh
  // grade together with finalScores (see the parseGrade effect below).
  const [teacherAnnotations, setTeacherAnnotations] = useState<
    SelectionAnnotation[]
  >([]);


  // When a grade is loaded from history, taskPdf is null so the normal
  // label derivation yields "". We stash the entry's task descriptor
  // (e.g. "Toán · ĐỀ HÌNH") so the tab still shows a meaningful title.
  const [historyTaskLabel, setHistoryTaskLabel] = useState<string>("");

  const handleSubjectChange = useCallback((code: BackendSubject) => {
    setSubject(code);
    setManualSubject(true);
  }, []);

  // Re-run detection every time the task PDF changes (new upload OR file
  // swap). Uses a ref to invalidate stale responses if the teacher uploads
  // a second PDF before the first call resolves — only the most recent
  // request gets to mutate state, preventing race-condition flicker.
  const detectionSeqRef = useRef(0);
  useEffect(() => {
    if (manualSubject && subject) {
      return;
    }
    if (!taskPdf?.dataUrl) {
      // PDF cleared → reset everything subject-related so the chip goes
      // back to its "Tải đề bài để phát hiện môn" idle state.
      detectionSeqRef.current += 1;
      setSubject(null);
      setDetectedSubject(null);
      setSubjectConfidence(null);
      setSubjectDetecting(false);
      setSubjectDetectError(null);
      setManualSubject(false);
      return;
    }
    const seq = ++detectionSeqRef.current;
    const ctrl = new AbortController();
    setSubjectDetecting(true);
    setSubjectDetectError(null);
    setManualSubject(false);
    detectSubject({ task_pdf_b64: taskPdf.dataUrl }, { signal: ctrl.signal })
      .then((res) => {
        if (seq !== detectionSeqRef.current) return; // stale response
        setDetectedSubject(res.detected);
        setSubjectConfidence(res.confidence);
        // Auto-apply only when the backend is confident. Low / none
        // require an explicit click on the chip — the chip enters its
        // amber "Xác nhận hoặc đổi" state until the teacher picks.
        if (res.confidence === "high") {
          setSubject(res.detected);
          onMetaRef.current({ initialSubject: res.detected });
        } else {
          setSubject(null);
          onMetaRef.current({ initialSubject: null });
        }
      })
      .catch((err) => {
        if (seq !== detectionSeqRef.current) return;
        if ((err as Error).name === "AbortError") return;
        const msg = err instanceof ApiError ? err.detail : (err as Error).message;
        setSubjectDetectError(msg || "Không phát hiện được môn từ file đề.");
        setSubjectConfidence("none");
      })
      .finally(() => {
        if (seq !== detectionSeqRef.current) return;
        setSubjectDetecting(false);
      });
    return () => {
      ctrl.abort();
    };
  }, [taskPdf?.dataUrl, manualSubject, subject]);

  const subjectLabel = useMemo(() => subjectLabelOf(subject), [subject]);

  const taskLabel = useMemo(() => taskFromPdfName(taskPdf?.name), [taskPdf]);

  const tabQuestions = useMemo(() => {
    if (!grade?.per_question_feedback) return undefined;
    return grade.per_question_feedback.map((q, i) => {
      const parsed = parseCauHeader(q.question ?? "", i + 1);
      const score = finalScores[parsed.num] ?? q.score ?? 0;
      return {
        num: parsed.num,
        score,
        label: `Câu ${parsed.num}`,
      };
    });
  }, [grade, finalScores]);
  const task = useMemo(
    () => buildTaskContext(taskPdf?.name, subjectLabel === "—" ? "" : subjectLabel),
    [taskPdf, subjectLabel],
  );

  // Parse grade when pipeline returns
  useEffect(() => {
    const g = parseGrade(pipeline.code);
    if (g) {
      setGrade(g);
      setFinalizedResult(null);
      setIsFinalizing(false);
      setFinalizeError(null);
      // Restore teacher's per-câu SCORE overrides if reloaded from
      // history. ``historyMaxOverrides`` is deliberately NOT consumed —
      // max belongs to the đề (AI reads it from the task PDF) and stale
      // values from older sessions would silently re-inflate the
      // denominator (see comment at the maxOverrides removal).
      setFinalScores(pipeline.historyFinalScores ?? {});
      // Keep the teacher's đối-soát comments across regrade rounds (notes on
      // the student's work, which doesn't change) by re-anchoring them to the
      // new transcript. A history load opens a different paper, so reset there.
      setTeacherAnnotations((prev) =>
        pipeline.historyFinalScores != null ? [] : reanchorAnnotations(prev, g),
      );
      // Reset the step high-water-mark — a regrade restarts the review
      // arc, so the indicator shouldn't claim step 4 is still "done"
      // from the previous round.
      setMaxStepReached((prev) => Math.max(prev, 3));
      setStep((s) => stepAfterGrade(s));
    }
  }, [
    pipeline.code,
    pipeline.runId,
    pipeline.historyFinalScores,
  ]);

  // Mirror AI's per-câu max from the current grade into
  // ``tab.maxPointsTemplate`` so App.tsx's cross-tab sync propagates the
  // batch's authoritative scoring scheme. Sourced from
  // ``grade.per_question_feedback[i].max_points`` — not from teacher
  // edits, because teacher cannot edit max under the "total = 10 (or
  // bareme)" invariant. Ref-guarded JSON compare prevents the loop where
  // updateMeta returns a new tab object on every call.
  const mirroredTemplateRef = useRef<string>("");
  useEffect(() => {
    if (!grade) return;
    const next: Record<number, number> = {};
    const pqf = grade.per_question_feedback ?? [];
    for (let i = 0; i < pqf.length; i++) {
      const q = pqf[i];
      const parsed = parseCauHeader(q.question ?? "", i + 1);
      if (typeof q.max_points === "number" && Number.isFinite(q.max_points)) {
        next[parsed.num] = q.max_points;
      }
    }
    const payload = Object.keys(next).length > 0 ? next : null;
    const key = JSON.stringify(payload ?? {});
    if (key === mirroredTemplateRef.current) return;
    mirroredTemplateRef.current = key;
    onMetaRef.current({ maxPointsTemplate: payload });
  }, [grade]);

  // Track the highest step the teacher reaches. Plain ratchet — only
  // moves upward, never resets except on a fresh grade (above).
  useEffect(() => {
    setMaxStepReached((prev) => (step > prev ? step : prev));
  }, [step]);

  // Handle pipeline phase changes
  useEffect(() => {
    setStep((s) => nextStepOnPhaseChange(s, pipeline.phase, pipeline.error));
  }, [pipeline.phase, pipeline.error]);

  // Hydrate from an opened-in-new-tab history entry. App.tsx populates
  // ``tab.initialHistoryEntry`` + ``tab.initialHistoryStep`` when the
  // teacher clicks a row in the "Bài đã chấm" dropdown; addTab puts it
  // into a fresh tab so this workspace mounts with a clean slate — no
  // overwrite of any other tab's uploaded files or unsaved edits ever
  // happens. We clear the fields after consuming them so a tab metadata
  // re-render doesn't replay the load. Dep is intentionally narrow:
  // ``pipeline.loadHistoryEntry`` is recreated each render and would
  // re-run this effect spuriously if included.
  useEffect(() => {
    const entry = tab.initialHistoryEntry;
    if (!entry || typeof entry.response?.code !== "string") return;
    const ok = pipeline.loadHistoryEntry(entry);
    if (!ok) return;
    feedbackHook.reset();
    setIsFinalizing(false);
    setFinalizeError(null);
    setFinalizedResult(null);
    const targetStep = tab.initialHistoryStep ?? 3;
    // Step 4/5 (the old "Xong" screen) folded into Step 3 — history
    // entries always land on the review surface.
    const mappedStep = targetStep === 5 || targetStep === 4 ? 3 : targetStep;
    setStep(mappedStep);
    // History entries are already-completed grades — mark all steps
    // through 3 as reached so the stepper shows green checks and the
    // teacher can navigate freely.
    setMaxStepReached(3);
    if (entry.subject) {
      setSubject(entry.subject as BackendSubject);
      setDetectedSubject(entry.subject as BackendSubject);
      setManualSubject(true);
    }
    // Stash the entry's task descriptor for the tab label — taskPdf
    // stays null when loading from history so PDF-based label derivation
    // yields "".
    setHistoryTaskLabel(entry.task || "");
    // ``initialHistoryEntry`` is intentionally NOT cleared after consume —
    // it acts as the dedup key for App.tsx's ``hitl.openHistoryEntry``
    // listener (clicking the same row twice switches to this tab instead
    // of spawning a duplicate). The useEffect dep is the entry reference,
    // which is stable across updateMeta re-renders, so keeping the field
    // populated does not re-trigger the load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab.initialHistoryEntry]);

  // Report tab metadata. When loading from history, taskPdf is null so
  // taskLabel is empty — fall back to the entry's task string (e.g.
  // "Toán · ĐỀ HÌNH") which was persisted when the grade was saved.
  const historyTask = historyTaskLabel && !taskPdf ? historyTaskLabel : "";
  // The bài làm (essay) filename is the per-student identifier — it's the
  // one thing that differs across a batch of same-đề / same-môn papers, so
  // the teacher always knows WHOSE paper they're on (teachers name the file
  // after the student). Falls back to the đề name (before a bài làm is
  // uploaded), then the persisted history descriptor (history loads have no
  // essay file). Strip the extension and normalise _/- the same way
  // taskFromPdfName does so "Nguyen_Van_A.pdf" reads as "Nguyen Van A".
  const essayLabel = useMemo(
    () =>
      (essayImage?.name ?? "")
        .replace(/\.[^./\\]+$/, "")
        .replace(/[_-]+/g, " ")
        .trim(),
    [essayImage],
  );
  const label = useMemo(
    () => (essayLabel || taskLabel || historyTask).slice(0, 30),
    [essayLabel, taskLabel, historyTask],
  );


  // Subject must be confirmed (either auto-detected at "high" confidence
  // or explicitly picked by the teacher) before grading is allowed. Without
  // it, the backend hint would be null and we'd silently fall back to
  // DEFAULT_SUBJECT — exactly the failure mode auto-detection is meant to
  // prevent. The chip's amber state nudges the teacher to click.
  const canRun =
    !!taskPdf && !!essayImage && !!subject && pipeline.phase !== "generating";
  const hasGrade = !!grade && step >= 3 && pipeline.phase !== "generating";

  const handleRun = useCallback(() => {
    feedbackHook.reset();
    setIsFinalizing(false);
    setFinalizeError(null);
    pipeline.generate(
      task,
      lang,
      null,
      null,
      essayImage?.dataUrl || null,
      taskPdf?.dataUrl || null,
      subject,
      answerKeyPdf?.dataUrl || null,
      // Pass the batch-level max-points scheme so the backend prompt
      // pins per-câu max to the teacher's numbers — keeps the AI from
      // re-guessing inconsistently across papers from the same exam.
      tab.maxPointsTemplate ?? null,
    );
  }, [task, lang, essayImage, taskPdf, answerKeyPdf, pipeline, feedbackHook, subject, tab.maxPointsTemplate]);

  // Auto-run grading when the workspace is mounted/updated and in the "generating" phase
  useEffect(() => {
    if (tab.phase === "generating" && pipeline.phase === "idle" && !grade && canRun && step === 1) {
      handleRun();
    }
  }, [tab.phase, pipeline.phase, grade, canRun, step, handleRun]);

  useEffect(() => {
    onMeta({
      label,
      phase: pipeline.phase,
      step,
      hasGrade,
      canRun,
      questions: tabQuestions,
      // Propagate pipeline error to tab meta so TabBar can render a
      // failure indicator instead of letting a failed tab silently
      // revert to the same "idle" icon as never-started tabs. Cleared
      // (null) on every fresh run via the same effect — handleRun
      // resets pipeline.error before kicking off, so the next render
      // syncs error: null down to the tab.
      error: pipeline.error || null,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [label, pipeline.phase, step, hasGrade, canRun, tabQuestions, pipeline.error]);

  const handleApprove = useCallback(() => setStep(3), []);

  // Click on a completed step in the indicator → jump back. Only user
  // checkpoints (1: Upload, 3: Review) are exposed as navigable — steps
  // 2 (AI reading) are transient loaders, not
  // checkpoints; clicking them would put the UI back into a "loading"
  // state with no real work happening.
  const handleStepClick = useCallback((n: number) => {
    setStep(n);
  }, []);
  // Expose navigable checkpoints (1: Upload, 3: Review/Score/Finalize).
  // Step 4 (the old "Xong" screen) is folded into Step 3.
  const isStepNavigable = useCallback(
    (n: number) => n === 1 || n === 3,
    [],
  );

  // Persist the finalized grade and capture AI↔teacher score delta as a
  // HITL lesson. The UI only locks after the backend confirms persistence.
  const persistFinalizedGrade = useCallback(
    async (payload: { overall: number | string }) => {
      const toNum = (v: unknown): number | null => {
        const n = parseFloat(v as string);
        return Number.isFinite(n) ? n : null;
      };
      // Per-câu maps mirror what step-4 actually edits. Teacher overrides
      // live in ``finalScores`` (câu_num → score); câus the teacher didn't
      // touch fall back to AI's score so the delta reads as 0 and gets
      // dropped by the 0.25 threshold server-side (no phantom lesson).
      const pqf = grade?.per_question_feedback ?? [];
      const aiPerQuestion: Record<string, number> = {};
      const teacherPerQuestion: Record<string, number> = {};
      let sumAiPq = 0;
      let hasRealPqf = false;
      for (let i = 0; i < pqf.length; i++) {
        const q = pqf[i];
        const aiScore =
          typeof q.score === "number" && Number.isFinite(q.score) ? q.score : null;
        if (aiScore === null) continue;
        hasRealPqf = true;
        const parsed = parseCauHeader(q.question ?? "", i + 1);
        const key = String(parsed.num);
        const teacherScore = finalScores[parsed.num] ?? aiScore;
        aiPerQuestion[key] = aiScore;
        teacherPerQuestion[key] = teacherScore;
        sumAiPq += aiScore;
      }
      // Apples-to-apples overall comparison: when per-câu data is present
      // use sumAI as ai_overall so the delta reads against the SAME
      // dimension the teacher edited. The old code compared sumTeacher
      // (per-câu) against grade.overall (rubric-derived), which produced
      // phantom deltas any time AI's rubric overall ≠ its per-câu sum.
      const teacherOverall = toNum(payload?.overall);
      const aiOverall = hasRealPqf ? sumAiPq : toNum(grade?.overall);
      const finalPerQuestionFeedback = pqf.map((q, i) => {
        const parsed = parseCauHeader(q.question ?? "", i + 1);
        const aiScore =
          typeof q.score === "number" && Number.isFinite(q.score) ? q.score : 0;
        const nextScore = finalScores[parsed.num] ?? aiScore;
        // Max stays at AI's value verbatim — see note at maxOverrides
        // removal. The "total = 10 (hoặc bareme)" invariant is enforced
        // by AI's prompt; frontend never overrides max.
        return {
          ...q,
          score: nextScore,
        };
      });
      const finalGrade = {
        ...(grade || {}),
        overall: teacherOverall ?? grade?.overall ?? null,
        per_question_feedback: finalPerQuestionFeedback,
      };
      const annotationPayload = buildAnnotationFinalizePayload(teacherAnnotations);
      try {
        const resp = await finalizeGrade({
          task,
          lang,
          ai_overall: aiOverall,
          teacher_overall: teacherOverall,
          ai_per_question: aiPerQuestion,
          teacher_per_question: teacherPerQuestion,
          approved_grade_json: JSON.stringify(finalGrade),
          run_id: pipeline.runId,
          subject,
          comment: annotationPayload.aggregateComment,
          staged_lessons: annotationPayload.stagedLessons,
        });
        // Persist the teacher's final đối-soát (highlights + comments) + per-câu
        // scores to the draft so reopening this graded paper from history
        // restores them. The raw annotations live NOWHERE else — the history
        // entry and approved-grade JSON don't carry them — and finalize just
        // deleted the pre-final "Lưu nháp" draft server-side, so re-save it here
        // with the FINAL state. Best-effort: a failure only means annotations
        // won't restore on a later reopen (grade itself is already saved).
        if (pipeline.runId != null) {
          void saveDraft({
            run_id: pipeline.runId,
            scores: finalScores,
            annotations: teacherAnnotations,
          }).catch((e) =>
            console.warn("[HITL] persist final đối-soát failed:", e),
          );
        }
        return resp;
      } catch (err) {
        console.warn("[HITL] finalize-grade persist failed:", err);
        if (err instanceof ApiError) {
          throw new Error(
            err.detail ||
              String(t.finalizeSaveError ?? "") ||
              "Could not save the finalized grade. Please try again.",
          );
        }
        throw err;
      }
    },
    [
      grade,
      task,
      lang,
      pipeline.runId,
      subject,
      finalScores,
      teacherAnnotations,
      t,
    ],
  );

  // Finalize the grade in place (Step 3). The review surface owns the
  // single "Chốt điểm" commit. ``runFinalize`` persists then sets
  // ``finalizedResult`` (which locks StepReview in place: read-only
  // scores + "AI đã học" banner) and the cross-tab ``finalized`` flag so
  // App.tsx auto-advances to the next paper.
  const runFinalize = useCallback(
    async (payload: { overall: number | string }) => {
      if (isFinalizing) return;
      setIsFinalizing(true);
      setFinalizeError(null);
      try {
        const resp = await persistFinalizedGrade(payload);
        // If this tab was opened from a class roster ("Chấm bài"), push the
        // effective per-câu scores into that student's gradebook row. Best-
        // effort: a failure doesn't undo the finalize (grade is already saved).
        if (tab.studentId && tabQuestions && tabQuestions.length > 0) {
          const scores: Record<number, number> = {};
          for (const q of tabQuestions) scores[q.num] = q.score;
          void upsertStudentGrade(
            tab.studentId,
            scores,
            pipeline.runId ?? undefined,
          ).catch((e) =>
            console.warn("[HITL] push grade to class gradebook failed:", e),
          );
        }
        const annotationPayload = buildAnnotationFinalizePayload(teacherAnnotations);
        setFinalizedResult({
          ...payload,
          finalizedAt: new Date().toISOString(),
          commentsSavedCount: resp?.comment_lesson_ids?.length ?? 0,
          commentsSkippedCount: annotationPayload.skippedCount,
          deltaLessonId: resp?.delta_lesson_id ?? null,
          deltas: resp?.deltas,
        });
        onMeta({ finalized: true });
        // Advance to the next paper on the finalize ACTION (not on a
        // ``finalized`` flag transition) — a paper re-chốt'd after being
        // re-opened is already finalized, so a rising-edge trigger in App.tsx
        // would never fire. Mirrors the "Lưu nháp" advance.
        window.dispatchEvent(
          new CustomEvent("hitl.finalizeAdvance", { detail: { tabId: tab.id } }),
        );
      } catch (err) {
        const e = err as Error;
        setFinalizeError(
          e?.message ||
            String(t.finalizeSaveError ?? "") ||
            "Không thể lưu điểm cuối cùng. Vui lòng thử lại.",
        );
      } finally {
        setIsFinalizing(false);
      }
    },
    [
      isFinalizing,
      persistFinalizedGrade,
      teacherAnnotations,
      onMeta,
      t,
      tab.id,
      tab.studentId,
      tabQuestions,
      pipeline.runId,
    ],
  );

  // "Chốt điểm" from Step 3 — compute the teacher's final total (sum of
  // per-câu scores, teacher override falling back to AI), then commit.
  const handleFinalizeFromReview = useCallback(() => {
    const pqf = grade?.per_question_feedback ?? [];
    let sum = 0;
    let hasReal = false;
    for (let i = 0; i < pqf.length; i++) {
      const q = pqf[i];
      const ai =
        typeof q.score === "number" && Number.isFinite(q.score) ? q.score : 0;
      if (typeof q.score === "number" && Number.isFinite(q.score)) hasReal = true;
      const parsed = parseCauHeader(q.question ?? "", i + 1);
      sum += finalScores[parsed.num] ?? ai;
    }
    const overall = hasReal ? sum : grade?.overall ?? 0;
    void runFinalize({ overall });
  }, [grade, finalScores, runFinalize]);

  // Unlock the review SCREEN (read-only → editable) WITHOUT touching the tab's
  // "đã xong" status. Shared by "Sửa lại", click-a-locked-score, and the
  // auto-unlock-on-return effect. Unlocking is free — the paper stays finalized
  // until the teacher actually edits something (see ``markGradeEdited``), so
  // merely re-opening a graded paper to look at it doesn't drop it from the
  // "Xong" count or misfire auto-advance.
  const handleUnlockFinalize = useCallback(() => {
    setFinalizedResult(null);
    setFinalizeError(null);
  }, []);

  // An actual edit (score or đối-soát comment) on an already-finalized paper
  // means it's no longer the committed grade — mark it "needs re-chốt" so the
  // TabBar status icon, batch "Xong" count, and auto-advance treat it as
  // in-progress again. No-op for papers that were never finalized.
  const markGradeEdited = useCallback(() => {
    if (tab.finalized) onMeta({ finalized: false });
  }, [tab.finalized, onMeta]);

  // Auto-unlock only on a RETURN — the tab going inactive→active again while
  // still holding a finalized result. Keying on the ``active`` false→true edge
  // (not just "active && finalizedResult") is what lets the finalize that just
  // happened keep its locked "đã chốt / AI đã ghi nhớ" confirmation: at finalize
  // the tab either stays active (last paper → stays locked) or auto-advances
  // away (active→false, no unlock), and only coming BACK re-opens it for
  // editing. Screen-only — finalized status is untouched (see markGradeEdited).
  const prevActiveRef = useRef(active);
  useEffect(() => {
    const wasActive = prevActiveRef.current;
    prevActiveRef.current = active;
    if (active && !wasActive && step === 3 && finalizedResult) {
      handleUnlockFinalize();
    }
  }, [active, step, finalizedResult, handleUnlockFinalize]);

  // "Lưu nháp" — persist the in-progress scores + đối-soát comments server-side
  // WITHOUT finalizing (no lock, no AI learning) so the work survives a reload
  // and the teacher can come back later. Returns success so the button can show
  // a transient confirmation. No-op (false) when there is no run to attach to.
  const runDraftSave = useCallback(async (): Promise<boolean> => {
    if (pipeline.runId == null) return false;
    try {
      await saveDraft({
        run_id: pipeline.runId,
        scores: finalScores,
        annotations: teacherAnnotations,
      });
      // Fast review pass: after saving, hand off to App.tsx to jump to the
      // next paper (it owns activeId). Lets the teacher lướt nháp through the
      // whole batch, then chốt at the end.
      window.dispatchEvent(
        new CustomEvent("hitl.draftAdvance", { detail: { tabId: tab.id } }),
      );
      return true;
    } catch (err) {
      console.warn("[HITL] save draft failed:", err);
      return false;
    }
  }, [pipeline.runId, finalScores, teacherAnnotations, tab.id]);

  // Restore a saved draft when a run loads (e.g. reopened from history): pull
  // the teacher's last in-progress scores + comments back. Finalized runs have
  // their draft deleted on commit, so this is a no-op for them. Keyed on runId
  // only — a fresh grade resets finalizedResult to null just before this runs.
  useEffect(() => {
    const runId = pipeline.runId;
    if (runId == null) return;
    let cancelled = false;
    void getDraft(runId)
      .then((res) => {
        if (cancelled || !res.draft) return;
        const scores: Record<number, number> = {};
        for (const [k, v] of Object.entries(res.draft.scores)) {
          const n = Number(k);
          if (Number.isFinite(n) && typeof v === "number") scores[n] = v;
        }
        if (Object.keys(scores).length > 0) setFinalScores(scores);
        if (res.draft.annotations && res.draft.annotations.length > 0) {
          setTeacherAnnotations(res.draft.annotations);
        }
      })
      .catch(() => {
        /* draft fetch is best-effort; absence just means "no draft" */
      });
    return () => {
      cancelled = true;
    };
  }, [pipeline.runId]);

  const displayStep = deriveDisplayStep(step);

  const stepLabels = [
    String(t.stepUpload ?? ""),
    String(t.stepReading ?? ""),
    String(t.stepReview ?? ""),
  ];

  return (
    <div className="workspace-container" style={{ padding: "0 var(--ws-bleed, clamp(16px, 4vw, 32px)) var(--ws-pad-bottom, 96px)", display: active ? "block" : "none" }}>
      <StepIndicator
        steps={stepLabels}
        currentStep={displayStep}
        maxStepReached={maxStepReached}
        onStepClick={handleStepClick}
        isStepNavigable={isStepNavigable}
      />

      {pipeline.error && (
        <div
          style={{
            maxWidth: 640,
            margin: "0 auto 20px",
            padding: "12px 16px",
            background: T.redSoft,
            border: `1px solid ${T.red}`,
            borderRadius: 8,
            fontSize: 16,
            color: T.red,
          }}
        >
          <span
            style={{
              display: "inline-flex",
              verticalAlign: "middle",
              marginRight: 4,
            }}
          >
            <Icon.AlertTriangle size={14} color={T.red} />
          </span>{" "}
          {String(t.pipelineError ?? "Error")}: {pipeline.error}
        </div>
      )}

      {step === 1 && (
        <ErrorBoundary label="Upload step failed">
          <StepUpload
            taskPdf={taskPdf}
            setTaskPdf={(file) => {
              setTaskPdf(file);
              onMeta({ initialTaskFile: file });
            }}
            essayImage={essayImage}
            setEssayImage={(file) => {
              setEssayImage(file);
              onMeta({ initialEssayFile: file });
            }}
            answerKeyPdf={answerKeyPdf}
            setAnswerKeyPdf={(file) => {
              setAnswerKeyPdf(file);
              onMeta({ initialAnswerKeyFile: file });
            }}
            onSubmit={handleRun}
            canSubmit={canRun}
            t={t}
            subject={subject}
            detectedSubject={detectedSubject}
            subjectConfidence={subjectConfidence}
            subjectDetecting={subjectDetecting}
            subjectDetectError={subjectDetectError}
            manualSubject={manualSubject}
            onSubjectChange={(code) => {
              handleSubjectChange(code);
              onMeta({ initialSubject: code });
            }}
            onBatchEssayUpload={handleBatchEssayUpload}
          />
        </ErrorBoundary>
      )}

      {step === 2 && (
        <LoadingSpinner
          title={String(t.step2Title ?? "")}
          description={String(t.step2Desc ?? "")}
        />
      )}

      {/* Step 3 has two phases on ONE screen (the old Step-4 "Xong" was
          folded in here): before finalize → the editable StepReview
          (đối soát + per-câu scoring + the "Chốt điểm" commit). After
          finalize the SAME component locks in place: score inputs go
          read-only, the "AI đã học" banner appears, and the action bar
          swaps to Sửa lại / Đã lưu. Printing lives in the toolbar (gated
          on nothing — the teacher prints whenever), and "Sửa lại"
          releases the lock without any screen change. The old separate
          ResultCard "Xong" screen is gone. */}
      {step === 3 && (
        <ErrorBoundary label="Review step failed">
          <StepReview
            grade={grade}
            pipeline={pipeline}
            feedbackHook={feedbackHook}
            onApprove={handleApprove}
            onFinish={handleFinalizeFromReview}
            onUnlock={handleUnlockFinalize}
            onEdit={markGradeEdited}
            onSaveDraft={runDraftSave}
            backendSubject={subject}
            task={task}
            t={t}
            essayImage={essayImage}
            subjectLabel={subjectLabel === "—" ? "" : subjectLabel}
            teacherAnnotations={teacherAnnotations}
            setTeacherAnnotations={setTeacherAnnotations}
            finalScores={finalScores}
            setFinalScores={setFinalScores}
            finalizedResult={finalizedResult}
            isFinalizing={isFinalizing}
            finalizeError={finalizeError}
          />
        </ErrorBoundary>
      )}
    </div>
  );
}
