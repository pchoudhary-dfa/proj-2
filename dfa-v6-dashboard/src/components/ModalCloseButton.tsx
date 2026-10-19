"use client";

import type { ButtonHTMLAttributes } from "react";

const BASE_CLASS = "btn-comp-icon-md";

export type ModalCloseButtonProps = {
  ariaLabel?: string;
  iconClassName?: string;
} & Pick<
  ButtonHTMLAttributes<HTMLButtonElement>,
  "onClick" | "disabled" | "className" | "type" | "title"
>;

export function ModalCloseButton({
  ariaLabel = "Close",
  className,
  iconClassName = "!text-sm",
  type = "button",
  ...rest
}: ModalCloseButtonProps) {
  return (
    <button
      type={type}
      className={className ? `${BASE_CLASS} ${className}`.trim() : BASE_CLASS}
      aria-label={ariaLabel}
      {...rest}
    >
      <span className={`material-icons ${iconClassName}`.trim()} aria-hidden>
        close
      </span>
    </button>
  );
}
