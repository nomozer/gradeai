import { T } from "../../../theme/tokens";
import type { ReviewPayload } from "../types";

// BanChamAiModal — escape hatch for the teacher to peek at AI's verdict
// without committing to step 4. Useful after they've finished blind
// annotation and want a sanity-check against their own scoring intuition.
export function BanChamAiModal({
  open,
  onClose,
  review,
  onGoToRegrade,
}: {
  open: boolean;
  onClose: () => void;
  review: ReviewPayload;
  onGoToRegrade?: () => void;
}) {
  if (!open) return null;
  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.55)",
        zIndex: 1000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
        animation: "fadeUp 0.2s ease-out",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(620px, 100%)",
          maxHeight: "85vh",
          background: T.paper,
          borderRadius: 12,
          boxShadow: "0 24px 60px rgba(0,0,0,0.35)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            padding: "16px 22px",
            borderBottom: `1px solid ${T.borderLight}`,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 8,
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
              Bản chấm AI · Lần {review.runNumber}
            </div>
            <div
              style={{
                fontFamily: T.font,
                fontSize: 17,
                fontWeight: 600,
                color: T.text,
              }}
            >
              AI chấm: {review.overallScore.toFixed(1)}
              <span style={{ color: T.textMute, fontWeight: 400 }}>
                {" "}
                / {review.overallMax.toFixed(1)}đ
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Đóng"
            title="Đóng"
            style={{
              width: 28,
              height: 28,
              borderRadius: "50%",
              border: `1px solid ${T.border}`,
              background: T.bgCard,
              color: T.textMute,
              cursor: "pointer",
              fontSize: 14,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            ×
          </button>
        </div>
        <div
          style={{
            padding: "14px 22px",
            overflowY: "auto",
            flex: 1,
            display: "flex",
            flexDirection: "column",
            gap: 12,
          }}
        >
          <div
            style={{
              fontSize: 12.5,
              color: T.textSoft,
              lineHeight: 1.55,
            }}
          >
            AI đề xuất các mức điểm dưới đây. Bạn vẫn là người quyết định
            cuối — vào bước "Chấm lại" để chốt điểm chính thức.
          </div>
          {review.questions.map((q) => {
            const lost = q.earned < q.max - 0.001;
            return (
              <div
                key={q.num}
                style={{
                  border: `1px solid ${T.borderLight}`,
                  borderRadius: 10,
                  padding: "10px 14px",
                  background: T.bgCard,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "baseline",
                    gap: 8,
                    marginBottom: 4,
                  }}
                >
                  <div
                    style={{
                      fontSize: 13,
                      fontWeight: 600,
                      color: T.text,
                    }}
                  >
                    Câu {q.num}
                  </div>
                  <div style={{ fontFamily: T.mono, fontSize: 13.5 }}>
                    <span
                      style={{
                        fontWeight: 700,
                        color: lost ? T.red : T.green,
                      }}
                    >
                      {q.earned.toFixed(1)}
                    </span>
                    <span style={{ color: T.textMute }}>
                      /{q.max.toFixed(1)}
                    </span>
                  </div>
                </div>
                {q.summary && (
                  <div
                    style={{
                      fontSize: 13,
                      color: T.textSoft,
                      lineHeight: 1.55,
                    }}
                  >
                    {q.summary}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <div
          style={{
            padding: "12px 22px",
            borderTop: `1px solid ${T.borderLight}`,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 8,
            flexWrap: "wrap",
          }}
        >
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: "8px 14px",
              fontSize: 13,
              color: T.textSoft,
              background: T.bgCard,
              border: `1px solid ${T.border}`,
              borderRadius: 8,
              cursor: "pointer",
              fontFamily: T.font,
            }}
          >
            Tiếp tục đối soát
          </button>
          {onGoToRegrade && (
            <button
              type="button"
              onClick={() => {
                onClose();
                onGoToRegrade();
              }}
              style={{
                padding: "8px 16px",
                fontSize: 13,
                fontWeight: 600,
                color: "#FFFDF8",
                background: T.accent,
                border: "none",
                borderRadius: 8,
                cursor: "pointer",
                fontFamily: T.font,
              }}
            >
              Đi tới chấm điểm →
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
