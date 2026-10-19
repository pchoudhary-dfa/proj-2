"use client";

import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import { ModalCloseButton } from "@/components/ModalCloseButton";

export type ModalProps = {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  titleId: string;
  children: ReactNode;
  footer?: ReactNode;
  /** When true, backdrop and header close do not run `onClose`. */
  dismissDisabled?: boolean;
  /** Extra classes on the dialog shell (e.g. max-width). */
  className?: string;
  /** Extra classes merged onto the header close button (layout overrides only). */
  closeButtonClassName?: string;
  closeIconClassName?: string;
  closeAriaLabel?: string;
  /** Extra classes on the footer row (layout overrides). */
  footerClassName?: string;
  /** Merged after `modal-body` (e.g. `!pl-0 !pb-0` for edge-to-edge layouts). */
  bodyClassName?: string;
  /** Merged after `modal-title` to override title typography when needed. */
  titleClassName?: string;
};

export function Modal({
  open,
  onClose,
  title,
  titleId,
  children,
  footer,
  dismissDisabled = false,
  className,
  closeButtonClassName,
  closeIconClassName,
  closeAriaLabel = "Close",
  footerClassName,
  bodyClassName,
  titleClassName,
}: ModalProps) {
  if (!open) return null;

  const footerRowClass = footerClassName
    ? `modal-footer ${footerClassName}`.trim()
    : "modal-footer";

  const overlay = (
    <div className="modal-overlay" role="presentation">
      <div
        className="modal-backdrop"
        aria-hidden
        onClick={() => {
          if (dismissDisabled) return;
          onClose();
        }}
      />
      <div
        className={className ? `modal-panel ${className}`.trim() : "modal-panel"}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <div className="modal-header">
          <h2
            id={titleId}
            className={
              titleClassName
                ? `modal-title ${titleClassName}`.trim()
                : "modal-title"
            }
          >
            {title}
          </h2>
          <ModalCloseButton
            className={closeButtonClassName}
            iconClassName={closeIconClassName}
            disabled={dismissDisabled}
            ariaLabel={closeAriaLabel}
            onClick={() => {
              if (dismissDisabled) return;
              onClose();
            }}
          />
        </div>
        <div
          className={
            bodyClassName
              ? `modal-body ${bodyClassName}`.trim()
              : "modal-body"
          }
        >
          {children}
        </div>
        {footer != null ? <div className={footerRowClass}>{footer}</div> : null}
      </div>
    </div>
  );

  if (typeof document === "undefined") return null;

  return createPortal(overlay, document.body);
}
