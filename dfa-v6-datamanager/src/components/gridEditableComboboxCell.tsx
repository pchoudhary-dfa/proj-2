"use client";

import {
  SearchableListCombobox,
  type SearchableListComboboxCreateSlot,
  type SearchableListComboboxOption,
  type SearchableListComboboxProps,
} from "@/components/SearchableListCombobox";
import { gridTextFieldClassName } from "@/components/TextField";
import type { RefObject } from "react";

/** Inline combobox config — rendered via {@link SearchableListCombobox}. */
export type GridInlineComboboxEditConfig = {
  inputValue: string;
  onInputChange: (value: string) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  highlightIndex: number;
  onHighlightChange: (index: number) => void;
  navigableCount: number;
  options: SearchableListComboboxOption[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  gridSuggestions?: string[];
  inputRef?: RefObject<HTMLInputElement | null>;
  className?: string;
  inputClassName?: string;
  placeholder?: string;
  disabled?: boolean;
  ariaLabel?: string;
  emptyMessage?: string;
  onEnterWhenClosed?: () => void;
  openOnArrowDown?: boolean;
  menuPortal?: boolean;
  createSlot?: SearchableListComboboxCreateSlot;
  afterSelectFocusRef?: SearchableListComboboxProps["afterSelectFocusRef"];
  onListScroll?: SearchableListComboboxProps["onListScroll"];
  onNeedMoreIfNotScrollable?: SearchableListComboboxProps["onNeedMoreIfNotScrollable"];
  listFooter?: SearchableListComboboxProps["listFooter"];
  dataTvEnterField?: boolean;
};

export function GridInlineComboboxField(config: GridInlineComboboxEditConfig) {
  const {
    inputClassName = gridTextFieldClassName(),
    className,
    dataTvEnterField = true,
    ...rest
  } = config;

  const props: SearchableListComboboxProps = {
    ...rest,
    className,
    inputClassName,
    dataTvEnterField,
  };

  return <SearchableListCombobox {...props} />;
}
