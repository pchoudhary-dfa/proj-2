"use client";

import Link from "next/link";
import { forwardRef, type ButtonHTMLAttributes, type ComponentProps, type ReactNode } from "react";

export type SecondaryButtonProps = Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  "children"
> & {
  /** Label after the optional icon; omit only when `icon` is set and `aria-label` is provided */
  children?: ReactNode;
  /** Material Icons ligature name; rendered before children when set */
  icon?: string;
  /** `toolbar` (default) vs `modal` — same h-8 styling; kept for call-site clarity. */
  variant?: "toolbar" | "modal";
};

export const SECONDARY_TOOLBAR_CLASS = "btn-comp-secondary shrink-0 font-medium gap-1";
const MODAL_CLASS = "btn-comp-secondary shrink-0 font-medium gap-1";

/**
 * Secondary action: bordered surface button.
 * Pass translated or dynamic copy via `children`; optional leading Material icon via `icon`.
 */
export const SecondaryButton = forwardRef<HTMLButtonElement, SecondaryButtonProps>(
  function SecondaryButton(
    { className = "", children, icon, variant = "toolbar", type = "button", ...rest },
    ref
  ) {
    const baseClass = variant === "modal" ? MODAL_CLASS : SECONDARY_TOOLBAR_CLASS;
    return (
      <button
        ref={ref}
        type={type}
        className={`${baseClass} ${className}`.trim()}
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

export type SecondaryButtonLinkProps = ComponentProps<typeof Link> & {
  icon?: string;
};

/** Secondary toolbar styling for Next.js {@link Link}. */
export function SecondaryButtonLink({
  className = "",
  icon,
  children,
  ...rest
}: SecondaryButtonLinkProps) {
  return (
    <Link className={`${SECONDARY_TOOLBAR_CLASS} ${className}`.trim()} {...rest}>
      {icon ? (
        <span className="material-icons !text-sm leading-none" aria-hidden>
          {icon}
        </span>
      ) : null}
      {children}
    </Link>
  );
}
