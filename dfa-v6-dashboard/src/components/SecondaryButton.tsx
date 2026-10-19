"use client";

import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";

export const SECONDARY_TOOLBAR_CLASS =
  "btn-comp-secondary shrink-0 gap-1.5 !text-xs font-medium";

export type SecondaryButtonProps = Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  "children"
> & {
  children?: ReactNode;
  icon?: string;
};

export const SecondaryButton = forwardRef<HTMLButtonElement, SecondaryButtonProps>(
  function SecondaryButton(
    { className = "", children, icon, type = "button", ...rest },
    ref,
  ) {
    return (
      <button
        ref={ref}
        type={type}
        className={`${SECONDARY_TOOLBAR_CLASS} ${className}`.trim()}
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
  },
);
