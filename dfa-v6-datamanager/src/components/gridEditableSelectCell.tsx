"use client";

import type { KeyboardEvent } from "react";
import {
  SelectField,
  gridSelectFieldClassName,
  type SelectFieldOption,
} from "@/components/SelectField";

/** Inline select field config for grid body / add-row cells. */
export type GridInlineSelectEditConfig = {
  value: string;
  onChange: (value: string) => void;
  options: SelectFieldOption[];
  ariaLabel?: string;
  className?: string;
  disabled?: boolean;
  menuPortal?: boolean;
  searchEnabled?: boolean;
  onKeyDown?: (e: KeyboardEvent<HTMLButtonElement>) => void;
  inputProps?: Record<string, string>;
};

export function GridInlineSelectField({
  value,
  onChange,
  options,
  ariaLabel,
  className,
  disabled,
  menuPortal = true,
  searchEnabled,
  onKeyDown,
  inputProps,
}: GridInlineSelectEditConfig) {
  return (
    <SelectField
      dataTvEnterField
      menuPortal={menuPortal}
      searchEnabled={searchEnabled}
      className={gridSelectFieldClassName(className)}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      aria-label={ariaLabel}
      options={options}
      onKeyDown={onKeyDown}
      {...inputProps}
    />
  );
}
