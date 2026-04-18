/**
 * Pure file utilities — no React, no DOM globals beyond FileReader.
 */

export function isPdfFile(file) {
  if (!file) return false;
  return (
    file.type === "application/pdf" ||
    file.name.toLowerCase().endsWith(".pdf")
  );
}

export function isImageFile(file) {
  return !!file && typeof file.type === "string" && file.type.startsWith("image/");
}

export function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error || new Error("read failed"));
    reader.readAsDataURL(file);
  });
}
