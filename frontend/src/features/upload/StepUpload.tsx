import { useCallback, useRef, useState } from "react";
import { T } from "../../theme/tokens";
import { Icon } from "../../components/ui/Icon";
import { SubjectChip } from "../../components/ui/SubjectChip";
import { readFileAsDataUrl, readOptimizedUploadDataUrl } from "../../lib/file";
import { validateTaskFile, validateEssayFile } from "./StepUpload.logic";
import { useIsMobile } from "../../hooks/useIsMobile";
import type { BackendSubject, EssayFile, I18nStrings, TaskFile } from "../../types";
import type { DetectConfidence } from "../../api";

interface StepUploadProps {
  taskPdf: TaskFile | null;
  setTaskPdf: (value: TaskFile | null) => void;
  essayImage: EssayFile | null;
  setEssayImage: (value: EssayFile | null) => void;
  answerKeyPdf: TaskFile | null;
  setAnswerKeyPdf: (value: TaskFile | null) => void;
  onSubmit: () => void;
  canSubmit: boolean;
  t: I18nStrings;
  // Subject autodetect — parent fires /api/detect-subject on each new task
  // PDF and feeds the verdict in here. StepUpload only renders the chip;
  // it never calls the detection endpoint itself, so the same chip can be
  // reused from any future surface (regrade step, history reload, etc.)
  // without duplicating the fetch logic.
  subject: BackendSubject | null;
  detectedSubject: BackendSubject | null;
  subjectConfidence: DetectConfidence | null;
  subjectDetecting: boolean;
  subjectDetectError: string | null;
  manualSubject: boolean;
  onSubjectChange: (code: BackendSubject) => void;
  onBatchEssayUpload?: (files: File[]) => void;
}

const fileButtonBaseStyle = {
  position: "relative" as const,
  overflow: "hidden" as const,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  cursor: "pointer",
  userSelect: "none" as const,
};

const hiddenFileInputStyle = {
  position: "fixed" as const,
  left: -10000,
  top: 0,
  width: 1,
  height: 1,
  opacity: 0,
};

function openFilePicker(ref: { current: HTMLInputElement | null }) {
  const input = ref.current;
  if (!input) return;
  input.value = "";
  try {
    if (typeof input.showPicker === "function") {
      input.showPicker();
      return;
    }
  } catch {
    // Fall back to click below for browsers that expose but reject showPicker.
  }
  input.click();
}

