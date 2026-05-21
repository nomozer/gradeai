import React from "react";
import { T } from "../../../theme/tokens";
import { Icon } from "../../../components/ui/Icon";
import type { EssayFile, SelectionAnnotation } from "../../../types";
import type { RegradePayload, RegradeQuestion } from "../types";
import { ExpandAllToggle, ViewOriginalButton } from "./RegradeControls";
import { RegradeQuestionBlock } from "./RegradeQuestionBlock";

// PaperRegrade — the step-4 "paper" column. A title bar with the AI→teacher
// score comparison + bulk controls, then one RegradeQuestionBlock per câu.
// Pure prop-driven: all score state lives in the StepRegrade parent.
export function PaperRegrade({
  review,
  finalScores,
  setFinalScores,
  maxOverrides,
  setMaxOverrides,
  effectiveMax,
  teacherTotal,
  anyEdited,
  expandedQs,
  toggleExpanded,
  expandAll,
  collapseAll,
  allExpanded,
  essayImage,
  onViewOriginal,
  teacherAnnotations,
}: {
  review: RegradePayload;
  finalScores: Record<number, number>;
  setFinalScores: React.Dispatch<React.SetStateAction<Record<number, number>>>;
  maxOverrides: Record<number, number>;
  setMaxOverrides: React.Dispatch<React.SetStateAction<Record<number, number>>>;
  effectiveMax: (q: RegradeQuestion) => number | undefined;
  teacherTotal: number;
  anyEdited: boolean;
  expandedQs: Set<number>;
  toggleExpanded: (n: number) => void;
  expandAll: () => void;
  collapseAll: () => void;
  allExpanded: boolean;
  essayImage: EssayFile | null | undefined;
  onViewOriginal?: () => void;
  teacherAnnotations?: SelectionAnnotation[];
}) {
  // Exam-level cap check. When per-câu maxPoints isn't supplied by the đề
  // we let the input run free; this is where the safety net catches it.
  // Tiny tolerance avoids triggering on float noise (1.0 + 2.0 + 7.0 == 10
  // can wobble to 10.0000000004 in JS).
  const overCap = anyEdited && teacherTotal - review.maxTotal > 0.001;
  return (
    <div
      style={{
        background: T.paper,
        border: `1px solid ${T.border}`,
        borderRadius: 12,
        boxShadow: T.shadowSoft,
        overflow: "hidden",
        minWidth: 0,
      }}
    >
      {/* paper-head — "Chấm lại" eyebrow + subtitle on left, score
          comparison on right. Bg is elevated to read as a title bar. */}
      <div
        style={{
          padding: "14px 20px",
          background: T.bgElevated,
          borderBottom: `1px solid ${T.border}`,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 16,
          flexWrap: "wrap",
        }}
      >
        <div>
          <div
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: T.textFaint,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              marginBottom: 4,
            }}
          >
            Chấm lại
          </div>
          <div
            style={{
              fontFamily: T.font,
              fontSize: 18,
              fontWeight: 600,
              color: T.text,
              letterSpacing: "-0.005em",
            }}
          >
            Chốt điểm từng câu — đối chiếu với ghi chú của bạn ở bước trước
          </div>
        </div>
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 12,
            flexWrap: "wrap",
            justifyContent: "flex-end",
          }}
        >
          <div
            style={{
              fontSize: 12,
              fontFamily: T.mono,
              color: T.textMute,
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <span>điểm AI: {review.aiOverall.toFixed(1)}</span>
            <span style={{ color: T.textFaint }}>→</span>
            <span
              style={{
                color: overCap ? T.red : anyEdited ? T.text : T.textMute,
                fontWeight: 600,
              }}
            >
              bạn: {anyEdited ? teacherTotal.toFixed(1) : "—"}
              <span style={{ color: T.textFaint, fontWeight: 400 }}>
                {" "}
                / {review.maxTotal.toFixed(1)}
              </span>
            </span>
          </div>
          {overCap && (
            // Cap-overrun chip — only appears when teacher total exceeds
            // the exam cap. Uses red softfill (consistent with other
            // warning chips in the app) so it reads as a soft alert,
            // not a blocking error. Teacher can still proceed; this is
            // a heads-up not a gate.
            <span
              style={{
                padding: "3px 9px",
                background: T.redSoft,
                border: `1px solid ${T.red}`,
                color: T.red,
                fontFamily: T.font,
                fontSize: 11,
                fontWeight: 600,
                borderRadius: 999,
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
                lineHeight: 1.4,
              }}
              title={`Tổng điểm vượt mức tối đa ${review.maxTotal.toFixed(1)}đ — kiểm tra lại từng câu.`}
            >
              <Icon.AlertTriangle size={11} color={T.red} />
              Vượt {(teacherTotal - review.maxTotal).toFixed(2)}đ
            </span>
          )}
          {/* Expand/collapse-all — sized as a sibling pill of "Xem PDF gốc"
              so the header reads as a single controls cluster. Only one of
              the two states shows at a time; clicking flips the bulk state
              of expandedQs. With 3 câu this is mild convenience; with 10+
              câu (real đề kiểm tra) it's the difference between scrolling
              once and clicking ten times. */}
          <ExpandAllToggle
            allExpanded={allExpanded}
            onClick={allExpanded ? collapseAll : expandAll}
          />
          {/* "Xem PDF gốc" — lets the teacher pop open the raw student PDF
              to spot-check that AI's transcription matches the original
              before locking down a score change. Same affordance ships on
              Step 3 (Xem xét) for visual + functional consistency. */}
          <ViewOriginalButton
            onClick={onViewOriginal}
            disabled={!essayImage?.dataUrl}
          />
        </div>
      </div>

      {/* Per-câu blocks stack inside the same paper. Border-bottom between
          them keeps the document-flow feel — no individual cards. */}
      <div>
        {review.questions.map((q, i) => (
          <RegradeQuestionBlock
            key={q.num}
            q={q}
            expanded={expandedQs.has(q.num)}
            onToggleExpand={() => toggleExpanded(q.num)}
            isLast={i === review.questions.length - 1}
            myScore={finalScores[q.num] ?? q.aiScore}
            teacherNotes={
              (teacherAnnotations ?? []).filter((a) => a.cau === q.num)
            }
            // "Edited" = teacher set a value that's MATERIALLY different
            // from AI's. Just touching the input (e.g. clicking it then
            // tabbing away) used to flip this true with a 0.00 delta —
            // which then surfaced as a misleading "Đã sửa" pill / red
            // input border on a câu the teacher hadn't really changed.
            isEdited={
              finalScores[q.num] != null &&
              Math.abs(finalScores[q.num] - q.aiScore) > 0.001
            }
            // Effective max: đề-supplied when present, else teacher's
            // manual override (or undefined when neither is set yet).
            cap={effectiveMax(q)}
            // Whether teacher needs to fill in the cap themselves —
            // controls the editable max input in the câu header.
            capEditable={q.maxPoints == null}
            maxOverride={maxOverrides[q.num]}
            onMaxOverrideChange={(v) =>
              setMaxOverrides((prev) => {
                const next = { ...prev };
                if (v == null || Number.isNaN(v)) delete next[q.num];
                else next[q.num] = v;
                return next;
              })
            }
            onScoreChange={(s) =>
              setFinalScores((prev) => ({ ...prev, [q.num]: s }))
            }
          />
        ))}
      </div>
    </div>
  );
}
