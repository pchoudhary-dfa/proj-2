"use client";

import { useCoreOptional } from "@/contexts/CoreContext";
import { getTranslationsFallback } from "@/lib/i18n/translations";
import { SearchInputBar } from "@/components/SearchInputBar";
import { PrimaryButton } from "@/components/PrimaryButton";
import { ToolbarHelpButton } from "@/components/ToolbarHelpButton";

const _fb = getTranslationsFallback("en");
const fallbackT = (code: string, fb?: string) => _fb[code] ?? fb ?? code;

export type BcMainToolbarProps = {
  /** Material icon name (same row as `PageToolbar`). */
  icon?: string;
  /** Page title (e.g. translated “Datawarehouse”). */
  title: string;
  /** Opens create / add flow; omit to hide divider + Add. */
  onAddClick?: () => void;
  /** Override Add label; defaults to `t("ADD")`. */
  addLabel?: string;
  searchPlaceholder: string;
  searchValue?: string;
  onSearchChange?: (value: string) => void;
  /** When true, hides the DFA Help Info button (default: show). */
  hideInfo?: boolean;
};

/**
 * Datawarehouse (and similar) row under the app tab strip: same chrome as `PageToolbar`
 * (icon box + title + divider + actions + flex spacer + search), without duplicating
 * `border-b` on the row — `.bc-main` already provides the section border.
 */
export function BcMainToolbar({
  icon = "storage",
  title,
  onAddClick,
  addLabel,
  searchPlaceholder,
  searchValue = "",
  onSearchChange,
  hideInfo = false,
}: BcMainToolbarProps) {
  const core = useCoreOptional();
  const t = core?.t ?? fallbackT;
  const resolvedAddLabel = addLabel ?? t("ADD");
  const hasAdd = Boolean(onAddClick);

  return (
    <div className="flex h-breadcrumb shrink-0 items-center gap-0 bg-surface px-5">
      <span className="page-chrome-icon mr-2 h-8 w-8">
        <span className="material-icons text-sm leading-none text-primary">{icon}</span>
      </span>
      <span className="text-sm font-bold tracking-tight text-text whitespace-nowrap">
        {title}
      </span>
      {hasAdd ? (
        <>
          <div className="mx-[18px] h-5 w-px shrink-0 self-center bg-border" />
          <div className="flex flex-wrap items-center gap-1">
            <PrimaryButton type="button" icon="add" onClick={onAddClick}>
              {resolvedAddLabel}
            </PrimaryButton>
          </div>
        </>
      ) : null}
      {!hideInfo ? <ToolbarHelpButton /> : null}
      <div className="flex-1" />
      <SearchInputBar
        embedded
        wrapperClassName="bc-main-search-wrap shrink-0 min-w-0"
        placeholder={searchPlaceholder}
        value={searchValue}
        onChange={(e) => onSearchChange?.(e.target.value)}
      />
    </div>
  );
}
