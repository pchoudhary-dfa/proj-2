"use client";

import type { RefObject } from "react";
import { useMemo } from "react";
import type { RoleRaw } from "@/lib/api/types";
import { gridTextFieldClassName } from "@/components/TextField";
import { GridConfigureButton } from "@/components/GridConfigureButton";
import { ICON_ACTION_COLUMN_LAYOUT } from "@/components/editableGridColumnClasses";
import {
  iconPairActionColumnHeader,
  InlineEditRowActions,
  type EditableGridColumnDef,
} from "@/components/TableView";

/** Background hooks only — widths come from `layout`. */
const TH_CODE = "bg-surface-muted";
const TD_CODE = "bg-surface";

export type RoleInlineFocusField = "name" | "role_code" | "description";

export function roleRowId(row: RoleRaw): string {
  return `id-${row.id}`;
}

export type UseRolesGridColumnsParams = {
  t: (code: string, fallback?: string) => string;
  allRowsSelected: boolean;
  selectedRowIds: Set<string>;
  selectAll: () => void;
  toggleSelect: (rowId: string) => void;
  colFilterName: string;
  setColFilterName: (v: string) => void;
  colFilterCode: string;
  setColFilterCode: (v: string) => void;
  onSortRoleCode: () => void;
  sortIconRoleCode: "arrow_upward" | "arrow_downward" | "unfold_more";
  editingRowId: string | null;
  inlineName: string;
  setInlineName: (v: string) => void;
  inlineNameInputRef: RefObject<HTMLInputElement | null>;
  inlineCode: string;
  setInlineCode: (v: string) => void;
  inlineCodeInputRef: RefObject<HTMLInputElement | null>;
  inlineDescription: string;
  setInlineDescription: (v: string) => void;
  inlineDescriptionInputRef: RefObject<HTMLInputElement | null>;
  inlineSaveLoading: boolean;
  onStartInlineEdit?: (row: RoleRaw, focusField: RoleInlineFocusField) => void;
  onInlineSave: () => void;
  onInlineCancel: () => void;
  openConfigPanel?: (row: RoleRaw) => void;
};

function displayCell(s: string | number | null | undefined): string {
  if (s == null) return "—";
  const v = String(s).trim();
  return v || "—";
}

