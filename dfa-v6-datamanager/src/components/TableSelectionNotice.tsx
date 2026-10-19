"use client";

import { useCore } from "@/contexts/CoreContext";
import { SecondaryButton } from "@/components/SecondaryButton";

export type TableSelectionNoticeProps = {
  /** Selected item count; hidden when 0 or negative. */
  count: number;
  onClear: () => void;
  /** Fully formatted count line; default uses `SELECTED_COUNT` i18n. */
  countLabel?: string;
  /** Clear action label; default uses `CLEAR_SELECTION` i18n. */
  clearLabel?: string;
  className?: string;
};

/**
 * Bulk-selection banner above data grids: count + clear action.
 * Prefer {@link InlineEditableTable} / {@link ServerDrivenTable} `selection` prop over inline markup.
 */
export function TableSelectionNotice({
  count,
  onClear,
  countLabel,
  clearLabel,
  className = "",
}: TableSelectionNoticeProps) {
  const { t } = useCore();
  if (count <= 0) return null;

  const resolvedCount =
    countLabel ??
    t("SELECTED_COUNT", "{count} selected").replace("{count}", String(count));
  const resolvedClear = clearLabel ?? t("CLEAR_SELECTION", "Clear selection");

  return (
    <div className={`sel-notice ${className}`.trim()}>
      <span className="material-icons !text-sm text-primary" aria-hidden>
        check_box
      </span>
      <span>{resolvedCount}</span>
      <SecondaryButton
        type="button"
        icon="close"
        onClick={onClear}
        className="ml-auto"
      >
        {resolvedClear}
      </SecondaryButton>
    </div>
  );
}
