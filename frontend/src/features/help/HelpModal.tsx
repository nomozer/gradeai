import { useEffect } from "react";
import { Icon } from "../../components/ui/Icon";
import { T } from "../../theme/tokens";

interface HelpModalProps {
  onClose: () => void;
}

interface Step {
  title: string;
  body: string;
}

const STEPS: Step[] = [
  {
    title: "Chọn môn ở thanh bên",
    body:
      "Toán, Tin hoặc Vật lý — AI dùng prompt + bộ nhớ riêng cho mỗi môn nên cần chọn đúng để chấm chính xác.",
  },
  {
    title: "Tải đề bài và bài làm",
    body:
      "Đề bài: PDF. Bài làm học sinh: ảnh chụp (JPG/PNG) hoặc PDF nhiều trang. AI đọc trực tiếp từ ảnh, không cần OCR thủ công.",
  },
  {
    title: "Đợi AI chấm — vài giây",
    body:
      "AI sinh transcript, chấm 4 tiêu chí (nội dung · phương pháp · trình bày · hiểu bản chất) và nhận xét theo từng câu.",
  },
  {
    title: "Xem xét và phản hồi",
    body:
      "Đồng ý → Duyệt. Sai vài chỗ → góp ý từng câu rồi Yêu cầu sửa. Sai nặng → Từ chối kèm lý do. Mỗi phản hồi đều thành bài học cho lần chấm sau.",
  },
  {
    title: "Bộ nhớ HITL học theo bạn",
    body:
      "Sau khi duyệt/sửa/từ chối, mở 'Bộ nhớ HITL' ở thanh trên để xem AI đã học gì, ưu tiên ra sao, và xoá những bài học không còn đúng.",
  },
];

export function HelpModal({ onClose }: HelpModalProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <>
      <div
        onClick={onClose}
        aria-hidden="true"
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(20, 22, 32, 0.42)",
          zIndex: 220,
          animation: "backdropFadeIn 0.2s ease-out",
        }}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="help-modal-title"
        style={{
          position: "fixed",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          width: "min(640px, calc(100vw - 32px))",
          maxHeight: "calc(100vh - 64px)",
          background: T.bgCard,
          border: `1px solid ${T.border}`,
          borderRadius: 12,
          boxShadow: T.shadowStrong,
          zIndex: 230,
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
          animation: "fadeUp 0.25s ease-out",
        }}
      >
        <header
          style={{
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            padding: "20px 24px 12px",
            borderBottom: `1px solid ${T.border}`,
          }}
        >
          <div>
            <h2
              id="help-modal-title"
              style={{
                fontFamily: T.display,
                fontSize: 24,
                fontWeight: 600,
                color: T.text,
                margin: 0,
                letterSpacing: "-0.015em",
              }}
            >
              Hướng dẫn sử dụng MIRROR
            </h2>
            <p
              style={{
                fontFamily: T.display,
                fontStyle: "italic",
                fontSize: 15,
                color: T.textMute,
                margin: "5px 0 0",
              }}
            >
              Bàn chấm tự luận đa phương thức · Có giáo viên trong vòng lặp
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Đóng"
            title="Đóng (Esc)"
            style={{
              background: "transparent",
              border: "none",
              color: T.textMute,
              padding: 4,
              cursor: "pointer",
              borderRadius: 6,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              transition: "color 0.15s, background 0.15s",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = T.text;
              e.currentTarget.style.background = T.bgHover;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = T.textMute;
              e.currentTarget.style.background = "transparent";
            }}
          >
            <Icon.X size={18} />
          </button>
        </header>

        <ol
          style={{
            margin: 0,
            padding: "8px 24px 24px",
            listStyle: "none",
            overflowY: "auto",
            display: "flex",
            flexDirection: "column",
            gap: 14,
          }}
        >
          {STEPS.map((step, i) => (
            <li
              key={i}
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: 14,
                padding: "12px 0",
                borderBottom: i < STEPS.length - 1 ? `1px dashed ${T.borderLight}` : "none",
              }}
            >
              <span
                style={{
                  flexShrink: 0,
                  width: 32,
                  height: 32,
                  borderRadius: "50%",
                  background: T.accentSoft,
                  color: T.accent,
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontFamily: T.display,
                  fontWeight: 600,
                  fontSize: 15,
                }}
              >
                {i + 1}
              </span>
              <div style={{ minWidth: 0 }}>
                <div
                  style={{
                    fontFamily: T.display,
                    fontSize: 17,
                    fontWeight: 600,
                    color: T.text,
                    marginBottom: 5,
                    letterSpacing: "-0.005em",
                  }}
                >
                  {step.title}
                </div>
                <div
                  style={{
                    fontSize: 15,
                    color: T.textSoft,
                    lineHeight: 1.65,
                  }}
                >
                  {step.body}
                </div>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </>
  );
}
