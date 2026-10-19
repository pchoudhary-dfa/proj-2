"use client";

const GRID_ACTION_ICON =
  "material-icons !text-sm leading-none";

const BTN_GRID_ICON_TICK =
  "inline-flex h-6 w-6 shrink-0 items-center justify-center rounded text-success hover:bg-success/10 disabled:opacity-40 disabled:pointer-events-none";

const BTN_GRID_ICON_CLOSE =
  "inline-flex h-6 w-6 shrink-0 items-center justify-center rounded text-error hover:bg-error/10 disabled:opacity-40 disabled:pointer-events-none";

export { GRID_ACTION_ICON, BTN_GRID_ICON_TICK, BTN_GRID_ICON_CLOSE };

export type GridInlineSaveCancelActionsProps = {
  onSave: () => void;
  onCancel: () => void;
  saveLoading?: boolean;
  saveDisabled?: boolean;
  saveTitle?: string;
  saveAriaLabel?: string;
  cancelTitle?: string;
  cancelAriaLabel?: string;
};

export function GridInlineSaveCancelActions({
  onSave,
  onCancel,
  saveLoading = false,
  saveDisabled = false,
  saveTitle = "Save",
  saveAriaLabel = "Save",
  cancelTitle = "Cancel",
  cancelAriaLabel = "Cancel",
}: GridInlineSaveCancelActionsProps) {
  return (
    <div className="flex items-center gap-0.5">
      <button
        type="button"
        className={BTN_GRID_ICON_TICK}
        onClick={onSave}
        disabled={saveLoading || saveDisabled}
        title={saveTitle}
        aria-label={saveAriaLabel}
      >
        {saveLoading ? (
          <span
            className="h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent"
            aria-hidden
          />
        ) : (
          <span className={GRID_ACTION_ICON} aria-hidden>
            check
          </span>
        )}
      </button>
      <button
        type="button"
        className={BTN_GRID_ICON_CLOSE}
        onClick={onCancel}
        disabled={saveLoading}
        title={cancelTitle}
        aria-label={cancelAriaLabel}
      >
        <span className={GRID_ACTION_ICON} aria-hidden>
          close
        </span>
      </button>
    </div>
  );
}
