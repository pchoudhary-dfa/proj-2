"use client";

import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";

export type PrimaryButtonProps = Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  "children"
> & {
  children: ReactNode;
  icon?: string;
};

export const PrimaryButton = forwardRef<HTMLButtonElement, PrimaryButtonProps>(
  function PrimaryButton(
    { className = "", children, icon, type = "button", ...rest },
    ref,
  ) {
    return (
      <button
        ref={ref}
        type={type}
        className={`btn-comp-primary shrink-0 gap-1.5 !text-xs font-medium ${className}`.trim()}
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
