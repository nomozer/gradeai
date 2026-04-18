// useFeedback.js — Hook for the HITL teacher-feedback loop.
// POSTs structured feedback (approve/revise/reject + comment) to /api/feedback
// so the backend persists the teacher's correction as a grading lesson. The
// returned lesson_id lets the UI show "✅ New lesson added" before kicking off
// a re-grade via /api/generate.

import { useState, useCallback, useEffect, useRef } from "react";

const API_BASE = "/api";
const FEEDBACK_TIMEOUT_MS = 30000;

export function useFeedback() {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [lastAction, setLastAction] = useState(null); // approve | revise | reject
  const [lastLessonId, setLastLessonId] = useState(null);
  const [error, setError] = useState(null);
  const controllerRef = useRef(null);
  const timeoutRef = useRef(null);
  const submitIdRef = useRef(0);

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

  const submit = useCallback(
    async ({ action, comment, task, wrongCode, runId, stagedLessons = [] }) => {
      const submitId = submitIdRef.current + 1;
      submitIdRef.current = submitId;
      clearInFlight();
      setIsSubmitting(true);
      setError(null);
      setLastAction(null);
      setLastLessonId(null);
      const controller = new AbortController();
      controllerRef.current = controller;
      const timeoutId = setTimeout(() => controller.abort(), FEEDBACK_TIMEOUT_MS);
      timeoutRef.current = timeoutId;

      const releaseIfCurrent = () => {
        if (submitIdRef.current !== submitId) return;
        if (timeoutRef.current !== null) {
          clearTimeout(timeoutRef.current);
          timeoutRef.current = null;
        }
        if (controllerRef.current === controller) {
          controllerRef.current = null;
        }
      };

      try {
        const res = await fetch(`${API_BASE}/feedback`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action,
            comment,
            task,
            wrong_code: wrongCode,
            run_id: runId,
            staged_lessons: stagedLessons,
          }),
          signal: controller.signal,
        });
        if (submitIdRef.current !== submitId) return null;
        releaseIfCurrent();

        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.detail || `Server error ${res.status}`);
        }

        const data = await res.json();
        if (submitIdRef.current !== submitId) return null;
        setLastAction(data.action);
        setLastLessonId(data.lesson_id);
        return data;
      } catch (err) {
        if (submitIdRef.current !== submitId) return null;
        releaseIfCurrent();
        const msg = err.name === "AbortError"
          ? "Feedback request timed out. Please try again."
          : err.message;
        setError(msg);
        return null;
      } finally {
        if (submitIdRef.current === submitId) {
          setIsSubmitting(false);
        }
      }
    },
    [clearInFlight]
  );

  const reset = useCallback(() => {
    submitIdRef.current += 1;
    clearInFlight();
    setIsSubmitting(false);
    setLastAction(null);
    setLastLessonId(null);
    setError(null);
  }, [clearInFlight]);

  useEffect(() => () => {
    submitIdRef.current += 1;
    clearInFlight();
  }, [clearInFlight]);

  return { isSubmitting, lastAction, lastLessonId, error, submit, reset };
}
