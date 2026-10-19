"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  TV_GRID_CONFIGURE_BTN,
  TV_GRID_CONFIGURE_LABELED_BTN,
} from "@/components/editableGridColumnClasses";
import { useCore } from "@/contexts/CoreContext";

type TableActionButtonProps = {
  rowId: string;
  isMenuOpen: boolean;
  onToggleMenu: (rowId: string) => void;
  onCloseMenu: () => void;
  onOpen: (rowId: string) => void;
  onEdit?: (rowId: string) => void;
  onDelete?: (rowId: string) => void;
  onGenerateSqlDump?: (rowId: string) => void;
  onDownloadSqlDump?: (rowId: string) => void;
};

export default function TableActionButton({
  rowId,
  isMenuOpen,
  onToggleMenu,
  onCloseMenu,
  onOpen,
  onEdit,
  onDelete,
  onGenerateSqlDump,
  onDownloadSqlDump,
}: TableActionButtonProps) {
  const { t } = useCore();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(
    null
  );
  const hasMenuActions = Boolean(onEdit || onDelete || onGenerateSqlDump || onDownloadSqlDump);

  const updateMenuPosition = () => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const minWidth = 140;
    const viewportWidth = window.innerWidth;
    const left = Math.max(8, Math.min(rect.right - minWidth, viewportWidth - minWidth - 8));
    setMenuPos({
      top: rect.bottom + 4,
      left,
    });
  };

  useLayoutEffect(() => {
    if (!isMenuOpen) {
      setMenuPos(null);
      return;
    }
    updateMenuPosition();
  }, [isMenuOpen]);

  useEffect(() => {
    if (!isMenuOpen) return;

    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!rootRef.current) return;
      if (rootRef.current.contains(target)) return;
      if (menuRef.current?.contains(target)) return;
      onCloseMenu();
    };
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCloseMenu();
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onEscape);
    window.addEventListener("resize", updateMenuPosition);
    window.addEventListener("scroll", updateMenuPosition, true);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onEscape);
      window.removeEventListener("resize", updateMenuPosition);
      window.removeEventListener("scroll", updateMenuPosition, true);
    };
  }, [isMenuOpen, onCloseMenu]);

  return (
    <div
      ref={rootRef}
      className="add-row-action-btns relative flex w-full items-center justify-center gap-1"
    >
      <button
        type="button"
        onClick={() => onOpen(rowId)}
        className={TV_GRID_CONFIGURE_LABELED_BTN}
        aria-label={t("OPEN")}
        title={t("OPEN")}
      >
        <span className="material-icons !text-sm leading-none" aria-hidden="true">
          open_in_new
        </span>
        {t("OPEN")}
      </button>

      {hasMenuActions && (
        <button
          ref={triggerRef}
          type="button"
          onClick={() => onToggleMenu(rowId)}
          className={`${TV_GRID_CONFIGURE_BTN} text-text-muted hover:text-text`}
          aria-label={t("TABLE_ACTIONS_ARIA_MENU")}
          title={t("TABLE_ACTIONS_ARIA_MENU")}
        >
          <span className="material-icons !text-sm leading-none">more_vert</span>
        </button>
      )}

      {isMenuOpen &&
        menuPos &&
        hasMenuActions &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            ref={menuRef}
            className="app-header__menu !z-[120] !min-w-[140px]"
            style={{
              position: "fixed",
              top: menuPos.top,
              left: menuPos.left,
            }}
          >
            {onEdit && (
              <button
                type="button"
                onClick={() => onEdit(rowId)}
                className="app-header__menu-item !text-xs"
              >
                <span className="material-icons mui-icon !text-sm leading-none">edit</span>
                {t("EDIT")}
              </button>
            )}
            {onDelete && (
              <button
                type="button"
                onClick={() => onDelete(rowId)}
                className="app-header__menu-item app-header__menu-item--danger !text-xs"
              >
                <span className="material-icons mui-icon !text-sm leading-none">delete</span>
                {t("DELETE")}
              </button>
            )}
            {onGenerateSqlDump && (
              <button
                type="button"
                onClick={() => onGenerateSqlDump(rowId)}
                className="app-header__menu-item !text-xs"
              >
                <span className="material-icons mui-icon !text-sm leading-none">backup</span>
                {t("GENERATE_SQL_DUMP")}
              </button>
            )}
            {onDownloadSqlDump && (
              <button
                type="button"
                onClick={() => onDownloadSqlDump(rowId)}
                className="app-header__menu-item !text-xs"
              >
                <span className="material-icons mui-icon !text-sm leading-none">download</span>
                {t("DOWNLOAD")}
              </button>
            )}
          </div>,
          document.body
        )}
    </div>
  );
}
