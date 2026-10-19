"use client";

import type { RefObject } from "react";
import { useMemo } from "react";
import type { TimePeriodRaw } from "@/lib/api/types";
import { GridInlineSaveCancelActions } from "@/components/GridInlineSaveCancelActions";
import { gridTextFieldClassName } from "@/components/TextField";
import { ICON_ACTION_COLUMN_LAYOUT } from "@/components/editableGridColumnClasses";
import {
  iconPairActionColumnHeader,
  type EditableGridColumnDef,
} from "@/components/TableView";

export function timeperiodRowId(row: TimePeriodRaw): string {
  if (row.id != null) return `id-${row.id}`;
  const tp = (row.timeperiod ?? "").trim();
  if (tp) return `tp-${tp}`;
  return "";
}

export type UseTimePeriodGridColumnsParams = {
  t: (code: string, fallback?: string) => string;
  allRowsSelected: boolean;
  selectedRowIds: Set<string>;
  selectAll: () => void;
  toggleSelect: (rowId: string) => void;
  colFilterTimeperiod: string;
  setColFilterTimeperiod: (v: string) => void;
  colFilterStartdate: string;
  setColFilterStartdate: (v: string) => void;
  colFilterEnddate: string;
  setColFilterEnddate: (v: string) => void;
  colFilterPeriodicity: string;
  setColFilterPeriodicity: (v: string) => void;
  onSortTimeperiod: () => void;
  onSortStartdate: () => void;
  onSortEnddate: () => void;
  onSortPeriodicity: () => void;
  periodicitySortIcon: "arrow_upward" | "arrow_downward" | "unfold_more";
  timeperiodSortIcon: "arrow_upward" | "arrow_downward" | "unfold_more";
  startdateSortIcon: "arrow_upward" | "arrow_downward" | "unfold_more";
  enddateSortIcon: "arrow_upward" | "arrow_downward" | "unfold_more";
  editingRowId: string | null;
  inlineLabel: string;
  setInlineLabel: (v: string) => void;
  inlinePeriodicity: string;
  setInlinePeriodicity: (v: string) => void;
  inlinePeriodicityInputRef: RefObject<HTMLInputElement | null>;
  inlineLabelInputRef: RefObject<HTMLInputElement | null>;
  inlineSaveLoading: boolean;
  onStartInlineEdit: (row: TimePeriodRaw) => void;
  onInlineSave: () => void;
  onInlineCancel: () => void;
  timePeriodFormatPlaceholder: string;
};

function displayCell(s: string | null | undefined): string {
  const v = (s ?? "").trim();
  return v || "—";
}

/** ISO datetime → `YYYY-MM-DD` for display (e.g. `2011-07-01T00:00:00` → `2011-07-01`). */
export function formatTimePeriodDateDisplay(s: string | null | undefined): string {
  const v = (s ?? "").trim();
  if (!v) return "";
  const t = v.indexOf("T");
  return t === -1 ? v : v.slice(0, t);
}

