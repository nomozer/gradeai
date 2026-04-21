// useAgentPipeline.js — Hook điều khiển Grader→Reviewer (VLM) pipeline.
// Quản lý phase transitions và kết quả grading qua useReducer.

import { useReducer, useCallback, useEffect, useRef } from "react";

const API_BASE = "/api";
// Intentionally generous so the client does not need to mirror backend retry math.
const PIPELINE_TIMEOUT_MS = 10 * 60 * 1000;

// ── State & actions ─────────────────────────────────────────────────

const ACTIONS = {
  PIPELINE_START: "PIPELINE_START",
  PIPELINE_SUCCESS: "PIPELINE_SUCCESS",
  PIPELINE_ERROR: "PIPELINE_ERROR",
  RESET: "RESET",
};

const initialState = {
  phase: "idle", // idle | generating | reviewing | done
  code: null,
  critique: null,
  lessonsUsed: [],
  // runCount + previousLessonIds let the UI highlight NEW lessons appearing
  // on a rerun — the core visual cue of the HITL learning loop.
  runCount: 0,
  previousLessonIds: [],
  newLessonIds: [],
  runId: null,
  error: null,
};

function reducer(state, action) {
  switch (action.type) {
    case ACTIONS.PIPELINE_START:
      // Preserve previous lesson IDs & runCount across the start→success
      // transition so SUCCESS can compute the diff (new lessons = evidence
      // the AI learned from the last round of human feedback).
      return {
        ...state,
        phase: "generating",
        code: null,
        critique: null,
        lessonsUsed: [],
        newLessonIds: [],
        runId: null,
        error: null,
        previousLessonIds: state.lessonsUsed.map((l) => l.id),
      };

    case ACTIONS.PIPELINE_SUCCESS: {
      const lessons = action.payload.lessons_used || [];
      const prev = new Set(state.previousLessonIds);
      const newLessonIds = lessons
        .map((l) => l.id)
        .filter((id) => !prev.has(id));
      return {
        ...state,
        phase: "done",
        code: action.payload.code,
        critique: action.payload.critique,
        lessonsUsed: lessons,
        runCount: state.runCount + 1,
        newLessonIds,
        runId: action.payload.run_id,
        error: null,
      };
    }

    case ACTIONS.PIPELINE_ERROR:
      return { ...state, phase: "idle", error: action.payload };

    case ACTIONS.RESET:
      return { ...initialState };

    default:
      return state;
  }
}

// ── Hook ────────────────────────────────────────────────────────────

/**
 * Hook quản lý Grader→Reviewer (VLM) pipeline.
 *
 * @returns {{
 *   phase: 'idle'|'generating'|'reviewing'|'done',
 *   code: string|null,                               // Grader JSON output
 *   critique: {issues: Array, severity: string, suggestion: string}|null,
 *   lessonsUsed: Array,
 *   runId: number|null,
 *   error: string|null,
 *   generate: (task, lang, feedback, wrongCode, imageB64, taskPdfB64) => Promise<void>,
 *   reset: () => void
 * }}
 */
export function useAgentPipeline() {
  const [state, dispatch] = useReducer(reducer, initialState);
  const controllerRef = useRef(null);
  const timeoutRef = useRef(null);
  const requestIdRef = useRef(0);

  const clearInFlight = useCallback(() => {
    if (timeoutRef.current !== null) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    if (controllerRef.current) {
      controllerRef.current.abort();
      controllerRef.current = null;
    }
  }, []);

  const generate = useCallback(
    async (
      task,
      lang = "en",
      feedback = null,
      wrongCode = null,
      imageB64 = null,
      taskPdfB64 = null,
      subject = null,
    ) => {
      const requestId = requestIdRef.current + 1;
      requestIdRef.current = requestId;
      clearInFlight();
      dispatch({ type: ACTIONS.PIPELINE_START });

      const controller = new AbortController();
      controllerRef.current = controller;
      const timeoutId = setTimeout(
        () => controller.abort(),
        PIPELINE_TIMEOUT_MS,
      );
      timeoutRef.current = timeoutId;

      const releaseIfCurrent = () => {
        if (requestIdRef.current !== requestId) return;
        if (timeoutRef.current !== null) {
          clearTimeout(timeoutRef.current);
          timeoutRef.current = null;
        }
        if (controllerRef.current === controller) {
          controllerRef.current = null;
        }
      };

      try {
        const res = await fetch(`${API_BASE}/generate`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            task,
            lang,
            feedback,
            wrong_code: wrongCode,
            image_b64: imageB64,
            task_pdf_b64: taskPdfB64,
            subject,
          }),
          signal: controller.signal,
        });

        if (requestIdRef.current !== requestId) return;
        releaseIfCurrent();

        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.detail || `Server error ${res.status}`);
        }

        const data = await res.json();
        if (requestIdRef.current !== requestId) return;
        dispatch({ type: ACTIONS.PIPELINE_SUCCESS, payload: data });
      } catch (err) {
        if (requestIdRef.current !== requestId) return;
        releaseIfCurrent();
        const msg =
          err.name === "AbortError"
            ? "Request timed out (server took too long to respond)."
            : err.message;
        dispatch({ type: ACTIONS.PIPELINE_ERROR, payload: msg });
      }
    },
    [clearInFlight],
  );

  // Atomic HITL re-grade: saves teacher feedback as a lesson then re-runs
  // the pipeline in a single /api/regrade call.
  const regrade = useCallback(
    async ({
      task,
      lang = "en",
      action,
      comment,
      wrongCode = null,
      imageB64 = null,
      taskPdfB64 = null,
      runId = null,
      subject = null,
    }) => {
      const requestId = requestIdRef.current + 1;
      requestIdRef.current = requestId;
      clearInFlight();
      dispatch({ type: ACTIONS.PIPELINE_START });

      const controller = new AbortController();
      controllerRef.current = controller;
      const timeoutId = setTimeout(
        () => controller.abort(),
        PIPELINE_TIMEOUT_MS,
      );
      timeoutRef.current = timeoutId;

      const releaseIfCurrent = () => {
        if (requestIdRef.current !== requestId) return;
        if (timeoutRef.current !== null) {
          clearTimeout(timeoutRef.current);
          timeoutRef.current = null;
        }
        if (controllerRef.current === controller) {
          controllerRef.current = null;
        }
      };

      try {
        const res = await fetch(`${API_BASE}/regrade`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            task,
            lang,
            action,
            comment,
            wrong_code: wrongCode,
            image_b64: imageB64,
            task_pdf_b64: taskPdfB64,
            run_id: runId,
            subject,
          }),
          signal: controller.signal,
        });

        if (requestIdRef.current !== requestId) return;
        releaseIfCurrent();

        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.detail || `Server error ${res.status}`);
        }

        const data = await res.json();
        if (requestIdRef.current !== requestId) return;
        dispatch({ type: ACTIONS.PIPELINE_SUCCESS, payload: data });
      } catch (err) {
        if (requestIdRef.current !== requestId) return;
        releaseIfCurrent();
        const msg =
          err.name === "AbortError"
            ? "Request timed out (server took too long to respond)."
            : err.message;
        dispatch({ type: ACTIONS.PIPELINE_ERROR, payload: msg });
      }
    },
    [clearInFlight],
  );

  const reset = useCallback(() => {
    requestIdRef.current += 1;
    clearInFlight();
    dispatch({ type: ACTIONS.RESET });
  }, [clearInFlight]);

  useEffect(
    () => () => {
      requestIdRef.current += 1;
      clearInFlight();
    },
    [clearInFlight],
  );

  return { ...state, generate, regrade, reset };
}
