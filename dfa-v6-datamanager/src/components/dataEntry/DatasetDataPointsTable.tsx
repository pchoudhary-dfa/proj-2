"use client";

import { toast } from "sonner";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type KeyboardEvent,
  type MouseEvent as ReactMouseEvent,
} from "react";
import {
  ICON_ACTION_COLUMN_LAYOUT,
  TV_GRID_CONFIGURE_BTN,
} from "@/components/editableGridColumnClasses";
import {
  EditableDataGridThead,
  focusEditableElement,
  iconPairActionColumnHeader,
  InlineEditableTable,
  isTextLikeInput,
  ServerDrivenListTbody,
  useColumnVisibility,
  buildColumnVisibilityTriggerCol,
  ColumnVisibilityPanel,
  type ColumnVisibilityItem,
  type EditableGridColumnDef,
} from "@/components/TableView";
import { StatusChip } from "@/components/StatusChip";
import { GridInlineTextField } from "@/components/gridEditableTextCell";
import { GridInlineSelectField } from "@/components/gridEditableSelectCell";
import { gridTextFieldClassName } from "@/components/TextField";
import type { DataPointsRow, IndicatorValidationRuleRow } from "@/lib/api/types";
import { MultiSelectDropdown, type MultiSelectOption } from "@/components/MultiSelectDropdown";

/** Fixed sticky indicator column (checkbox + indicator stay pinned on horizontal scroll). */
const DATA_POINTS_INDICATOR_COLUMN_WIDTH = 420;

export type DataPointsSortState = {
  columnId: string | null;
  direction: "asc" | "desc" | null;
};

export function cycleDataPointsSort(columnId: string, prev: DataPointsSortState): DataPointsSortState {
  if (prev.columnId !== columnId) return { columnId, direction: "asc" };
  if (prev.direction === "asc") return { columnId, direction: "desc" };
  if (prev.direction === "desc") return { columnId: null, direction: null };
  return { columnId, direction: "asc" };
}

function dataPointsSortIcon(
  columnId: string,
  state: DataPointsSortState
): "arrow_upward" | "arrow_downward" | "unfold_more" {
  if (state.columnId === columnId && state.direction === "asc") return "arrow_upward";
  if (state.columnId === columnId && state.direction === "desc") return "arrow_downward";
  return "unfold_more";
}

/** Maps data-point grid column ids to translation keys for the show/hide drawer. */
const DATA_POINT_COLUMN_LABEL_KEYS: Record<string, string> = {
  indicator: "INDICATORS",
  subgroup: "SUBGROUPS",
  area: "AREA",
  timePeriod: "TIME_PERIOD",
  previousData: "PREVIOUS_DATA",
  data: "TABLE_COL_DATA",
  sources: "SOURCES",
  footnote: "FOOTNOTE",
  status: "STATUS",
};

type PageType = "data-entry" | "data-review";

export type DataPointEditValues = {
  timePeriod?: string;
  dataValue?: string;
  footnote?: string;
};

export type DataPointCommentTitle = {
  primary: string;
  secondary: string;
};

type DatasetDataPointsTableProps = {
  t: (code: string, fallback?: string) => string;
  rows: DataPointsRow[];
  loading: boolean;
  error: string | null;
  pageType: PageType;
  /** When true, shows the sticky "Columns" trigger and in-table show/hide panel. */
  enableColumnVisibility?: boolean;
  /** When set, row selection is cleared whenever the dataset or page changes. */
  datasetId?: string;
  dataPointsPage?: number;
  timePeriodOptions?: MultiSelectOption[];
  sourceOptions?: MultiSelectOption[];
  editedValues?: Map<string, DataPointEditValues>;
  /** Row keys whose Data cell should show validation error styling after a partial draft save. */
  dataFieldSaveErrorKeys?: ReadonlySet<string>;
  onEditRow?: (rowKey: string, field: keyof DataPointEditValues, value: string) => void;
  onSelectionCountChange?: (count: number) => void;
  onSelectionRowsChange?: (rows: DataPointsRow[]) => void;
  onCommentClick?: (dataPointId: number, title: DataPointCommentTitle, isCommentLocked: boolean) => void;
  /** When a data-point comment drawer is open, rows are clickable to switch the active data point. */
  commentDrawerOpen?: boolean;
  activeCommentDataPointId?: number | null;
  selectionResetToken?: number;
  hideTimePeriodColumn?: boolean;
  selectedTimePeriodLabel?: string;
  showPreviousDataColumn?: boolean;
  previousTimePeriodLabel?: string;
  hideStatusColumn?: boolean;
  colSearchIndicator?: string;
  colSearchSubgroup?: string;
  colSearchArea?: string;
  onColSearchIndicatorChange?: (value: string) => void;
  onColSearchSubgroupChange?: (value: string) => void;
  onColSearchAreaChange?: (value: string) => void;
  listSort?: DataPointsSortState;
  onSortChange?: (sort: DataPointsSortState) => void;
  onPageReset?: () => void;
  readOnly?: boolean;
  onUndoDeleteRow?: (row: DataPointsRow) => void;
  validationRulesMap?: Record<string, IndicatorValidationRuleRow[]>;
  datasetSourceOptions?: MultiSelectOption[];
  selectedSourceNids?: string[];
  onSourceNidsChange?: (nids: string[]) => void;
};

function firstNonBlank(...values: unknown[]): string {
  for (const value of values) {
    if (value == null) continue;
    const text = String(value).trim();
    if (text) return text;
  }
  return "";
}

