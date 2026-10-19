"use client";

import { forwardRef, type InputHTMLAttributes } from "react";

/**
 * Shared height / typography presets (table cells, filters, toolbar).
 * `sm` / `md` use `.field-comp--*` from `globals.css`. Grid body/add-row text inputs use
 * {@link gridTextFieldClassName} (`field-comp--xs`) directly in column and add-row markup.
 */
export type TextFieldSize = "xs" | "sm" | "md" | "lg";

const TEXT_FIELD_BY_SIZE: Record<TextFieldSize, string> = {
  xs: "field-comp--xs w-full",
  sm: "field-comp--sm w-full",
  md: "field-comp--md w-full",
  lg:
    "box-border min-w-0 h-10 min-h-10 w-full rounded-sm border border-border bg-surface py-0 px-3 " +
    "font-body text-xs font-normal leading-normal text-text outline-none " +
    "transition-[border-color,box-shadow] placeholder:font-normal placeholder:text-text-muted " +
    "focus:border-primary focus:shadow-[var(--shadow-focus-ring)] " +
    "disabled:cursor-not-allowed disabled:opacity-50",
};

/**
 * Tailwind classes for a standard text input. Use `extraClassName` for width
 * (`flex-1`, `min-w-[220px]`, …), icon padding (`pl-7 pr-2`), monospace, etc.
 */
export function textFieldClassName(
  size: TextFieldSize = "sm",
  extraClassName?: string,
): string {
  return [TEXT_FIELD_BY_SIZE[size], extraClassName].filter(Boolean).join(" ").trim();
}

/** Dense `field-comp--xs` for inputs inside `.tbl-wrap.tv-grid-wrap` body/add-row cells. */
export function gridTextFieldClassName(extraClassName?: string): string {
  return textFieldClassName("xs", extraClassName);
}

/** Borderless inner input inside a bordered combobox shell (e.g. subgroup selector). */
export function shellTextFieldClassName(extraClassName?: string): string {
  return [
    "flex-1 min-w-0 h-8 px-3 border-0 outline-none bg-transparent box-border",
    "font-body text-xs text-text placeholder:text-text-muted",
    extraClassName,
  ]
    .filter(Boolean)
    .join(" ");
}

/** Inline rename inside a side-nav row (metadata categories). */
export function inlineRowTextFieldClassName(extraClassName?: string): string {
  return [
    "flex-1 min-w-0 border-0 outline-none bg-transparent font-body text-xs text-inherit",
    "py-0.5 px-1 -my-0.5 -mx-1 rounded truncate",
    "hover:bg-[color:color-mix(in_srgb,var(--color-text)_4%,transparent)]",
    "focus:bg-surface focus:text-text focus:shadow-[0_0_0_1px_var(--color-border)]",
    extraClassName,
  ]
    .filter(Boolean)
    .join(" ");
}

export type TextFieldVariant = "default" | "shell" | "inlineRow";

function resolveTextFieldClassName(
  variant: TextFieldVariant,
  fieldSize: TextFieldSize,
  className?: string,
): string {
  switch (variant) {
    case "shell":
      return shellTextFieldClassName(className);
    case "inlineRow":
      return inlineRowTextFieldClassName(className);
    default:
      return textFieldClassName(fieldSize, className);
  }
}

export type TextFieldProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "size"
> & {
  /** @default sm */
  fieldSize?: TextFieldSize;
  /** Layout/skin preset; `default` uses {@link fieldSize}. */
  variant?: TextFieldVariant;
  className?: string;
};

/**
 * Native text input with shared Data Manager styling.
 */
export const TextField = forwardRef<HTMLInputElement, TextFieldProps>(
  function TextField(
    {
      fieldSize = "sm",
      variant = "default",
      className = "",
      type = "text",
      ...rest
    },
    ref,
  ) {
    return (
      <input
        ref={ref}
        type={type}
        className={resolveTextFieldClassName(variant, fieldSize, className)}
        {...rest}
      />
    );
  },
);
