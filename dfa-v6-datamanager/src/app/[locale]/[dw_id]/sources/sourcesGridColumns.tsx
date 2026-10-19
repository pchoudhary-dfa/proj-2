"use client";

import type { RefObject } from "react";
import { useMemo } from "react";
import type { SourceRaw } from "@/lib/api/types";
import { GridInlineSaveCancelActions } from "@/components/GridInlineSaveCancelActions";
import { gridTextFieldClassName } from "@/components/TextField";
import { ICON_ACTION_COLUMN_LAYOUT } from "@/components/editableGridColumnClasses";
import {
  iconPairActionColumnHeader,
  type EditableGridColumnDef,
} from "@/components/TableView";

/** First editable inline field in column order, or the column the user double-clicked. */
export type SourceInlineFocusField =
  | "publisher"
  | "title"
  | "year"
  | "short_name";

export function sourceRowId(row: SourceRaw): string {
  const nid = row.src_nid ?? row.ic_nid;
  if (nid != null) return `id-${nid}`;
  const gid = (row.src_gid ?? row.ic_gid ?? "").trim();
  if (gid) return `gid-${gid}`;
  return "";
}

export type UseSourcesGridColumnsParams = {
  t: (code: string, fallback?: string) => string;
  allRowsSelected: boolean;
  selectedRowIds: Set<string>;
  selectAll: () => void;
  toggleSelect: (rowId: string) => void;
  colFilterName: string;
  setColFilterName: (v: string) => void;
  colFilterPublisher: string;
  setColFilterPublisher: (v: string) => void;
  colFilterTitle: string;
  setColFilterTitle: (v: string) => void;
  colFilterYear: string;
  setColFilterYear: (v: string) => void;
  colFilterShortName: string;
  setColFilterShortName: (v: string) => void;
  onSortName: () => void;
  onSortPublisher: () => void;
  onSortTitle: () => void;
  onSortYear: () => void;
  onSortShortName: () => void;
  sortIconName: "arrow_upward" | "arrow_downward" | "unfold_more";
  sortIconPublisher: "arrow_upward" | "arrow_downward" | "unfold_more";
  sortIconTitle: "arrow_upward" | "arrow_downward" | "unfold_more";
  sortIconYear: "arrow_upward" | "arrow_downward" | "unfold_more";
  sortIconShortName: "arrow_upward" | "arrow_downward" | "unfold_more";
  editingRowId: string | null;
  inlinePublisher: string;
  setInlinePublisher: (v: string) => void;
  inlineTitle: string;
  setInlineTitle: (v: string) => void;
  inlineYear: string;
  setInlineYear: (v: string) => void;
  inlineShortName: string;
  setInlineShortName: (v: string) => void;
  inlinePublisherInputRef: RefObject<HTMLInputElement | null>;
  inlineTitleInputRef: RefObject<HTMLInputElement | null>;
  inlineYearInputRef: RefObject<HTMLInputElement | null>;
  inlineShortNameInputRef: RefObject<HTMLInputElement | null>;
  inlineSaveLoading: boolean;
  onStartInlineEdit: (row: SourceRaw, focusField: SourceInlineFocusField) => void;
  onInlineSave: () => void;
  onInlineCancel: () => void;
};

function displayCell(s: string | null | undefined): string {
  const v = (s ?? "").trim();
  return v || "—";
}

function resolveField(
  row: SourceRaw,
  ext: keyof SourceRaw,
  int: keyof SourceRaw
): string | null | undefined {
  return (row[ext] as string | null | undefined) ?? (row[int] as string | null | undefined);
}

