const USERNAME_RE = /^[a-z0-9]{3,32}$/;

export const USERNAME_HELP_TEXT =
  "Chỉ dùng chữ thường không dấu và số, 3-32 ký tự. Ví dụ: gv001, admin01.";

export function normalizeUsername(value: string): string {
  return value.trim().toLowerCase();
}

export function validateUsername(value: string): string | null {
  const username = normalizeUsername(value);
  if (!username) return "Tên đăng nhập không được để trống.";
  if (!USERNAME_RE.test(username)) return USERNAME_HELP_TEXT;
  return null;
}
