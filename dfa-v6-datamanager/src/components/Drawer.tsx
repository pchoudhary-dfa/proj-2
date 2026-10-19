"use client";

import { useEffect } from "react";
import type { ReactNode } from "react";
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
  /** Main content area below the header. Default: padded vertical scroll. */
  bodyClassName?: string;
  /**
   * Called when Escape is pressed while the drawer is open, before `onClose`.
   * Return true to keep the drawer open (e.g. after reverting in-place edits).
   */
  onEscapeFirst?: () => boolean;
  /** When false, clicking backdrop should not close drawer. */
  closeOnOverlayClick?: boolean;
  /** When true, backdrop does not block clicks so underlying UI (e.g. grid rows) stays interactive. */
  allowBackgroundInteraction?: boolean;
};

export default function Drawer({
  open,
  onClose,
  title,
  headerActions,
  width = "30%",
  children,
  footer,
  zIndexClassName = "z-50",
  bodyClassName = "flex-1 overflow-y-auto px-4 py-4",
  onEscapeFirst,
  closeOnOverlayClick = true,
  allowBackgroundInteraction = false,
}: DrawerProps) {
  const passThroughBackground = open && allowBackgroundInteraction;

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
      className={`fixed inset-0 ${zIndexClassName} ${
        open && !allowBackgroundInteraction ? "" : "pointer-events-none"
      }`}
      aria-hidden={!open}
    >
      <button
        type="button"
        className={`absolute inset-0 bg-black/45 transition-opacity duration-300 ${
          open && !allowBackgroundInteraction ? "opacity-100" : "opacity-0"
        } ${passThroughBackground ? "pointer-events-none" : ""}`}
        onClick={() => {
          if (!closeOnOverlayClick) return;
          onClose();
        }}
        aria-label="Close drawer overlay"
        tabIndex={passThroughBackground ? -1 : undefined}
      />
      <aside
        className={`absolute right-0 top-0 flex h-full flex-col border-l border-border bg-surface shadow-[0_8px_24px_color-mix(in_srgb,var(--color-text)_12%,transparent)] transition-transform duration-300 ease-out ${
          open ? "translate-x-0" : "translate-x-full"
        } ${passThroughBackground ? "pointer-events-auto" : ""}`}
        style={{ width }}
        role="dialog"
        aria-modal="true"
      >
        <div className="sp-header">
          <ModalCloseButton onClick={onClose} />
          {title ? (
            <div className="sp-header-info">
              <h2 className="sp-title">{title}</h2>
            </div>
          ) : null}
          {headerActions ? (
            <div className="flex shrink-0 items-center gap-2">{headerActions}</div>
          ) : null}
        </div>

        <div className={bodyClassName}>{children}</div>
        {footer ? (
          <div className="shrink-0 border-t border-border bg-surface px-4 py-3">
            {footer}
          </div>
        ) : null}
      </aside>
    </div>
  );
}