export function useSourcesGridColumns(
  p: UseSourcesGridColumnsParams
): EditableGridColumnDef<SourceRaw>[] {
  const { t } = p;
  return useMemo((): EditableGridColumnDef<SourceRaw>[] => {
    return [
      {
        id: "select",
        layout: { width: 1 },
        header: {
          kind: "selectAll",
          checked: p.allRowsSelected,
          onChange: p.selectAll,
          ariaLabel: t("SELECT_ALL"),
        },
        filter: null,
        cell: ({ row }) => {
          const id = sourceRowId(row);
          return (
            <input
              type="checkbox"
              className="checkbox-comp"
              checked={id ? p.selectedRowIds.has(id) : false}
              onChange={() => id && p.toggleSelect(id)}
              aria-label={t("SELECT_ROW_SOURCE").replace("{id}", id || "row")}
            />
          );
        },
      },
      {
        id: "src_name",
        layout: { width: 20, unit: "%", sticky: true, main: true },
        header: {
          kind: "sort",
          text: t("SOURCES"),
          onSort: p.onSortName,
          sortIcon: p.sortIconName,
          sortAriaLabel: t("SORT_SRC_NAME"),
        },
        filter: {
          kind: "search",
          value: p.colFilterName,
          onChange: p.setColFilterName,
          placeholder: t("SEARCH_PLACEHOLDER"),
          ariaLabel: t("SEARCH"),
        },
        onCellDoubleClick: ({ row }) =>
          p.onStartInlineEdit(row, "publisher"),
        cell: ({ row }) => (
          <span className="cell-name">
            {displayCell(resolveField(row, "src_name", "ic_name"))}
          </span>
        ),
      },
      {
        id: "publisher",
        layout: { width: 15, unit: "%" },
        header: {
          kind: "sort",
          text: t("SOURCE_PUBLISHER"),
          onSort: p.onSortPublisher,
          sortIcon: p.sortIconPublisher,
          sortAriaLabel: t("SORT_SRC_PUBLISHER"),
        },
        filter: {
          kind: "search",
          value: p.colFilterPublisher,
          onChange: p.setColFilterPublisher,
          placeholder: t("SEARCH_PLACEHOLDER"),
          ariaLabel: t("SEARCH"),
        },
        onCellDoubleClick: ({ row }) =>
          p.onStartInlineEdit(row, "publisher"),
        viewCell: ({ row }) => (
          <span>
            {displayCell(resolveField(row, "src_publisher", "publisher"))}
          </span>
        ),
        editField: {
          kind: "text",
          value: p.inlinePublisher,
          onChange: p.setInlinePublisher,
          inputRef: p.inlinePublisherInputRef,
          className: gridTextFieldClassName("min-w-0"),
          disabled: p.inlineSaveLoading,
          ariaLabel: t("SOURCE_PUBLISHER"),
          onEscape: p.onInlineCancel,
        },
      },
      {
        id: "title",
        layout: { width: 21, unit: "%" },
        header: {
          kind: "sort",
          text: t("SOURCE_TITLE"),
          onSort: p.onSortTitle,
          sortIcon: p.sortIconTitle,
          sortAriaLabel: t("SORT_SRC_TITLE"),
        },
        filter: {
          kind: "search",
          value: p.colFilterTitle,
          onChange: p.setColFilterTitle,
          placeholder: t("SEARCH_PLACEHOLDER"),
          ariaLabel: t("SEARCH"),
        },
        onCellDoubleClick: ({ row }) =>
          p.onStartInlineEdit(row, "title"),
        viewCell: ({ row }) => (
          <span>
            {displayCell(resolveField(row, "src_title", "title"))}
          </span>
        ),
        editField: {
          kind: "text",
          value: p.inlineTitle,
          onChange: p.setInlineTitle,
          inputRef: p.inlineTitleInputRef,
          className: gridTextFieldClassName("min-w-0"),
          disabled: p.inlineSaveLoading,
          ariaLabel: t("SOURCE_TITLE"),
          onEscape: p.onInlineCancel,
        },
      },
      {
        id: "year",
        layout: { width: 9, unit: "%" },
        header: {
          kind: "sort",
          text: t("YEAR"),
          onSort: p.onSortYear,
          sortIcon: p.sortIconYear,
          sortAriaLabel: t("SORT_SRC_YEAR"),
        },
        filter: {
          kind: "search",
          value: p.colFilterYear,
          onChange: p.setColFilterYear,
          placeholder: t("SEARCH_PLACEHOLDER"),
          ariaLabel: t("SEARCH"),
        },
        onCellDoubleClick: ({ row }) =>
          p.onStartInlineEdit(row, "year"),
        viewCell: ({ row }) => (
          <span className="text-xs">
            {displayCell(resolveField(row, "src_year", "diyear"))}
          </span>
        ),
        editField: {
          kind: "text",
          value: p.inlineYear,
          onChange: p.setInlineYear,
          inputRef: p.inlineYearInputRef,
          className: gridTextFieldClassName("min-w-0"),
          disabled: p.inlineSaveLoading,
          ariaLabel: t("YEAR"),
          onEscape: p.onInlineCancel,
        },
      },
      {
        id: "short_name",
        layout: { width: 15, unit: "%" },
        header: {
          kind: "sort",
          text: t("SHORT_NAME"),
          onSort: p.onSortShortName,
          sortIcon: p.sortIconShortName,
          sortAriaLabel: t("SORT"),
        },
        filter: {
          kind: "search",
          value: p.colFilterShortName,
          onChange: p.setColFilterShortName,
          placeholder: t("SEARCH_PLACEHOLDER"),
          ariaLabel: t("SEARCH"),
        },
        onCellDoubleClick: ({ row }) =>
          p.onStartInlineEdit(row, "short_name"),
        viewCell: ({ row }) => (
          <span className="text-xs">
            {displayCell(
              resolveField(row, "src_short_name", "ic_short_name")
            )}
          </span>
        ),
        editField: {
          kind: "text",
          value: p.inlineShortName,
          onChange: p.setInlineShortName,
          inputRef: p.inlineShortNameInputRef,
          className: gridTextFieldClassName("min-w-0"),
          disabled: p.inlineSaveLoading,
          ariaLabel: t("SHORT_NAME"),
          onEscape: p.onInlineCancel,
        },
      },
      {
        id: "actions",
        layout: ICON_ACTION_COLUMN_LAYOUT,
        header: iconPairActionColumnHeader(t("ACTION", "Action")),
        filter: null,
        cell: ({ row, mode }) => {
          if (mode !== "edit" || p.editingRowId !== sourceRowId(row)) {
            return null;
          }
          return (
            <GridInlineSaveCancelActions
              onSave={p.onInlineSave}
              onCancel={p.onInlineCancel}
              saveLoading={p.inlineSaveLoading}
              saveTitle={t("SAVE")}
              saveAriaLabel={t("SAVE")}
              cancelTitle={t("CANCEL_INLINE_EDIT")}
              cancelAriaLabel={t("CANCEL_INLINE_EDIT")}
            />
          );
        },
      },
    ];
  }, [
    t,
    p.allRowsSelected,
    p.selectedRowIds,
    p.selectAll,
    p.toggleSelect,
    p.colFilterName,
    p.setColFilterName,
    p.colFilterPublisher,
    p.setColFilterPublisher,
    p.colFilterTitle,
    p.setColFilterTitle,
    p.colFilterYear,
    p.setColFilterYear,
    p.colFilterShortName,
    p.setColFilterShortName,
    p.onSortName,
    p.onSortPublisher,
    p.onSortTitle,
    p.onSortYear,
    p.onSortShortName,
    p.sortIconName,
    p.sortIconPublisher,
    p.sortIconTitle,
    p.sortIconYear,
    p.sortIconShortName,
    p.editingRowId,
    p.inlinePublisher,
    p.setInlinePublisher,
    p.inlineTitle,
    p.setInlineTitle,
    p.inlineYear,
    p.setInlineYear,
    p.inlineShortName,
    p.setInlineShortName,
    p.inlinePublisherInputRef,
    p.inlineTitleInputRef,
    p.inlineYearInputRef,
    p.inlineShortNameInputRef,
    p.inlineSaveLoading,
    p.onStartInlineEdit,
    p.onInlineSave,
    p.onInlineCancel,
  ]);
}
