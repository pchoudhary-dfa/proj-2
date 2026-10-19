"use client";

import type {
  HTMLAttributes,
  HTMLInputTypeAttribute,
  KeyboardEvent,
  ReactNode,
  RefObject,
} from "react";
import {
  GridInlineTextField,
  type GridInlineTextEditConfig,
} from "@/components/gridEditableTextCell";
import {
  GridInlineSelectField,
  type GridInlineSelectEditConfig,
} from "@/components/gridEditableSelectCell";
import {
  GridInlineComboboxField,
  type GridInlineComboboxEditConfig,
} from "@/components/gridEditableComboboxCell";
import type {
  SearchableListComboboxCreateSlot,
  SearchableListComboboxOption,
  SearchableListComboboxProps,
} from "@/components/SearchableListCombobox";
import type { SelectFieldOption } from "@/components/SelectField";
import type { EditableGridCellContext } from "@/components/TableView";
import { ENABLE_GRID_AUTOSUGGESTIONS } from "@/lib/constants";
import { collectGridSuggestions } from "@/lib/gridSuggestions";

export type EditableGridEditTextFieldDef<TRow> = {
  kind: "text";
  value: string | ((ctx: EditableGridCellContext<TRow>) => string);
  onChange: (value: string) => void;
  /**
   * Explicit suggestion vocabulary. When omitted, use {@link suggestFromRow} with
   * `ctx.gridSuggestions` (built by {@link EditableDataGridBody} from loaded rows).
   */
  suggestions?:
    | string[]
    | ((ctx: EditableGridCellContext<TRow>) => string[]);
  /** Distinct values from loaded grid rows — no page-level `collectGridSuggestions` needed. */
  suggestFromRow?: (row: TRow) => string | null | undefined;
  inputRef?:
    | RefObject<HTMLInputElement | null>
    | ((el: HTMLInputElement | null) => void);
  className?: string;
  disabled?: boolean | ((ctx: EditableGridCellContext<TRow>) => boolean);
  ariaLabel?: string;
  placeholder?: string;
  onEscape?: () => void;
  onEnter?: () => void;
  onKeyDown?: (e: KeyboardEvent<HTMLInputElement>) => void;
  type?: HTMLInputTypeAttribute;
  inputMode?: HTMLAttributes<HTMLInputElement>["inputMode"];
  id?: string;
  maxLength?: number;
  minLength?: number;
  inputProps?: GridInlineTextEditConfig["inputProps"];
  /** Defaults to `ctx.mode === "edit"`. */
  when?: (ctx: EditableGridCellContext<TRow>) => boolean;
};

export type EditableGridEditSelectFieldDef<TRow> = {
  kind: "select";
  value: string | ((ctx: EditableGridCellContext<TRow>) => string);
  onChange: (value: string) => void;
  options:
    | SelectFieldOption[]
    | ((ctx: EditableGridCellContext<TRow>) => SelectFieldOption[]);
  ariaLabel?: string;
  className?: string;
  disabled?: boolean | ((ctx: EditableGridCellContext<TRow>) => boolean);
  menuPortal?: boolean;
  searchEnabled?: boolean;
  when?: (ctx: EditableGridCellContext<TRow>) => boolean;
};

export type EditableGridEditComboboxFieldDef<TRow> = {
  kind: "combobox";
  inputValue: string | ((ctx: EditableGridCellContext<TRow>) => string);
  onInputChange: (value: string) => void;
  open: boolean | ((ctx: EditableGridCellContext<TRow>) => boolean);
  onOpenChange: (open: boolean) => void;
  highlightIndex: number | ((ctx: EditableGridCellContext<TRow>) => number);
  onHighlightChange: (index: number) => void;
  navigableCount: number | ((ctx: EditableGridCellContext<TRow>) => number);
  options:
    | SearchableListComboboxOption[]
    | ((ctx: EditableGridCellContext<TRow>) => SearchableListComboboxOption[]);
  selectedId: string | null | ((ctx: EditableGridCellContext<TRow>) => string | null);
  onSelect: (id: string) => void;
  gridSuggestions?:
    | string[]
    | ((ctx: EditableGridCellContext<TRow>) => string[]);
  inputRef?: RefObject<HTMLInputElement | null>;
  className?: string;
  inputClassName?: string;
  placeholder?: string;
  disabled?: boolean | ((ctx: EditableGridCellContext<TRow>) => boolean);
  ariaLabel?: string;
  emptyMessage?: string;
  onEnterWhenClosed?: () => void;
  openOnArrowDown?: boolean;
  menuPortal?: boolean;
  createSlot?: SearchableListComboboxCreateSlot;
  afterSelectFocusRef?: RefObject<HTMLElement | null>;
  onListScroll?: SearchableListComboboxProps["onListScroll"];
  onNeedMoreIfNotScrollable?: SearchableListComboboxProps["onNeedMoreIfNotScrollable"];
  listFooter?: SearchableListComboboxProps["listFooter"];
  when?: (ctx: EditableGridCellContext<TRow>) => boolean;
};

