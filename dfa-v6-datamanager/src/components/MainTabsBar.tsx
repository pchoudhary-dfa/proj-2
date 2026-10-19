"use client";

import type { ReactNode } from "react";

const ROOT_CLASS = "bc-main-tabs";
const TAB_CLASS = "btn-comp-tab";

export type MainTabItem<T extends string = string> = {
  value: T;
  label: ReactNode;
  /** Material Icons ligature name; rendered with `material-icons mui-icon`. */
  icon?: string;
  disabled?: boolean;
  /** Extra classes on the tab button (e.g. `shrink-0`, `gap-1`). */
  tabClassName?: string;
  id?: string;
};

export type MainTabsBarTablistA11y = {
  ariaLabel?: string;
  labelledBy?: string;
};

export type MainTabsBarProps<T extends string = string> = {
  tabs: readonly MainTabItem<T>[];
  activeValue: T;
  /**
   * Invoked when a tab is activated. Omitted for purely presentational strips
   * (still pass `disabled` on items as needed).
   */
  onSelect?: (value: T) => void;
  /**
   * `bar` — wraps in `.bc-main-tabs` (default).
   * `buttonsOnly` — renders only tab buttons (no wrapper). Use inside a custom
   * row (e.g. horizontal scroll) that already applies layout.
   */
  variant?: "bar" | "buttonsOnly";
  /** Merged onto the bar root; ignored when `variant="buttonsOnly"`. */
  className?: string;
  /**
   * When defined (including `{}`), the bar root gets `role="tablist"` and optional
   * `aria-label` / `aria-labelledby`. Each tab gets `role="tab"` + `aria-selected`.
   */
  tablistAccessibility?: MainTabsBarTablistA11y;
  /**
   * Adds `role="tab"` and `aria-selected` on each button without a `tablist` wrapper
   * (e.g. legacy indicator config strip). Ignored when `tablistAccessibility` is set.
   */
  tabRole?: boolean;
  /**
   * If true (default), clicking the already-active tab does not call `onSelect`.
   */
  skipSelectWhenActive?: boolean;
  // If true, removes the bottom border from the bar (e.g. for use in a sidebar). Only applies when `variant="bar"`.
  removeBorder?: boolean;
};

function renderTabButton<T extends string>(
  tab: MainTabItem<T>,
  active: boolean,
  tabA11y: boolean,
  skipSelectWhenActive: boolean,
  onSelect: ((value: T) => void) | undefined
) {
  const classes = [TAB_CLASS, active ? "active" : "", tab.tabClassName ?? ""]
    .filter(Boolean)
    .join(" ");

  return (
    <button
      key={tab.value}
      type="button"
      id={tab.id}
      role={tabA11y ? "tab" : undefined}
      aria-selected={tabA11y ? active : undefined}
      className={classes}
      disabled={tab.disabled}
      onClick={() => {
        if (tab.disabled) return;
        if (skipSelectWhenActive && active) return;
        onSelect?.(tab.value);
      }}
    >
      {tab.icon ? (
        <span className="material-icons mui-icon" aria-hidden>
          {tab.icon}
        </span>
      ) : null}
      {tab.label}
    </button>
  );
}

/**
 * Primary app tab strip: `.bc-main-tabs` + `.btn-comp-tab` (+ optional Material icon).
 * Use for breadcrumb-style navigation, admin sub-tabs, drawer tab rows, etc.
 */
export function MainTabsBar<T extends string>({
  tabs,
  activeValue,
  onSelect,
  variant = "bar",
  className = "",
  tablistAccessibility,
  tabRole = false,
  skipSelectWhenActive = true,
  removeBorder = false,
}: MainTabsBarProps<T>) {
  const wantsTablist = tablistAccessibility !== undefined;
  const tabItemA11y = wantsTablist || tabRole;

  const buttons = tabs.map((tab) =>
    renderTabButton(
      tab,
      activeValue === tab.value,
      tabItemA11y,
      skipSelectWhenActive,
      onSelect
    )
  );

  if (variant === "buttonsOnly") {
    return <>{buttons}</>;
  }

  const rootClass = [`${ROOT_CLASS} ${removeBorder==true ? `border-0` : ``}`, className].filter(Boolean).join(" ");

  return (
    <div
      className={rootClass}
      role={wantsTablist ? "tablist" : undefined}
      aria-label={tablistAccessibility?.ariaLabel}
      aria-labelledby={tablistAccessibility?.labelledBy}
    >
      {buttons}
    </div>
  );
}
