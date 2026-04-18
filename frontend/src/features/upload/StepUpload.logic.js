import { isPdfFile, isImageFile } from "../../lib/file";

/**
 * Validate a prompt file (must be PDF).
 * Returns {ok: true} or {ok: false, error: string}.
 */
export function validateTaskFile(file, lang) {
  if (!file) return { ok: false, error: null };
  if (!isPdfFile(file)) {
    return {
      ok: false,
      error:
        lang === "vi"
          ? "Đề bài chỉ hỗ trợ định dạng PDF."
          : "Only PDF files are accepted for the exam prompt.",
    };
  }
  return { ok: true };
}

/**
 * Validate a student essay file (PDF or image).
 * Returns {ok: true, isPdf} or {ok: false, error}.
 */
export function validateEssayFile(file, t) {
  if (!file) return { ok: false, error: null };
  const isPdf = isPdfFile(file);
  const isImage = isImageFile(file);
  if (!isPdf && !isImage) {
    return { ok: false, error: t.uploadInvalidType };
  }
  return { ok: true, isPdf };
}