export type EditableGridEditFieldDef<TRow> =
  | EditableGridEditTextFieldDef<TRow>
  | EditableGridEditSelectFieldDef<TRow>
  | EditableGridEditComboboxFieldDef<TRow>;

/** Memoized per render in {@link EditableDataGridBody} for columns with `editField.suggestFromRow`. */
export function buildGridEditFieldSuggestionsMap<TRow>(
  columns: ReadonlyArray<{ id: string; editField?: EditableGridEditFieldDef<TRow> }>,
  rows: readonly TRow[]
): Map<string, string[]> {
  const out = new Map<string, string[]>();
  if (!ENABLE_GRID_AUTOSUGGESTIONS) return out;
  for (const col of columns) {
    const field = col.editField;
    if (field?.kind !== "text" || !field.suggestFromRow || field.suggestions != null) {
      continue;
    }
    out.set(col.id, collectGridSuggestions(rows, field.suggestFromRow));
  }
  return out;
}

function resolveTextEditConfig<TRow>(
  field: EditableGridEditTextFieldDef<TRow>,
  ctx: EditableGridCellContext<TRow>
): GridInlineTextEditConfig {
  const {
    kind: _kind,
    value,
    suggestions,
    suggestFromRow: _suggestFromRow,
    disabled,
    when: _when,
    ...rest
  } = field;
  void _kind;
  void _when;
  void _suggestFromRow;
  void suggestions;
  return {
    ...rest,
    value: typeof value === "function" ? value(ctx) : value,
    disabled:
      typeof disabled === "function" ? disabled(ctx) : disabled,
  };
}

function resolveComboboxEditConfig<TRow>(
  field: EditableGridEditComboboxFieldDef<TRow>,
  ctx: EditableGridCellContext<TRow>
): GridInlineComboboxEditConfig {
  const {
    kind: _kind,
    inputValue,
    open,
    highlightIndex,
    navigableCount,
    options,
    selectedId,
    gridSuggestions,
    disabled,
    when: _when,
    ...rest
  } = field;
  void _kind;
  void _when;
  return {
    ...rest,
    inputValue: typeof inputValue === "function" ? inputValue(ctx) : inputValue,
    open: typeof open === "function" ? open(ctx) : open,
    highlightIndex:
      typeof highlightIndex === "function" ? highlightIndex(ctx) : highlightIndex,
    navigableCount:
      typeof navigableCount === "function" ? navigableCount(ctx) : navigableCount,
    options: typeof options === "function" ? options(ctx) : options,
    selectedId:
      typeof selectedId === "function" ? selectedId(ctx) : selectedId,
    gridSuggestions:
      typeof gridSuggestions === "function" ? gridSuggestions(ctx) : gridSuggestions,
    disabled:
      typeof disabled === "function" ? disabled(ctx) : disabled,
  };
}

function resolveSelectEditConfig<TRow>(
  field: EditableGridEditSelectFieldDef<TRow>,
  ctx: EditableGridCellContext<TRow>
): GridInlineSelectEditConfig {
  const {
    kind: _kind,
    value,
    options,
    disabled,
    when: _when,
    ...rest
  } = field;
  void _kind;
  void _when;
  return {
    ...rest,
    value: typeof value === "function" ? value(ctx) : value,
    options: typeof options === "function" ? options(ctx) : options,
    disabled:
      typeof disabled === "function" ? disabled(ctx) : disabled,
  };
}

export function renderEditableGridEditField<TRow>(
  field: EditableGridEditFieldDef<TRow>,
  ctx: EditableGridCellContext<TRow>
): ReactNode {
  switch (field.kind) {
    case "text":
      return (
        <GridInlineTextField {...resolveTextEditConfig(field, ctx)} />
      );
    case "select":
      return (
        <GridInlineSelectField {...resolveSelectEditConfig(field, ctx)} />
      );
    case "combobox":
      return (
        <GridInlineComboboxField {...resolveComboboxEditConfig(field, ctx)} />
      );
    default:
      return null;
  }
}

/** Body cell from declarative `viewCell` + `editField`, or custom `cell`. */
export function renderEditableGridBodyCell<TRow>(
  col: {
    editField?: EditableGridEditFieldDef<TRow>;
    viewCell?: (ctx: EditableGridCellContext<TRow>) => ReactNode;
    cell?: (ctx: EditableGridCellContext<TRow>) => ReactNode;
  },
  ctx: EditableGridCellContext<TRow>
): ReactNode {
  if (col.viewCell) {
    if (col.editField) {
      const when =
        col.editField.when ??
        ((c: EditableGridCellContext<TRow>) => c.mode === "edit");
      if (when(ctx)) {
        return renderEditableGridEditField(col.editField, ctx);
      }
    }
    return col.viewCell(ctx);
  }
  return col.cell?.(ctx) ?? null;
}
