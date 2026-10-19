"use client";

import { forwardRef, type TextareaHTMLAttributes } from "react";
import type { TextFieldSize } from "@/components/TextField";

export type TextAreaFieldSize = TextFieldSize;

const TEXTAREA_FIELD_BASE =
  "box-border min-w-0 w-full border border-border bg-surface font-body text-text " +
  "outline-none transition-[border-color,box-shadow] " +
  "placeholder:font-normal placeholder:text-text-muted " +
  "focus:border-primary " +
  "disabled:cursor-not-allowed disabled:opacity-50";

const TEXTAREA_FIELD_BY_SIZE: Record<TextAreaFieldSize, string> = {
  xs:
    "field-comp--xs w-full min-h-[50px] max-h-[50px] h-[50px] resize-none overflow-y-auto py-1 leading-5",
  sm:
    "min-h-[50px] max-h-[50px] resize-none overflow-y-auto rounded-sm px-2 py-1 " +
    "text-xs font-normal leading-5 focus:shadow-[var(--shadow-focus-ring)]",
  md:
    "min-h-[84px] resize-y rounded-sm px-2 py-1.5 text-xs font-normal leading-normal " +
    "focus:shadow-[var(--shadow-focus-ring)]",
  lg:
    "min-h-[100px] resize-y rounded-sm px-3 py-2 text-sm font-normal leading-normal " +
    "focus:shadow-[var(--shadow-focus-ring)]",
};

/**
 * Tailwind classes for a standard textarea. Use `extraClassName` for width,
 * monospace, error borders, chat-style rounding, etc.
 */
export function textareaFieldClassName(
  size: TextAreaFieldSize = "sm",
  extraClassName?: string,
): string {
  const parts =
    size === "xs"
      ? [TEXTAREA_FIELD_BY_SIZE.xs, extraClassName]
      : [TEXTAREA_FIELD_BASE, TEXTAREA_FIELD_BY_SIZE[size], extraClassName];
  return parts.filter(Boolean).join(" ").trim();
}

export type TextAreaFieldProps = Omit<
  TextareaHTMLAttributes<HTMLTextAreaElement>,
  "size"
> & {
  /** @default sm */
  fieldSize?: TextAreaFieldSize;
  className?: string;
};

/**
 * Native textarea with shared Data Manager styling (paired with {@link TextField}).
 */
export const TextAreaField = forwardRef<
  HTMLTextAreaElement,
  TextAreaFieldProps
>(function TextAreaField(
  { fieldSize = "sm", className = "", rows, ...rest },
  ref,
) {
  return (
    <textarea
      ref={ref}
      rows={rows}
      className={textareaFieldClassName(fieldSize, className)}
      {...rest}
    />
  );
});
