import { useState } from "react";
import { useHeartbeat } from "../../hooks/useHeartbeat";
import { MirrorLogo } from "../../components/ui/MirrorLogo";
import { T } from "../../theme/tokens";
import type { ClassRoom } from "../../api";
import { ClassList } from "./ClassList";
import { ClassDetail } from "./ClassDetail";

/**
 * Class (lớp) management page — opened in its own browser tab via the header
 * account-menu (#class), same idiom as the Memory page. Heartbeats so the
 * backend doesn't shut down while this tab is the only one open.
 *
 * Two views, gated by ``selected``: the class list, or one class's roster.
 * Grading + gradebook export hang off here in a later stage; for now this is
 * roster setup only.
 */
export function ClassPage() {
  useHeartbeat();
  const [selected, setSelected] = useState<ClassRoom | null>(null);

  return (
    <div style={{ minHeight: "100vh", background: T.bg }}>
      <header
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "12px clamp(16px, 4vw, 32px)",
          borderBottom: `1px solid ${T.border}`,
          background: T.bg,
          position: "sticky",
          top: 0,
          zIndex: 40,
        }}
      >
        <MirrorLogo size={26} style={{ transform: "translateY(-6%)" }} />
        <span
          style={{
            fontFamily: T.brand,
            fontSize: 26,
            fontWeight: 700,
            color: T.accentDark,
            letterSpacing: -0.3,
            lineHeight: 1,
          }}
        >
          Mirror
        </span>
        <span style={{ color: T.textFaint, margin: "0 4px" }}>·</span>
        <span style={{ fontFamily: T.font, fontSize: T.fontSize.sm, color: T.textMute, fontWeight: 600 }}>
          Lớp học
        </span>
      </header>

      {selected ? (
        <ClassDetail cls={selected} onBack={() => setSelected(null)} />
      ) : (
        <ClassList onOpen={setSelected} />
      )}
    </div>
  );
}
