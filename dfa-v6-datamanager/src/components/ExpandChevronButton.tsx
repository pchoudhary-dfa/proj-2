"use client";

import type { ButtonHTMLAttributes, MouseEvent } from "react";

const BTN_CLASS =
  "inline-flex h-5 w-5 min-w-5 shrink-0 items-center justify-center rounded border-0 bg-transparent p-0 text-current shadow-none outline-none transition-opacity hover:opacity-70 focus-visible:shadow-[var(--shadow-focus-ring)] disabled:pointer-events-none disabled:opacity-45";

export type ExpandChevronButtonProps = Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  "type" | "aria-expanded" | "children"
> & {
  expanded: boolean;
  onClick: (e: MouseEvent<HTMLButtonElement>) => void;
  /** Visible when collapsed (default: "Expand") */
  expandAriaLabel?: string;
  /** Visible when expanded (default: "Collapse") */
  collapseAriaLabel?: string;
  /**
   * Icon color utilities (default: `!text-primary`).
   * Use e.g. `text-text-muted` when the control should recede until selected.
   */
  iconClassName?: string;
};

/**
 * Standard row/tree expand toggle: compact chevron, transparent chrome, primary icon.
 * Use for any expand-in-place pattern in grids and nested lists.
 */
export function ExpandChevronButton({
  expanded,
  onClick,
  expandAriaLabel = "Expand",
  collapseAriaLabel = "Collapse",
  disabled,
  title,
  className,
  tabIndex = -1,
  iconClassName,
  ...rest
}: ExpandChevronButtonProps) {
  const iconTone = iconClassName ?? "!text-primary";
  return (
    <button
      type="button"
      tabIndex={tabIndex}
      className={[BTN_CLASS, className].filter(Boolean).join(" ")}
      aria-expanded={expanded}
      aria-label={expanded ? collapseAriaLabel : expandAriaLabel}
      title={title}
      disabled={disabled}
      onClick={onClick}
      {...rest}
    >
      <span
        className={`material-icons !text-sm leading-none ${iconTone}`}
        aria-hidden="true"
      >
        {expanded ? "expand_more" : "chevron_right"}
      </span>
    </button>
  );
}
