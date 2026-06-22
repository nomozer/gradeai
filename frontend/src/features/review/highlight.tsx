import { T } from "../../theme/tokens";
import { formatLine } from "../../lib/mathFormat";
import type { SelectionAnnotation } from "../../types";

// Color tokens for `<mark>` highlights, keyed by verdict + dispute
// decision. Rest = soft tone matching the verdict pill; active (= bubble
// open) = a slightly bolder shade so the teacher sees which mark their
// bubble belongs to when several are visible. Dispute+skip falls into a
// muted grey because the lesson is intentionally dropped.
export function highlightColors(ann: SelectionAnnotation, active: boolean): {
  bg: string;
  strike?: boolean;
} {
  // If custom color is explicitly selected (e.g. Highlight only annotations)
  if (ann.color) {
    if (ann.color === "green") {
      return {
        bg: active ? "#76EDB2" : "#C6F6D5",
      };
    }
    if (ann.color === "red") {
      return {
        bg: active ? "#FF8A80" : "#FFCDD2",
      };
    }
    if (ann.color === "yellow") {
      return {
        bg: active ? "#FFE082" : "#FFF59D",
      };
    }
    if (ann.color === "blue") {
      return {
        bg: active ? "#A1C2FA" : "#C4E2FF",
      };
    }
    if (ann.color === "purple") {
      return {
        bg: active ? "#D5B4F1" : "#E8D5F6",
      };
    }
    if (ann.color === "orange") {
      return {
        bg: active ? "#FFCC80" : "#FFE0B2",
      };
    }
    if (ann.color === "pink") {
      return {
        bg: active ? "#F48FB1" : "#FBCFE8",
      };
    }
    if (ann.color === "mint") {
      return {
        bg: active ? "#80CBC4" : "#E0F2F1",
      };
    }
  }

  // 1. Chưa có verdict (đang tạo mới, đang nhập nhận xét, hoặc đang chờ AI phân tích) -> màu vàng
  if (!ann.verdict) {
    return {
      bg: active ? "#FFE082" : "#FFF59D",
    };
  }

  // 2. AI đồng ý -> green
  if (ann.verdict === "agree") {
    return {
      bg: active ? "#76EDB2" : "#C6F6D5",
    };
  }

  // 3. AI phản biện (chưa giải quyết) -> xanh dương/indigo
  if (ann.verdict === "dispute" && !ann.disputeDecision) {
    return {
      bg: active ? "#A1C2FA" : "#C4E2FF",
    };
  }

  // 4. Còn lại -> đỏ (đồng ý một phần, hoặc đã chọn Áp dụng/Bỏ qua phản biện)
  return {
    bg: active ? "#FF8A80" : "#FFCDD2",
  };
}

// Normalize a string for quote matching. Vietnamese text + browser
// selection can disagree on:
//   • Unicode normalization (NFC vs NFD — e.g. "đ" as one codepoint vs
//     "d" + combining mark). Selection.toString() sometimes returns NFD
//     while the source string from the backend transcript is NFC.
//   • Non-breaking spaces (\u00A0) — some renderers/copies insert these
//     in place of regular spaces.
// Normalizing both sides before indexOf makes the highlight resilient to
// these mismatches without changing the stored quote (we keep the raw
// teacher-selected text for display in the bubble).
export function normalizeForMatch(s: string): string {
  return s.normalize("NFC").replace(/\u00A0/g, " ");
}