function getDataPointValue(row: DataPointsRow): string {
  if (row.dt_is_textual) {
    return firstNonBlank(row.dt_text_value, row.approved_textual_value, row.approved_value, row.dt_value);
  }
  return firstNonBlank(row.dt_value, row.approved_value, row.dt_text_value, row.approved_textual_value);
}

function getPreviousDataPointValue(row: DataPointsRow): string {
  if (row.dt_is_textual) {
    return firstNonBlank(row.prev_tmprd_textual_data_value, row.prev_tmprd_data_value);
  }
  return firstNonBlank(row.prev_tmprd_data_value, row.prev_tmprd_textual_data_value);
}

function getValidationRule(
  row: DataPointsRow,
  rulesMap?: Record<string, IndicatorValidationRuleRow[]>
): IndicatorValidationRuleRow | null {
  if (!rulesMap || !row.i_gid) return null;
  const rules = rulesMap[row.i_gid];
  if (!rules?.length) return null;
  return rules.find((r) => r.unit_gid === row.u_gid) ?? rules[0] ?? null;
}

function getEnumOptionLabel(
  option: IndicatorValidationRuleRow["options"][number],
  locale: string
): string {
  return option.labels?.[locale] ?? option.labels?.["en"] ?? option.option_code;
}

function getCurrentLocale(): string {
  if (typeof window === "undefined") return "en";
  return window.location.pathname.split("/")[1] || "en";
}

function getIndicatorDisplayLabel(row: DataPointsRow): string {
  const indicatorLabel = firstNonBlank(row.i_name, row.i_gid, row.i_nid, "-");
  const unitLabel = firstNonBlank(row.u_name, row.u_gid);
  return unitLabel ? `${indicatorLabel}, ${unitLabel}` : indicatorLabel;
}

function token(value: unknown): string {
  if (value == null) return "";
  return String(value).trim().toLowerCase();
}

function normalizeCommentCount(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.trunc(parsed) : 0;
}

function getRowKey(row: DataPointsRow): string {
  return String(
    row.data_point_id ??
      row.dt_nid ??
      [
        row.ius_nid ?? "ius",
        row.tp_nid ?? "tp",
        row.ar_nid ?? "ar",
        row.i_nid ?? "i",
        row.u_nid ?? "u",
        row.sg_nid ?? "sg",
      ].join("-")
  );
}

function isRowApproved(row: DataPointsRow): boolean {
  return String(row.review_status ?? "").trim().toUpperCase() === "APPROVED";
}

function getDataPointId(row: DataPointsRow): number | undefined {
  const raw = row.data_point_id ?? row.dt_nid;
  if (raw == null) return undefined;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : undefined;
}

function buildDataPointCommentTitle(
  row: DataPointsRow,
  sourceOptions: MultiSelectOption[],
  t: (code: string, fallback?: string) => string
): DataPointCommentTitle {
  const indicatorName =
    firstNonBlank(row.i_name, row.i_gid) || t("LABEL_INDICATOR", "Indicator");
  const unitName = firstNonBlank(row.u_name, row.u_gid) || t("UNITS", "Units");
  const subgroupName =
    firstNonBlank(row.sg_name, row.sg_gid) || t("SUBGROUPS", "Subgroups");
  const areaName =
    firstNonBlank(row.ar_name, row.ar_id, row.ar_nid) || t("AREA", "Area");
  const resolvedSource = sourceDisplayText(row, sourceOptions, undefined);
  const sourceName =
    firstNonBlank(resolvedSource === "—" ? "" : resolvedSource) || t("SOURCE", "Source");
  return {
    primary: `${indicatorName} | ${unitName}`,
    secondary: `${subgroupName} | ${areaName} | ${sourceName}`,
  };
}

function sourceNidString(row: DataPointsRow): string {
  if (row.src_nid != null && String(row.src_nid).trim() !== "") {
    return String(row.src_nid).trim();
  }
  if (row.source_nid == null) return "";
  return String(row.source_nid).trim();
}

/** Resolved source label for display; avoids using `row.source`. */
function sourceDisplayText(
  row: DataPointsRow,
  sourceOptions: MultiSelectOption[],
  editedSource: string | undefined
): string {
  const value = editedSource ?? sourceNidString(row);
  const fromOpt = value ? sourceOptions.find((o) => o.value === value)?.label ?? "" : "";
  return firstNonBlank(fromOpt, row.src_name) || "\u2014";
}

function timePeriodDisplayText(
  row: DataPointsRow,
  timePeriodOptions: MultiSelectOption[],
  editedTimePeriod: string | undefined
): string {
  const value = editedTimePeriod ?? firstNonBlank(row.tp_timeperiod, row.tp_nid);
  const nid = firstNonBlank(row.tp_nid);
  const fromOpt =
    nid && timePeriodOptions.length
      ? timePeriodOptions.find((o) => o.value === nid)?.label ?? ""
      : value && timePeriodOptions.length
        ? timePeriodOptions.find((o) => o.value === value)?.label ?? ""
        : "";
  return firstNonBlank(fromOpt, row.tp_timeperiod, nid, value) || "\u2014";
}

