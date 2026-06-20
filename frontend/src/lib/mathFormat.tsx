import type { ReactNode } from "react";
import type { Subject } from "../types";

/**
 * formatTranscript — render the cross-check transcript with visual cues.
 *
 *   1. Uncertainty markers become colored pills so teachers can eyeball
 *      the risky spots at a glance:
 *        [?]          → red pill
 *        [gạch]       → orange strikethrough pill
 *        [gạch: xxx]  → orange strikethrough pill (content visible)
 *        [a|b]        → yellow ambiguity pill
 *
 *   2. Figure/diagram wrappers → blue block pill so the teacher spots
 *      non-text elements in the transcript and can jump to "Xem ảnh gốc":
 *        [Hình vẽ: △ABC cân tại A, AB = AC = 5cm, ...]
 *        [Figure: ...]  [Sơ đồ: ...]  [Diagram: ...]
 *        [Bảng: ...]    [Table: ...]  [Mind map: ...]
 *
 *   3. Soft line-breaks after ' ⇒ ' or ' → ' so chains of reasoning
 *      read like real step-by-step work.
 *
 *   4. Math-only (subject === "stem") tokens:
 *        x^2, x^{n+1}   → <sup>
 *        a_1, v_{max}   → <sub>
 *        sqrt(x+1)      → √ with overline bar (CSS)
 *        vec(AB)        → overline text
 *        a/b            → visual fraction (CSS) when both sides are math
 */

const FIGURE_LABELS = "Hình vẽ|Figure|Sơ đồ|Diagram|Bảng|Table|Mind map";
const FIGURE_RE = new RegExp(`^\\[(${FIGURE_LABELS}):\\s*([\\s\\S]*)\\]$`, "i");

const TOKEN_RE = new RegExp(
  "(" +
    "\\[\\?\\]|" +
    "\\[gạch(?::\\s*[^\\]]*)?\\]|" +
    `\\[(?:${FIGURE_LABELS}):[^\\]]*\\]|` +
    "\\[[^|\\]\\n]+\\|[^|\\]\\n]+\\]|" +
    "vec\\([^)]*\\)|" +
    "sqrt\\([^)]*\\)|" +
    "\\^\\{[^}]+\\}|\\^[A-Za-z0-9+\\-]|" +
    "_\\{[^}]+\\}|_[A-Za-z0-9+\\-]" +
    ")",
  "g",
);

function createTokenRegex(): RegExp {
  // renderMath is recursive; each call needs its own lastIndex state.
  return new RegExp(TOKEN_RE.source, "g");
}

const pillBase: React.CSSProperties = {
  display: "inline-block",
  padding: "0 6px",
  borderRadius: 5,
  fontSize: "0.86em",
  fontWeight: 600,
  lineHeight: 1.4,
  verticalAlign: "baseline",
};

const S = {
  unclear: { ...pillBase, background: "#fee2e2", color: "#b91c1c" } as React.CSSProperties,
  strike: {
    ...pillBase,
    background: "#fed7aa",
    color: "#9a3412",
    textDecoration: "line-through",
  } as React.CSSProperties,
  ambig: { ...pillBase, background: "#fef3c7", color: "#854d0e" } as React.CSSProperties,
  figure: {
    display: "inline-block",
    padding: "4px 10px",
    borderRadius: 6,
    background: "#dbeafe",
    color: "#1e3a8a",
    border: "1px solid #93c5fd",
    fontSize: "inherit",
    fontFamily: "inherit",
    fontWeight: 500,
    lineHeight: 1.5,
    maxWidth: "100%",
    wordBreak: "break-word",
    verticalAlign: "baseline",
  } as React.CSSProperties,
  figureLabel: {
    display: "inline-block",
    marginRight: 6,
    fontSize: "0.85em",
    fontWeight: 700,
    letterSpacing: "0.04em",
    textTransform: "uppercase",
    opacity: 0.7,
  } as React.CSSProperties,
  arrow: { color: "#6366f1", fontWeight: 600 } as React.CSSProperties,
};

