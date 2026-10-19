"use client";

import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";

export type PrimarySaveButtonProps = Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  "children"
> & {
  /** Text or node shown after the check icon */
  children: ReactNode;
};

/**
 * Primary action styled like “Save changes”: small primary button with leading check icon.
 * Pass translated or dynamic copy via `children`.
 */
export const PrimarySaveButton = forwardRef<HTMLButtonElement, PrimarySaveButtonProps>(
  function PrimarySaveButton(
    { className = "", children, type = "button", ...rest },
    ref
  ) {
    return (
      <button
        ref={ref}
        type={type}
        className={`btn-comp-primary gap-1.5 !text-xs ${className}`.trim()}
        {...rest}
      >
        <span className="material-icons !text-xs leading-none" aria-hidden>
          check
        </span>
        {children}
      </button>
    );
  }
);
