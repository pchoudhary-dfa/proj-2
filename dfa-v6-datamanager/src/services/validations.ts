import { MANUAL_GID_INVALID_CHARS_REGEX } from "@/lib/constants";
export function sanitizeManualGidInput(gid: string): string {
  return gid.replace(MANUAL_GID_INVALID_CHARS_REGEX, "");
}