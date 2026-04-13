/**
 * HITLEditor.jsx ΓÇö MIRROR 3-column HITL UI
 *
 * Layout:
 *   ΓöîΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ HEADER (title + lang + reset) ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÉ
 *   Γöé   Step indicator:  1.GENERATE  2.EVALUATE    Γöé
 *   Γöé                    3.EXECUTE   4.TEACH AI    Γöé
 *   Γö£ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓö¼ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓö¼ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöñ
 *   Γöé  LEFT    Γöé     CENTER      Γöé     RIGHT       Γöé
 *   Γöé          Γöé                 Γöé                 Γöé
 *   Γöé  Task    Γöé  Monaco code    Γöé Feedback panel  Γöé
 *   Γöé  Strat.  Γöé  Critic result  Γöé  (HITL CORE)    Γöé
 *   Γöé  Run     Γöé                 Γöé Lessons list    Γöé
 *   Γöé  Sandbox Γöé                 Γöé Prompt debug    Γöé
 *   ΓööΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓö┤ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓö┤ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÿ
 *
 * The HITL loop is visible because the right panel is where the user:
 *   1. Reads the AI output on the center panel
 *   2. Clicks Approve / Revise / Reject
 *   3. Writes WHY it is wrong
 *   4. Submits ΓåÆ backend persists a lesson
 *   5. Clicks "Run Again" ΓåÆ /api/generate re-runs WITH the feedback
 *   6. New lessons appearing in the Lessons list are highlighted as Γ£à NEW
 *      ΓÇö that is the visual proof that the AI learned.
 */

import React, { useCallback, useState, useEffect, useRef } from "react";
import { DiffEditor } from "@monaco-editor/react";
import { useAgentPipeline } from "./hooks/useAgentPipeline";
import { useCodeExecution } from "./hooks/useCodeExecution";
import { useTeachMemory } from "./hooks/useTeachMemory";
import { useFeedback } from "./hooks/useFeedback";

/* =========================================================================
   THEME TOKENS
   ========================================================================= */
const DARK = {
  bg:       "#0D0D0D",
  surface:  "#141414",
  surface2: "#1A1A1A",
  border:   "#2A2A2A",
  cyan:     "#00E5FF",
  amber:    "#FFB300",
  green:    "#39FF14",
  red:      "#FF3D3D",
  magenta:  "#FF00AA",
  textPri:  "#E0E0E0",
  textSec:  "#808080",
  mono:     "'JetBrains Mono', monospace",
  ui:       "'Space Mono', monospace",
  editorTheme: "vs-dark",
};

const LIGHT = {
  bg:       "#F5F5F5",
  surface:  "#FFFFFF",
  surface2: "#EBEBEB",
  border:   "#D0D0D0",
  cyan:     "#0077B6",
  amber:    "#E65100",
  green:    "#2E7D32",
  red:      "#C62828",
  magenta:  "#AD1457",
  textPri:  "#1A1A1A",
  textSec:  "#666666",
  mono:     "'JetBrains Mono', monospace",
  ui:       "'Space Mono', monospace",
  editorTheme: "light",
};

// Mutable theme reference ΓÇö synced each render so sub-components read the active palette
let T = DARK;

/* =========================================================================
   I18N
   ========================================================================= */