export function useTimePeriodGridColumns(
  p: UseTimePeriodGridColumnsParams
): EditableGridColumnDef<TimePeriodRaw>[] {
  const { t } = p;
  return useMemo((): EditableGridColumnDef<TimePeriodRaw>[] => {
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
          const id = timeperiodRowId(row);
          return (
            <input
              type="checkbox"
              className="checkbox-comp"
              checked={id ? p.selectedRowIds.has(id) : false}
              onChange={() => id && p.toggleSelect(id)}
              aria-label={t("SELECT_ROW_TIMEPERIOD").replace("{id}", id || "row")}
            />
          );
        },
      },
      {
        id: "periodicity",
        layout: { width: 5, minWidth: 80, sticky: true, main: true },
        header: {
          kind: "sort",
          text: t("LABEL_PERIODICITY"),
          onSort: p.onSortPeriodicity,
          sortIcon: p.periodicitySortIcon,
          sortAriaLabel: t("SORT_PERIODICITY"),
        },
        filter: {
          kind: "search",
          value: p.colFilterPeriodicity,
          onChange: p.setColFilterPeriodicity,
          placeholder: t("SEARCH_PLACEHOLDER"),
          ariaLabel: t("FILTER_BY_PERIODICITY"),
        },
        onCellDoubleClick: ({ row }) => p.onStartInlineEdit(row),
        viewCell: ({ row }) => (
          <span className="text-xs">{displayCell(row.periodicity)}</span>
        ),
        editField: {
          kind: "text",
          value: p.inlinePeriodicity,
          onChange: (v) => p.setInlinePeriodicity(v.toUpperCase()),
          inputRef: p.inlinePeriodicityInputRef,
          className: gridTextFieldClassName("min-w-0 text-xs uppercase"),
          disabled: p.inlineSaveLoading,
          ariaLabel: t("EDIT_PERIODICITY"),
          onEscape: p.onInlineCancel,
        },
      },
      {
        id: "timeperiod",
        layout: { width: 5, minWidth: 80, main: true },
        header: {
          kind: "sort",
          text: t("TIME_PERIOD"),
          onSort: p.onSortTimeperiod,
          sortIcon: p.timeperiodSortIcon,
          sortAriaLabel: t("SORT_TIMEPERIOD"),
        },
        filter: {
          kind: "search",
          value: p.colFilterTimeperiod,
          onChange: p.setColFilterTimeperiod,
          placeholder: t("SEARCH_PLACEHOLDER"),
          ariaLabel: t("FILTER_SEARCH"),
        },
        onCellDoubleClick: ({ row }) => p.onStartInlineEdit(row),
        viewCell: ({ row }) => (
          <span className="cell-name">{displayCell(row.timeperiod)}</span>
        ),
        editField: {
          kind: "text",
          value: p.inlineLabel,
          onChange: p.setInlineLabel,
          inputRef: p.inlineLabelInputRef,
          placeholder: p.timePeriodFormatPlaceholder,
          disabled: p.inlineSaveLoading,
          ariaLabel: t("EDIT_LABEL"),
          onEscape: p.onInlineCancel,
        },
      },
      {
        id: "startdate",
        layout: { width: 5, minWidth: 80 },
        header: {
          kind: "sort",
          text: t("LABEL_START_DATE"),
          onSort: p.onSortStartdate,
          sortIcon: p.startdateSortIcon,
          sortAriaLabel: t("SORT_START_DATE"),
        },
        filter: {
          kind: "search",
          value: p.colFilterStartdate,
          onChange: p.setColFilterStartdate,
          placeholder: t("SEARCH_PLACEHOLDER"),
          ariaLabel: t("FILTER_BY_START_DATE"),
        },
        onCellDoubleClick: ({ row }) => p.onStartInlineEdit(row),
        cell: ({ row }) => (
          <span className="text-xs">
            {displayCell(formatTimePeriodDateDisplay(row.startdate))}
          </span>
        ),
      },
      {
        id: "enddate",
        layout: { width: 5, minWidth: 80 },
        header: {
          kind: "sort",
          text: t("LABEL_END_DATE"),
          onSort: p.onSortEnddate,
          sortIcon: p.enddateSortIcon,
          sortAriaLabel: t("SORT_END_DATE"),
        },
        filter: {
          kind: "search",
          value: p.colFilterEnddate,
          onChange: p.setColFilterEnddate,
          placeholder: t("SEARCH_PLACEHOLDER"),
          ariaLabel: t("FILTER_BY_END_DATE"),
        },
        onCellDoubleClick: ({ row }) => p.onStartInlineEdit(row),
        cell: ({ row }) => (
          <span className="text-xs">
            {displayCell(formatTimePeriodDateDisplay(row.enddate))}
          </span>
        ),
      },
      {
        id: "inlineActions",
        layout: ICON_ACTION_COLUMN_LAYOUT,
        header: iconPairActionColumnHeader(t("ACTION", "Action")),
        filter: null,
        cell: ({ row, mode }) => {
          const rid = timeperiodRowId(row);
          if (mode !== "edit" || p.editingRowId !== rid) {
            return null;
          }
          const labelOk = p.inlineLabel.trim().length > 0;
          const periodicityOk = p.inlinePeriodicity.trim().length > 0;
          const saveOk = labelOk && periodicityOk;
          return (
            <GridInlineSaveCancelActions
              onSave={() => void p.onInlineSave()}
              onCancel={p.onInlineCancel}
              saveLoading={p.inlineSaveLoading}
              saveDisabled={!saveOk}
              saveTitle={
                !labelOk
                  ? t("TIMEPERIOD_ADD_SAVE_TITLE_NEED_LABEL")
                  : !periodicityOk
                    ? t("TIMEPERIOD_ADD_SAVE_TITLE_NEED_PERIODICITY")
                    : t("SAVE_TIMEPERIOD_CHANGES")
              }
              saveAriaLabel={
                !labelOk
                  ? t("TIMEPERIOD_ADD_SAVE_ARIA_NEED_LABEL")
                  : !periodicityOk
                    ? t("TIMEPERIOD_ADD_SAVE_ARIA_NEED_PERIODICITY")
                    : t("SAVE_TIMEPERIOD_CHANGES")
              }
              cancelTitle={t("CANCEL_EDIT")}
              cancelAriaLabel={t("CANCEL_EDIT")}
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
    p.colFilterTimeperiod,
    p.setColFilterTimeperiod,
    p.colFilterStartdate,
    p.setColFilterStartdate,
    p.colFilterEnddate,
    p.setColFilterEnddate,
    p.colFilterPeriodicity,
    p.setColFilterPeriodicity,
    p.onSortTimeperiod,
    p.onSortStartdate,
    p.onSortEnddate,
    p.onSortPeriodicity,
    p.periodicitySortIcon,
    p.timeperiodSortIcon,
    p.startdateSortIcon,
    p.enddateSortIcon,
    p.editingRowId,
    p.inlineLabel,
    p.setInlineLabel,
    p.inlinePeriodicity,
    p.setInlinePeriodicity,
    p.inlinePeriodicityInputRef,
    p.inlineLabelInputRef,
    p.inlineSaveLoading,
    p.onStartInlineEdit,
    p.onInlineSave,
    p.onInlineCancel,
    p.timePeriodFormatPlaceholder,
  ]);
}