/**
 * Check whether a string looks like a math expression (for fraction detection).
 * Must contain at least one digit or single-letter variable, and not look like
 * a Vietnamese word or file extension.
 */
function isMathLike(s: string): boolean {
  const trimmed = s.trim();
  if (!trimmed) return false;
  // Must have a digit or look like a math variable (single letter or known symbols)
  if (/\d/.test(trimmed)) return true;
  // Single letter variables
  if (/^[a-zA-Z]$/.test(trimmed)) return true;
  // Parenthesized expression with math-like content
  if (/^\(.*\)$/.test(trimmed) && /[a-zA-Z0-9+\-×÷=^_]/.test(trimmed)) return true;
  // Contains math functions/operators
  if (/(?:sqrt|vec|sin|cos|tan|log|ln)\(/.test(trimmed)) return true;
  return false;
}

function getLeftTerm(str: string, endIdx: number): { term: string; startIdx: number } {
  let i = endIdx - 1;
  // Skip trailing whitespace
  while (i >= 0 && /\s/.test(str[i])) {
    i--;
  }
  if (i < 0) return { term: "", startIdx: endIdx };

  if (str[i] === ")") {
    // Find matching '('
    let depth = 1;
    let j = i - 1;
    while (j >= 0 && depth > 0) {
      if (str[j] === ")") depth++;
      else if (str[j] === "(") depth--;
      j--;
    }
    if (depth > 0) {
      return { term: "", startIdx: endIdx };
    }
    // Check for a function name before '('
    let k = j;
    while (k >= 0 && /[a-zA-Z0-9_]/.test(str[k])) {
      k--;
    }
    const funcName = str.slice(k + 1, j + 1);
    if (funcName === "sqrt" || funcName === "vec") {
      return { term: str.slice(k + 1, i + 1), startIdx: k + 1 };
    }
    return { term: str.slice(j + 1, i + 1), startIdx: j + 1 };
  }

  // Consuming characters: letters, digits, '.', '√', '^', '_', '{', '}'
  const termChar = /[a-zA-Z0-9.√^_{}]/;
  let j = i;
  while (j >= 0 && termChar.test(str[j])) {
    j--;
  }
  return { term: str.slice(j + 1, i + 1), startIdx: j + 1 };
}

function getRightTerm(str: string, startIdx: number): { term: string; endIdx: number } {
  let i = startIdx;
  // Skip leading whitespace
  while (i < str.length && /\s/.test(str[i])) {
    i++;
  }
  if (i >= str.length) return { term: "", endIdx: startIdx };

  // Check if it starts with 'sqrt(' or 'vec(' or '('
  if (str.slice(i).startsWith("sqrt(")) {
    let depth = 1;
    let j = i + 5;
    while (j < str.length && depth > 0) {
      if (str[j] === "(") depth++;
      else if (str[j] === ")") depth--;
      j++;
    }
    if (depth === 0) {
      return { term: str.slice(i, j), endIdx: j };
    }
  }
  if (str.slice(i).startsWith("vec(")) {
    let depth = 1;
    let j = i + 4;
    while (j < str.length && depth > 0) {
      if (str[j] === "(") depth++;
      else if (str[j] === ")") depth--;
      j++;
    }
    if (depth === 0) {
      return { term: str.slice(i, j), endIdx: j };
    }
  }
  if (str[i] === "(") {
    let depth = 1;
    let j = i + 1;
    while (j < str.length && depth > 0) {
      if (str[j] === "(") depth++;
      else if (str[j] === ")") depth--;
      j++;
    }
    if (depth === 0) {
      return { term: str.slice(i, j), endIdx: j };
    }
  }

  // Consuming characters
  const termChar = /[a-zA-Z0-9.√^_{}]/;
  let j = i;
  while (j < str.length && termChar.test(str[j])) {
    j++;
  }
  return { term: str.slice(i, j), endIdx: j };
}

function findTopLevelSlash(s: string): number {
  let depth = 0;
  for (let i = 0; i < s.length; i++) {
    if (s[i] === "(" || s[i] === "[" || s[i] === "{") {
      depth++;
    } else if (s[i] === ")" || s[i] === "]" || s[i] === "}") {
      depth--;
    } else if (s[i] === "/" && depth === 0) {
      return i;
    }
  }
  return -1;
}

function renderToken(tok: string, isStem: boolean, key: string): ReactNode {
  if (tok === "[?]") {
    return (
      <span key={key} style={S.unclear} title="Không đọc được">
        ?
      </span>
    );
  }
  if (tok.startsWith("[gạch")) {
    if (tok === "[gạch]") {
      return (
        <span
          key={key}
          style={{ ...S.strike, textDecoration: "none" }}
          title="Nét gạch xóa không đọc được"
        >
          [xóa bỏ]
        </span>
      );
    }
    let inner = tok.slice(1, -1); // drop [ ]
    if (inner.startsWith("gạch:")) inner = inner.slice(5).trim();
    else if (inner.startsWith("gạch")) inner = inner.slice(4).trim();

    return (
      <span key={key} style={S.strike} title="Học sinh gạch bỏ chữ này">
        {inner}
      </span>
    );
  }
  const figMatch = tok.match(FIGURE_RE);
  if (figMatch) {
    return (
      <span
        key={key}
        data-action="view-figure"
        style={{ ...S.figure, cursor: "pointer" }}
        title="Nhấn để xem ảnh gốc — đối chiếu hình vẽ với bài làm"
        onClick={() => {
          window.dispatchEvent(new CustomEvent("mirror.viewOriginalImage"));
        }}
      >
        <span style={S.figureLabel}>{figMatch[1]}</span>
        {figMatch[2]}
        <span style={{
          marginLeft: 8,
          fontSize: "0.8em",
          opacity: 0.55,
          verticalAlign: "middle",
        }}>👁</span>
      </span>
    );
  }
  if (/^\[[^|\]\n]+\|[^|\]\n]+\]$/.test(tok)) {
    return (
      <span key={key} style={S.ambig} title="Phân vân giữa hai cách đọc">
        {tok.slice(1, -1)}
      </span>
    );
  }
  return tok;
}