const i18n = {
  en: {
    title: "MIRROR",
    subtitle: "HUMAN-IN-THE-LOOP AGENTIC CODE LEARNING",
    reset: "RESET",
    steps: ["1. GENERATE", "2. EVALUATE", "3. EXECUTE", "4. TEACH AI"],
    // LEFT
    taskLabel: "TASK DESCRIPTION",
    taskPlaceholder: "Describe the coding task for the AI agentΓÇª",
    strategyLabel: "STRATEGY",
    strategyDefault: "default",
    strategyStrict: "strict",
    strategyConcise: "concise",
    runPipeline: "Γû╢ RUN PIPELINE",
    runAgain: "Γå╗ RUN AGAIN (WITH FEEDBACK)",
    generating: "GENERATINGΓÇª",
    runSandbox: "ΓÜÖ RUN SANDBOX",
    running: "RUNNINGΓÇª",
    // CENTER
    aiGenerated: "AI OUTPUT",
    humanEditor: "HUMAN EDIT",
    criticTitle: "CRITIC REVIEW",
    suggestion: "SUGGESTION",
    exitLabel: "EXIT",
    noOutputYet: "No code generated yet. Enter a task on the left and click RUN PIPELINE.",
    // RIGHT
    feedbackTitle: "HUMAN FEEDBACK (HITL CORE)",
    feedbackApprove: "Γ£ô APPROVE",
    feedbackRevise: "Γ£Ä REVISE",
    feedbackReject: "Γ£ù REJECT",
    feedbackExplain: "EXPLAIN WHAT IS WRONG",
    feedbackPlaceholder: "e.g. ΓÇ£it crashes on empty inputΓÇ¥, ΓÇ£uses unsafe evalΓÇ¥, ΓÇ£off-by-one on the last elementΓÇ¥ΓÇª",
    feedbackSubmit: "SUBMIT FEEDBACK",
    feedbackSubmitting: "SAVINGΓÇª",
    feedbackNeedsComment: "Comment required for revise/reject",
    lessonAdded: "Γ£à New lesson added to memory",
    lessonsTitle: "≡ƒºá LESSONS RETRIEVED",
    lessonsEmpty: "No lessons retrieved for this task yet.",
    newBadge: "NEW",
    debugTitle: "PROMPT DEBUG",
    debugSystem: "SYSTEM",
    debugMemory: "MEMORY / LESSONS",
    debugContext: "CONTEXT",
    // dashboard
    dashboard: "RESEARCH DASHBOARD",
    totalLessons: "Total Lessons",
    avgScore: "Avg Score",
    pipelineRuns: "Pipeline Runs",
    autoFixRate: "Auto-fix Rate",
    statsError: "Could not load stats",
    colId: "ID", colTask: "Task", colScore: "Score", colTime: "Time",
    // misc
    memoryContext: "MEMORY CONTEXT",
    lessonsInjected: "lesson(s) injected",
    pipelineError: "Pipeline error",
    runCount: "Run",
    learningBannerTitle: "AI IS LEARNING",
    learningBannerBody: "New lesson(s) from your last feedback are now in the coder prompt.",
  },
  vi: {
    title: "MIRROR",
    subtitle: "Hß╗å THß╗ÉNG Hß╗îC CODE C├ô CON NG╞»ß╗£I CAN THIß╗åP",
    reset: "─Éß║╢T Lß║áI",
    steps: ["1. Tß║áO CODE", "2. ─É├üNH GI├ü", "3. CHß║áY THß╗¼", "4. Dß║áY AI"],
    taskLabel: "M├ö Tß║ó NHIß╗åM Vß╗ñ",
    taskPlaceholder: "M├┤ tß║ú nhiß╗çm vß╗Ñ lß║¡p tr├¼nh cho AIΓÇª",
    strategyLabel: "CHIß║╛N L╞»ß╗óC",
    strategyDefault: "mß║╖c ─æß╗ïnh",
    strategyStrict: "nghi├¬m ngß║╖t",
    strategyConcise: "ngß║»n gß╗ìn",
    runPipeline: "Γû╢ CHß║áY PIPELINE",
    runAgain: "Γå╗ CHß║áY Lß║áI (D├ÖNG PHß║óN Hß╗ÆI)",
    generating: "─ÉANG Tß║áOΓÇª",
    runSandbox: "ΓÜÖ CHß║áY SANDBOX",
    running: "─ÉANG CHß║áYΓÇª",
    aiGenerated: "CODE AI",
    humanEditor: "NG╞»ß╗£I Sß╗¼A",
    criticTitle: "─É├üNH GI├ü CODE",
    suggestion: "Gß╗óI ├¥",
    exitLabel: "M├â THO├üT",
    noOutputYet: "Ch╞░a c├│ code. Nhß║¡p nhiß╗çm vß╗Ñ ß╗ƒ cß╗Öt tr├íi v├á bß║Ñm CHß║áY PIPELINE.",
    feedbackTitle: "PHß║óN Hß╗ÆI CON NG╞»ß╗£I (HITL)",
    feedbackApprove: "Γ£ô ─Éß╗ÆNG ├¥",
    feedbackRevise: "Γ£Ä Sß╗¼A Lß║áI",
    feedbackReject: "Γ£ù Tß╗¬ CHß╗ÉI",
    feedbackExplain: "GIß║óI TH├ìCH Lß╗ûI SAI",
    feedbackPlaceholder: "VD: ΓÇ£lß╗ùi khi input rß╗ùngΓÇ¥, ΓÇ£d├╣ng eval kh├┤ng an to├ánΓÇ¥, ΓÇ£sai chß╗ë sß╗æ ß╗ƒ phß║ºn tß╗¡ cuß╗æiΓÇ¥ΓÇª",
    feedbackSubmit: "Gß╗¼I PHß║óN Hß╗ÆI",
    feedbackSubmitting: "─ÉANG L╞»UΓÇª",
    feedbackNeedsComment: "Cß║ºn c├│ m├┤ tß║ú cho sß╗¡a/tß╗½ chß╗æi",
    lessonAdded: "Γ£à ─É├ú th├¬m b├ái hß╗ìc mß╗¢i v├áo tr├¡ nhß╗¢",
    lessonsTitle: "≡ƒºá B├ÇI Hß╗îC ─É╞»ß╗óC Lß║ñY",
    lessonsEmpty: "Ch╞░a c├│ b├ái hß╗ìc n├áo cho nhiß╗çm vß╗Ñ n├áy.",
    newBadge: "Mß╗ÜI",
    debugTitle: "DEBUG PROMPT",
    debugSystem: "Hß╗å THß╗ÉNG",
    debugMemory: "TR├ì NHß╗Ü / B├ÇI Hß╗îC",
    debugContext: "NGß╗« Cß║óNH",
    dashboard: "Bß║óNG ─ÉIß╗ÇU KHIß╗éN NGHI├èN Cß╗¿U",
    totalLessons: "Tß╗òng B├ái Hß╗ìc",
    avgScore: "─Éiß╗âm TB",
    pipelineRuns: "Sß╗æ Lß║ºn Chß║íy",
    autoFixRate: "Tß╗╖ Lß╗ç Tß╗▒ Sß╗¡a",
    statsError: "Kh├┤ng thß╗â tß║úi thß╗æng k├¬",
    colId: "ID", colTask: "Nhiß╗çm vß╗Ñ", colScore: "─Éiß╗âm", colTime: "Thß╗¥i gian",
    memoryContext: "NGß╗« Cß║óNH TR├ì NHß╗Ü",
    lessonsInjected: "b├ái hß╗ìc ─æ╞░ß╗úc sß╗¡ dß╗Ñng",
    pipelineError: "Lß╗ùi Pipeline",
    runCount: "Lß║ºn chß║íy",
    learningBannerTitle: "AI ─ÉANG Hß╗îC",
    learningBannerBody: "B├ái hß╗ìc mß╗¢i tß╗½ phß║ún hß╗ôi vß╗½a rß╗ôi ─æ├ú ─æ╞░ß╗úc ─æ╞░a v├áo prompt.",
  },
};

