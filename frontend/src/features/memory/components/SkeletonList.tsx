import { T } from "../../../theme/tokens";

// Placeholder rows shown while the lesson list is loading for the first
// time (no cached snapshot to render).
export function SkeletonList() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: T.space[2] }}>
      {[0, 1, 2, 3, 4].map((i) => (
        <div
          key={i}
          style={{
            height: 48,
            background: T.bgCard,
            border: `1px solid ${T.borderLight}`,
            borderRadius: 4,
            opacity: 0.5,
            animation: `pulse 1.4s ease-in-out ${i * 0.1}s infinite`,
          }}
        />
      ))}
    </div>
  );
}
