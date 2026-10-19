"use client";

import { useEffect, useRef } from "react";

export type DashboardRowMenuAction = {
  id: string;
  label: string;
  icon: string;
  onClick: (rowId: string) => void;
  danger?: boolean;
};

type TableRowActionsMenuProps = {
  rowId: string;
  isMenuOpen: boolean;
  onToggleMenu: (rowId: string) => void;
  onCloseMenu: () => void;
  actions: DashboardRowMenuAction[];
};

export default function TableRowActionsMenu({
  rowId,
  isMenuOpen,
  onToggleMenu,
  onCloseMenu,
  actions,
}: TableRowActionsMenuProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!isMenuOpen) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        onCloseMenu();
      }
    };
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCloseMenu();
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onEscape);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onEscape);
    };
  }, [isMenuOpen, onCloseMenu]);

  function runAction(action: DashboardRowMenuAction) {
    onCloseMenu();
    action.onClick(rowId);
  }

  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        type="button"
        onClick={() => onToggleMenu(rowId)}
        className=" text-text-muted hover:text-text"
        aria-label="Row actions"
        aria-expanded={isMenuOpen}
        aria-haspopup="menu"
      >
        <span className="material-icons !text-sm leading-none">more_vert</span>
      </button>

      {isMenuOpen && actions.length > 0 ? (
        <div
          className="app-header__menu !top-9 !z-[60] !min-w-[160px]"
          role="menu"
        >
          {actions.map((action) => (
            <button
              key={action.id}
              type="button"
              role="menuitem"
              onClick={() => runAction(action)}
              className={
                action.danger
                  ? "app-header__menu-item app-header__menu-item--danger !text-xs"
                  : "app-header__menu-item !text-xs"
              }
            >
              <span className="material-icons mui-icon !text-sm leading-none">
                {action.icon}
              </span>
              {action.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