/* =========================================================================
   SHARED SUB-COMPONENTS
   ========================================================================= */

function ScanlineLoader() {
  const lines = useRef(
    Array.from({ length: 12 }, (_, i) => {
      const p = ["INIT", "LOAD", "PARSE", "COMPILE", "LINK", "EXEC",
                 "VERIFY", "SYNC", "ALLOC", "ENCODE", "ROUTE", "EMIT"];
      return `[${p[i]}] ${"Γûê".repeat(Math.floor(Math.random() * 24) + 8)}`;
    })
  );
  const [idx, setIdx] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setIdx((p) => (p + 1) % lines.current.length), 220);
    return () => clearInterval(id);
  }, []);
  return (
    <div style={{
      fontFamily: T.mono, fontSize: 11, color: T.cyan, padding: 12,
      background: T.bg, border: `1px solid ${T.border}`, borderRadius: 4,
      overflow: "hidden", position: "relative",
    }}>
      <div style={{
        position: "absolute", inset: 0, pointerEvents: "none",
        background: `repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,229,255,0.03) 2px, rgba(0,229,255,0.03) 4px)`,
      }} />
      {lines.current.slice(0, idx + 1).map((l, i) => (
        <div key={i} style={{ opacity: i === idx ? 1 : 0.35 }}>
          <span style={{ color: T.textSec }}>{String(i + 1).padStart(2, "0")} </span>{l}
        </div>
      ))}
      <span className="blink" style={{ color: T.green }}>Γûè</span>
    </div>
  );
}

function SeverityBadge({ level }) {
  const colors = { high: T.red, medium: T.amber, low: T.green };
  const c = colors[level] || T.textSec;
  return (
    <span style={{
      display: "inline-block", padding: "2px 10px", borderRadius: 3,
      fontSize: 10, fontFamily: T.ui, fontWeight: 700,
      color: T.bg, background: c, textTransform: "uppercase",
      animation: level === "high" ? "pulse 1.2s infinite" : undefined,
    }}>
      {level}
    </span>
  );
}

function CriticPanel({ critique, t }) {
  if (!critique) return null;
  const { issues = [], severity, suggestion } = critique;
  return (
    <div style={{
      fontFamily: T.mono, fontSize: 12, color: T.textPri,
      padding: 12, background: T.surface, border: `1px solid ${T.border}`,
      borderRadius: 4,
    }}>
      <div style={{ marginBottom: 8, display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ color: T.cyan, fontFamily: T.ui, fontSize: 12, fontWeight: 700 }}>
          {t.criticTitle}
        </span>
        <SeverityBadge level={severity} />
      </div>
      {issues.map((iss, i) => (
        <div key={i} style={{
          marginBottom: 6, padding: "6px 8px",
          background: T.surface2, borderLeft: `3px solid ${
            iss.dimension === "Security Vulnerabilities" || iss.dimension === "Lß╗ù Hß╗òng Bß║úo Mß║¡t" ? T.red :
            iss.dimension === "Logic Correctness" || iss.dimension === "T├¡nh ─É├║ng ─Éß║»n Logic" ? T.amber : T.cyan
          }`, borderRadius: 2,
        }}>
          <div style={{ color: T.textSec, fontSize: 10, marginBottom: 2 }}>
            {iss.dimension} {iss.line != null && `┬╖ L${iss.line}`}
          </div>
          <div>{iss.description}</div>
        </div>
      ))}
      {suggestion && (
        <div style={{ marginTop: 8, padding: "8px 10px", background: T.surface2, borderRadius: 4 }}>
          <span style={{ color: T.amber, fontSize: 11 }}>{t.suggestion} </span>
          <span>{suggestion}</span>
        </div>
      )}
    </div>
  );
}

function TerminalPanel({ stdout, stderr, exitCode, t }) {
  if (exitCode === null) return null;
  const ok = exitCode === 0;
  return (
    <div style={{
      fontFamily: T.mono, fontSize: 11, padding: 12,
      background: T.bg, border: `1px solid ${ok ? T.green : T.red}`,
      borderRadius: 4, color: T.textPri,
    }}>
      <div style={{ marginBottom: 4 }}>
        <span style={{ color: ok ? T.green : T.red, fontFamily: T.ui, fontWeight: 700, fontSize: 10 }}>
          {t.exitLabel} {exitCode}
        </span>
      </div>
      {stdout && <pre style={{ margin: 0, whiteSpace: "pre-wrap", color: T.green }}>{stdout}</pre>}
      {stderr && <pre style={{ margin: 0, whiteSpace: "pre-wrap", color: T.red }}>{stderr}</pre>}
    </div>
  );
}

/* =========================================================================
   STEP INDICATOR (4 phases of the HITL loop)
   ========================================================================= */
