import { T } from "../../theme/tokens";
import { Icon } from "../primitives/Icon";

export function Sidebar({
  t,
  selectedSubject,
  onSubjectChange,
  selectedClass,
  onClassChange,
}) {
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
            fontFamily: T.display, fontSize: 24, fontWeight: 500,
            color: T.text, letterSpacing: "-0.01em", lineHeight: 1,
          }}
        >
          {t.title}
        </div>
        <div
          style={{
            fontFamily: T.display, fontStyle: "italic",
            fontSize: 14, color: T.textMute, marginTop: 4,
          }}
        >
          {t.subtitle}
        </div>
      </div>

      {/* Subject select */}
      <div>
        <div
          style={{
            fontSize: 13, color: T.textMute, textTransform: "uppercase",
            letterSpacing: "0.08em", marginBottom: 8,
          }}
        >
          Môn chấm
        </div>
        <div style={{ position: "relative" }}>
          <select
            value={selectedSubject}
            onChange={(e) => onSubjectChange(e.target.value)}
            style={{
              width: "100%", appearance: "none",
              padding: "10px 30px 10px 12px", background: T.bg,
              color: T.text, fontSize: 15,
              border: `1px solid ${T.border}`, cursor: "pointer", outline: "none",
            }}
          >
            {["Môn Tin"].map((sub) => (
              <option key={sub} value={sub}>{sub}</option>
            ))}
          </select>
          <div
            style={{
              position: "absolute", right: 10, top: "50%",
              transform: "translateY(-50%)", pointerEvents: "none", color: T.textFaint,
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
            fontSize: 13, color: T.textMute, textTransform: "uppercase",
            letterSpacing: "0.08em", marginBottom: 8,
          }}
        >
          Phân luồng lớp
        </div>
        <div style={{ position: "relative" }}>
          <select
            value={selectedClass}
            onChange={(e) => onClassChange(e.target.value)}
            style={{
              width: "100%", appearance: "none",
              padding: "10px 30px 10px 12px", background: T.bg,
              color: T.text, fontSize: 15,
              border: `1px solid ${T.border}`, cursor: "pointer", outline: "none",
            }}
          >
            {["Lớp 10", "Lớp 11", "Lớp 12"].map((cls) => (
              <option key={cls} value={cls}>{cls}</option>
            ))}
          </select>
          <div
            style={{
              position: "absolute", right: 10, top: "50%",
              transform: "translateY(-50%)", pointerEvents: "none", color: T.textFaint,
            }}
          >
            <Icon.ArrowDown size={12} />
          </div>
        </div>
      </div>
    </aside>
  );
}
