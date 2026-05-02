import { isPdfFile, isImageFile } from "../../lib/file";
import type { I18nStrings } from "../../types";

export type ValidationResult = { ok: true; isPdf?: boolean } | { ok: false; error: string | null };

export function validateTaskFile(file: File | null | undefined): ValidationResult {
  if (!file) return { ok: false, error: null };
  if (!isPdfFile(file)) {
    return { ok: false, error: "Đề bài chỉ hỗ trợ định dạng PDF." };
  }
  return { ok: true };
}

/**
 * Validate a student essay file (PDF or image).
 */
export function validateEssayFile(file: File | null | undefined, t: I18nStrings): ValidationResult {
  if (!file) return { ok: false, error: null };
  const isPdf = isPdfFile(file);
  const isImage = isImageFile(file);
  if (!isPdf && !isImage) {
    return { ok: false, error: String(t.uploadInvalidType ?? "Invalid file") };
  }
  return { ok: true, isPdf };
}
