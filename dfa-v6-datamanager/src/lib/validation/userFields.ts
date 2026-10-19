/**
 * Client-side checks aligned with `AdminCreateUserRequest` / `AdminUpdateUserRequest`
 * in dfa-toolkit-api (`apps/app_db/schemas/users.py`).
 */

const CREATE_USERNAME_MIN = 3;
const CREATE_USERNAME_MAX = 50;
const CREATE_FIRST_NAME_MAX = 100;
const CREATE_LAST_NAME_MAX = 100;

/** Pragmatic email shape (local@domain.tld) — close to backend `EmailStr`. */
export function isValidUserEmail(email: string): boolean {
  const v = email.trim();
  if (!v) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i.test(v);
}

export type CreateUserClientErrorCode =
  | "USERNAME_TOO_SHORT"
  | "USERNAME_TOO_LONG"
  | "FIRST_NAME_TOO_LONG"
  | "LAST_NAME_TOO_LONG"
  | "EMAIL_INVALID";

export function validateCreateUserClient(input: {
  username: string;
  first_name: string;
  last_name: string;
  email: string;
}): CreateUserClientErrorCode | null {
  const u = input.username.trim();
  const fn = input.first_name.trim();
  const ln = input.last_name.trim();
  const em = input.email.trim();
  if (u.length < CREATE_USERNAME_MIN) return "USERNAME_TOO_SHORT";
  if (u.length > CREATE_USERNAME_MAX) return "USERNAME_TOO_LONG";
  if (fn.length > CREATE_FIRST_NAME_MAX) return "FIRST_NAME_TOO_LONG";
  if (ln.length > CREATE_LAST_NAME_MAX) return "LAST_NAME_TOO_LONG";
  if (!isValidUserEmail(em)) return "EMAIL_INVALID";
  return null;
}

/** FastAPI / Pydantic `validation_errors` list under `errors`. */
export function extractApiValidationMessages(
  errors: Record<string, unknown> | undefined
): string | null {
  if (!errors) return null;
  const raw = errors.validation_errors;
  if (!Array.isArray(raw)) return null;
  const parts: string[] = [];
  for (const item of raw) {
    if (item && typeof item === "object" && "msg" in item) {
      const m = (item as { msg?: unknown }).msg;
      if (typeof m === "string" && m.trim()) parts.push(m.trim());
    }
  }
  return parts.length ? parts.join(" ") : null;
}
