"use client";

import type { ButtonHTMLAttributes } from "react";

/** Material icon name for column sort affordance in grid headers. */
export type GridSortIcon = "arrow_upward" | "arrow_downward" | "unfold_more";

export type GridSortDirection = "asc" | "desc" | null;

/** Shared class for grid header sort controls (`globals.css`). */
export const GRID_SORT_BUTTON_CLASS = "btn-comp-ghost--sort";

/** Icon from active flag + direction (use in custom headers if needed). */
export function gridSortIcon(
  active: boolean,
  direction: GridSortDirection
): GridSortIcon {
  if (!active) return "unfold_more";
  if (direction === "asc") return "arrow_upward";
  if (direction === "desc") return "arrow_downward";
  return "unfold_more";
}

/** Icon when sort state is keyed by column id. */
export function gridSortIconForColumn<T extends string>(
  columnId: T,
  activeColumnId: T | null,
  direction: GridSortDirection
): GridSortIcon {
  return gridSortIcon(activeColumnId === columnId, direction);
}

export type GridSortButtonProps = Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  "type" | "children"
> & {
  ariaLabel: string;
  title?: string;
  /** Resolved icon; omit when using `active` + `direction`. */
  icon?: GridSortIcon;
  /** Column is the active sort target — pair with `direction`. */
  active?: boolean;
  direction?: GridSortDirection;
  /** Visually hidden but keeps layout (e.g. non-sortable label column). */
  hidden?: boolean;
};

/**
 * Grid column header sort control. Prefer declaring `kind: "sort"` on
 * {@link EditableGridColumnDef} so {@link renderEditableGridHeader} renders this;
 * use the component directly only for one-off headers.
 */
export function GridSortButton({
  ariaLabel,
  title,
  icon,
  active = false,
  direction = null,
  hidden = false,
  className,
  disabled,
  ...rest
}: GridSortButtonProps) {
  const resolvedIcon = icon ?? gridSortIcon(active, direction);
  const resolvedTitle = title ?? ariaLabel;

  if (hidden) {
    return (
      <button
        type="button"
        className={[GRID_SORT_BUTTON_CLASS, "invisible", className]
          .filter(Boolean)
          .join(" ")}
        aria-hidden
        tabIndex={-1}
        disabled
      />
    );
  }

  return (
    <button
      type="button"
      className={[GRID_SORT_BUTTON_CLASS, className].filter(Boolean).join(" ")}
      aria-label={ariaLabel}
      title={resolvedTitle}
      disabled={disabled}
      {...rest}
    >
      <span className="material-icons !text-sm" aria-hidden="true">
        {resolvedIcon}
      </span>
    </button>
  );
}
