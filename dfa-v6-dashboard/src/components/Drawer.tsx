"use client";

import { useEffect, type ReactNode } from "react";
import { ModalCloseButton } from "@/components/ModalCloseButton";

type DrawerProps = {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  headerActions?: ReactNode;
  width?: string;
  children: ReactNode;
  footer?: ReactNode;
  zIndexClassName?: string;
  bodyClassName?: string;
  onEscapeFirst?: () => boolean;
  closeOnOverlayClick?: boolean;
};

export default function Drawer({
  open,
  onClose,
  title,
  headerActions,
  width = "40%",
  children,
  footer,
  zIndexClassName = "z-[500]",
  bodyClassName = "flex-1 overflow-y-auto px-5 py-4",
  onEscapeFirst,
  closeOnOverlayClick = true,
}: DrawerProps) {
  useEffect(() => {
    if (!open) return;
    const onEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (onEscapeFirst?.()) {
        event.preventDefault();
        return;
      }
      onClose();
    };
    document.addEventListener("keydown", onEscape);
    return () => document.removeEventListener("keydown", onEscape);
  }, [open, onClose, onEscapeFirst]);

  return (
    <div
      className={`fixed inset-0 ${zIndexClassName} ${open ? "" : "pointer-events-none"}`}
      aria-hidden={!open}
    >
      <button
        type="button"
        className={`absolute inset-0 bg-black/45 transition-opacity duration-300 ${
          open ? "opacity-100" : "opacity-0"
        }`}
        onClick={() => {
          if (!closeOnOverlayClick) return;
          onClose();
        }}
        aria-label="Close drawer overlay"
      />
      <aside
        className={`absolute right-0 top-0 flex h-full flex-col border-l border-border bg-surface shadow-[0_8px_24px_color-mix(in_srgb,var(--color-text)_12%,transparent)] transition-transform duration-300 ease-out ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
        style={{ width }}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? "dashboard-drawer-title" : undefined}
      >
        <div className="sp-header">
          <ModalCloseButton onClick={onClose} />
          {title ? (
            <div className="sp-header-info">
              <h2 id="dashboard-drawer-title" className="sp-title">
                {title}
              </h2>
            </div>
          ) : null}
          {headerActions ? (
            <div className="flex shrink-0 items-center gap-2">{headerActions}</div>
          ) : null}
        </div>

        <div className={bodyClassName}>{children}</div>
        {footer ? (
          <div className="shrink-0 border-t border-border bg-surface px-5 py-3">
            {footer}
          </div>
        ) : null}
      </aside>
    </div>
  );
}
