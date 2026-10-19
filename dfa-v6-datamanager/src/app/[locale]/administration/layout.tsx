import type { ReactNode } from "react";

import "dfa-mailer-templates/dist/index.css";
import "./mailer-package-dm-theme.css";

/**
 * Mailer package styles are extracted to dist/index.css by Rollup; importing them here
 * ensures they load for all Administration sections (email templates/logs use them).
 * `mailer-package-dm-theme.css` redefines the same package class names to match DM tables
 * and tokens (scoped under `.dm-mailer-package-host`).
 */
export default function AdministrationLayout({
  children,
}: {
  children: ReactNode;
}) {
  return children;
}
