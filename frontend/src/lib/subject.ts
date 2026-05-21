import type { BackendSubject } from "../types";

// Single source of truth for the human-readable Vietnamese label of each
// backend subject code. Imported by SubjectChip (dropdown options),
// EssayWorkspace (task-context string), and anywhere else the UI needs to
// show a subject by name. Keep in sync with `BackendSubject` — adding a
// new subject means adding both a row here and a backend prompts entry.
const SUBJECT_LABEL: Record<BackendSubject, string> = {
  math: "Toán",
  cs:   "Tin học",
  phys: "Vật lý",
  chem: "Hoá học",
  bio:  "Sinh học",
};

export function subjectLabelOf(code: BackendSubject | null | undefined): string {
  if (!code) return "—";
  return SUBJECT_LABEL[code] ?? code;
}

// Extra display-only labels for raw subject strings that ride along on
// HITL memory rows (legacy code "stem", explicit "unknown"). Kept separate
// from SUBJECT_LABEL because they are not BackendSubject codes — the
// pipeline never emits them, but lessons saved from older runs do.
const EXTRA_RAW_LABELS: Record<string, string> = {
  stem: "STEM",
  unknown: "Khác",
};

/**
 * Permissive label lookup for raw lesson.subject strings. Use this when
 * displaying the label for data that may carry legacy / unknown subjects
 * (e.g. HITL lessons listed in the Memory panel and Grade History
 * dropdown). Falls back to capitalizing the raw code so a brand-new
 * subject still renders without a code change.
 */
export function subjectLabelRaw(code: string | null | undefined): string {
  if (!code) return "Khác";
  if (code in SUBJECT_LABEL) return SUBJECT_LABEL[code as BackendSubject];
  if (code in EXTRA_RAW_LABELS) return EXTRA_RAW_LABELS[code];
  return code.charAt(0).toUpperCase() + code.slice(1);
}

export interface SubjectOption {
  code: BackendSubject;
  label: string;
}

export const SUBJECT_OPTIONS: SubjectOption[] = (
  Object.entries(SUBJECT_LABEL) as Array<[BackendSubject, string]>
).map(([code, label]) => ({ code, label }));
