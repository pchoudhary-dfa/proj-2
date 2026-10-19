"use client";

import { forwardRef, type InputHTMLAttributes } from "react";

export type TextFieldSize = "xs" | "sm" | "md" | "lg";

const TEXT_FIELD_BY_SIZE: Record<TextFieldSize, string> = {
  xs: "field-comp--xs",
  sm: "field-comp--sm",
  md: "field-comp--md",
  lg:
    "box-border min-w-0 h-10 min-h-10 rounded-sm border border-border bg-surface py-0 px-3 " +
    "font-body text-xs font-normal leading-normal text-text outline-none " +
    "transition-[border-color,box-shadow] placeholder:font-normal placeholder:text-text-muted " +
    "focus:border-primary focus:shadow-[var(--shadow-focus-ring-2)] " +
    "disabled:cursor-not-allowed disabled:opacity-50",
};

export function textFieldClassName(
  size: TextFieldSize = "sm",
  extraClassName?: string,
): string {
  return [TEXT_FIELD_BY_SIZE[size], extraClassName].filter(Boolean).join(" ").trim();
}

export type TextFieldProps = Omit<InputHTMLAttributes<HTMLInputElement>, "size"> & {
  fieldSize?: TextFieldSize;
  className?: string;
};

export const TextField = forwardRef<HTMLInputElement, TextFieldProps>(
  function TextField({ fieldSize = "sm", className = "w-full", type = "text", ...rest }, ref) {
    return (
      <input
        ref={ref}
        type={type}
        className={textFieldClassName(fieldSize, className)}
        {...rest}
      />
    );
  },
);