function renderMath(s: string, keyBase: string): ReactNode[] {
  if (!s) return [];

  // 1. Check for top-level fraction
  const slashIdx = findTopLevelSlash(s);
  if (slashIdx !== -1) {
    const left = getLeftTerm(s, slashIdx);
    const right = getRightTerm(s, slashIdx + 1);

    if (left.term && right.term && (isMathLike(left.term) || isMathLike(right.term))) {
      const num = left.term.trim();
      const den = right.term.trim();
      const isFileExt = /^[A-Z]{2,}$/.test(num) || /^[A-Z]{2,}$/.test(den);
      if (!isFileExt) {
        const beforeStr = s.slice(0, left.startIdx);
        const afterStr = s.slice(right.endIdx);
        const result: ReactNode[] = [];
        if (beforeStr) {
          result.push(...renderMath(beforeStr, `${keyBase}-fpre`));
        }
        result.push(
          <span key={`${keyBase}-frac`} className="math-expr math-frac">
            <span className="math-frac-num">{renderMath(num, `${keyBase}-fnum`)}</span>
            <span className="math-frac-den">{renderMath(den, `${keyBase}-fden`)}</span>
          </span>,
        );
        if (afterStr) {
          result.push(...renderMath(afterStr, `${keyBase}-fpost`));
        }
        return result;
      }
    }
  }

  // 2. Tokenize using a local regex to avoid global shared state issues in recursive calls
  const regex = createTokenRegex();
  const nodes: ReactNode[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  let k = 0;
  while ((m = regex.exec(s)) !== null) {
    if (m.index > last) {
      nodes.push(s.slice(last, m.index));
    }
    const tok = m[0];
    const key = `${keyBase}-${k++}`;

    if (tok.startsWith("vec(")) {
      const inner = tok.slice(4, -1);
      nodes.push(
        <span key={key} className="math-expr math-vec">
          {renderMath(inner, `${key}-v`)}
        </span>,
      );
    } else if (tok.startsWith("sqrt(")) {
      const inner = tok.slice(5, -1);
      nodes.push(
        <span key={key} className="math-expr math-sqrt">
          <span className="math-sqrt-symbol">√</span>
          <span className="math-sqrt-content">
            {renderMath(inner, `${key}-s`)}
          </span>
        </span>,
      );
    } else if (tok.startsWith("^{")) {
      const inner = tok.slice(2, -1);
      nodes.push(
        <sup key={key} className="math-expr">
          {renderMath(inner, `${key}-sup`)}
        </sup>,
      );
    } else if (tok.startsWith("^")) {
      const inner = tok.slice(1);
      nodes.push(
        <sup key={key} className="math-expr">
          {inner}
        </sup>,
      );
    } else if (tok.startsWith("_{")) {
      const inner = tok.slice(2, -1);
      nodes.push(
        <sub key={key} className="math-expr">
          {renderMath(inner, `${key}-sub`)}
        </sub>,
      );
    } else if (tok.startsWith("_")) {
      const inner = tok.slice(1);
      nodes.push(
        <sub key={key} className="math-expr">
          {inner}
        </sub>,
      );
    } else {
      // Non-math tokens like [?], [gạch], figures, ambiguity
      nodes.push(renderToken(tok, true, key));
    }

    last = m.index + tok.length;
  }
  if (last < s.length) {
    nodes.push(s.slice(last));
  }
  return nodes;
}

function tokenize(src: string, isStem: boolean, keyBase: string): ReactNode[] {
  const regex = createTokenRegex();
  const nodes: ReactNode[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  let k = 0;
  while ((m = regex.exec(src)) !== null) {
    if (m.index > last) nodes.push(src.slice(last, m.index));
    nodes.push(renderToken(m[0], isStem, `${keyBase}-${k++}`));
    last = m.index + m[0].length;
  }
  if (last < src.length) nodes.push(src.slice(last));
  return nodes;
}

export function formatTranscript(
  text: string | null | undefined,
  subject: Subject | string,
): ReactNode {
  if (!text) return text;
  const isStem = subject === "stem";
  const lines = String(text).split("\n");
  const out: ReactNode[] = [];
  lines.forEach((line, li) => {
    // Split on ' ⇒ ', ' → ', or ' ⇔ ' — whitespace-bordered arrows only.
    const segments = line.split(/\s+([⇒→⇔])\s+/);
    segments.forEach((seg, si) => {
      const key = `${li}-${si}`;
      if (seg === "⇒" || seg === "→" || seg === "⇔") {
        out.push("\n  ");
        out.push(
          <span key={`a-${key}`} style={S.arrow}>
            {seg}
          </span>,
        );
        out.push(" ");
      } else {
        if (isStem) {
          out.push(...renderMath(seg, key));
        } else {
          out.push(...tokenize(seg, false, key));
        }
      }
    });
    if (li < lines.length - 1) out.push("\n");
  });
  return out;
}

/**
 * formatLine — format a single already-split line with STEM math rendering.
 *
 * Use this when the caller already has lines[] split (e.g. step-4 regrade
 * where q.lines is pre-split by the backend). Always treats text as STEM
 * because the data reaching this path is AI transcript of math homework.
 */
export function formatLine(
  line: string,
  lineKey: string | number = 0,
): ReactNode[] {
  const segments = line.split(/\s+([⇒→⇔])\s+/);
  const out: ReactNode[] = [];
  segments.forEach((seg, si) => {
    const key = `${lineKey}-${si}`;
    if (seg === "⇒" || seg === "→" || seg === "⇔") {
      out.push("\n  ");
      out.push(
        <span key={`a-${key}`} style={S.arrow}>
          {seg}
        </span>,
      );
      out.push(" ");
    } else {
      out.push(...renderMath(seg, key));
    }
  });
  return out;
}