// renderLineWithHighlights — split a line into segments where each
// annotation's quote becomes a `<mark>` (colored per verdict) and the
// rest stays plain text. Annotations whose quote can't be found in
// any seg fall back to an invisible end-of-line anchor `<span>` so the
// AnnotationBubble still has a `[data-ann-id="…"]` element to query
// against and position itself — otherwise the bubble would be stranded
// off-screen and the teacher would think commenting didn't work.
export function renderLineWithHighlights(
  line: string,
  anns: SelectionAnnotation[],
  lineIdx: number,
  activeAnnId: string | null,
  onClickMark: (id: string) => void,
): React.ReactNode[] {
  type Seg = { text: string; ann: SelectionAnnotation | null };
  let segs: Seg[] = [{ text: line, ann: null }];
  const unmatched: SelectionAnnotation[] = [];
  for (const ann of anns) {
    const next: Seg[] = [];
    let placed = false;
    // Multi-line selections: split the stored quote by line breaks and
    // pick the segment belonging to THIS row. Start row gets the first
    // segment, end row gets the last, middle rows highlight the whole
    // line. Single-line annotations keep the full quote as the needle.
    const endIdx = ann.endLineIdx ?? ann.lineIdx;
    const isMultiline = endIdx > ann.lineIdx;
    let needleSource: string;
    if (!isMultiline) {
      needleSource = ann.quote;
    } else if (lineIdx === ann.lineIdx) {
      // First line: highlight from the quote's first segment to end of
      // line. Fall back to the whole line when that segment doesn't map
      // cleanly — sel.toString() line separators vary across browsers, so
      // the split may not align with this line. The fallback guarantees
      // the line is still highlighted instead of silently dropped.
      const first = ann.quote.split("\n")[0] ?? "";
      needleSource =
        first && normalizeForMatch(line).includes(normalizeForMatch(first))
          ? first
          : line;
    } else if (lineIdx === endIdx) {
      const parts = ann.quote.split("\n");
      const last = parts[parts.length - 1] ?? "";
      needleSource =
        last && normalizeForMatch(line).includes(normalizeForMatch(last))
          ? last
          : line;
    } else {
      // Middle line — highlight the entire line. Using the line itself
      // as the needle guarantees indexOf hits at offset 0.
      needleSource = line;
    }
    const needle = normalizeForMatch(needleSource);
    for (const seg of segs) {
      if (seg.ann || placed) {
        next.push(seg);
        continue;
      }
      const haystack = normalizeForMatch(seg.text);
      const idx = haystack.indexOf(needle);
      if (idx === -1) {
        next.push(seg);
        continue;
      }
      // Use the haystack offset as the slice index — relies on
      // normalize("NFC") + nbsp→space preserving 1:1 char positions for
      // typical Vietnamese text. Both normalization steps are idempotent
      // and length-preserving on this input class.
      if (idx > 0) next.push({ text: seg.text.slice(0, idx), ann: null });
      next.push({ text: seg.text.slice(idx, idx + needleSource.length), ann });
      const tail = seg.text.slice(idx + needleSource.length);
      if (tail.length > 0) next.push({ text: tail, ann: null });
      placed = true;
    }
    segs = next;
    if (!placed) unmatched.push(ann);
  }
  const nodes = segs.map((seg, i) => {
    if (!seg.ann) return <span key={i}>{formatLine(seg.text, `rh-${lineIdx}-${i}`)}</span>;
    const active = activeAnnId === seg.ann.id;
    const colors = highlightColors(seg.ann, active);
    const annId = seg.ann.id;
    return (
      <mark
        key={i}
        data-ann-id={annId}
        onClick={(e) => {
          e.stopPropagation();
          onClickMark(annId);
        }}
        style={{
          background: colors.bg,
          color: T.text,
          padding: "1.5px 4px",
          margin: "0 1px",
          borderRadius: 3,
          cursor: "pointer",
          transition: "background 0.12s",
          textDecoration: colors.strike ? "line-through" : "none",
        }}
      >
        {formatLine(seg.text, `rh-${lineIdx}-m${i}`)}
      </mark>
    );
  });
  // Fallback anchors for annotations whose quote we couldn't find.
  // Invisible <mark> elements at end-of-line — the bubble's reposition
  // uses these as anchor and at least appears somewhere on the right
  // line. Teacher can still edit/delete; the visible highlight is
  // simply missing for that ann.
  for (const ann of unmatched) {
    const active = activeAnnId === ann.id;
    const annId = ann.id;
    nodes.push(
      <mark
        key={`fallback-${ann.id}`}
        data-ann-id={annId}
        onClick={(e) => {
          e.stopPropagation();
          onClickMark(annId);
        }}
        style={{
          background: active ? "rgba(192, 139, 48, 0.20)" : "transparent",
          padding: 0,
          margin: 0,
          // Tiny zero-width-ish anchor — present in the DOM so
          // getBoundingClientRect returns sensible coords, but
          // visually a no-op.
          display: "inline-block",
          width: 0,
          overflow: "hidden",
          cursor: "pointer",
        }}
        title={`Bình luận: ${ann.comment || "(chưa có)"}`}
      >
        {"​"}
      </mark>,
    );
  }
  return nodes;
}