function StepIndicator({ activeStep, t }) {
  return (
    <div style={{
      display: "flex", gap: 0, marginBottom: 16,
      border: `1px solid ${T.border}`, borderRadius: 4, overflow: "hidden",
    }}>
      {t.steps.map((label, i) => {
        const active = i === activeStep;
        const done = i < activeStep;
        return (
          <div key={label} style={{
            flex: 1, padding: "10px 0", textAlign: "center",
            fontFamily: T.ui, fontSize: 11, fontWeight: 700, letterSpacing: 1,
            color: active ? T.bg : done ? T.green : T.textSec,
            background: active ? T.cyan : done ? "rgba(57,255,20,0.08)" : "transparent",
            borderRight: i < t.steps.length - 1 ? `1px solid ${T.border}` : "none",
            transition: "all .3s",
          }}>
            {done ? "Γ£ô " : ""}{label}
          </div>
        );
      })}
    </div>
  );
}

/* =========================================================================
   LESSONS LIST (with NEW highlight when the last rerun added lessons)
   ========================================================================= */
function LessonsList({ lessons, newLessonIds, t }) {
  const newSet = new Set(newLessonIds || []);
  return (
    <div style={{
      padding: 12, background: T.surface, border: `1px solid ${T.border}`,
      borderRadius: 4, fontFamily: T.mono, fontSize: 12, color: T.textPri,
    }}>
      <div style={{
        color: T.amber, fontFamily: T.ui, fontSize: 11, fontWeight: 700,
        letterSpacing: 1, marginBottom: 8,
      }}>
        {t.lessonsTitle} ┬╖ {lessons?.length || 0}
      </div>
      {(!lessons || lessons.length === 0) && (
        <div style={{ color: T.textSec, fontSize: 11, fontStyle: "italic" }}>
          {t.lessonsEmpty}
        </div>
      )}
      {lessons && lessons.map((l) => {
        const isNew = newSet.has(l.id);
        return (
          <div key={l.id} style={{
            marginTop: 6, padding: "6px 8px",
            background: isNew ? "rgba(57,255,20,0.10)" : T.surface2,
            border: isNew ? `1px solid ${T.green}` : `1px solid ${T.border}`,
            borderRadius: 3, position: "relative",
            animation: isNew ? "fadeIn .5s" : undefined,
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
              <span style={{ color: T.cyan, fontSize: 10 }}>#{l.id}</span>
              {isNew && (
                <span style={{
                  padding: "1px 6px", background: T.green, color: T.bg,
                  borderRadius: 2, fontSize: 9, fontFamily: T.ui, fontWeight: 700,
                }}>
                  {t.newBadge}
                </span>
              )}
              <span style={{ color: T.amber, fontSize: 10, marginLeft: "auto" }}>
                Γÿà {l.feedback_score}
              </span>
            </div>
            <div style={{ fontSize: 11, color: T.textPri, lineHeight: 1.4 }}>
              {l.lesson_text}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* =========================================================================
   FEEDBACK PANEL ΓÇö the HITL CORE
   ========================================================================= */
function FeedbackPanel({
  pipelineCode, task, runId,
  feedbackHook, onRunAgain, onLessonSaved,
  t,
}) {
  const [action, setAction] = useState(null); // approve | revise | reject
  const [comment, setComment] = useState("");
  const [justSaved, setJustSaved] = useState(false);

  const canSubmit =
    action === "approve" || (action && comment.trim().length > 0);

  const handleSubmit = async () => {
    if (!action) return;
    if (action !== "approve" && !comment.trim()) return;
    const res = await feedbackHook.submit({
      action,
      comment,
      task,
      wrongCode: pipelineCode || "",
      runId,
    });
    if (res && res.saved) {
      setJustSaved(true);
      if (onLessonSaved) onLessonSaved(comment);
    }
    if (res && action === "approve") {
      setJustSaved(true);
    }
  };

  const handleRunAgain = () => {
    // Pass BOTH the human comment AND the wrong code so the AI sees
    // exactly what it generated before and what needs fixing.
    onRunAgain(comment.trim() || null, pipelineCode || "");
    setJustSaved(false);
    setAction(null);
    setComment("");
  };

  const btn = (key, color, label) => (
    <button
      onClick={() => { setAction(key); setJustSaved(false); }}
      style={{
        flex: 1, padding: "10px 4px",
        background: action === key ? color : "transparent",
        border: `1px solid ${color}`,
        color: action === key ? T.bg : color,
        fontFamily: T.ui, fontSize: 11, fontWeight: 700,
        cursor: "pointer", borderRadius: 3, letterSpacing: 1,
        transition: "all .15s",
      }}
    >
      {label}
    </button>
  );

  return (
    <div style={{
      padding: 12, background: T.surface,
      border: `2px solid ${T.magenta}`, borderRadius: 4,
      fontFamily: T.mono, fontSize: 12, color: T.textPri,
      boxShadow: "0 0 0 1px rgba(255,0,170,0.2), 0 0 20px rgba(255,0,170,0.15)",
    }}>
      <div style={{
        color: T.magenta, fontFamily: T.ui, fontSize: 11, fontWeight: 700,
        letterSpacing: 1.5, marginBottom: 10,
      }}>
        Γ¼ó {t.feedbackTitle}
      </div>

      <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
        {btn("approve", T.green,  t.feedbackApprove)}
        {btn("revise",  T.amber,  t.feedbackRevise)}
        {btn("reject",  T.red,    t.feedbackReject)}
      </div>

      <label style={{
        display: "block", marginBottom: 4,
        color: T.cyan, fontSize: 10, fontFamily: T.ui, letterSpacing: 1,
      }}>
        {t.feedbackExplain}
      </label>
      <textarea
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        rows={4}
        placeholder={t.feedbackPlaceholder}
        disabled={action === "approve"}
        style={{
          width: "100%", background: T.surface2, color: T.textPri,
          border: `1px solid ${T.border}`, borderRadius: 3, padding: 8,
          fontFamily: T.mono, fontSize: 11, resize: "vertical",
          opacity: action === "approve" ? 0.5 : 1,
        }}
      />

      {action && action !== "approve" && !comment.trim() && (
        <div style={{ marginTop: 4, fontSize: 10, color: T.textSec }}>
          {t.feedbackNeedsComment}
        </div>
      )}

      {feedbackHook.error && (
        <div style={{ marginTop: 6, color: T.red, fontSize: 11 }}>
          ΓÜá {feedbackHook.error}
        </div>
      )}

      {justSaved && feedbackHook.lastLessonId && (
        <div style={{
          marginTop: 8, padding: "6px 8px",
          background: "rgba(57,255,20,0.10)", border: `1px solid ${T.green}`,
          color: T.green, fontSize: 11, borderRadius: 3,
          animation: "fadeIn .5s",
        }}>
          {t.lessonAdded} ┬╖ #{feedbackHook.lastLessonId}
        </div>
      )}

      <button
        onClick={handleSubmit}
        disabled={!canSubmit || feedbackHook.isSubmitting}
        style={{
          marginTop: 10, width: "100%", padding: "10px 0",
          background: canSubmit && !feedbackHook.isSubmitting ? T.cyan : T.border,
          color: T.bg, border: "none", borderRadius: 3,
          fontFamily: T.ui, fontWeight: 700, fontSize: 12, cursor: "pointer",
          letterSpacing: 1,
        }}
      >
        {feedbackHook.isSubmitting ? t.feedbackSubmitting : t.feedbackSubmit}
      </button>

      {justSaved && action !== "approve" && (
        <button
          onClick={handleRunAgain}
          style={{
            marginTop: 8, width: "100%", padding: "12px 0",
            background: T.magenta, color: T.bg, border: "none", borderRadius: 3,
            fontFamily: T.ui, fontWeight: 700, fontSize: 12, cursor: "pointer",
            letterSpacing: 1,
            animation: "pulse 2s infinite",
          }}
        >
          {t.runAgain}
        </button>
      )}
    </div>
  );
}

/* =========================================================================
   PROMPT DEBUG (collapsible ΓÇö System / Memory / Context)
   ========================================================================= */
function PromptDebug({ bundle, t }) {
  const [open, setOpen] = useState(false);
  if (!bundle) return null;

  const systemText = bundle.system || "";
  const memoryText = (bundle.lessons_used || [])
    .map((l) => `#${l.id} (Γÿà${l.feedback_score}) ${l.lesson_text}`)
    .join("\n") || "(none)";
  const contextText = bundle.user_content || "";

  const section = (label, body, color) => (
    <div style={{ marginTop: 6 }}>
      <div style={{
        color, fontFamily: T.ui, fontSize: 10, fontWeight: 700,
        letterSpacing: 1, marginBottom: 2,
      }}>{label}</div>
      <pre style={{
        margin: 0, padding: 6,
        background: T.bg, border: `1px solid ${T.border}`, borderRadius: 3,
        fontFamily: T.mono, fontSize: 10, color: T.textPri,
        whiteSpace: "pre-wrap", wordBreak: "break-word",
        maxHeight: 160, overflowY: "auto",
      }}>{body}</pre>
    </div>
  );

  return (
    <div style={{
      background: T.surface, border: `1px solid ${T.border}`, borderRadius: 4,
    }}>
      <button
        onClick={() => setOpen(!open)}
        style={{
          width: "100%", padding: "10px 12px", background: "transparent",
          border: "none", color: T.cyan, fontFamily: T.ui, fontSize: 11,
          fontWeight: 700, cursor: "pointer", textAlign: "left",
          display: "flex", justifyContent: "space-between", letterSpacing: 1,
        }}
      >
        <span>ΓÜÖ {t.debugTitle}</span>
        <span>{open ? "Γû▓" : "Γû╝"}</span>
      </button>
      {open && (
        <div style={{ padding: "0 12px 12px" }}>
          {section(t.debugSystem,  systemText,  T.cyan)}
          {section(t.debugMemory,  memoryText,  T.amber)}
          {section(t.debugContext, contextText, T.green)}
        </div>
      )}
    </div>
  );
}

/* =========================================================================
   RESEARCH DASHBOARD (kept from previous version)
   ========================================================================= */
function ResearchDashboard({ stats, statsError, t }) {
  const [open, setOpen] = useState(false);
  if (!stats && !statsError) return null;
  return (
    <div style={{
      background: T.surface, border: `1px solid ${T.border}`,
      borderRadius: 4, fontFamily: T.mono, fontSize: 12, color: T.textPri,
    }}>
      <button
        onClick={() => setOpen(!open)}
        style={{
          width: "100%", padding: "10px 14px", background: "transparent",
          border: "none", color: T.cyan, fontFamily: T.ui, fontSize: 12,
          fontWeight: 700, cursor: "pointer", textAlign: "left",
          display: "flex", justifyContent: "space-between",
        }}
      >
        <span>{t.dashboard}</span><span>{open ? "Γû▓" : "Γû╝"}</span>
      </button>
      {open && (
        <div style={{ padding: "0 14px 14px" }}>
          {statsError && (
            <div style={{ color: T.red, fontSize: 11, marginBottom: 8 }}>
              ΓÜá {t.statsError}: {statsError}
            </div>
          )}
          {stats && (
            <>
              <div style={{ display: "flex", gap: 10, marginBottom: 12 }}>
                {[
                  { label: t.totalLessons, value: stats.total, color: T.cyan },
                  { label: t.avgScore, value: stats.avg_score, color: T.amber },
                  { label: t.pipelineRuns, value: stats.total_runs, color: T.textPri },
                  { label: t.autoFixRate, value: `${stats.auto_fix_rate}%`, color: T.green },
                ].map((s) => (
                  <div key={s.label} style={{
                    flex: 1, padding: "10px 12px", background: T.surface2,
                    borderRadius: 4, textAlign: "center",
                  }}>
                    <div style={{ fontSize: 22, fontWeight: 700, color: s.color }}>{s.value}</div>
                    <div style={{ fontSize: 10, color: T.textSec, marginTop: 2 }}>{s.label}</div>
                  </div>
                ))}
              </div>
              {stats.recent && stats.recent.length > 0 && (
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
                  <thead>
                    <tr style={{ color: T.textSec, textAlign: "left" }}>
                      <th style={{ padding: "4px 6px", borderBottom: `1px solid ${T.border}` }}>{t.colId}</th>
                      <th style={{ padding: "4px 6px", borderBottom: `1px solid ${T.border}` }}>{t.colTask}</th>
                      <th style={{ padding: "4px 6px", borderBottom: `1px solid ${T.border}` }}>{t.colScore}</th>
                      <th style={{ padding: "4px 6px", borderBottom: `1px solid ${T.border}` }}>{t.colTime}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.recent.map((r) => (
                      <tr key={r.id}>
                        <td style={{ padding: "4px 6px", color: T.cyan }}>{r.id}</td>
                        <td style={{ padding: "4px 6px", maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.task}</td>
                        <td style={{ padding: "4px 6px", color: T.amber }}>{r.feedback_score}</td>
                        <td style={{ padding: "4px 6px", color: T.textSec }}>{r.timestamp?.slice(0, 16)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

/* =========================================================================
   MAIN COMPONENT
   ========================================================================= */

export default function HITLEditor() {
  const pipeline = useAgentPipeline();
  const execution = useCodeExecution();
  const teachMemory = useTeachMemory();
  const feedbackHook = useFeedback();

  const [lang, setLang] = useState(() => localStorage.getItem("hitl_lang") || "en");
  const t = i18n[lang];
  const toggleLang = () => {
    const next = lang === "en" ? "vi" : "en";
    setLang(next);
    localStorage.setItem("hitl_lang", next);
  };

  const [theme, setTheme] = useState(() => localStorage.getItem("hitl_theme") || "dark");
  T = theme === "dark" ? DARK : LIGHT;  // sync module-level ref for sub-components
  const toggleTheme = () => {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    localStorage.setItem("hitl_theme", next);
  };

  // Keep backend alive while tab is open
  useEffect(() => {
    const send = () => fetch("/api/heartbeat", { method: "POST" }).catch(() => {});
    send();
    const id = setInterval(send, 10000);
    return () => clearInterval(id);
  }, []);

  const [task, setTask] = useState("");
  const [strategy, setStrategy] = useState("default");
  const [editedCode, setEditedCode] = useState("");
  const [stats, setStats] = useState(null);
  const [statsError, setStatsError] = useState(null);
  const [showLearningBanner, setShowLearningBanner] = useState(false);


  // Compute the active step for the indicator
  // 0 = GENERATE, 1 = EVALUATE (code ready), 2 = EXECUTE (sandbox ran), 3 = TEACH (feedback saved)
  const activeStep = feedbackHook.lastLessonId
    ? 3
    : execution.exitCode !== null
      ? 2
      : pipeline.code
        ? 1
        : 0;

  // Sync edited code when a new run completes
  useEffect(() => {
    if (pipeline.code) setEditedCode(pipeline.code);
  }, [pipeline.code]);

  // Reset sandbox output and any pending feedback acknowledgement every time
  // a new run is kicked off ΓÇö otherwise the step indicator would "stick" on
  // EXECUTE / TEACH AI after a rerun.
  useEffect(() => {
    if (pipeline.phase === "generating") {
      execution.reset();
      feedbackHook.reset();
    }
  }, [pipeline.phase]);

  // Show the "AI is learning" banner when new lessons appeared on the last run
  useEffect(() => {
    if (pipeline.newLessonIds && pipeline.newLessonIds.length > 0 && pipeline.runCount > 1) {
      setShowLearningBanner(true);
      const id = setTimeout(() => setShowLearningBanner(false), 6000);
      return () => clearTimeout(id);
    }
  }, [pipeline.runCount, pipeline.newLessonIds]);

  const fetchStats = useCallback(async () => {
    setStatsError(null);
    await teachMemory.fetchStats();
  }, [teachMemory]);

  useEffect(() => {
    if (teachMemory.stats) setStats(teachMemory.stats);
    if (teachMemory.error) setStatsError(teachMemory.error);
  }, [teachMemory.stats, teachMemory.error]);

  useEffect(() => { fetchStats(); }, []);

  const handleReset = () => {
    pipeline.reset();
    teachMemory.resetTeach();
    feedbackHook.reset();
    setTask("");
    setEditedCode("");
    fetchStats();
  };

  const handleRunPipeline = (feedback = null) => {
    pipeline.generate(task, lang, feedback);
  };

  const handleRunAgain = (feedback, wrongCode) => {
    feedbackHook.reset();
    fetchStats();
    pipeline.generate(task, lang, feedback, wrongCode);
  };

  const handleEditorMount = useCallback((editor) => {
    const modified = editor.getModifiedEditor();
    modified.onDidChangeModelContent(() => {
      setEditedCode(modified.getValue());
    });
  }, []);

  const canRun = task.trim().length > 0 && pipeline.phase !== "generating";

  return (
    <div style={{
      minHeight: "100vh", background: T.bg, color: T.textPri,
      fontFamily: T.ui, padding: "16px 20px",
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;700&family=Space+Mono:wght@400;700&display=swap');
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: ${T.bg}; }
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.55} }
        @keyframes fadeIn { from{opacity:0;transform:translateY(4px)} to{opacity:1;transform:none} }
        @keyframes slideDown { from{opacity:0;transform:translateY(-8px)} to{opacity:1;transform:none} }
        .blink { animation: pulse 1s step-end infinite; }
        textarea:focus, input:focus, select:focus { outline: 1px solid ${T.cyan}; }
        ::-webkit-scrollbar { width: 6px; height: 6px; }
        ::-webkit-scrollbar-track { background: ${T.surface}; }
        ::-webkit-scrollbar-thumb { background: ${T.border}; border-radius: 3px; }
      `}</style>

      {/* ================ HEADER ================ */}
      <header style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        marginBottom: 14, paddingBottom: 10,
        borderBottom: `1px solid ${T.border}`,
      }}>
        <div>
          <h1 style={{
            fontSize: 22, fontWeight: 700, fontFamily: T.ui,
            color: T.cyan, letterSpacing: 3,
          }}>
            {t.title}
          </h1>
          <div style={{ fontSize: 10, color: T.textSec, letterSpacing: 1 }}>
            {t.subtitle}
            {pipeline.runCount > 0 && (
              <span style={{ marginLeft: 12, color: T.amber }}>
                ┬╖ {t.runCount} #{pipeline.runCount}
              </span>
            )}
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button
            onClick={toggleLang}
            style={{
              padding: "6px 14px", background: T.surface2,
              border: `1px solid ${T.cyan}`, borderRadius: 3,
              color: T.cyan, fontFamily: T.ui, fontSize: 11, fontWeight: 700,
              cursor: "pointer", letterSpacing: 1,
            }}
          >
            {lang === "en" ? "≡ƒç╗≡ƒç│ VI" : "≡ƒç║≡ƒç╕ EN"}
          </button>
          <button
            onClick={toggleTheme}
            title={theme === "dark" ? "Switch to Light Mode" : "Switch to Dark Mode"}
            style={{
              padding: "6px 12px", background: T.surface2,
              border: `1px solid ${T.amber}`, borderRadius: 3,
              color: T.amber, display: "flex", alignItems: "center", justifyContent: "center",
              cursor: "pointer", transition: "all 0.2s ease",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = "scale(1.05)";
              e.currentTarget.style.boxShadow = `0 0 8px ${T.amber}44`;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = "scale(1)";
              e.currentTarget.style.boxShadow = "none";
            }}
          >
            {theme === "dark" ? (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
              </svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
              </svg>
            )}
          </button>
          <button
            onClick={handleReset}
            style={{
              padding: "6px 16px", background: "transparent",
              border: `1px solid ${T.border}`, borderRadius: 3,
              color: T.textSec, fontFamily: T.ui, fontSize: 11, cursor: "pointer",
            }}
          >
            {t.reset}
          </button>
        </div>
      </header>

      {/* ================ STEP INDICATOR ================ */}
      <StepIndicator activeStep={activeStep} t={t} />

      {/* ================ LEARNING BANNER ================ */}
      {showLearningBanner && (
        <div style={{
          marginBottom: 12, padding: "10px 14px",
          background: "rgba(57,255,20,0.08)",
          border: `1px solid ${T.green}`,
          borderRadius: 4, color: T.green,
          fontFamily: T.ui, fontSize: 12, fontWeight: 700,
          animation: "slideDown .4s",
          display: "flex", alignItems: "center", gap: 10,
        }}>
          <span style={{ fontSize: 16 }}>≡ƒºá</span>
          <div>
            <div>{t.learningBannerTitle}</div>
            <div style={{ fontSize: 10, color: T.textSec, fontWeight: 400 }}>
              {t.learningBannerBody}
            </div>
          </div>
        </div>
      )}

      {/* ================ PIPELINE ERROR BANNER ================ */}
      {pipeline.error && (
        <div style={{
          marginBottom: 12, padding: "8px 14px",
          background: T.surface2, border: `1px solid ${T.red}`,
          color: T.red, fontFamily: T.mono, fontSize: 12, borderRadius: 4,
        }}>
          ΓÜá {t.pipelineError}: {pipeline.error}
        </div>
      )}

      {/* ================ 3-COLUMN LAYOUT ================ */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "300px 1fr 360px",
        gap: 14,
        minHeight: "70vh",
      }}>

        {/* ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ LEFT COLUMN ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ */}
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{
            padding: 12, background: T.surface,
            border: `1px solid ${T.border}`, borderRadius: 4,
          }}>
            <label style={{
              display: "block", marginBottom: 6,
              color: T.cyan, fontSize: 10, fontWeight: 700, letterSpacing: 1,
            }}>
              {t.taskLabel}
            </label>
            <textarea
              value={task}
              onChange={(e) => setTask(e.target.value)}
              rows={6}
              placeholder={t.taskPlaceholder}
              style={{
                width: "100%", background: T.surface2, color: T.textPri,
                border: `1px solid ${T.border}`, borderRadius: 3, padding: 10,
                fontFamily: T.mono, fontSize: 12, resize: "vertical",
              }}
            />

            <label style={{
              display: "block", marginTop: 12, marginBottom: 4,
              color: T.cyan, fontSize: 10, fontWeight: 700, letterSpacing: 1,
            }}>
              {t.strategyLabel}
            </label>
            <select
              value={strategy}
              onChange={(e) => setStrategy(e.target.value)}
              style={{
                width: "100%", background: T.surface2, color: T.textPri,
                border: `1px solid ${T.border}`, borderRadius: 3, padding: "6px 8px",
                fontFamily: T.mono, fontSize: 12,
              }}
            >
              <option value="default">{t.strategyDefault}</option>
              <option value="strict">{t.strategyStrict}</option>
              <option value="concise">{t.strategyConcise}</option>
            </select>

            <button
              onClick={() => handleRunPipeline(null)}
              disabled={!canRun}
              style={{
                marginTop: 12, width: "100%", padding: "12px 0",
                background: canRun ? T.cyan : T.border,
                color: T.bg, border: "none", borderRadius: 3,
                fontFamily: T.ui, fontWeight: 700, fontSize: 13, cursor: canRun ? "pointer" : "not-allowed",
                letterSpacing: 1,
              }}
            >
              {pipeline.phase === "generating" ? t.generating : t.runPipeline}
            </button>

            {/* Sandbox run ΓÇö available once we have code */}
            {pipeline.code && (
              <button
                onClick={() => execution.execute(editedCode)}
                disabled={execution.isRunning}
                style={{
                  marginTop: 8, width: "100%", padding: "10px 0",
                  background: execution.isRunning ? T.border : T.green,
                  color: T.bg, border: "none", borderRadius: 3,
                  fontFamily: T.ui, fontWeight: 700, fontSize: 12, cursor: "pointer",
                  letterSpacing: 1,
                }}
              >
                {execution.isRunning ? t.running : t.runSandbox}
              </button>
            )}
          </div>

          {pipeline.phase === "generating" && <ScanlineLoader />}

          {/* Terminal output goes under the controls on the left */}
          <TerminalPanel
            stdout={execution.stdout}
            stderr={execution.stderr}
            exitCode={execution.exitCode}
            t={t}
          />

        </div>

        {/* ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ CENTER COLUMN ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ */}
        <div style={{ display: "flex", flexDirection: "column", gap: 12, minWidth: 0 }}>
          <div style={{
            flex: 1, border: `1px solid ${T.border}`, borderRadius: 4,
            overflow: "hidden", background: T.surface,
            display: "flex", flexDirection: "column",
          }}>
            <div style={{
              padding: "8px 14px", background: T.surface,
              borderBottom: `1px solid ${T.border}`,
              display: "flex", justifyContent: "space-between",
              fontFamily: T.ui, fontSize: 11, color: T.textSec,
            }}>
              <span>{t.aiGenerated}</span>
              <span style={{ color: T.cyan }}>{t.humanEditor}</span>
            </div>
            {pipeline.code ? (
              <DiffEditor
                height="55vh"
                language="python"
                original={pipeline.code || ""}
                modified={editedCode}
                onMount={handleEditorMount}
                theme={T.editorTheme}
                options={{
                  fontSize: 13,
                  fontFamily: "'JetBrains Mono', monospace",
                  minimap: { enabled: false },
                  readOnly: false,
                  originalEditable: false,
                  renderSideBySide: true,
                  scrollBeyondLastLine: false,
                }}
              />
            ) : (
              <div style={{
                padding: 40, textAlign: "center",
                fontFamily: T.mono, fontSize: 12, color: T.textSec,
                minHeight: "55vh", display: "flex",
                alignItems: "center", justifyContent: "center",
              }}>
                {t.noOutputYet}
              </div>
            )}
          </div>

          {/* Critic result below Monaco */}
          <CriticPanel critique={pipeline.critique} t={t} />
        </div>

        {/* ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ RIGHT COLUMN ΓÇö HITL CORE ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ */}
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <FeedbackPanel
            pipelineCode={pipeline.code}
            task={task}
            runId={pipeline.runId}
            feedbackHook={feedbackHook}
            onRunAgain={handleRunAgain}
            onLessonSaved={fetchStats}
            t={t}
          />

          <LessonsList
            lessons={pipeline.lessonsUsed}
            newLessonIds={pipeline.newLessonIds}
            t={t}
          />

          <PromptDebug bundle={pipeline.coderPrompt} t={t} />
        </div>
      </div>

      {/* ================ BOTTOM: RESEARCH DASHBOARD ================ */}
      <div style={{ marginTop: 16 }}>
        <ResearchDashboard stats={stats} statsError={statsError} t={t} />
      </div>
    </div>
  );
}
