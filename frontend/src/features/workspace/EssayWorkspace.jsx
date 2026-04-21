import { useCallback, useEffect, useMemo, useState } from "react";
import { useAgentPipeline } from "../../hooks/useAgentPipeline";
import { useFeedback } from "../../hooks/useFeedback";
import { T } from "../../theme/tokens";
import { i18n } from "../../i18n";
import { Icon } from "../../components/primitives/Icon";
import { parseGrade } from "../../lib/grade";
import { LoadingSpinner } from "../../components/primitives/LoadingSpinner";
import { StepIndicator } from "../../components/layout/StepIndicator";
import { ResultCard } from "../../components/grade/ResultCard";
import { ErrorBoundary } from "../../components/primitives/ErrorBoundary";
import { StepUpload } from "../upload/StepUpload";
import { StepReview } from "../review/StepReview";
import {
  buildTaskContext,
  deriveDisplayStep,
  nextStepOnPhaseChange,
  stepAfterGrade,
  subjectCodeFromSelection,
  taskFromPdfName,
} from "./workspace.logic";

export function EssayWorkspace({
  active,
  lang,
  selectedSubject,
  selectedClass,
  onMeta,
}) {
  const t = i18n[lang];
  const pipeline = useAgentPipeline();
  const feedbackHook = useFeedback();

  const [taskPdf, setTaskPdf] = useState(null);
  const [essayImage, setEssayImage] = useState(null);
  const [grade, setGrade] = useState(null);
  const [step, setStep] = useState(1);
  // Finalized score lives here (not inside ResultCard) so it survives tab switches.
  // Reset whenever a new AI grade arrives — regrade invalidates the previous finalization.
  const [finalizedResult, setFinalizedResult] = useState(null);
  const [isFinalizing, setIsFinalizing] = useState(false);
  const [finalizeError, setFinalizeError] = useState(null);

  const taskLabel = useMemo(() => taskFromPdfName(taskPdf?.name), [taskPdf]);
  const task = useMemo(
    () => buildTaskContext(taskPdf?.name, selectedSubject, selectedClass),
    [taskPdf, selectedSubject, selectedClass],
  );
  const subject = useMemo(
    () => subjectCodeFromSelection(selectedSubject),
    [selectedSubject],
  );

  // Parse grade when pipeline returns
  useEffect(() => {
    const g = parseGrade(pipeline.code);
    if (g) {
      setGrade(g);
      setFinalizedResult(null);
      setIsFinalizing(false);
      setFinalizeError(null);
      setStep((s) => stepAfterGrade(s));
    }
  }, [pipeline.code]);

  // Handle pipeline phase changes
  useEffect(() => {
    setStep((s) => nextStepOnPhaseChange(s, pipeline.phase, pipeline.error));
  }, [pipeline.phase, pipeline.error]);

  // Report tab metadata
  const label = useMemo(() => taskLabel.slice(0, 30), [taskLabel]);

  useEffect(() => {
    onMeta({ label, phase: pipeline.phase, step, hasGrade: step === 5 });
  }, [label, pipeline.phase, step]);

  const canRun = !!taskPdf && !!essayImage && pipeline.phase !== "generating";

  const handleRun = useCallback(() => {
    feedbackHook.reset();
    setIsFinalizing(false);
    setFinalizeError(null);
    pipeline.generate(
      task, lang, null, null,
      essayImage?.dataUrl || null,
      taskPdf?.dataUrl || null,
      subject,
    );
  }, [task, lang, essayImage, taskPdf, pipeline, feedbackHook, subject]);



  const handleApprove = useCallback(() => setStep(5), []);

  // Persist the finalized grade and capture AI↔teacher score delta as a
  // HITL lesson. The UI only locks after the backend confirms persistence.
  const persistFinalizedGrade = useCallback(
    async (payload) => {
      const toNum = (v) => {
        const n = parseFloat(v);
        return Number.isFinite(n) ? n : null;
      };
      const teacherScores = {};
      const aiScores = {};
      for (const key of ["content", "argument", "expression", "creativity"]) {
        const te = toNum(payload?.scores?.[key]);
        const ai = toNum(grade?.scores?.[key]);
        if (te !== null) teacherScores[key] = te;
        if (ai !== null) aiScores[key] = ai;
      }
      const teacherOverall = toNum(payload?.overall);
      const aiOverall = toNum(grade?.overall);
      const finalGrade = {
        ...(grade || {}),
        scores: { ...(grade?.scores || {}), ...teacherScores },
        overall: teacherOverall ?? grade?.overall ?? null,
      };
      try {
        const res = await fetch("/api/finalize-grade", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            task,
            lang,
            ai_overall: aiOverall,
            teacher_overall: teacherOverall,
            ai_scores: aiScores,
            teacher_scores: teacherScores,
            approved_grade_json: JSON.stringify(finalGrade),
            run_id: pipeline.runId,
            subject,
          }),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(
            body.detail ||
              t.finalizeSaveError ||
              "Could not save the finalized grade. Please try again.",
          );
        }
        return await res.json().catch(() => ({}));
      } catch (err) {
        console.warn("[HITL] finalize-grade persist failed:", err);
        throw err;
      }
    },
    [grade, task, lang, pipeline.runId, subject, t],
  );

  const displayStep = deriveDisplayStep(step);

  const stepLabels = [
    t.stepUpload, t.stepReading, t.stepReview, t.stepRegrade, t.stepDone,
  ];

  if (!active) return null;

  return (
    <div style={{ padding: "0 32px 40px" }}>
      <StepIndicator steps={stepLabels} currentStep={displayStep} />



      {/* Error banner */}
      {pipeline.error && (
        <div
          style={{
            maxWidth: 640, margin: "0 auto 20px", padding: "12px 16px",
            background: T.redSoft, border: `1px solid ${T.red}`,
            borderRadius: 8, fontSize: 15, color: T.red,
            animation: "fadeUp 0.3s ease-out",
          }}
        >
          <span style={{ display: "inline-flex", verticalAlign: "middle", marginRight: 4 }}>
            <Icon.AlertTriangle size={14} color={T.red} />
          </span>{" "}
          {t.pipelineError}: {pipeline.error}
        </div>
      )}

      {/* Step content */}
      {step === 1 && (
        <ErrorBoundary label="Upload step failed">
          <StepUpload
            taskPdf={taskPdf} setTaskPdf={setTaskPdf}
            essayImage={essayImage} setEssayImage={setEssayImage}
            onSubmit={handleRun} canSubmit={canRun}
            lang={lang} t={t}
          />
        </ErrorBoundary>
      )}

      {step === 2 && <LoadingSpinner title={t.step2Title} description={t.step2Desc} />}

      {step === 3 && (
        <ErrorBoundary label="Review step failed">
          <StepReview
            grade={grade} pipeline={pipeline} feedbackHook={feedbackHook}
            onApprove={handleApprove}
            task={task} t={t}
            essayImage={essayImage}
          />
        </ErrorBoundary>
      )}

      {step === 4 && <LoadingSpinner title={t.step4Title} description={t.step4Desc} />}

      {step === 5 && (
        <ErrorBoundary label="Result card failed">
          <ResultCard
            grade={grade}
            t={t}
            finalized={finalizedResult}
            isFinalizing={isFinalizing}
            finalizeError={finalizeError}
            onFinalize={async (payload) => {
              if (isFinalizing) return;
              setIsFinalizing(true);
              setFinalizeError(null);
              try {
                await persistFinalizedGrade(payload);
                setFinalizedResult({
                  ...payload,
                  finalizedAt: new Date().toISOString(),
                });
              } catch (err) {
                setFinalizeError(
                  err?.message ||
                    t.finalizeSaveError ||
                    "Không thể lưu điểm cuối cùng. Vui lòng thử lại.",
                );
              } finally {
                setIsFinalizing(false);
              }
            }}
            onEdit={() => {
              setFinalizedResult(null);
              setFinalizeError(null);
            }}
          />
        </ErrorBoundary>
      )}
    </div>
  );
}
