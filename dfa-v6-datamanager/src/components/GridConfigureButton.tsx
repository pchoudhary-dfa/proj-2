"use client";

import type { ButtonHTMLAttributes, MouseEvent } from "react";
import { TV_GRID_CONFIGURE_BTN } from "@/components/editableGridColumnClasses";

export type GridConfigureButtonProps = Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  "type" | "children"
> & {
  /** Localized label; also used as `title` when `title` is omitted */
  ariaLabel: string;
  title?: string;
  /** Wrap in `.add-row-action-btns` for sticky grid actions columns */
  wrapInActionBtns?: boolean;
  /** Calls `stopPropagation` on double-click (default true) */
  stopDoubleClickPropagation?: boolean;
};

/**
 * Compact bordered settings control for grid row actions (`btn-comp-ghost--grid-icon` + primary tone).
 * Use in sticky actions columns and anywhere a row-level Configure affordance is needed.
 */
export function GridConfigureButton({
  ariaLabel,
  title,
  className,
  wrapInActionBtns = false,
  stopDoubleClickPropagation = true,
  onDoubleClick,
  ...rest
}: GridConfigureButtonProps) {
  const resolvedTitle = title ?? ariaLabel;

  const handleDoubleClick = (e: MouseEvent<HTMLButtonElement>) => {
    if (stopDoubleClickPropagation) {
      e.stopPropagation();
    }
    onDoubleClick?.(e);
  };

  const button = (
    <button
      type="button"
      className={[TV_GRID_CONFIGURE_BTN, className].filter(Boolean).join(" ")}
      aria-label={ariaLabel}
      title={resolvedTitle}
      onDoubleClick={handleDoubleClick}
      {...rest}
    >
      <span className="material-icons !text-sm" aria-hidden="true">
        settings
      </span>
    </button>
  );

  if (wrapInActionBtns) {
    return <div className="add-row-action-btns">{button}</div>;
  }

  return button;
}
