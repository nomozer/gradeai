import { useEffect, useMemo, useState } from "react";
import { T } from "../../theme/tokens";
import type { EssayFile, I18nStrings } from "../../types";

// ---------------------------------------------------------------------------
// OriginalImageModal — shared lightbox for the student's raw bài làm.
//
// Used by step 3 (Xem xét) and step 4 (Chấm lại) so teachers can spot-check
// the AI's transcription against the original. Owns its own dataUrl → blob
// URL conversion + revoke lifecycle — callers just pass the EssayFile
// straight from workspace state.
//
// Why convert to a blob URL: <object data="data:application/pdf;base64,…">
// renders inconsistently across Chrome/Firefox/Safari. A blob URL works
// uniformly. For images we'd be fine with the dataUrl directly, but the
// branch isn't worth the extra code.
// ---------------------------------------------------------------------------

export interface OriginalImageModalProps {
  /** Whether the modal is open. Lets the caller own the trigger state. */
  open: boolean;
  /** Student's bài làm. The modal handles the empty / null case as a
   *  no-op so callers can render unconditionally without guards. */
  essayImage: EssayFile | null;
  onClose: () => void;
  t: I18nStrings;
}

export function OriginalImageModal({
  open,
  essayImage,
  onClose,
  t,
}: OriginalImageModalProps) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const sourceUrl = essayImage?.dataUrl || "";
  const sourceMime = useMemo(() => {
    const match = /^data:([^;]+);/i.exec(sourceUrl);
    return match?.[1]?.toLowerCase() || "";
  }, [sourceUrl]);
  const needsBlobUrl = /^data:[^;]+;base64,/i.test(sourceUrl);
  const isPdf = Boolean(
    essayImage?.isPdf ||
      sourceMime.includes("pdf") ||
      essayImage?.name?.toLowerCase().endsWith(".pdf")
  );
  const closeLabel = String(t.close);
  const originalImageLabel = String(t.originalImage);
  const openingLabel = String(t.originalImageOpening);
  const inlineErrorMessage = String(t.originalImageInlineError);
  const openNewTabLabel = String(t.originalImageOpenNewTab);

  useEffect(() => {
    if (!open || !sourceUrl) {
      setBlobUrl(null);
      setError(null);
      return undefined;
    }

    setBlobUrl(null);
    setError(null);

    const match = /^data:([^;]+);base64,(.+)$/i.exec(sourceUrl);
    if (!match) {
      setBlobUrl(sourceUrl);
      return undefined;
    }
    let url: string | null = null;
    try {
      const binary = atob(match[2]);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      url = URL.createObjectURL(new Blob([bytes], { type: match[1] }));
      setBlobUrl(url);
    } catch {
      setError(inlineErrorMessage);
      setBlobUrl(sourceUrl);
    }
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [inlineErrorMessage, open, sourceUrl]);

  if (!open || !essayImage) return null;
  const viewerUrl = blobUrl || (needsBlobUrl ? "" : sourceUrl);

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.78)",
        zIndex: 1000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
        animation: "fadeUp 0.2s ease-out",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          position: "relative",
          width: isPdf ? "92vw" : "auto",
          height: isPdf ? "92vh" : "auto",
          maxWidth: "92vw",
          maxHeight: "92vh",
          background: T.paper,
          borderRadius: 10,
          overflow: "hidden",
          boxShadow: "0 24px 60px rgba(0,0,0,0.5)",
        }}
      >
        <button
          onClick={onClose}
          style={{
            position: "absolute",
            top: 10,
            right: 10,
            width: 32,
            height: 32,
            borderRadius: "50%",
            background: "rgba(0,0,0,0.55)",
            border: "none",
            color: "#fff",
            cursor: "pointer",
            fontSize: 16,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1,
          }}
          title={closeLabel}
        >
          ×
        </button>
        {error && (
          <div
            style={{
              position: "absolute",
              left: 12,
              right: 56,
              top: 12,
              zIndex: 1,
              padding: "8px 10px",
              borderRadius: 8,
              background: "#fff7ed",
              color: "#9a3412",
              fontSize: 13,
            }}
          >
            {error}
          </div>
        )}
        {!viewerUrl ? (
          <div
            style={{
              minWidth: 320,
              minHeight: 180,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: 24,
              color: T.textMute,
            }}
          >
            {openingLabel}
          </div>
        ) : isPdf ? (
          <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column" }}>
            {/* Always-visible escape hatch above the embed. Some browsers /
                extensions block blob-PDF inside an <iframe> and just show a
                blank "content blocked" pane — when that happens the iframe
                gives no affordance to recover. This strip guarantees the
                teacher can always open/download the PDF even if the inline
                viewer is blocked. */}
            <div
              style={{
                flex: "0 0 auto",
                display: "flex",
                alignItems: "center",
                gap: 10,
                // Reserve room on the right so the absolute ✕ close button
                // (top:10 / right:10, 32px) doesn't sit on top of the
                // "Mở ở tab mới" link.
                padding: "8px 52px 8px 12px",
                background: T.bgElevated,
                borderBottom: `1px solid ${T.border}`,
                fontSize: 13,
                color: T.textSoft,
                fontFamily: T.font,
              }}
            >
              <span style={{ minWidth: 0, flex: 1 }}>{inlineErrorMessage}</span>
              <a
                href={viewerUrl}
                target="_blank"
                rel="noreferrer"
                style={{
                  flex: "0 0 auto",
                  borderRadius: 8,
                  background: T.accent,
                  color: "#fff",
                  padding: "6px 14px",
                  fontSize: 13,
                  fontWeight: 600,
                  textDecoration: "none",
                  whiteSpace: "nowrap",
                }}
              >
                {openNewTabLabel}
              </a>
            </div>
            {/* <object> renders blob PDFs where some browsers leave an
                <iframe> blank; the nested <iframe> is the fallback when
                <object> itself can't render. If both fail, the strip above
                still offers "open in new tab". */}
            <object
              data={viewerUrl}
              type="application/pdf"
              aria-label={originalImageLabel}
              style={{
                display: "block",
                width: "100%",
                flex: "1 1 auto",
                border: "none",
                background: "#fff",
              }}
            >
              <iframe
                src={viewerUrl}
                title={originalImageLabel}
                loading="eager"
                style={{
                  display: "block",
                  width: "100%",
                  height: "100%",
                  border: "none",
                  background: "#fff",
                }}
              />
            </object>
          </div>
        ) : (
          <img
            src={viewerUrl}
            alt={originalImageLabel}
            decoding="async"
            loading="eager"
            style={{
              display: "block",
              maxWidth: "92vw",
              maxHeight: "92vh",
              objectFit: "contain",
            }}
          />
        )}
        {/* Image branch keeps the corner "open in new tab" chip; the PDF
            branch already has its own escape strip above the iframe, so we
            skip it there to avoid two identical buttons. */}
        {viewerUrl && !isPdf && (
          <a
            href={viewerUrl}
            target="_blank"
            rel="noreferrer"
            style={{
              position: "absolute",
              right: 52,
              bottom: 12,
              zIndex: 1,
              borderRadius: 999,
              background: "rgba(0,0,0,0.58)",
              color: "#fff",
              padding: "7px 12px",
              fontSize: 13,
              textDecoration: "none",
            }}
          >
            {openNewTabLabel}
          </a>
        )}
      </div>
    </div>
  );
}
