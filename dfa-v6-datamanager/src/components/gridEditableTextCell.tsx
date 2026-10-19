"use client";

import type {
  FocusEvent,
  HTMLAttributes,
  HTMLInputTypeAttribute,
  KeyboardEvent,
  RefObject,
} from "react";
import { gridTextFieldClassName } from "@/components/TextField";

/** Inline text field config for grid body / add-row cells. */
export type GridInlineTextEditConfig = {
  value: string;
  onChange: (value: string) => void;
  inputRef?:
    | RefObject<HTMLInputElement | null>
    | ((el: HTMLInputElement | null) => void);
  className?: string;
  disabled?: boolean;
  ariaLabel?: string;
  placeholder?: string;
  onEscape?: () => void;
  onEnter?: () => void;
  onKeyDown?: (e: KeyboardEvent<HTMLInputElement>) => void;
  onBlur?: (e: FocusEvent<HTMLInputElement>) => void;
  type?: HTMLInputTypeAttribute;
  inputMode?: HTMLAttributes<HTMLInputElement>["inputMode"];
  autoComplete?: string;
  id?: string;
  maxLength?: number;
  minLength?: number;
  /** TableView add-row keyboard navigation. */
  dataTvEnterField?: string | boolean;
  /** Extra native input attributes (e.g. data-dm-dp-* nav hooks). */
  inputProps?: Record<string, string | number | boolean | undefined>;
};

function renderGridInlineTextField(config: GridInlineTextEditConfig) {
  const {
    value,
    onChange,
    inputRef,
    className = gridTextFieldClassName(),
    disabled,
    ariaLabel,
    placeholder,
    onEscape,
    onEnter,
    onKeyDown,
    onBlur,
    type,
    inputMode,
    autoComplete = "off",
    id,
    maxLength,
    minLength,
    dataTvEnterField,
    inputProps,
  } = config;

  return (
    <input
      ref={inputRef}
      id={id}
      type={type ?? "text"}
      className={className}
      value={value}
      placeholder={placeholder}
      disabled={disabled}
      aria-label={ariaLabel}
      autoComplete={autoComplete}
      inputMode={inputMode}
      maxLength={maxLength}
      minLength={minLength}
      spellCheck={false}
      data-tv-enter-field={dataTvEnterField}
      onChange={(e) => onChange(e.target.value)}
      onBlur={onBlur}
      onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => {
        onKeyDown?.(e);
        if (e.defaultPrevented) return;
        if (e.key === "Escape" && onEscape) {
          e.preventDefault();
          onEscape();
          return;
        }
        if (e.key === "Enter" && onEnter) {
          e.preventDefault();
          onEnter();
        }
      }}
      {...inputProps}
    />
  );
}

/** Direct render for custom cell layouts (e.g. areas tree draft row, add-row fields). */
export function GridInlineTextField(config: GridInlineTextEditConfig) {
  return renderGridInlineTextField(config);
}
