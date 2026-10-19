"use client";

import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";

const DESTRUCTIVE_CLASS =
  "!bg-error !text-on-primary border-error shadow-none hover:!brightness-95 disabled:hover:!bg-error";

type PrimaryButtonVariant = "default" | "destructive" | "approve" | "reject";

const VARIANT_CLASS: Record<PrimaryButtonVariant, string> = {
  default: "",
  destructive: DESTRUCTIVE_CLASS,
  approve: "btn-approve",
  reject: "btn-reject",
};

export type PrimaryButtonProps = Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  "children"
> & {
  children: ReactNode;
  /** Material Icons ligature name; rendered before children when set */
  icon?: string;
  /** Visual variant; approve/reject use semantic green/red fills on primary shape. */
  variant?: PrimaryButtonVariant;
};

/**
 * Primary action (`btn-comp-primary`). Optional leading Material icon.
 * For save-with-check actions, prefer {@link PrimarySaveButton}.
 */
export const PrimaryButton = forwardRef<HTMLButtonElement, PrimaryButtonProps>(
  function PrimaryButton(
    { className = "", children, icon, variant = "default", type = "button", ...rest },
    ref
  ) {
    return (
      <button
        ref={ref}
        type={type}
        className={`btn-comp-primary shrink-0 font-medium gap-1 ${VARIANT_CLASS[variant]} ${className}`.trim()}
        {...rest}
      >
        {icon ? (
          <span className="material-icons !text-sm leading-none" aria-hidden>
            {icon}
          </span>
        ) : null}
        {children}
      </button>
    );
  }
);
