"use client";

import { useMemo } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { DFAHelpRenderer } from "@dfa/dfa-help-renderer";
import { useCoreOptional } from "@/contexts/CoreContext";
import { useDfaHelpConfig } from "@/contexts/DfaHelpConfigContext";
import { getTranslationsFallback } from "@/lib/i18n/translations";
import * as helpKeys from "@/lib/helpKeys";
import { SECONDARY_TOOLBAR_CLASS } from "@/components/SecondaryButton";

const _fb = getTranslationsFallback("en");
const fallbackT = (code: string, fb?: string) => _fb[code] ?? fb ?? code;

/**
 * Info / help control for any page toolbar row.
 * Resolves `helpKey` from pathname + `?section=` (see `helpKeys.ts`) and uses
 * languages from {@link DfaHelpProvider}. Mount on PageToolbar, BcMainToolbar, etc.
 */
export function ToolbarHelpButton({
  className = "ml-2 shrink-0",
}: {
  className?: string;
}) {
  const core = useCoreOptional();
  const { languages } = useDfaHelpConfig();
  const t = core?.t ?? fallbackT;
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const section = searchParams.get("section");
  const helpKey = useMemo(
    () => helpKeys.getHelpKey(pathname, section),
    [pathname, section],
  );

  return (
    <DFAHelpRenderer
      helpKey={helpKey}
      languages={languages}
      buttonText={t("INFO")}
      buttonClassName={SECONDARY_TOOLBAR_CLASS}
      className={className}
      buttonIcon={
        <span className="material-icons !text-sm leading-none" aria-hidden>
          info
        </span>
      }
    />
  );
}
