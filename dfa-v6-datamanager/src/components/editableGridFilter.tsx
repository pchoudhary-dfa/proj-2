"use client";

import type { ReactNode } from "react";
import {
  SearchInputBar,
  type SearchInputBarSize,
} from "@/components/SearchInputBar";
import {
  SelectField,
  type SelectFieldOption,
} from "@/components/SelectField";

export type EditableGridFilterSearchDef = {
  kind: "search";
  value: string;
  onChange: (value: string) => void;
  ariaLabel: string;
  placeholder: string;
  size?: SearchInputBarSize;
};

export type EditableGridFilterSelectDef = {
  kind: "select";
  value: string;
  onChange: (value: string) => void;
  ariaLabel: string;
  options: SelectFieldOption[];
  searchEnabled?: boolean;
  menuPortal?: boolean;
};

export type EditableGridFilterDef =
  | EditableGridFilterSearchDef
  | EditableGridFilterSelectDef;

/** Renders filter-row controls from {@link EditableGridFilterDef}. */
export function renderEditableGridFilter(
  filter: EditableGridFilterDef
): ReactNode {
  switch (filter.kind) {
    case "search":
      return (
        <SearchInputBar
          embedded
          size={filter.size}
          placeholder={filter.placeholder}
          value={filter.value}
          onChange={(e) => filter.onChange(e.target.value)}
          aria-label={filter.ariaLabel}
        />
      );
    case "select":
      return (
        <SelectField
          menuPortal={filter.menuPortal}
          searchEnabled={filter.searchEnabled}
          value={filter.value}
          onChange={(e) => filter.onChange(e.target.value)}
          aria-label={filter.ariaLabel}
          options={filter.options}
          className="[&_button]:!h-7 [&_button]:!min-h-7 [&_button]:!py-0 [&_button]:!px-2"
        />
      );
    default:
      return null;
  }
}
