"use client";

import type { RefObject } from "react";
import { useMemo } from "react";
import { GridInlineSaveCancelActions } from "@/components/GridInlineSaveCancelActions";
import { ToggleSwitch } from "@/components/ToggleSwitch";
import { ICON_ACTION_COLUMN_LAYOUT } from "@/components/editableGridColumnClasses";
import {
  iconPairActionColumnHeader,
  type EditableGridColumnDef,
} from "@/components/TableView";

export type LanguageInlineFocusField = "name" | "code";

interface LanguageRaw {
  lang_nid?: number;
  lang_name: string | null;
  lang_code: string | null;
  lang_is_default: boolean;
  lang_is_global_lock: boolean;
}

export function languageRowId(row: LanguageRaw): string {
  const nid = row.lang_nid;
  if (nid != null) return `id-${nid}`;
  const code = (row.lang_code ?? "").trim();
  if (code) return `code-${code}`;
  return "";
}

export type UseLanguagesGridColumnsParams = {
  t: (code: string, fallback?: string) => string;
  canUpdate: boolean;
  canDelete: boolean;
  allRowsSelected: boolean;
  selectedRowIds: Set<string>;
  selectAll: () => void;
  toggleSelect: (rowId: string) => void;
  colFilterName: string;
  setColFilterName: (v: string) => void;
  colFilterCode: string;
  setColFilterCode: (v: string) => void;
  onSortName: () => void;
  onSortCode: () => void;
  nameSortIcon: "arrow_upward" | "arrow_downward" | "unfold_more";
  codeSortIcon: "arrow_upward" | "arrow_downward" | "unfold_more";
  editingRowId: string | null;
  inlineName: string;
  setInlineName: (v: string) => void;
  inlineCode: string;
  setInlineCode: (v: string) => void;
  inlineNameInputRef: RefObject<HTMLInputElement | null>;
  inlineCodeInputRef: RefObject<HTMLInputElement | null>;
  inlineSaveLoading: boolean;
  onStartInlineEdit: (row: LanguageRaw, focusField: LanguageInlineFocusField) => void;
  onInlineSave: () => void;
  onInlineCancel: () => void;
  onToggleDefault?: (row: LanguageRaw) => void;
};

function displayCell(s: string | null | undefined): string {
  const v = (s ?? "").trim();
  return v || "—";
}

export function useLanguagesGridColumns(
  p: UseLanguagesGridColumnsParams
): EditableGridColumnDef<LanguageRaw>[] {
  const { t } = p;
  const languageNameLabel = t("LANGUAGE_NAME", t("NAME"));
  const languageCodeLabel = t("LANGUAGE_CODE", t("CODE"));
  const defaultLabel = t("DEFAULT", "Default");
  return useMemo((): EditableGridColumnDef<LanguageRaw>[] => {
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
          const id = languageRowId(row);
          return (
            <input
              type="checkbox"
              className="checkbox-comp"
              checked={id ? p.selectedRowIds.has(id) : false}
              onChange={() => id && p.toggleSelect(id)}
              aria-label={t("SELECT_ROW")}
            />
          );
        },
      },
      {
        id: "lang_name",
        layout: { width: 5, minWidth: 180, sticky: true, main: true },
        header: {
          kind: "sort",
          text: languageNameLabel,
          onSort: p.onSortName,
          sortIcon: p.nameSortIcon,
          sortAriaLabel: t("SORT_BY_LABEL", "Sort by {label}").replace("{label}", languageNameLabel),
        },
        filter: {
          kind: "search",
          value: p.colFilterName,
          onChange: p.setColFilterName,
          placeholder: t("SEARCH_PLACEHOLDER"),
          ariaLabel: t("FILTER_BY_LABEL", "Filter by {label}").replace(
            "{label}",
            languageNameLabel
          ),
        },
        onCellDoubleClick: ({ row }) => p.onStartInlineEdit(row, "name"),
        viewCell: ({ row }) => (
          <span className="cell-name">{displayCell(row.lang_name)}</span>
        ),
        editField: {
          kind: "text",
          value: p.inlineName,
          onChange: (v) => p.setInlineName(v.slice(0, 50)),
          inputRef: p.inlineNameInputRef,
          disabled: p.inlineSaveLoading,
          onEscape: p.onInlineCancel,
          onEnter: p.onInlineSave,
        },
      },
      {
        id: "lang_code",
        layout: { width: 5, minWidth: 120, main: true },
        header: {
          kind: "sort",
          text: languageCodeLabel,
          onSort: p.onSortCode,
          sortIcon: p.codeSortIcon,
          sortAriaLabel: t("SORT_BY_LABEL", "Sort by {label}").replace("{label}", languageCodeLabel),
        },
        filter: {
          kind: "search",
          value: p.colFilterCode,
          onChange: p.setColFilterCode,
          placeholder: t("SEARCH_PLACEHOLDER"),
          ariaLabel: t("FILTER_BY_LABEL", "Filter by {label}").replace(
            "{label}",
            languageCodeLabel
          ),
        },
        onCellDoubleClick: undefined,
        cell: ({ row }) => (
          <span className="break-all text-xs">
            {displayCell(row.lang_code)}
          </span>
        ),
      },
      {
        id: "lang_is_default",
        layout: { width: 120 },
        header: { kind: "centered", text: defaultLabel },
        filter: null,
        cell: ({ row }) => {
          return (
            <div className="flex h-full items-center justify-center">
              <ToggleSwitch
                checked={row.lang_is_default}
                onClick={(e) => e.stopPropagation()}
                onCheckedChange={() => p.onToggleDefault?.(row)}
                disabled={!p.canUpdate}
                aria-label={defaultLabel}
              />
            </div>
          );
        },
      },
      {
        id: "actions",
        layout: ICON_ACTION_COLUMN_LAYOUT,
        header: iconPairActionColumnHeader(t("ACTION", "Action")),
        filter: null,
        cell: ({ row, mode }) =>
          mode === "edit" && p.editingRowId === languageRowId(row) ? (
            <GridInlineSaveCancelActions
              onSave={p.onInlineSave}
              onCancel={p.onInlineCancel}
              saveLoading={p.inlineSaveLoading}
              saveDisabled={p.inlineSaveLoading}
              cancelDisabled={p.inlineSaveLoading}
            />
          ) : null,
      },
    ];
  }, [defaultLabel, languageCodeLabel, languageNameLabel, p, t]);
}
