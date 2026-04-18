import { useState } from "react";
import { T } from "../../theme/tokens";
import { Icon } from "../primitives/Icon";
import { scoreColor } from "../../features/review/StepReview.logic";

// ---------------------------------------------------------------------------
// Editable Score Row — teacher can adjust each rubric dimension
// ---------------------------------------------------------------------------
function EditableScore({ label, value, onChange, icon: IconComp }) {
  const c = scoreColor(value, T);
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        padding: "14px 18px",
        background: T.bgCard,
        borderRadius: 12,
        border: `1px solid ${T.border}`,
        transition: "box-shadow 0.2s",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        {IconComp && <IconComp size={16} color={T.textFaint} />}
        <span style={{ fontSize: 15, color: T.textSoft, fontWeight: 500 }}>
          {label}
        </span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
        <input
          type="number"
          min={0}
          max={10}
          step={0.5}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          style={{
            width: 52,
            padding: "4px 6px",
            fontSize: 20,
            fontWeight: 700,
            color: c,
            textAlign: "center",
            border: `1.5px solid ${T.border}`,
            borderRadius: 8,
            background: T.bgInput,
            outline: "none",
            fontFamily: T.mono,
            transition: "border-color 0.2s",
          }}
          onFocus={(e) => (e.target.style.borderColor = T.accent)}
          onBlur={(e) => (e.target.style.borderColor = T.border)}
        />
        <span
          style={{
            fontSize: 13,
            fontWeight: 400,
            color: T.textFaint,
            marginLeft: 2,
          }}
        >
          / 10
        </span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ResultCard — Final step: teacher reviews AI scores and finalizes them.
// ---------------------------------------------------------------------------
export function ResultCard({ grade, t, finalized, onFinalize, onEdit }) {
  const locked = !!finalized;
  // Local editable state initialized from AI-generated scores
  const [scores, setScores] = useState(() => ({
    content: grade?.scores?.content ?? "",
    argument: grade?.scores?.argument ?? "",
    expression: grade?.scores?.expression ?? "",
    creativity: grade?.scores?.creativity ?? "",
  }));
  const [overall, setOverall] = useState(() => grade?.overall ?? "");

  if (!grade) {
    return (
      <div
        style={{
          padding: 40,
          textAlign: "center",
          color: T.textFaint,
          fontSize: 17,
        }}
      >
        {t.noResult}
      </div>
    );
  }

  const handleScoreChange = (key, val) => {
    setScores((prev) => ({ ...prev, [key]: val }));
  };

  const handleFinalize = () => {
    if (onFinalize) {
      onFinalize({ scores, overall });
    }
  };

  // "Sửa lại" — hydrate editable fields from finalized values so teacher
  // can tweak from there rather than start over from the raw AI scores.
  const handleEdit = () => {
    if (finalized) {
      setScores(finalized.scores);
      setOverall(finalized.overall);
    }
    if (onEdit) onEdit();
  };

  // Displayed values: lock → use finalized snapshot; unlock → use local state.
  const displayOverall = locked ? finalized.overall : overall;

  const subject = grade.subject || "literature";
  const subjLabels =
    t.rubricBySubject?.[subject] || t.rubricBySubject?.literature || {};
  const rubrics = [
    {
      key: "content",
      label: subjLabels.content || t.rubricContent,
      icon: Icon.FileText,
    },
    {
      key: "argument",
      label: subjLabels.argument || t.rubricArgument,
      icon: Icon.MessageCircle,
    },
    {
      key: "expression",
      label: subjLabels.expression || t.rubricExpression,
      icon: Icon.PenTool,
    },
    {
      key: "creativity",
      label: subjLabels.creativity || t.rubricCreativity,
      icon: Icon.Award,
    },
  ];

  const overallColor = scoreColor(displayOverall, T);

  const formatFinalizedAt = (iso) => {
    if (!iso) return "";
    const d = new Date(iso);
    const pad = (n) => String(n).padStart(2, "0");
    return `${pad(d.getHours())}:${pad(d.getMinutes())} · ${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
  };

  return (
    <div
      style={{
        maxWidth: 720,
        margin: "0 auto",
        animation: "fadeUp 0.4s ease-out",
      }}
    >
      {/* Status badge */}
      <div style={{ textAlign: "center", marginBottom: 20 }}>
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            fontSize: 13,
            fontFamily: T.mono,
            color: locked ? T.green : T.amber,
            padding: "6px 16px",
            background: locked ? T.greenSoft : T.amberSoft,
            borderRadius: 20,
            border: `1px solid ${locked ? T.green : T.amber}`,
          }}
        >
          {locked ? (
            <>
              <Icon.Check size={13} color={T.green} />
              {t.done || "Đã hoàn thành"}
            </>
          ) : (
            <>
              <Icon.Edit size={13} color={T.amber} />
              {t.finalizeScores || "Chốt điểm cuối cùng"}
            </>
          )}
        </span>
      </div>

      {/* Instruction text */}
      {!locked && (
        <div
          style={{
            textAlign: "center",
            fontSize: 14,
            color: T.textMute,
            marginBottom: 20,
            lineHeight: 1.6,
          }}
        >
          {t.finalizeInstruction ||
            'Vui lòng kiểm tra và chỉnh sửa điểm bên dưới. Nhấn "Xác nhận điểm" để hoàn tất.'}
        </div>
      )}

      {/* Overall Score — large editable */}
      <div
        style={{
          textAlign: "center",
          padding: "36px 24px",
          marginBottom: 24,
          background: T.bgCard,
          border: `1px solid ${T.border}`,
          borderRadius: 12,
        }}
      >
        <div
          style={{
            fontSize: 13,
            color: T.textMute,
            textTransform: "uppercase",
            letterSpacing: "0.12em",
            marginBottom: 10,
          }}
        >
          {t.overallScore || "Tổng điểm"}
        </div>
        {locked ? (
          <>
            <div
              style={{
                display: "inline-flex",
                alignItems: "baseline",
                justifyContent: "center",
                gap: 14,
                fontFamily: T.display,
                fontWeight: 600,
                fontSize: 88,
                lineHeight: 1,
                color: overallColor,
                letterSpacing: "-0.02em",
                fontVariantNumeric: "tabular-nums",
              }}
            >
              <span>{displayOverall || "\u2014"}</span>
              <span
                style={{
                  fontSize: 26,
                  fontWeight: 500,
                  color: T.textFaint,
                  marginLeft: -4,
                }}
              >
                {t.outOf || "/ 10"}
              </span>
            </div>
            <div
              style={{
                marginTop: 16,
                display: "flex",
                justifyContent: "center",
                alignItems: "center",
                gap: 14,
                fontSize: 12,
                fontFamily: T.mono,
                color: T.textFaint,
              }}
            >
              <span>
                {(t.finalizedAt || "Đã chốt lúc") + " "}
                {formatFinalizedAt(finalized.finalizedAt)}
              </span>
              <button
                onClick={handleEdit}
                style={{
                  padding: "4px 12px",
                  fontSize: 12,
                  color: T.textSoft,
                  background: "transparent",
                  border: `1px solid ${T.border}`,
                  borderRadius: 6,
                  cursor: "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 4,
                  transition: "all 0.15s",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = T.accent;
                  e.currentTarget.style.color = T.accent;
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = T.border;
                  e.currentTarget.style.color = T.textSoft;
                }}
              >
                <Icon.Edit size={11} />
                {t.editAgain || "Sửa lại"}
              </button>
            </div>
          </>
        ) : (
          <div style={{ display: "flex", justifyContent: "center", alignItems: "baseline", gap: 8 }}>
            <input
              type="number"
              min={0}
              max={10}
              step={0.5}
              value={overall}
              onChange={(e) => setOverall(e.target.value)}
              style={{
                width: 130,
                padding: "8px 14px",
                fontSize: 56,
                fontWeight: 700,
                color: overallColor,
                textAlign: "center",
                border: `2px solid ${T.border}`,
                borderRadius: 12,
                background: T.bgInput,
                outline: "none",
                fontFamily: T.mono,
                fontVariantNumeric: "tabular-nums",
                transition: "border-color 0.2s",
              }}
              onFocus={(e) => (e.target.style.borderColor = T.accent)}
              onBlur={(e) => (e.target.style.borderColor = T.border)}
            />
            <span style={{ fontSize: 20, color: T.textFaint }}>
              {t.outOf || "/ 10"}
            </span>
          </div>
        )}
      </div>




      {/* Per-question AI feedback */}
      {grade.per_question_feedback && grade.per_question_feedback.length > 0 ? (
        <div style={{ marginBottom: 24 }}>
          <div
            style={{
              fontSize: 14,
              fontWeight: 700,
              color: T.textMute,
              textTransform: "uppercase",
              letterSpacing: "0.1em",
              marginBottom: 12,
              display: "flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <Icon.MessageCircle size={14} color={T.textMute} />
            {t.perQuestionFeedback || "Nhận xét từng câu"}
          </div>

          {grade.per_question_feedback.map((fb, i) => (
            <div
              key={i}
              style={{
                background: T.bgCard,
                borderRadius: 12,
                border: `1px solid ${T.border}`,
                padding: "16px 20px",
                marginBottom: 10,
                boxShadow: T.shadowSoft,
              }}
            >
              {/* Question label */}
              <div
                style={{
                  fontSize: 14,
                  fontWeight: 700,
                  color: T.accent,
                  marginBottom: 10,
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                <span
                  style={{
                    width: 24,
                    height: 24,
                    borderRadius: "50%",
                    background: T.accentSoft,
                    border: `1.5px solid ${T.accent}`,
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 12,
                    fontFamily: T.mono,
                    fontWeight: 700,
                  }}
                >
                  {i + 1}
                </span>
                {fb.question || `Câu ${i + 1}`}
              </div>


              {/* Good points — shown first */}
              {fb.good_points && (
                <div
                  style={{
                    padding: "8px 12px",
                    background: T.greenSoft,
                    borderLeft: `3px solid ${T.green}`,
                    borderRadius: "0 8px 8px 0",
                    marginBottom: 8,
                    fontSize: 14,
                    color: T.textSoft,
                    lineHeight: 1.6,
                  }}
                >
                  <span style={{ fontWeight: 700, color: T.green, fontSize: 12, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                    <Icon.Check size={11} color={T.green} style={{ marginRight: 4, verticalAlign: "middle" }} />
                    {t.goodPoints || "Phần làm tốt"}
                  </span>
                  <div style={{ marginTop: 4 }}>{fb.good_points}</div>
                </div>
              )}

              {/* Areas to improve — shown after */}
              {fb.errors && (
                <div
                  style={{
                    padding: "8px 12px",
                    background: T.amberSoft,
                    borderLeft: `3px solid ${T.amber}`,
                    borderRadius: "0 8px 8px 0",
                    fontSize: 14,
                    color: T.textSoft,
                    lineHeight: 1.6,
                  }}
                >
                  <span style={{ fontWeight: 700, color: T.amber, fontSize: 12, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                    <Icon.Edit size={11} color={T.amber} style={{ marginRight: 4, verticalAlign: "middle" }} />
                    {t.errors || "Cần cải thiện"}
                  </span>
                  <div style={{ marginTop: 4 }}>{fb.errors}</div>
                </div>
              )}
            </div>
          ))}
        </div>
      ) : grade.comment ? (
        <div
          style={{
            background: T.bgCard,
            borderRadius: 12,
            border: `1px solid ${T.border}`,
            padding: 20,
            marginBottom: 24,
          }}
        >
          <div
            style={{
              fontSize: 14,
              fontWeight: 600,
              color: T.textMute,
              textTransform: "uppercase",
              letterSpacing: "0.1em",
              marginBottom: 10,
            }}
          >
            {t.comment || "Nhận xét chung"}
          </div>
          <div
            style={{
              fontSize: 17,
              color: T.textSoft,
              lineHeight: 1.7,
              whiteSpace: "pre-wrap",
            }}
          >
            {grade.comment}
          </div>
        </div>
      ) : null}

      {/* Finalize button */}
      {!locked && (
        <div style={{ textAlign: "center" }}>
          <button
            onClick={handleFinalize}
            style={{
              padding: "14px 56px",
              fontSize: 16,
              color: "#fff",
              background: T.green,
              border: "none",
              borderRadius: 10,
              cursor: "pointer",
              transition: "all 0.2s",
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              fontWeight: 600,
              boxShadow: T.shadowSoft,
            }}
            onMouseEnter={(e) => (e.target.style.transform = "translateY(-1px)")}
            onMouseLeave={(e) => (e.target.style.transform = "translateY(0)")}
          >
            <Icon.Check size={16} color="#fff" />
            {t.confirmScores || "Xác nhận điểm"}
          </button>
        </div>
      )}
    </div>
  );
}
