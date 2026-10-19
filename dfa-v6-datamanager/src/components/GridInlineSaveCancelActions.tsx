"use client";

import type { MouseEvent } from "react";
import {
  TV_GRID_CANCEL_BTN,
  TV_GRID_SAVE_BTN,
} from "@/components/editableGridColumnClasses";
import { useCore } from "@/contexts/CoreContext";

/** Green check — add-row / inline save (compact grid icon + success tone). */
export const BTN_GRID_ICON_TICK = TV_GRID_SAVE_BTN;

/** Rose close — cancel / clear inline row (compact grid icon + danger tone). */
export const BTN_GRID_ICON_CLOSE = TV_GRID_CANCEL_BTN;

export const GRID_ACTION_ICON = "!text-sm";

const Mi = ({ name }: { name: string }) => (
  <span className="material-icons !text-sm" aria-hidden="true">
    {name}
  </span>
);

export type GridInlineSaveCancelActionsProps = {
  onSave: () => void;
  onCancel: () => void;
  /** Disables save while a request is in flight. */
  saveLoading?: boolean;
  /** Extra disable for save (e.g. empty required fields). */
  saveDisabled?: boolean;
  /** Extra disable for cancel (e.g. inactive draft). Defaults to only `saveLoading`. */
  cancelDisabled?: boolean;
  saveTitle?: string;
  saveAriaLabel?: string;
  cancelTitle?: string;
  cancelAriaLabel?: string;
};

/**
 * Paired check/close controls for grid inline edit or add-row actions.
 * Styling matches `InlineEditRowActions` and server-driven add-row actions in TableView.
 */
export function GridInlineSaveCancelActions({
  onSave,
  onCancel,
  saveLoading = false,
  saveDisabled = false,
  cancelDisabled = false,
  saveTitle,
  saveAriaLabel = "Save row changes",
  cancelTitle = "Cancel editing",
  cancelAriaLabel = "Cancel row edit",
}: GridInlineSaveCancelActionsProps) {
  const { t } = useCore();
  const resolvedSaveTitle = saveTitle ?? t("SAVE", "Save");
  const saveBtnDisabled = saveLoading || saveDisabled;
  const cancelBtnDisabled = saveLoading || cancelDisabled;

  const stop = (e: MouseEvent) => e.stopPropagation();

  return (
    <div className="add-row-action-btns">
      <button
        type="button"
        className={BTN_GRID_ICON_TICK}
        title={resolvedSaveTitle}
        aria-label={saveAriaLabel}
        disabled={saveBtnDisabled}
        onClick={(e) => {
          e.stopPropagation();
          onSave();
        }}
        onDoubleClick={stop}
      >
        <Mi name="check" />
      </button>
      <button
        type="button"
        className={BTN_GRID_ICON_CLOSE}
        title={cancelTitle}
        aria-label={cancelAriaLabel}
        disabled={cancelBtnDisabled}
        onClick={(e) => {
          e.stopPropagation();
          onCancel();
        }}
        onDoubleClick={stop}
      >
        <Mi name="close" />
      </button>
    </div>
  );
}
