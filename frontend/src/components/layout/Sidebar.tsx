import { T } from "../../theme/tokens";
import { Icon } from "../ui/Icon";
import type { I18nStrings } from "../../types";

interface SidebarProps {
  t: I18nStrings;
  selectedSubject: string;
  onSubjectChange: (value: string) => void;
  selectedClass: string;
  onClassChange: (value: string) => void;
}

export function Sidebar({
  t,
  selectedSubject,
  onSubjectChange,
  selectedClass,
  onClassChange,
}: SidebarProps) {
  return (
    <aside
      style={{
        background: T.bgCard,
        borderRight: `1px solid ${T.border}`,
        padding: "28px 20px",
        display: "flex",
        flexDirection: "column",
        gap: 28,
        height: "100vh",
        position: "sticky",
        top: 0,
      }}
    >
      {/* Logo */}
      <div>
        <div
          style={{
            fontFamily: T.display,
            fontSize: 24,
            fontWeight: 500,
            color: T.text,
            letterSpacing: "-0.01em",
            lineHeight: 1,
          }}
        >
          {String(t.title)}
        </div>
        <div
          style={{
            fontFamily: T.display,
            fontStyle: "italic",
            fontSize: 14,
            color: T.textMute,
            marginTop: 4,
          }}
        >
          {String(t.subtitle)}
        </div>
      </div>

      {/* Subject select */}
      <div>
        <div
          style={{
            fontSize: 13,
            color: T.textMute,
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            marginBottom: 8,
          }}
        >
          Môn chấm
        </div>
        <div
          style={{
            position: "relative",
            // Pulse the dropdown border when no subject is selected so the
            // teacher's eye is drawn here from the waiting hero in the
            // main pane. Once a subject is picked this dies down.
            borderRadius: 6,
            animation: !selectedSubject
              ? "subjectPrompt 1.6s ease-in-out infinite"
              : "none",
          }}
        >
          <select
            value={selectedSubject}
            onChange={(e) => onSubjectChange(e.target.value)}
            style={{
              width: "100%",
              appearance: "none",
              padding: "10px 30px 10px 12px",
              background: T.bg,
              color: selectedSubject ? T.text : T.textFaint,
              fontSize: 15,
              border: `1px solid ${selectedSubject ? T.border : T.accent}`,
              borderRadius: 6,
              cursor: "pointer",
              outline: "none",
            }}
          >
            <option value="" disabled>
              — Chọn môn —
            </option>
            {["Môn Tin", "Môn Toán"].map((sub) => (
              <option key={sub} value={sub}>
                {sub}
              </option>
            ))}
          </select>
          <div
            style={{
              position: "absolute",
              right: 10,
              top: "50%",
              transform: "translateY(-50%)",
              pointerEvents: "none",
              color: T.textFaint,
            }}
          >
            <Icon.ArrowDown size={12} />
          </div>
        </div>
      </div>

      {/* Class select */}
      <div>
        <div
          style={{
            fontSize: 13,
            color: T.textMute,
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            marginBottom: 8,
          }}
        >
          Phân luồng lớp
        </div>
        <div style={{ position: "relative", borderRadius: 6 }}>
          <select
            value={selectedClass}
            onChange={(e) => onClassChange(e.target.value)}
            style={{
              width: "100%",
              appearance: "none",
              padding: "10px 30px 10px 12px",
              background: T.bg,
              color: T.text,
              fontSize: 15,
              border: `1px solid ${T.border}`,
              borderRadius: 6,
              cursor: "pointer",
              outline: "none",
            }}
          >
            {["Lớp 10", "Lớp 11", "Lớp 12"].map((cls) => (
              <option key={cls} value={cls}>
                {cls}
              </option>
            ))}
          </select>
          <div
            style={{
              position: "absolute",
              right: 10,
              top: "50%",
              transform: "translateY(-50%)",
              pointerEvents: "none",
              color: T.textFaint,
            }}
          >
            <Icon.ArrowDown size={12} />
          </div>
        </div>
      </div>
    </aside>
  );
}
