import { ApiError } from "../../api/client";

// Small formatting/error helpers shared across the admin sections.

export function errText(err: unknown, fallback: string): string {
  return err instanceof ApiError ? err.detail || fallback : fallback;
}

/** "1.234.567" — Vietnamese thousands grouping for token counts. */
export function fmtNum(n: number | undefined): string {
  return (n || 0).toLocaleString("vi-VN");
}

/** Quota display: 0 (or unset) means no cap. */
export function fmtQuota(q: number | undefined): string {
  return q && q > 0 ? fmtNum(q) : "Không giới hạn";
}
