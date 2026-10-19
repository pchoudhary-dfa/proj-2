"use client";

import type { SelectHTMLAttributes } from "react";

export type SelectFieldOption = {
  value: string;
  label: string;
  disabled?: boolean;
};

export type SelectFieldProps = Omit<
  SelectHTMLAttributes<HTMLSelectElement>,
  "className"
> & {
  className?: string;
  options: SelectFieldOption[];
  placeholder?: string;
};

export function SelectField({
  className = "w-full",
  options,
  placeholder,
  value,
  ...rest
}: SelectFieldProps) {
  return (
    <select
      className={`field-comp--md min-w-0 ${className}`.trim()}
      value={value}
      {...rest}
    >
      {placeholder ? <option value="">{placeholder}</option> : null}
      {options.map((opt) => (
        <option key={opt.value} value={opt.value} disabled={opt.disabled}>
          {opt.label}
        </option>
      ))}
    </select>
  );
}