export function StepUpload({
  taskPdf,
  setTaskPdf,
  essayImage,
  setEssayImage,
  answerKeyPdf,
  setAnswerKeyPdf,
  onSubmit,
  canSubmit,
  t,
  subject,
  detectedSubject,
  subjectConfidence,
  subjectDetecting,
  subjectDetectError,
  manualSubject,
  onSubjectChange,
  onBatchEssayUpload,
}: StepUploadProps) {
  const taskInputRef = useRef<HTMLInputElement | null>(null);
  const essayInputRef = useRef<HTMLInputElement | null>(null);
  const answerKeyInputRef = useRef<HTMLInputElement | null>(null);
  const [dragOverTask, setDragOverTask] = useState(false);
  const [dragOverEssay, setDragOverEssay] = useState(false);
  const [dragOverAnswerKey, setDragOverAnswerKey] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  
  const isMobile = useIsMobile();
  const [hoveredZone, setHoveredZone] = useState<"task" | "essay" | "answerKey" | null>(null);
  const [hoveredSubmit, setHoveredSubmit] = useState(false);

  const handleTaskFile = useCallback(
    async (file: File | null | undefined) => {
      const check = validateTaskFile(file);
      if (!check.ok) {
        setUploadError(check.error);
        return;
      }
      try {
        const dataUrl = await readFileAsDataUrl(file as File);
        setUploadError(null);
        setTaskPdf({ dataUrl, name: (file as File).name });
      } catch {
        setUploadError(String(t.uploadReadError ?? ""));
      }
    },
    [setTaskPdf, t.uploadReadError],
  );

  const handleEssayFile = useCallback(
    async (file: File | null | undefined) => {
      const check = validateEssayFile(file, t);
      if (!check.ok) {
        setUploadError(check.error);
        return;
      }
      try {
        const dataUrl = await readOptimizedUploadDataUrl(file as File);
        if (!dataUrl) {
          setUploadError(String(t.uploadReadError ?? ""));
          return;
        }
        setUploadError(null);
        setEssayImage({
          dataUrl,
          name: (file as File).name,
          isPdf: !!check.isPdf,
        });
      } catch {
        setUploadError(String(t.uploadReadError ?? ""));
      }
    },
    [setEssayImage, t],
  );

  const handleAnswerKeyFile = useCallback(
    async (file: unknown) => {
      const f = file as File;
      if (!f) return;
      const isPdf = f.type === "application/pdf" || f.name.endsWith(".pdf");
      if (!isPdf) {
        setUploadError(String(t.uploadInvalidType ?? "Chỉ hỗ trợ file PDF cho đáp án."));
        return;
      }
      try {
        const dataUrl = await readFileAsDataUrl(f);
        setUploadError(null);
        setAnswerKeyPdf({ dataUrl, name: f.name });
      } catch {
        setUploadError(String(t.uploadReadError ?? ""));
      }
    },
    [setAnswerKeyPdf, t],
  );

  return (
    <div
      style={{
        maxWidth: T.width.form,
        margin: "0 auto",
        padding: "0 16px 24px",
        boxSizing: "border-box",
      }}
    >
      {/* ── Title & Intro Header ── */}
      <div style={{ textAlign: "center", marginBottom: 32, marginTop: 12 }}>
        <h2
          style={{
            fontFamily: T.display,
            fontSize: 28,
            fontWeight: 800,
            color: T.text,
            letterSpacing: "-0.02em",
            margin: "0 0 10px 0",
          }}
        >
          {String(t.step1Title ?? "Tải Bài Lên")}
        </h2>
        <p
          style={{
            fontFamily: T.font,
            fontSize: 15,
            color: T.textSoft,
            margin: 0,
            opacity: 0.8,
            lineHeight: 1.5,
          }}
        >
          {String(t.step1Desc ?? "Nhập đề bài và ảnh bài làm của học sinh để bắt đầu chấm điểm")}
        </p>
      </div>

      <div
        style={{
          display: isMobile ? "flex" : "grid",
          flexDirection: isMobile ? "column" : undefined,
          gridTemplateColumns: isMobile ? undefined : "1fr 1fr",
          alignItems: "stretch",
          gap: 24,
          marginBottom: 24,
        }}
      >
        {/* ── Card 1: Task PDF Upload Card ── */}
        <div
          onMouseEnter={() => setHoveredZone("task")}
          onMouseLeave={() => setHoveredZone(null)}
          style={{
            background: T.bgCard,
            border: `1px solid ${hoveredZone === "task" ? T.accent : T.border}`,
            borderRadius: 20,
            padding: 24,
            display: "flex",
            flexDirection: "column",
            gap: 20,
            boxShadow: T.shadowSoft,
            transition: "border-color 0.15s ease",
            boxSizing: "border-box",
            position: "relative",
          }}
        >
          {/* Badge Header Row */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                background: "rgba(59, 79, 138, 0.06)",
                color: T.accent,
                padding: "4px 10px",
                borderRadius: 999,
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: "0.05em",
                textTransform: "uppercase",
              }}
            >
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: T.accent, display: "inline-block" }} />
              {String(t.promptLabel ?? "Đề Bài")}
            </div>
            {taskPdf && (
              <button
                type="button"
                onClick={() => setTaskPdf(null)}
                style={{
                  background: "rgba(184, 66, 58, 0.08)",
                  border: "none",
                  borderRadius: 999,
                  width: 24,
                  height: 24,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: "pointer",
                  color: T.red,
                  transition: "all 0.2s",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = "rgba(184, 66, 58, 0.15)";
                  e.currentTarget.style.transform = "scale(1.1)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "rgba(184, 66, 58, 0.08)";
                  e.currentTarget.style.transform = "scale(1)";
                }}
                title="Xóa tệp"
              >
                <Icon.X size={12} color={T.red} />
              </button>
            )}
          </div>
          
          {/* Drag & Drop Area */}
          {!taskPdf ? (
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragOverTask(true);
              }}
              onDragLeave={() => setDragOverTask(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragOverTask(false);
                handleTaskFile(e.dataTransfer.files?.[0]);
              }}
              onClick={() => openFilePicker(taskInputRef)}
              style={{
                position: "relative",
                border: dragOverTask ? `2px solid ${T.accent}` : `2px dashed ${T.border}`,
                borderRadius: 12,
                padding: "36px 16px",
                textAlign: "center",
                cursor: "pointer",
                userSelect: "none",
                transition: "all 0.25s ease",
                background: dragOverTask
                  ? "linear-gradient(135deg, rgba(59,79,138,0.04), rgba(59,79,138,0.10))"
                  : hoveredZone === "task"
                    ? "rgba(59, 79, 138, 0.01)"
                    : "rgba(44, 46, 58, 0.01)",
                boxShadow: dragOverTask ? `0 0 0 3px ${T.accentSoft}, 0 4px 16px ${T.accentSoft}` : "none",
                display: "block",
              }}
            >
              <input
                ref={taskInputRef}
                type="file"
                accept=".pdf,application/pdf"
                style={hiddenFileInputStyle}
                onChange={(e) => {
                  handleTaskFile(e.target.files?.[0]);
                  e.target.value = "";
                }}
              />
              <div
                style={{
                  width: 48,
                  height: 48,
                  borderRadius: "50%",
                  background: dragOverTask ? "rgba(59, 79, 138, 0.12)" : "rgba(59, 79, 138, 0.05)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  marginBottom: 12,
                  color: T.accent,
                  transition: "background-color 0.15s ease",
                  marginLeft: "auto",
                  marginRight: "auto",
                }}
              >
                <Icon.FileText size={22} color={T.accent} />
              </div>
              <div
                style={{
                  fontSize: 13,
                  color: T.textSoft,
                  fontWeight: 600,
                  lineHeight: 1.4,
                }}
              >
                {dragOverTask ? "Thả file để tải lên!" : String(t.promptDrop ?? "Thả file PDF đề bài vào đây")}
              </div>
            </div>
          ) : (
            <div
              style={{
                borderRadius: 12,
                background: "linear-gradient(135deg, #FFFDF8 0%, #FAF8F2 100%)",
                border: `1px solid ${T.borderLight}`,
                padding: "20px 16px",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                boxShadow: "inset 0 1px 2px rgba(0,0,0,0.02)",
              }}
            >
              <div
                style={{
                  width: 52,
                  height: 64,
                  borderRadius: 8,
                  background: `linear-gradient(135deg, ${T.red} 0%, #9B3530 100%)`,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "white",
                  boxShadow: `0 6px 16px rgba(184, 66, 58, 0.2)`,
                  position: "relative",
                  overflow: "hidden",
                  marginBottom: 12,
                }}
              >
                <div
                  style={{
                    position: "absolute",
                    top: 0,
                    right: 0,
                    width: 16,
                    height: 16,
                    background: "rgba(255,255,255,0.2)",
                    clipPath: "polygon(0 0, 100% 100%, 0 100%)",
                  }}
                />
                <Icon.FileText size={22} color="white" />
                <div
                  style={{
                    fontSize: 9,
                    fontWeight: 800,
                    marginTop: 4,
                    letterSpacing: "0.1em",
                  }}
                >
                  PDF
                </div>
              </div>
              <div
                style={{
                  fontSize: 14,
                  fontWeight: 700,
                  color: T.text,
                  textAlign: "center",
                  maxWidth: "100%",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  padding: "0 8px",
                  marginBottom: 12,
                }}
                title={taskPdf.name}
              >
                {taskPdf.name}
              </div>
              <button
                type="button"
                onClick={() => openFilePicker(taskInputRef)}
                style={{
                  ...fileButtonBaseStyle,
                  background: "transparent",
                  border: `1px solid ${T.accent}`,
                  color: T.accent,
                  borderRadius: 999,
                  padding: "4px 12px",
                  fontFamily: T.font,
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: "0.03em",
                  textTransform: "uppercase",
                  transition: "all 0.2s",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = T.accentSoft;
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "transparent";
                }}
              >
                {String(t.promptChange ?? "Thay đổi tệp")}
              </button>
              <input
                ref={taskInputRef}
                type="file"
                accept=".pdf,application/pdf"
                style={hiddenFileInputStyle}
                onChange={(e) => {
                  handleTaskFile(e.target.files?.[0]);
                  e.target.value = "";
                }}
              />
            </div>
          )}

          {/* Integrated Autodetect Subject Area */}
          <div
            style={{
              borderTop: `1px dashed ${T.border}`,
              paddingTop: 16,
              display: "flex",
              flexDirection: "column",
              gap: 8,
            }}
          >
            <div
              style={{
                fontSize: 11,
                fontWeight: 700,
                color: T.textMute,
                letterSpacing: "0.05em",
                textTransform: "uppercase",
              }}
            >
              Phát Hiện Môn Học
            </div>
            <div>
              <SubjectChip
                subject={subject}
                detected={detectedSubject}
                confidence={subjectConfidence}
                loading={subjectDetecting}
                idle={!taskPdf}
                manualOverride={manualSubject}
                onChange={onSubjectChange}
              />
              {subjectDetectError && (
                <div
                  style={{
                    marginTop: 8,
                    fontSize: 12,
                    color: T.red,
                    lineHeight: 1.4,
                  }}
                >
                  {subjectDetectError}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── Card 2: Essay Image/PDF Upload Card ── */}
        <div
          onMouseEnter={() => setHoveredZone("essay")}
          onMouseLeave={() => setHoveredZone(null)}
          style={{
            background: T.bgCard,
            border: `1px solid ${hoveredZone === "essay" ? T.green : T.border}`,
            borderRadius: 20,
            padding: 24,
            display: "flex",
            flexDirection: "column",
            gap: 20,
            boxShadow: T.shadowSoft,
            transition: "border-color 0.15s ease",
            boxSizing: "border-box",
            position: "relative",
          }}
        >
          {/* Badge Header Row */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                background: "rgba(46, 125, 91, 0.06)",
                color: T.green,
                padding: "4px 10px",
                borderRadius: 999,
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: "0.05em",
                textTransform: "uppercase",
              }}
            >
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: T.green, display: "inline-block" }} />
              {String(t.imageLabel ?? "Bài Làm Học Sinh")}
            </div>
            {essayImage && (
              <button
                type="button"
                onClick={() => setEssayImage(null)}
                style={{
                  background: "rgba(184, 66, 58, 0.08)",
                  border: "none",
                  borderRadius: 999,
                  width: 24,
                  height: 24,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: "pointer",
                  color: T.red,
                  transition: "all 0.2s",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = "rgba(184, 66, 58, 0.15)";
                  e.currentTarget.style.transform = "scale(1.1)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "rgba(184, 66, 58, 0.08)";
                  e.currentTarget.style.transform = "scale(1)";
                }}
                title="Xóa tệp"
              >
                <Icon.X size={12} color={T.red} />
              </button>
            )}
          </div>
          
          {/* Drag & Drop Area */}
          {!essayImage ? (
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragOverEssay(true);
              }}
              onDragLeave={() => setDragOverEssay(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragOverEssay(false);
                if (e.dataTransfer.files && e.dataTransfer.files.length > 1) {
                  const filesArr = Array.from(e.dataTransfer.files);
                  handleEssayFile(filesArr[0]);
                  onBatchEssayUpload?.(filesArr.slice(1));
                } else {
                  handleEssayFile(e.dataTransfer.files?.[0]);
                }
              }}
              onClick={() => openFilePicker(essayInputRef)}
              style={{
                position: "relative",
                border: dragOverEssay ? `2px solid ${T.green}` : `2px dashed ${T.border}`,
                borderRadius: 12,
                padding: "36px 16px",
                textAlign: "center",
                cursor: "pointer",
                userSelect: "none",
                transition: "all 0.25s ease",
                background: dragOverEssay
                  ? "linear-gradient(135deg, rgba(46,125,91,0.04), rgba(46,125,91,0.10))"
                  : hoveredZone === "essay"
                    ? "rgba(46, 125, 91, 0.01)"
                    : "rgba(44, 46, 58, 0.01)",
                boxShadow: dragOverEssay ? `0 0 0 3px ${T.greenSoft}, 0 4px 16px ${T.greenSoft}` : "none",
                display: "block",
              }}
            >
              <input
                ref={essayInputRef}
                type="file"
                accept="image/*,.pdf,application/pdf"
                multiple
                style={hiddenFileInputStyle}
                onChange={(e) => {
                  if (e.target.files && e.target.files.length > 1) {
                    const filesArr = Array.from(e.target.files);
                    handleEssayFile(filesArr[0]);
                    onBatchEssayUpload?.(filesArr.slice(1));
                  } else {
                    handleEssayFile(e.target.files?.[0]);
                  }
                  e.target.value = "";
                }}
              />
              <div
                style={{
                  width: 48,
                  height: 48,
                  borderRadius: "50%",
                  background: dragOverEssay ? "rgba(46, 125, 91, 0.12)" : "rgba(46, 125, 91, 0.05)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  marginBottom: 12,
                  color: T.green,
                  transition: "background-color 0.15s ease",
                  marginLeft: "auto",
                  marginRight: "auto",
                }}
              >
                <Icon.Upload size={22} color={T.green} />
              </div>
              <div
                style={{
                  fontSize: 13,
                  color: T.textSoft,
                  fontWeight: 600,
                  lineHeight: 1.4,
                }}
              >
                {dragOverEssay ? "Thả file để tải lên!" : String(t.imageDrop ?? "Thả ảnh hoặc PDF bài làm vào đây")}
              </div>
            </div>
          ) : (
            <div
              style={{
                borderRadius: 12,
                background: "linear-gradient(135deg, #FFFDF8 0%, #FAF8F2 100%)",
                border: `1px solid ${T.borderLight}`,
                padding: "16px 16px",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                boxShadow: "inset 0 1px 2px rgba(0,0,0,0.02)",
              }}
            >
              {essayImage.isPdf ? (
                <div
                  style={{
                    width: 52,
                    height: 64,
                    borderRadius: 8,
                    background: `linear-gradient(135deg, ${T.red} 0%, #9B3530 100%)`,
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "white",
                    boxShadow: `0 6px 16px rgba(184, 66, 58, 0.2)`,
                    position: "relative",
                    overflow: "hidden",
                    marginBottom: 12,
                  }}
                >
                  <div
                    style={{
                      position: "absolute",
                      top: 0,
                      right: 0,
                      width: 16,
                      height: 16,
                      background: "rgba(255,255,255,0.2)",
                      clipPath: "polygon(0 0, 100% 100%, 0 100%)",
                    }}
                  />
                  <Icon.FileText size={22} color="white" />
                  <div
                    style={{
                      fontSize: 9,
                      fontWeight: 800,
                      marginTop: 4,
                      letterSpacing: "0.1em",
                    }}
                  >
                    PDF
                  </div>
                </div>
              ) : (
                <div
                  style={{
                    position: "relative",
                    borderRadius: 10,
                    overflow: "hidden",
                    boxShadow: "0 4px 20px rgba(44, 46, 58, 0.12)",
                    border: `1px solid ${T.border}`,
                    marginBottom: 12,
                    width: "100%",
                    maxWidth: 220,
                    aspectRatio: "3 / 2",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    background: T.bg,
                  }}
                >
                  <img
                    src={essayImage.dataUrl}
                    alt={essayImage.name}
                    style={{
                      maxHeight: "100%",
                      maxWidth: "100%",
                      objectFit: "contain",
                      display: "block",
                    }}
                  />
                </div>
              )}
              <div
                style={{
                  fontSize: 14,
                  fontWeight: 700,
                  color: T.text,
                  textAlign: "center",
                  maxWidth: "100%",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  padding: "0 8px",
                  marginBottom: 12,
                }}
                title={essayImage.name}
              >
                {essayImage.name}
              </div>
              <button
                type="button"
                onClick={() => openFilePicker(essayInputRef)}
                style={{
                  ...fileButtonBaseStyle,
                  background: "transparent",
                  border: `1px solid ${T.green}`,
                  color: T.green,
                  borderRadius: 999,
                  padding: "4px 12px",
                  fontFamily: T.font,
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: "0.03em",
                  textTransform: "uppercase",
                  transition: "all 0.2s",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = T.greenSoft;
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "transparent";
                }}
              >
                {String(t.imageChange ?? "Thay đổi tệp")}
              </button>
              <input
                ref={essayInputRef}
                type="file"
                accept="image/*,.pdf,application/pdf"
                style={hiddenFileInputStyle}
                onChange={(e) => {
                  handleEssayFile(e.target.files?.[0]);
                  e.target.value = "";
                }}
              />
            </div>
          )}

          {/* Integrated Status / Support Tip Area */}
          <div
            style={{
              borderTop: `1px dashed ${T.border}`,
              paddingTop: 16,
              display: "flex",
              flexDirection: "column",
              gap: 8,
            }}
          >
            <div
              style={{
                fontSize: 11,
                fontWeight: 700,
                color: T.textMute,
                letterSpacing: "0.05em",
                textTransform: "uppercase",
              }}
            >
              Trạng Thái Tệp
            </div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                fontSize: 12,
                color: essayImage ? T.green : T.textSoft,
                fontStyle: "italic",
                padding: "4px 0",
              }}
            >
              {essayImage ? (
                <>
                  <Icon.Check size={12} color={T.green} />
                  <span>Đã tải lên tệp thành công.</span>
                </>
              ) : (
                <>
                  <span style={{ width: 6, height: 6, borderRadius: "50%", background: T.textFaint, display: "inline-block" }} />
                  <span>Hỗ trợ file PDF hoặc ảnh (PNG, JPG).</span>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── Card 3: Redesigned Answer Key / Bareme Section (Horizontal) ── */}
      <div
        onMouseEnter={() => setHoveredZone("answerKey")}
        onMouseLeave={() => setHoveredZone(null)}
        style={{
          background: T.bgCard,
          border: `1px solid ${answerKeyPdf ? T.amber : hoveredZone === "answerKey" ? T.amber : T.border}`,
          borderRadius: 16,
          padding: "16px 20px",
          marginBottom: 32,
          boxShadow: T.shadowSoft,
          transition: "all 0.2s ease",
          boxSizing: "border-box",
          position: "relative",
          display: "flex",
          flexDirection: isMobile ? "column" : "row",
          alignItems: isMobile ? "stretch" : "center",
          justifyContent: "space-between",
          gap: 16,
        }}
      >
        {!answerKeyPdf ? (
          <>
            <div style={{ display: "flex", alignItems: "center", gap: 16, flex: 1, minWidth: 0 }}>
              <div
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 10,
                  background: "rgba(192, 139, 48, 0.08)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                <Icon.FileText size={20} color={T.amber} />
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span
                    style={{
                      fontFamily: T.display,
                      fontSize: 14,
                      fontWeight: 700,
                      color: T.text,
                    }}
                  >
                    {String(t.answerKeyLabel ?? "Đáp Án & Hướng Dẫn Chấm")}
                  </span>
                  <span
                    style={{
                      fontSize: 10,
                      fontWeight: 700,
                      color: T.textMute,
                      background: T.bgMuted,
                      padding: "2px 6px",
                      borderRadius: 4,
                      textTransform: "uppercase",
                      letterSpacing: "0.03em",
                    }}
                  >
                    {String(t.optionalLabel ?? "Tùy chọn")}
                  </span>
                </div>
                <p
                  style={{
                    fontFamily: T.font,
                    fontSize: 12,
                    color: T.textSoft,
                    margin: 0,
                    lineHeight: 1.4,
                  }}
                >
                  {String(t.answerKeyDesc ?? "Tải file PDF đáp án chính thức (bareme) để AI chấm điểm chính xác và sát với yêu cầu của giáo viên.")}
                </p>
              </div>
            </div>

            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragOverAnswerKey(true);
              }}
              onDragLeave={() => setDragOverAnswerKey(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragOverAnswerKey(false);
                const file = e.dataTransfer?.files?.[0];
                if (file) handleAnswerKeyFile(file);
              }}
              onClick={() => openFilePicker(answerKeyInputRef)}
              style={{
                position: "relative",
                border: `2px dashed ${dragOverAnswerKey ? T.amber : T.border}`,
                borderRadius: 10,
                padding: "8px 16px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
                cursor: "pointer",
                userSelect: "none",
                background: dragOverAnswerKey
                  ? "rgba(192, 139, 48, 0.04)"
                  : hoveredZone === "answerKey"
                    ? "rgba(192, 139, 48, 0.01)"
                    : "transparent",
                transition: "all 0.15s ease",
                minWidth: isMobile ? undefined : 150,
                boxSizing: "border-box",
              }}
            >
              <input
                ref={answerKeyInputRef}
                type="file"
                accept=".pdf"
                style={hiddenFileInputStyle}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleAnswerKeyFile(file);
                  e.target.value = "";
                }}
              />
              <Icon.Upload size={14} color={T.amber} />
              <span style={{ fontSize: 13, fontWeight: 700, color: T.textSoft }}>
                {String(t.uploadFileBtn ?? "Tải PDF lên")}
              </span>
            </div>
          </>
        ) : (
          <>
            <div style={{ display: "flex", alignItems: "center", gap: 16, flex: 1, minWidth: 0 }}>
              <div
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 10,
                  background: "rgba(192, 139, 48, 0.08)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                <Icon.Check size={20} color={T.amber} />
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span
                    style={{
                      fontFamily: T.display,
                      fontSize: 14,
                      fontWeight: 700,
                      color: T.text,
                    }}
                  >
                    {String(t.answerKeyUploadedTitle ?? "Đã tích hợp Đáp án")}
                  </span>
                  <span
                    style={{
                      fontSize: 10,
                      fontWeight: 700,
                      color: "#FFFFFF",
                      background: T.amber,
                      padding: "2px 6px",
                      borderRadius: 4,
                      textTransform: "uppercase",
                      letterSpacing: "0.03em",
                    }}
                  >
                    {String(t.activeLabel ?? "Đang dùng")}
                  </span>
                </div>
                <div
                  style={{
                    fontFamily: T.font,
                    fontSize: 12,
                    color: T.textSoft,
                    fontWeight: 600,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    maxWidth: isMobile ? "100%" : "380px",
                  }}
                  title={answerKeyPdf.name}
                >
                  {answerKeyPdf.name}
                </div>
              </div>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
              <button
                type="button"
                onClick={() => openFilePicker(answerKeyInputRef)}
                style={{
                  ...fileButtonBaseStyle,
                  fontFamily: T.font,
                  fontSize: 12,
                  fontWeight: 700,
                  color: T.textSoft,
                  background: "transparent",
                  border: `1px solid ${T.border}`,
                  borderRadius: 8,
                  padding: "8px 16px",
                  transition: "all 0.15s",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = T.bgHover;
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "transparent";
                }}
              >
                {String(t.answerKeyChange ?? "Đổi đáp án")}
              </button>
              <input
                ref={answerKeyInputRef}
                type="file"
                accept=".pdf"
                style={hiddenFileInputStyle}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleAnswerKeyFile(file);
                  e.target.value = "";
                }}
              />
              <button
                type="button"
                onClick={() => setAnswerKeyPdf(null)}
                style={{
                  background: "rgba(184, 66, 58, 0.08)",
                  border: "none",
                  borderRadius: 8,
                  width: 32,
                  height: 32,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: "pointer",
                  color: T.red,
                  transition: "all 0.2s",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = "rgba(184, 66, 58, 0.15)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "rgba(184, 66, 58, 0.08)";
                }}
                title="Xóa đáp án"
              >
                <Icon.X size={14} color={T.red} />
              </button>
            </div>
          </>
        )}
      </div>

      {uploadError && (
        <div
          style={{
            fontSize: 14,
            color: T.red,
            background: "rgba(184, 66, 58, 0.06)",
            border: `1px solid ${T.red}`,
            borderRadius: 8,
            padding: "10px 14px",
            lineHeight: 1.4,
            marginBottom: 24,
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          <Icon.AlertTriangle size={14} color={T.red} />
          <span>{uploadError}</span>
        </div>
      )}

      {/* Submit Button */}
      <button
        onClick={onSubmit}
        disabled={!canSubmit}
        onMouseEnter={() => setHoveredSubmit(true)}
        onMouseLeave={() => setHoveredSubmit(false)}
        style={{
          width: "100%",
          padding: "16px 24px",
          fontSize: 16,
          fontWeight: 700,
          color: "#FFFFFF",
          background: canSubmit
            ? hoveredSubmit
              ? `linear-gradient(135deg, ${T.accentLight} 0%, ${T.accent} 100%)`
              : `linear-gradient(135deg, ${T.accent} 0%, ${T.accentLight} 100%)`
            : "rgba(44, 46, 58, 0.04)",
          border: `1px solid ${canSubmit ? "transparent" : T.border}`,
          borderRadius: 12,
          cursor: canSubmit ? "pointer" : "not-allowed",
          boxShadow: "none",
          transition: "background-color 0.15s ease, opacity 0.15s ease",
          fontFamily: `"Inter", "Outfit", system-ui, -apple-system, sans-serif`,
          opacity: canSubmit ? 1 : 0.6,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
          <Icon.Bot size={18} color={canSubmit ? "#FFFFFF" : T.textFaint} />
          <span style={{ color: canSubmit ? "#FFFFFF" : T.textMute }}>
            {String(t.startGrading ?? "Bắt Đầu Chấm")}
          </span>
        </div>
      </button>
    </div>
  );
}
