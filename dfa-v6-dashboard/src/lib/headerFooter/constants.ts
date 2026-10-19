import { DEFAULT_DASH_FAVICON, DEFAULT_LOGIN_LOGO } from "@/lib/constants";

export const HEADER_FOOTER_LOGO_OPTIONS = [
  { value: "", label: "Select logo...", src: "" },
  {
    value: "dfa_dash_logo",
    label: "DFA Dashboard Logo",
    src: `/${DEFAULT_LOGIN_LOGO.replace(/^\/+/, "")}`,
  },
  {
    value: "dfa_dash_favicon",
    label: "DFA Dashboard Icon",
    src: DEFAULT_DASH_FAVICON,
  },
] as const;

export const FONT_FAMILY_OPTIONS = [
  { value: "", label: "Select font family" },
  { value: "Arial, Helvetica, sans-serif", label: "Arial" },
  { value: "Georgia, serif", label: "Georgia" },
  { value: "'Times New Roman', Times, serif", label: "Times New Roman" },
  { value: "Verdana, Geneva, sans-serif", label: "Verdana" },
  { value: "'Segoe UI', Tahoma, sans-serif", label: "Segoe UI" },
  { value: "'Trebuchet MS', sans-serif", label: "Trebuchet MS" },
] as const;

export function logoSrcForId(logoId: string): string {
  const match = HEADER_FOOTER_LOGO_OPTIONS.find((opt) => opt.value === logoId);
  return match?.src ?? "";
}