export function useRolesGridColumns(
  p: UseRolesGridColumnsParams
): EditableGridColumnDef<RoleRaw>[] {
  const { t } = p;
  return useMemo((): EditableGridColumnDef<RoleRaw>[] => {
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
          const id = roleRowId(row);
          const isSystem = Boolean(row.is_system_role);
          return (
            <input
              type="checkbox"
              className="checkbox-comp"
              checked={id ? p.selectedRowIds.has(id) : false}
              onChange={() => id && p.toggleSelect(id)}
              disabled={isSystem}
              title={isSystem ? t("CANNOT_DELETE_SYSTEM_ROLE") : undefined}
              aria-label={t("SELECT_ROW_ROLE").replace("{id}", id || "row")}
            />
          );
        },
      },
      {
        id: "name",
        layout: { width: 5, minWidth: 200, sticky: true, main: true },
        header: { kind: "sortWrapLabel", text: t("NAME") },
        filter: {
          kind: "search",
          value: p.colFilterName,
          onChange: p.setColFilterName,
          placeholder: t("SEARCH_PLACEHOLDER"),
          ariaLabel: t("FILTER_BY_LABEL").replace("{label}", t("NAME")),
        },
        onCellDoubleClick: p.onStartInlineEdit ? ({ row }) => p.onStartInlineEdit!(row, "name") : undefined,
        viewCell: ({ row }) => (
          <span className="cell-name">
            {displayCell(row.name)}
            {Boolean(row.is_system_role) && (
              <span className="label-tag tone-pill--muted-subtle ml-1.5">
                {t("SYSTEM_ROLE_BADGE")}
              </span>
            )}
          </span>
        ),
        editField: {
          kind: "text",
          value: p.inlineName,
          onChange: p.setInlineName,
          inputRef: p.inlineNameInputRef,
          className: gridTextFieldClassName("min-w-0"),
          disabled: p.inlineSaveLoading,
          ariaLabel: t("NAME"),
          onEscape: p.onInlineCancel,
        },
      },
      {
        id: "role_code",
        layout: { width: 20, unit: "%" },
        header: {
          kind: "sort",
          text: t("ROLE_CODE"),
          onSort: p.onSortRoleCode,
          sortIcon: p.sortIconRoleCode,
          sortAriaLabel: t("SORT_BY_LABEL").replace("{label}", t("ROLE_CODE")),
        },
        filter: {
          kind: "search",
          value: p.colFilterCode,
          onChange: p.setColFilterCode,
          placeholder: t("SEARCH_PLACEHOLDER"),
          ariaLabel: t("FILTER_BY_LABEL").replace("{label}", t("ROLE_CODE")),
        },
        onCellDoubleClick: p.onStartInlineEdit ? ({ row }) => p.onStartInlineEdit!(row, "role_code") : undefined,
        viewCell: ({ row }) => (
          <span className="break-all text-xs">
            {displayCell(row.role_code)}
          </span>
        ),
        editField: {
          kind: "text",
          value: p.inlineCode,
          onChange: p.setInlineCode,
          inputRef: p.inlineCodeInputRef,
          className: gridTextFieldClassName("min-w-0"),
          disabled: p.inlineSaveLoading,
          ariaLabel: t("ROLE_CODE"),
          onEscape: p.onInlineCancel,
        },
      },
      {
        id: "description",
        layout: { width: 40, unit: "%" },
        cellOverflowHidden: true,
        header: { kind: "sortWrapLabel", text: t("DESCRIPTION") },
        filter: null,
        onCellDoubleClick: p.onStartInlineEdit ? ({ row }) => p.onStartInlineEdit!(row, "description") : undefined,
        viewCell: ({ row }) => (
          <span
            className="cell-name"
            title={
              row.description?.trim() ? String(row.description).trim() : undefined
            }
          >
            {displayCell(row.description)}
          </span>
        ),
        editField: {
          kind: "text",
          value: p.inlineDescription,
          onChange: p.setInlineDescription,
          inputRef: p.inlineDescriptionInputRef,
          className: gridTextFieldClassName("min-w-0"),
          disabled: p.inlineSaveLoading,
          ariaLabel: t("DESCRIPTION"),
          onEscape: p.onInlineCancel,
        },
      },
      {
        id: "actions",
        layout: ICON_ACTION_COLUMN_LAYOUT,
        header: iconPairActionColumnHeader(t("ACTION", "Action")),
        filter: null,
        cell: ({ row, mode }) => (
          <InlineEditRowActions
            isEditing={mode === "edit" && p.editingRowId === roleRowId(row)}
            saveLoading={p.inlineSaveLoading}
            onSave={p.onInlineSave}
            onCancel={p.onInlineCancel}
            saveTitle={t("SAVE")}
            saveAriaLabel={t("SAVE")}
            cancelTitle={t("CANCEL_INLINE_EDIT")}
            cancelAriaLabel={t("CANCEL_INLINE_EDIT")}
            viewContent={
              p.openConfigPanel ? (
                <GridConfigureButton
                  wrapInActionBtns
                  ariaLabel={t("CONFIGURE", "Configure")}
                  onClick={(e) => {
                    e.stopPropagation();
                    p.openConfigPanel!(row);
                  }}
                />
              ) : null
            }
          />
        ),
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
    p.colFilterCode,
    p.setColFilterCode,
    p.onSortRoleCode,
    p.sortIconRoleCode,
    p.editingRowId,
    p.inlineName,
    p.setInlineName,
    p.inlineNameInputRef,
    p.inlineCode,
    p.setInlineCode,
    p.inlineCodeInputRef,
    p.inlineDescription,
    p.setInlineDescription,
    p.inlineDescriptionInputRef,
    p.inlineSaveLoading,
    p.onStartInlineEdit,
    p.onInlineSave,
    p.onInlineCancel,
    p.openConfigPanel,
  ]);
}