export function DatasetDataPointsTable({
  t,
  rows,
  loading,
  error,
  pageType,
  enableColumnVisibility = false,
  datasetId,
  dataPointsPage,
  timePeriodOptions = [],
  sourceOptions = [],
  editedValues,
  dataFieldSaveErrorKeys,
  onEditRow,
  onSelectionCountChange,
  onSelectionRowsChange,
  onCommentClick,
  commentDrawerOpen = false,
  activeCommentDataPointId = null,
  selectionResetToken,
  hideTimePeriodColumn = false,
  selectedTimePeriodLabel = "",
  showPreviousDataColumn = false,
  previousTimePeriodLabel = "",
  hideStatusColumn = false,
  colSearchIndicator: propColSearchIndicator,
  colSearchSubgroup: propColSearchSubgroup,
  colSearchArea: propColSearchArea,
  onColSearchIndicatorChange,
  onColSearchSubgroupChange,
  onColSearchAreaChange,
  listSort,
  onSortChange,
  onPageReset,
  readOnly = false,
  onUndoDeleteRow,
  validationRulesMap,
  datasetSourceOptions,
  selectedSourceNids,
  onSourceNidsChange,
}: DatasetDataPointsTableProps) {
  const isEditable = pageType === "data-entry" && !readOnly;
  const showUndoAction = pageType === "data-entry";
  const isServerDriven = onColSearchIndicatorChange != null;

  const [sourceFilterOpen, setSourceFilterOpen] = useState(false);
  const [sourceFilterSearch, setSourceFilterSearch] = useState("");
  const [pendingSourceNids, setPendingSourceNids] = useState<string[]>(selectedSourceNids ?? []);

  const [localColSearch, setLocalColSearch] = useState({
    indicator: "",
    subgroup: "",
    area: "",
  });

  const colSearch = {
    indicator: propColSearchIndicator ?? localColSearch.indicator,
    subgroup: propColSearchSubgroup ?? localColSearch.subgroup,
    area: propColSearchArea ?? localColSearch.area,
  };

  const handleColSearchIndicator = useCallback(
    (value: string) => {
      if (onColSearchIndicatorChange) {
        onColSearchIndicatorChange(value);
        onColSearchSubgroupChange?.("");
        onColSearchAreaChange?.("");
      } else {
        setLocalColSearch({ indicator: value, subgroup: "", area: "" });
      }
    },
    [onColSearchIndicatorChange, onColSearchSubgroupChange, onColSearchAreaChange]
  );

  const handleColSearchSubgroup = useCallback(
    (value: string) => {
      if (onColSearchSubgroupChange) {
        onColSearchSubgroupChange(value);
        onColSearchIndicatorChange?.("");
        onColSearchAreaChange?.("");
      } else {
        setLocalColSearch({ indicator: "", subgroup: value, area: "" });
      }
    },
    [onColSearchIndicatorChange, onColSearchSubgroupChange, onColSearchAreaChange]
  );

  const handleColSearchArea = useCallback(
    (value: string) => {
      if (onColSearchAreaChange) {
        onColSearchAreaChange(value);
        onColSearchIndicatorChange?.("");
        onColSearchSubgroupChange?.("");
      } else {
        setLocalColSearch({ indicator: "", subgroup: "", area: value });
      }
    },
    [onColSearchIndicatorChange, onColSearchSubgroupChange, onColSearchAreaChange]
  );

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const [colVisDrawerOpen, setColVisDrawerOpen] = useState(false);

  useEffect(() => {
    setSelectedIds(new Set());
  }, [datasetId, dataPointsPage, selectionResetToken]);

  useEffect(() => {
    onSelectionCountChange?.(selectedIds.size);
  }, [onSelectionCountChange, selectedIds]);

  useEffect(() => {
    if (!onSelectionRowsChange) return;
    const selected = rows.filter((row) => selectedIds.has(getRowKey(row)));
    onSelectionRowsChange(selected);
  }, [onSelectionRowsChange, rows, selectedIds]);

  // Sync pendingSourceNids from the prop whenever the dropdown is closed (covers
  // external resets such as dataset switch or initial source auto-selection).
  useEffect(() => {
    if (!sourceFilterOpen) {
      setPendingSourceNids(selectedSourceNids ?? []);
    }
  }, [selectedSourceNids, sourceFilterOpen]);

  const visibleRows = useMemo(() => {
    if (isServerDriven) return rows;
    return rows.filter((row) => {
      return (
        token(firstNonBlank(row.i_name, row.i_gid)).includes(token(colSearch.indicator)) &&
        token(firstNonBlank(row.sg_name, row.sg_gid)).includes(token(colSearch.subgroup)) &&
        token(firstNonBlank(row.ar_name, row.ar_id)).includes(token(colSearch.area))
      );
    });
  }, [colSearch, isServerDriven, rows]);

  const { dataNavByRowKey, dataNavMaxIndex } = useMemo(() => {
    const m = new Map<string, number>();
    let idx = -1;
    for (const row of visibleRows) {
      const rowKey = getRowKey(row);
      const isApproved = String(row.review_status ?? "").trim().toUpperCase() === "APPROVED";
      if (isEditable && !isApproved) {
        idx += 1;
        m.set(rowKey, idx);
      }
    }
    return { dataNavByRowKey: m, dataNavMaxIndex: idx };
  }, [visibleRows, isEditable]);

  const focusDpDataInput = useCallback((navIndex: number, cursorAtEnd: boolean): boolean => {
    const inputEl = document.querySelector<HTMLInputElement>(
      `input[data-dm-dp-data-nav-index="${navIndex}"]`
    );
    if (inputEl) {
      focusEditableElement(inputEl, { selectText: false, cursorAtEnd });
      if (isTextLikeInput(inputEl) && !cursorAtEnd) {
        inputEl.setSelectionRange(0, 0);
      }
      inputEl.scrollIntoView({ block: "nearest", inline: "nearest" });
      return true;
    }
    const btnEl = document.querySelector<HTMLButtonElement>(
      `button[data-dm-dp-data-nav-index="${navIndex}"]`
    );
    if (btnEl) {
      btnEl.focus();
      btnEl.scrollIntoView({ block: "nearest", inline: "nearest" });
      return true;
    }
    return false;
  }, []);

  const focusDpFootnoteInput = useCallback((navIndex: number, cursorAtEnd: boolean): boolean => {
    const el = document.querySelector<HTMLInputElement>(
      `input[data-dm-dp-footnote-nav-index="${navIndex}"]`
    );
    if (!el) return false;
    focusEditableElement(el, { selectText: false, cursorAtEnd });
    if (isTextLikeInput(el) && !cursorAtEnd) {
      el.setSelectionRange(0, 0);
    }
    el.scrollIntoView({ block: "nearest", inline: "nearest" });
    return true;
  }, []);

  const handleDataCellKeyDown = useCallback(
    (event: KeyboardEvent<HTMLInputElement>, navIndex: number) => {
      if (event.defaultPrevented) return;
      if (event.altKey || event.ctrlKey || event.metaKey) return;
      if (dataNavMaxIndex < 0) return;

      if (event.key === "Enter" || event.key === "Tab") {
        if (event.key === "Tab" && event.shiftKey) {
          if (navIndex > 0) {
            event.preventDefault();
            focusDpFootnoteInput(navIndex - 1, true);
          }
          return;
        }
        event.preventDefault();
        focusDpFootnoteInput(navIndex, false);
        return;
      }
      if (event.key === "ArrowDown") {
        event.preventDefault();
        if (navIndex < dataNavMaxIndex) focusDpDataInput(navIndex + 1, false);
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        if (navIndex > 0) focusDpDataInput(navIndex - 1, false);
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        (event.target as HTMLInputElement).blur();
      }
    },
    [dataNavMaxIndex, focusDpFootnoteInput, focusDpDataInput]
  );

  const handleDataCellSelectKeyDown = useCallback(
    (event: KeyboardEvent<HTMLButtonElement>, navIndex: number) => {
      if (event.defaultPrevented) return;
      if (event.altKey || event.ctrlKey || event.metaKey) return;
      if (dataNavMaxIndex < 0) return;

      if (event.key === "Tab") {
        if (event.shiftKey) {
          if (navIndex > 0) {
            event.preventDefault();
            focusDpFootnoteInput(navIndex - 1, true);
          }
          return;
        }
        event.preventDefault();
        focusDpFootnoteInput(navIndex, false);
        return;
      }
      if (event.key === "ArrowDown") {
        event.preventDefault();
        if (navIndex < dataNavMaxIndex) focusDpDataInput(navIndex + 1, false);
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        if (navIndex > 0) focusDpDataInput(navIndex - 1, false);
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        (event.target as HTMLButtonElement).blur();
      }
      // Enter / Space are intentionally omitted — they open the dropdown (SelectField default)
    },
    [dataNavMaxIndex, focusDpFootnoteInput, focusDpDataInput]
  );

  const handleFootnoteCellKeyDown = useCallback(
    (event: KeyboardEvent<HTMLInputElement>, navIndex: number) => {
      if (event.defaultPrevented) return;
      if (event.altKey || event.ctrlKey || event.metaKey) return;
      if (dataNavMaxIndex < 0) return;

      if (event.key === "Enter" || event.key === "Tab") {
        if (event.key === "Tab" && event.shiftKey) {
          event.preventDefault();
          focusDpDataInput(navIndex, true);
          return;
        }
        event.preventDefault();
        if (navIndex < dataNavMaxIndex) {
          focusDpDataInput(navIndex + 1, false);
        }
        return;
      }
      if (event.key === "ArrowLeft") {
        const el = event.target as HTMLInputElement;
        if (el.selectionStart === 0 && el.selectionEnd === 0) {
          event.preventDefault();
          focusDpDataInput(navIndex, true);
        }
        return;
      }
      if (event.key === "ArrowDown") {
        event.preventDefault();
        if (navIndex < dataNavMaxIndex) focusDpFootnoteInput(navIndex + 1, false);
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        if (navIndex > 0) focusDpFootnoteInput(navIndex - 1, false);
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        (event.target as HTMLInputElement).blur();
      }
    },
    [dataNavMaxIndex, focusDpDataInput, focusDpFootnoteInput]
  );

  const selectableRowKeys = useMemo(
    () =>
      visibleRows
        .filter((row) => {
          if (isRowApproved(row)) return false;
          if (pageType === "data-entry" && row.is_deleted) return false;
          return true;
        })
        .map((row) => getRowKey(row)),
    [pageType, visibleRows]
  );

  const toggleSelect = useCallback((key: string, disabled: boolean) => {
    if (disabled) return;
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  useEffect(() => {
    setSelectedIds((prev) => {
      if (prev.size === 0) return prev;
      const allowed = new Set(selectableRowKeys);
      let changed = false;
      const next = new Set<string>();
      prev.forEach((key) => {
        if (allowed.has(key)) next.add(key);
        else changed = true;
      });
      return changed ? next : prev;
    });
  }, [selectableRowKeys]);

  const toggleSelectAll = useCallback(() => {
    if (selectableRowKeys.length === 0) return;
    const allSelectableSelected = selectableRowKeys.every((key) => selectedIds.has(key));
    if (allSelectableSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(selectableRowKeys));
    }
  }, [selectableRowKeys, selectedIds]);

  const handleFieldChange = useCallback(
    (rowKey: string, field: keyof DataPointEditValues, value: string) => {
      onEditRow?.(rowKey, field, value);
    },
    [onEditRow]
  );

  const dataHeaderLabel = t("TABLE_COL_DATA", "Data");
  const dataHeaderWithTimePeriod =
    hideTimePeriodColumn && selectedTimePeriodLabel
      ? selectedTimePeriodLabel
      : dataHeaderLabel;
  const previousDataHeaderLabel = previousTimePeriodLabel || t("PREVIOUS_DATA", "Previous data");

  const theadColumns = useMemo((): EditableGridColumnDef<DataPointsRow>[] => {
    const cols: EditableGridColumnDef<DataPointsRow>[] = [
      {
        id: "select",
        layout: { width: 1 },
        header: {
          kind: "selectAll",
          checked:
            selectableRowKeys.length > 0 &&
            selectableRowKeys.every((key) => selectedIds.has(key)),
          onChange: toggleSelectAll,
          ariaLabel: t("TOOLBAR_SELECT_HINT", "Select all"),
          disabled: selectableRowKeys.length === 0,
        },
        filter: null,
        cell: ({ row }) => {
          const rowKey = getRowKey(row);
          const isApproved = isRowApproved(row);
          const isDeletedSelectionLocked = pageType === "data-entry" && Boolean(row.is_deleted);
          return (
            <input
              type="checkbox"
              className="checkbox-comp"
              checked={selectedIds.has(rowKey)}
              onChange={() => toggleSelect(rowKey, isApproved || isDeletedSelectionLocked)}
              aria-label={t("TOOLBAR_SELECT_HINT", "Select one or more items")}
              disabled={isApproved || isDeletedSelectionLocked}
            />
          );
        },
      },
      {
        id: "indicator",
        layout: {
          width: DATA_POINTS_INDICATOR_COLUMN_WIDTH,
          minWidth: 240,
          sticky: true,
        },
        defaultWidth: DATA_POINTS_INDICATOR_COLUMN_WIDTH,
        header: {
          kind: "sort",
          text: t("INDICATORS"),
          onSort: () => {
            if (onSortChange && listSort) {
              onPageReset?.();
              onSortChange(cycleDataPointsSort("indicator_name", listSort));
            }
          },
          sortIcon: listSort
            ? dataPointsSortIcon("indicator_name", listSort)
            : "unfold_more",
          sortAriaLabel: t("SORT_INDICATORS", "Sort indicators"),
        },
        filter: {
          kind: "search",
          value: colSearch.indicator,
          onChange: handleColSearchIndicator,
          placeholder: t("SEARCH_PLACEHOLDER", "Search..."),
          ariaLabel: t("FILTER_BY_LABEL", "Filter by {label}").replace(
            "{label}",
            t("INDICATORS")
          ),
        },
        cell: ({ row }) => {
          const indicatorLabel = getIndicatorDisplayLabel(row);
          return <span title={indicatorLabel}>{indicatorLabel}</span>;
        },
      },
      {
        id: "subgroup",
        layout: { width: 250, minWidth: 180 },
        header: {
          kind: "sort",
          text: t("SUBGROUPS"),
          onSort: () => {
            if (onSortChange && listSort) {
              onPageReset?.();
              onSortChange(cycleDataPointsSort("subgroup", listSort));
            }
          },
          sortIcon: listSort
            ? dataPointsSortIcon("subgroup", listSort)
            : "unfold_more",
          sortAriaLabel: t("SORT", "Sort"),
        },
        defaultWidth: 250,
        filter: {
          kind: "search",
          value: colSearch.subgroup,
          onChange: handleColSearchSubgroup,
          placeholder: t("SEARCH_PLACEHOLDER", "Search..."),
          ariaLabel: t("FILTER_BY_LABEL", "Filter by {label}").replace(
            "{label}",
            t("SUBGROUPS")
          ),
        },
        cell: ({ row }) => {
          const text = firstNonBlank(row.sg_name, row.sg_gid, row.sg_nid, "—");
          return <span title={text}>{text}</span>;
        },
      },
      {
        id: "area",
        layout: { width: 180, minWidth: 140 },
        header: {
          kind: "sort",
          text: t("AREA"),
          onSort: () => {
            if (onSortChange && listSort) {
              onPageReset?.();
              onSortChange(cycleDataPointsSort("area", listSort));
            }
          },
          sortIcon: listSort ? dataPointsSortIcon("area", listSort) : "unfold_more",
          sortAriaLabel: t("SORT", "Sort"),
        },
        defaultWidth: 180,
        filter: {
          kind: "search",
          value: colSearch.area,
          onChange: handleColSearchArea,
          placeholder: t("SEARCH_PLACEHOLDER", "Search..."),
          ariaLabel: t("FILTER_BY_LABEL", "Filter by {label}").replace(
            "{label}",
            t("AREA")
          ),
        },
        cell: ({ row }) => {
          const text = firstNonBlank(row.ar_name, row.ar_id, row.ar_nid, "-");
          return <span title={text}>{text}</span>;
        },
      },
    ];

    if (showPreviousDataColumn) {
      cols.push({
        id: "previousData",
        layout: { width: 150, minWidth: 120 },
        header: previousDataHeaderLabel,
        defaultWidth: 150,
        filter: null,
        cell: ({ row }) => (
          <span className="text-text-muted">{getPreviousDataPointValue(row) || "-"}</span>
        ),
      });
    }

    if (!hideTimePeriodColumn) {
      cols.push({
        id: "timePeriod",
        layout: { width: 150, minWidth: 120 },
        header: t("TIME_PERIOD"),
        defaultWidth: 150,
        filter: null,
        cell: ({ row }) => {
          const editVals = editedValues?.get(getRowKey(row));
          return (
            <span className="text-text">
              {timePeriodDisplayText(row, timePeriodOptions, editVals?.timePeriod)}
            </span>
          );
        },
      });
    }

    cols.push(
      {
        id: "data",
        layout: { width: 160, minWidth: 120 },
        header: dataHeaderWithTimePeriod,
        defaultWidth: 160,
        filter: null,
        cell: ({ row }) => {
          const rowKey = getRowKey(row);
          const editVals = editedValues?.get(rowKey);
          const dataNavIndex = dataNavByRowKey.get(rowKey);
          const isApproved = isRowApproved(row);
          const canEditFields = isEditable && !isApproved && !Boolean(row.is_deleted);
          const dataValue = editVals?.dataValue ?? getDataPointValue(row);
          const dataFieldError = Boolean(dataFieldSaveErrorKeys?.has(rowKey));

          const rule = getValidationRule(row, validationRulesMap);
          const validationType = rule?.validation_type ?? null;
          const locale = getCurrentLocale();

          if (!canEditFields) {
            let displayValue = dataValue;
            if (validationType === "ENUM" && rule?.options?.length && dataValue) {
              const opt = rule.options.find((o) => o.option_code === dataValue);
              if (opt) displayValue = getEnumOptionLabel(opt, locale);
            }
            return (
              <span className="block truncate text-text" title={displayValue || undefined}>
                {displayValue || "-"}
              </span>
            );
          }

          if (validationType === "ENUM" && rule?.options?.length) {
            const activeOptions = rule.options
              .filter((o) => o.is_active !== false)
              .sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0))
              .map((o) => ({ value: o.option_code, label: getEnumOptionLabel(o, locale) }));
            const selectOptions = [
              { value: "", label: t("SELECT", "Select...") },
              ...activeOptions,
            ];
            return (
              <GridInlineSelectField
                value={dataValue}
                onChange={(v) => handleFieldChange(rowKey, "dataValue", v)}
                options={selectOptions}
                menuPortal
                className={`w-full${dataFieldError ? " [&_button]:!border-error" : ""}`}
                inputProps={
                  dataNavIndex !== undefined
                    ? { "data-dm-dp-data-nav-index": String(dataNavIndex) }
                    : undefined
                }
                onKeyDown={(e) => {
                  if (dataNavIndex === undefined) return;
                  handleDataCellSelectKeyDown(e, dataNavIndex);
                }}
              />
            );
          }

          const extraProps: React.InputHTMLAttributes<HTMLInputElement> = {};
          if (validationType === "TEXT") {
            if (rule?.max_length != null) extraProps.maxLength = rule.max_length;
            if (rule?.min_length != null) extraProps.minLength = rule.min_length;
          }

          const handleDataValueBlur =
            validationType === "NUM" && rule?.min_value != null
              ? () => {
                  const val = dataValue;
                  if (val !== "" && val !== "-" && !val.endsWith(".")) {
                    const numVal = parseFloat(val);
                    if (!isNaN(numVal) && numVal < rule.min_value!) {
                      toast.warning(
                        t(
                          "DATA_VALUE_BELOW_MIN_ADJUSTED",
                          `Value is below the minimum allowed (${rule.min_value}). It has been adjusted to ${rule.min_value}.`
                        )
                          .replace(/\{min\}/g, String(rule.min_value))
                      );
                      handleFieldChange(rowKey, "dataValue", String(rule.min_value));
                    }
                  }
                }
              : undefined;

          return (
            <GridInlineTextField
              className={gridTextFieldClassName(
                dataFieldError
                  ? "!border-error focus:!border-error focus:!shadow-none"
                  : undefined
              )}
              placeholder={t("ENTER_DATA", "Enter data")}
              value={dataValue}
              onChange={(v) => {
                if (validationType === "NUM") {
                  if (v === "" || /^-?\d*\.?\d*$/.test(v)) {
                    if (
                      rule?.max_value != null &&
                      v !== "" &&
                      v !== "-" &&
                      !v.endsWith(".")
                    ) {
                      const numVal = parseFloat(v);
                      if (!isNaN(numVal) && numVal > rule.max_value) return;
                    }
                    handleFieldChange(rowKey, "dataValue", v);
                  }
                  return;
                }
                handleFieldChange(rowKey, "dataValue", v);
              }}
              onBlur={handleDataValueBlur}
              onKeyDown={(e) => {
                if (dataNavIndex === undefined) return;
                handleDataCellKeyDown(e, dataNavIndex);
              }}
              inputMode={validationType === "NUM" ? "decimal" : undefined}
              maxLength={extraProps.maxLength}
              minLength={extraProps.minLength}
              inputProps={
                dataNavIndex !== undefined
                  ? { "data-dm-dp-data-nav-index": String(dataNavIndex) }
                  : undefined
              }
            />
          );
        },
      },
    );

    cols.push(
      {
        id: "sources",
        layout: { width: 290, minWidth: 180, main: true },
        header: t("SOURCES"),
        defaultWidth: 290,
        filter: null,
        filterCell: (datasetSourceOptions?.length ?? 0) > 1 ? (
          <MultiSelectDropdown
            open={sourceFilterOpen}
            onOpenChange={(open) => {
              if (!open && onSourceNidsChange) {
                onSourceNidsChange(pendingSourceNids);
              }
              setSourceFilterOpen(open);
            }}
            options={datasetSourceOptions!}
            selectedValues={pendingSourceNids}
            onToggleValue={(value) => {
              setPendingSourceNids((current) =>
                current.includes(value)
                  ? current.filter((v) => v !== value)
                  : [...current, value]
              );
            }}
            searchQuery={sourceFilterSearch}
            onSearchChange={setSourceFilterSearch}
            emptyLabel={t("ALL_SOURCES", "All sources")}
            autoWidth={true}
            menuPortal
          />
        ) : null,
        cell: ({ row }) => {
          const src = sourceDisplayText(row, sourceOptions, undefined);
          return <span className="text-text" title={src}>{src}</span>;
        },
      },
      {
        id: "footnote",
        layout: { width: 250, minWidth: 180 },
        header: t("FOOTNOTE", "Footnote"),
        defaultWidth: 250,
        filter: null,
        cell: ({ row }) => {
          const rowKey = getRowKey(row);
          const editVals = editedValues?.get(rowKey);
          const dataNavIndex = dataNavByRowKey.get(rowKey);
          const isApproved = isRowApproved(row);
          const canEditFields = isEditable && !isApproved && !Boolean(row.is_deleted);
          const footnoteValue = editVals?.footnote ?? (row.footnote ?? "");
          return canEditFields ? (
            <GridInlineTextField
              placeholder={t("ENTER_FOOTNOTE", "Enter footnote")}
              value={footnoteValue}
              onChange={(v) => handleFieldChange(rowKey, "footnote", v)}
              onKeyDown={(e) => {
                if (dataNavIndex === undefined) return;
                handleFootnoteCellKeyDown(e, dataNavIndex);
              }}
              inputProps={
                dataNavIndex !== undefined
                  ? { "data-dm-dp-footnote-nav-index": String(dataNavIndex) }
                  : undefined
              }
            />
          ) : (
            <span
              className="block truncate text-text"
              title={footnoteValue || undefined}
            >
              {footnoteValue || "-"}
            </span>
          );
        },
      }
    );

    if (!hideStatusColumn) {
      const statusColumnWidth = 130;
      cols.push({
        id: "status",
        layout: {
          width: statusColumnWidth,
          minWidth: statusColumnWidth,
          maxWidth: statusColumnWidth,
          sticky: "right",
        },
        header: t("STATUS"),
        filter: null,
        cell: ({ row }) => {
          const statusText = String(row.review_status ?? "").trim();
          const statusLabel =
            statusText.toUpperCase() === "PENDING_REVIEW"
              ? t("PENDING", "Pending")
              : t(statusText.toUpperCase(), statusText || "-");
          return <StatusChip status={statusText} label={statusLabel} />;
        },
      });
    }

    cols.push({
      id: "comment",
      layout: ICON_ACTION_COLUMN_LAYOUT,
      header: iconPairActionColumnHeader(t("ACTION", "Action")),
      filter: null,
      cell: ({ row }) => {
        const rowKey = getRowKey(row);
        const isApproved = isRowApproved(row);
        const isMarkedDeleted = Boolean(row.is_deleted);
        const commentCount = normalizeCommentCount(row.cmnt_cnt);
        return (
          <div className="add-row-action-btns">
            {isMarkedDeleted && showUndoAction ? (
              <button
                type="button"
                className={TV_GRID_CONFIGURE_BTN}
                title={t("UNDO", "Undo")}
                aria-label={t("UNDO", "Undo")}
                onClick={() => onUndoDeleteRow?.(row)}
              >
                <span className="material-icons !text-sm" aria-hidden="true">
                  undo
                </span>
              </button>
            ) : null}
            <button
              type="button"
              className={`${TV_GRID_CONFIGURE_BTN}${isApproved ? " opacity-70" : ""} relative overflow-visible`}
              title={
                isApproved
                  ? t(
                      "COMMENT_LOCKED_APPROVED_DATAPOINT",
                      "Comments are read-only for approved data points."
                    )
                  : t("DATAPOINT_COMMENTS", "Data Point Comments")
              }
              aria-label={t("DATAPOINT_COMMENTS", "Data Point Comments")}
              onClick={() => {
                const dpId = getDataPointId(row);
                if (onCommentClick && dpId != null) {
                  onCommentClick(
                    dpId,
                    buildDataPointCommentTitle(row, sourceOptions, t),
                    isApproved
                  );
                }
              }}
            >
              <span className="material-icons !text-sm" aria-hidden="true">
                chat_bubble_outline
              </span>
              {commentCount > 0 && (
                <span
                  className="absolute -right-[0.60rem] -top-1 inline-flex min-w-[16px] items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold leading-4 text-white"
                  aria-hidden="true"
                >
                  {commentCount}
                </span>
              )}
            </button>
          </div>
        );
      },
    });

    return cols;
  }, [
    t,
    selectableRowKeys,
    selectedIds,
    toggleSelectAll,
    toggleSelect,
    pageType,
    colSearch.indicator,
    colSearch.subgroup,
    colSearch.area,
    handleColSearchIndicator,
    handleColSearchSubgroup,
    handleColSearchArea,
    hideTimePeriodColumn,
    showPreviousDataColumn,
    previousDataHeaderLabel,
    dataHeaderWithTimePeriod,
    hideStatusColumn,
    onSortChange,
    listSort,
    onPageReset,
    isEditable,
    editedValues,
    dataFieldSaveErrorKeys,
    dataNavByRowKey,
    handleDataCellKeyDown,
    handleFootnoteCellKeyDown,
    handleFieldChange,
    timePeriodOptions,
    sourceOptions,
    onCommentClick,
    onUndoDeleteRow,
    showUndoAction,
    sourceFilterOpen,
    sourceFilterSearch,
    pendingSourceNids,
    setPendingSourceNids,
    datasetSourceOptions,
    onSourceNidsChange,
  ]);

  const columnsWithVisibilityTrigger = useMemo((): EditableGridColumnDef<DataPointsRow>[] => {
    if (!enableColumnVisibility) return theadColumns;
    const triggerCol = buildColumnVisibilityTriggerCol<DataPointsRow>(
      t("COLUMNS"),
      t("SHOW_HIDE_COLUMNS"),
      () => setColVisDrawerOpen(true)
    );
    return [...theadColumns, triggerCol];
  }, [enableColumnVisibility, t, theadColumns]);

  const { hiddenIds, visibleColumns, toggle: toggleColumnVisibility } =
    useColumnVisibility(columnsWithVisibilityTrigger);

  const hideableColumns = useMemo((): ColumnVisibilityItem[] => {
    const alwaysHidden = new Set(["select", "comment", "__col_visibility"]);
    return columnsWithVisibilityTrigger
      .filter((col) => !alwaysHidden.has(col.id))
      .map((col) => {
        let label = DATA_POINT_COLUMN_LABEL_KEYS[col.id]
          ? t(DATA_POINT_COLUMN_LABEL_KEYS[col.id])
          : col.id;
        if (typeof col.header === "string") {
          label = col.header;
        } else if (col.header && typeof col.header === "object") {
          if ("text" in col.header && typeof col.header.text === "string") {
            label = col.header.text;
          }
        }
        return { id: col.id, label };
      });
  }, [columnsWithVisibilityTrigger, t]);

  const canSwitchCommentByRowClick =
    commentDrawerOpen && activeCommentDataPointId != null && Boolean(onCommentClick);

  return (
    <InlineEditableTable
      wrapClassName="tbl-wrap min-w-0 bg-surface"
      tableClassName="tv-grid-table tv-dataset-datapoints-grid min-w-[1820px] w-full text-left text-xs"
      error={error}
      onRetry={undefined}
      disableGlobalArrowNavigation
      gridColumns={visibleColumns as EditableGridColumnDef<unknown>[]}
      thead={
        <thead>
          <EditableDataGridThead columns={visibleColumns} />
        </thead>
      }
      tbody={
        <ServerDrivenListTbody<DataPointsRow>
          colSpan={visibleColumns.length}
          rows={visibleRows}
          columns={visibleColumns}
          getRowId={getRowKey}
          editingRowId={null}
          showLoadingRow={loading}
          showEmptyRow={!loading && !error && visibleRows.length === 0}
          showDataRows={!loading}
          emptyMessage={t("NO_DATA_POINTS_FOUND", "No Data-Points found")}
          getRowClassName={(row) => {
            const rowDpId = getDataPointId(row);
            const isActiveCommentRow =
              canSwitchCommentByRowClick &&
              rowDpId != null &&
              rowDpId === activeCommentDataPointId;
            return [
              row.is_deleted
                ? "bg-error/10 text-error line-through decoration-error/70"
                : "",
              isActiveCommentRow ? "settings-active" : "",
              canSwitchCommentByRowClick ? "tv-grid-row--clickable" : "",
            ]
              .filter(Boolean)
              .join(" ");
          }}
          trProps={(row) => {
            if (!canSwitchCommentByRowClick) return {};
            const rowDpId = getDataPointId(row);
            if (rowDpId == null || rowDpId === activeCommentDataPointId) return {};
            return {
              onClick: (e: ReactMouseEvent<HTMLTableRowElement>) => {
                const clickTarget = e.target as HTMLElement;
                if (
                  clickTarget.closest(
                    "input, button, textarea, select, label, [role='listbox'], [role='option']"
                  )
                ) {
                  return;
                }
                onCommentClick!(
                  rowDpId,
                  buildDataPointCommentTitle(row, sourceOptions, t),
                  isRowApproved(row)
                );
              },
            };
          }}
          getRowTdClassName={(row, col) => {
            if (!row.is_deleted) return undefined;
            if (col.id === "select" || col.id === "comment" || col.id === "__col_visibility") {
              return "!bg-error/10";
            }
            if (col.id === "status") return "bg-error/10";
            return undefined;
          }}
          addRow={null}
        />
      }
      overlay={
        enableColumnVisibility ? (
          <ColumnVisibilityPanel
            open={colVisDrawerOpen}
            onClose={() => setColVisDrawerOpen(false)}
            title={t("SHOW_HIDE_COLUMNS")}
            closeAriaLabel={t("CLOSE")}
            groupAriaLabel={t("COLUMNS")}
            items={hideableColumns}
            hiddenIds={hiddenIds}
            onToggle={toggleColumnVisibility}
          />
        ) : null
      }
    />
  );
}
