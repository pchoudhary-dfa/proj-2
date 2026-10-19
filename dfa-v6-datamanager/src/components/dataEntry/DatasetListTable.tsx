"use client";

import { useCallback, useEffect, useMemo, useState, type MouseEvent as ReactMouseEvent } from "react";
import type { SelectFieldOption } from "@/components/SelectField";
import { StatusChip } from "@/components/StatusChip";
import { DEFAULT_TABLE_PAGE_SIZES } from "@/components/TablePaginationFooter";
import { GridConfigureButton } from "@/components/GridConfigureButton";
import {
  DUAL_ACTION_COLUMN_LAYOUT,
  dualActionColumnThExtras,
  TV_GRID_CONFIGURE_LABELED_BTN,
} from "@/components/editableGridColumnClasses";
import {
  dualActionColumnHeader,
  EditableDataGridThead,
  InlineEditableTable,
  ServerDrivenListTbody,
  useColumnVisibility,
  buildColumnVisibilityTriggerCol,
  ColumnVisibilityPanel,
  type ColumnVisibilityItem,
  type EditableGridColumnDef,
} from "@/components/TableView";
import type { DatasetListItem, DatasetStage } from "@/lib/api/types";
import { COMPLETENESS_HIGH_THRESHOLD, COMPLETENESS_MEDIUM_THRESHOLD } from "@/lib/constants";


const DATASET_NAME_COL_STYLE = { minWidth: 300 } as const;

/** Maps dataset list column ids to translation keys for the show/hide panel. */
const DATASET_COLUMN_LABEL_KEYS: Record<string, string> = {
  dataset_name: "LABEL_DATASET",
  dataset_info: "INFO",
  status: "STATUS",
  data_count: "DATA_COUNT",
  completeness: "COMPLETENESS_PCT",
  created_on: "CREATED_ON",
};

function ReviewStageDots({ stages }: { stages?: DatasetStage[] }) {
  if (!stages || stages.length === 0) return null;
  const sorted = [...stages].sort((a, b) => a.level_no - b.level_no);
  return (
    <div className="flex items-center gap-1.5">
      {sorted.map((stage) => {
        const status = (stage.stage_status ?? "").toUpperCase();
        let dotClass = "review-stage-dot--pending";
        if (status === "COMPLETED") dotClass = "review-stage-dot--completed";
        else if (status === "ACTIVE") dotClass = "review-stage-dot--active";
        return (
          <span
            key={stage.stage_id}
            className={`review-stage-dot ${dotClass}`}
            title={`${stage.level_no}: ${stage.stage_status}`}
          />
        );
      })}
    </div>
  );
}

export type DatasetSortState = {
  columnId: string | null;
  direction: "asc" | "desc" | null;
};

export function cycleDatasetSort(columnId: string, prev: DatasetSortState): DatasetSortState {
  if (prev.columnId !== columnId) return { columnId, direction: "asc" };
  if (prev.direction === "asc") return { columnId, direction: "desc" };
  if (prev.direction === "desc") return { columnId: null, direction: null };
  return { columnId, direction: "asc" };
}

function datasetSortIcon(
  columnId: string,
  state: DatasetSortState
): "arrow_upward" | "arrow_downward" | "unfold_more" {
  if (state.columnId === columnId && state.direction === "asc") return "arrow_upward";
  if (state.columnId === columnId && state.direction === "desc") return "arrow_downward";
  return "unfold_more";
}

type DatasetListTableProps = {
  t: (code: string, fallback?: string) => string;
  workflowSelected: boolean;
  /** When true, shows the sticky "Columns" trigger and in-table show/hide panel. */
  enableColumnVisibility?: boolean;
  reviewEnabled?: boolean;
  isDataReview?: boolean;
  showStatusFilter?: boolean;
  /** Hide the leading select/checkbox column. Default false. */
  hideSelectColumn?: boolean;
  /** Hide the trailing Action column (configure + open). Default false. */
  hideActionsColumn?: boolean;
  /** Hide the pagination footer (use when all rows fit on one page). Default false. */
  hideFooter?: boolean;
  /** Hide the search box on the dataset name column (and the filter row when it's the only filter). Default false. */
  hideSearch?: boolean;
  /**
   * Embedded/inline layout for the primary (dataset name) column: fixed width (no auto-grow, so
   * columns distribute to full width) but still sticky-left at offset 0 (so it stays put while the
   * inner table scrolls horizontally). Use when the table is hosted inside another scroll region
   * without a leading select column. Default false (full sticky+auto-grow primary column).
   */
  embeddedLayout?: boolean;
  datasets: DatasetListItem[];
  datasetsLoading: boolean;
  datasetsError: string | null;
  statusFilter: string;
  onStatusFilterChange?: (status: string) => void;
  onSelectionChange?: (meta: {
    count: number;
    selectedDataset: DatasetListItem | null;
    selectedDatasets: DatasetListItem[];
  }) => void;
  onOpenDataset: (dataset: DatasetListItem) => void;
  onEditDataset: (dataset: DatasetListItem) => void;
  /** When the configure drawer is open (edit mode), rows are clickable to switch the active dataset. */
  editDrawerOpen?: boolean;
  editDrawerDatasetId?: string | null;
  canOpenDataset?: (dataset: DatasetListItem) => boolean;
  totalCount?: number;
  totalPages?: number;
  page?: number;
  pageSize?: number;
  onPageChange?: (page: number) => void;
  onPageSizeChange?: (size: number) => void;
  search?: string;
  onSearchChange?: (value: string) => void;
  listSort?: DatasetSortState;
  onSortChange?: (sort: DatasetSortState) => void;
  scopeArea?: "SINGLE" | "MULTIPLE";
  scopeTimePeriod?: "SINGLE" | "MULTIPLE";
  areaNameMap?: Map<number, string>;
  timePeriodNameMap?: Map<number, string>;
};

function formatDateTime(value: string | null | undefined): string {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
  });
}

function toToken(value: string): string {
  return value.trim().toLowerCase();
}

function matchesStatus(dataset: DatasetListItem, statusFilter: string): boolean {
  if (!statusFilter) return true;
  return String(dataset.dataset_status ?? "").trim().toUpperCase() === statusFilter;
}

const DATASET_STATUS_LABEL_FALLBACKS: Record<string, string> = {
  APPROVED: "Approved",
  PENDING_REVIEW: "Pending review",
  UNDER_REVIEW: "Under review",
  REVISION: "Revision",
  RETURNED: "Returned for revision",
  RETURNED_FOR_REVISION: "Returned for revision",
  SUBMITTED: "Submitted",
  DRAFT: "Draft",
};

function getDatasetStatusLabel(
  status: unknown,
  t: (code: string, fallback?: string) => string
): string {
  const raw = String(status ?? "").trim();
  if (!raw) return "";
  const token = raw.toUpperCase();
  return t(token, DATASET_STATUS_LABEL_FALLBACKS[token] ?? raw);
}

export function DatasetListTable({
  t,
  workflowSelected,
  enableColumnVisibility = false,
  reviewEnabled = false,
  isDataReview = false,
  showStatusFilter = true,
  hideSelectColumn = false,
  hideActionsColumn = false,
  hideFooter = false,
  hideSearch = false,
  embeddedLayout = false,
  datasets,
  datasetsLoading,
  datasetsError,
  statusFilter,
  onStatusFilterChange,
  onSelectionChange,
  onOpenDataset,
  onEditDataset,
  editDrawerOpen = false,
  editDrawerDatasetId = null,
  canOpenDataset,
  totalCount: propTotalCount,
  totalPages: propTotalPages,
  page: propPage,
  pageSize: propPageSize,
  onPageChange: propOnPageChange,
  onPageSizeChange: propOnPageSizeChange,
  search: propSearch,
  onSearchChange,
  listSort,
  onSortChange,
  scopeArea,
  scopeTimePeriod,
  areaNameMap,
  timePeriodNameMap,
}: DatasetListTableProps) {
  const isServerDriven = propPage != null && propOnPageChange != null;

  const [localSearch, setLocalSearch] = useState("");
  const search = propSearch ?? localSearch;
  const handleSearchChange = useCallback(
    (value: string) => {
      if (onSearchChange) {
        onSearchChange(value);
      } else {
        setLocalSearch(value);
      }
    },
    [onSearchChange]
  );

  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [colVisDrawerOpen, setColVisDrawerOpen] = useState(false);
  const [localPage, setLocalPage] = useState(1);
  const [localPageSize, setLocalPageSize] = useState<number>(DEFAULT_TABLE_PAGE_SIZES[0]);

  const page = propPage ?? localPage;
  const pageSize = propPageSize ?? localPageSize;
  const setPage = propOnPageChange ?? setLocalPage;
  const setPageSize = propOnPageSizeChange ?? setLocalPageSize;

  const statusOptions = useMemo<SelectFieldOption[]>(
    () =>
      isDataReview
        ? [
            { value: "", label: t("ALL", "All") },
            { value: "PENDING_REVIEW", label: t("PENDING_REVIEW", "Pending review") },
            { value: "APPROVED", label: t("APPROVED", "Approved") },
            { value: "REVISION", label: t("REVISION", "Revision") },
          ]
        : [
            { value: "", label: t("ALL", "All") },
            { value: "DRAFT", label: t("DRAFT", "Draft") },
            { value: "APPROVED", label: t("APPROVED", "Approved") },
            { value: "PENDING_REVIEW", label: t("PENDING_REVIEW", "Pending review") },
            { value: "REVISION", label: t("REVISION", "Revision") },
          ],
    [isDataReview, t]
  );

  const visibleDatasets = useMemo(() => {
    if (isServerDriven) return datasets;
    const q = toToken(search);
    return datasets.filter((dataset) => {
      if (!matchesStatus(dataset, statusFilter)) return false;
      if (!q) return true;
      const name = toToken(dataset.dataset_name ?? "");
      const workflow = toToken(dataset.workflow_name ?? "");
      const idText = toToken(String(dataset.dataset_id));
      return name.includes(q) || workflow.includes(q) || idText.includes(q);
    });
  }, [datasets, isServerDriven, search, statusFilter]);

  const totalListCount = propTotalCount ?? visibleDatasets.length;
  const totalPages = propTotalPages ?? Math.max(1, Math.ceil(totalListCount / pageSize));

  const pagedDatasets = useMemo(() => {
    if (isServerDriven) return datasets;
    const start = (page - 1) * pageSize;
    return visibleDatasets.slice(start, start + pageSize);
  }, [datasets, isServerDriven, page, pageSize, visibleDatasets]);

  useEffect(() => {
    if (isServerDriven) return;
    setPage(1);
  }, [isServerDriven, search, setPage, statusFilter]);

  useEffect(() => {
    if (isServerDriven) return;
    if (page > totalPages) setPage(Math.max(1, totalPages));
  }, [isServerDriven, page, setPage, totalPages]);

  const toggleSelect = useCallback((id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  /** Select-all applies to the current page only (see pagination). */
  const toggleSelectAll = useCallback(() => {
    const pageIds = pagedDatasets.map((d) => d.dataset_id);
    setSelectedIds((prev) => {
      const allPageSelected = pageIds.length > 0 && pageIds.every((id) => prev.has(id));
      const next = new Set(prev);
      if (allPageSelected) {
        for (const id of pageIds) next.delete(id);
      } else {
        for (const id of pageIds) next.add(id);
      }
      return next;
    });
  }, [pagedDatasets]);

  useEffect(() => {
    if (!workflowSelected) {
      setSelectedIds(new Set());
      return;
    }
    const validIds = new Set(datasets.map((d) => d.dataset_id));
    setSelectedIds((prev) => {
      const next = new Set(Array.from(prev).filter((id) => validIds.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [datasets, workflowSelected]);

  const selectedDataset = useMemo(() => {
    if (selectedIds.size !== 1) return null;
    const id = Array.from(selectedIds)[0];
    return datasets.find((d) => d.dataset_id === id) ?? null;
  }, [datasets, selectedIds]);
  const selectedDatasets = useMemo(
    () => datasets.filter((dataset) => selectedIds.has(dataset.dataset_id)),
    [datasets, selectedIds]
  );

  useEffect(() => {
    onSelectionChange?.({
      count: selectedIds.size,
      selectedDataset,
      selectedDatasets,
    });
  }, [onSelectionChange, selectedDataset, selectedDatasets, selectedIds.size]);

  const showPromptCard = !workflowSelected;
  const reviewDateColumnLabel = isDataReview
    ? t("SUBMITTED_ON", "Submitted On")
    : t("REVIEWED_ON", "Reviewed On");
  const reviewByColumnLabel = isDataReview
    ? t("SUBMITTED_BY", "Submitted By")
    : t("REVIEWED_BY", "Reviewed By");

  const theadColumns = useMemo((): EditableGridColumnDef<DatasetListItem>[] => {
    const cols: EditableGridColumnDef<DatasetListItem>[] = [];
    if (!hideSelectColumn) {
      cols.push({
        id: "select",
        layout: { width: 1 },
        header: {
          kind: "selectAll",
          checked:
            pagedDatasets.length > 0 &&
            pagedDatasets.every((d) => selectedIds.has(d.dataset_id)),
          onChange: toggleSelectAll,
          ariaLabel: t("TOOLBAR_SELECT_HINT", "Select all"),
        },
        filter: null,
        cell: ({ row }) => (
          <input
            type="checkbox"
            className="checkbox-comp"
            checked={selectedIds.has(row.dataset_id)}
            onChange={() => toggleSelect(row.dataset_id)}
            aria-label={`Select ${row.dataset_name ?? row.dataset_id}`}
          />
        ),
      });
    }
    cols.push(
      {
        id: "dataset_name",
        defaultWidth: 320,
        layout: embeddedLayout
          ? { width: 320, minWidth: 200, sticky: "left" }
          : { width: 320, minWidth: 200, sticky: true, main: true },
        header: {
          kind: "sort",
          text: t("LABEL_DATASET", "Dataset"),
          onSort: () => {
            if (onSortChange && listSort) {
              setPage(1);
              onSortChange(cycleDatasetSort("dataset_name", listSort));
            }
          },
          sortIcon: listSort
            ? datasetSortIcon("dataset_name", listSort)
            : "unfold_more",
          sortAriaLabel: t("SORT", "Sort"),
        },
        headerThStyle: DATASET_NAME_COL_STYLE,
        filterThExtraProps: { style: DATASET_NAME_COL_STYLE },
        filter: hideSearch
          ? null
          : {
              kind: "search",
              size: "sm",
              value: search,
              onChange: handleSearchChange,
              placeholder: t("SEARCH_PLACEHOLDER", "Search..."),
              ariaLabel: t("SEARCH_PLACEHOLDER", "Search..."),
            },
        tdExtraProps: { style: DATASET_NAME_COL_STYLE },
        cell: ({ row }) => {
          const name = row.dataset_name?.trim() || String(row.dataset_id);
          return <span title={name}>{name}</span>;
        },
      },
    );

    if (scopeArea === "SINGLE" || scopeTimePeriod === "SINGLE") {
      cols.push({
        id: "dataset_info",
        defaultWidth: 200,
        header: t("INFO", "Info"),
        headerThStyle: { width: 200, minWidth: 150 },
        filterThExtraProps: { style: { width: 200, minWidth: 150 } },
        filter: null,
        tdExtraProps: { style: { width: 200, minWidth: 150 } },
        cell: ({ row }) => {
          const infoParts: string[] = [];
          if (scopeArea === "SINGLE" && row.area_nids?.length) {
            const nid = row.area_nids[0];
            infoParts.push(areaNameMap?.get(nid) ?? String(nid));
          }
          if (scopeTimePeriod === "SINGLE" && row.timeperiod_nids?.length) {
            const nid = row.timeperiod_nids[0];
            infoParts.push(timePeriodNameMap?.get(nid) ?? String(nid));
          }
          return infoParts.join(", ") || "-";
        },
      });
    }

    cols.push(
      {
        id: "status",
        defaultWidth: 140,
        // Centered header kind so the "Status" label sits centered over its
        // centered chip — `textAlign` alone can't center the flex header wrapper.
        header: { kind: "centered", text: t("STATUS", "Status") },
        headerThStyle: { width: 140, minWidth: 140, textAlign: "center" },
        filterThExtraProps: { style: { width: 140, minWidth: 140, textAlign: "center" as const } },
        filter: showStatusFilter
          ? {
              kind: "select",
              value: statusFilter,
              onChange: (v) => onStatusFilterChange?.(v),
              ariaLabel: t("STATUS", "Status"),
              options: statusOptions,
            }
          : null,
        tdExtraProps: { style: { width: 140, minWidth: 140, textAlign: "center" as const } },
        cell: ({ row }) => {
          const statusText = String(row.dataset_status ?? "").trim();
          const statusLabel = getDatasetStatusLabel(row.dataset_status, t);
          return (
            <div className="flex flex-col items-center gap-1">
              <StatusChip status={statusText} label={statusLabel} />
              {reviewEnabled && <ReviewStageDots stages={row.stages} />}
            </div>
          );
        },
      },
      {
        id: "data_count",
        defaultWidth: 110,
        header: t("DATA_COUNT", "Data count"),
        headerThStyle: { width: 110, minWidth: 110 },
        filterThExtraProps: { style: { width: 110, minWidth: 110 } },
        filter: null,
        tdExtraProps: { style: { width: 110, minWidth: 110 } },
        cell: ({ row }) =>
          typeof row.data_point_count === "number" ? row.data_point_count : "-",
      },
      {
        id: "completeness",
        defaultWidth: 160,
        header: t("COMPLETENESS_PCT", "Completeness %"),
        headerThStyle: { width: 160, minWidth: 160 },
        filterThExtraProps: { style: { width: 160, minWidth: 160 } },
        filter: null,
        tdExtraProps: { style: { width: 160, minWidth: 160 } },
        cell: ({ row }) => {
          if (
            typeof row.data_point_count !== "number" ||
            row.data_point_count === 0
          )
            return <span className="text-text-muted">—</span>;
          const missing =
            typeof row.missing_data_count === "number"
              ? row.missing_data_count
              : 0;
          const pct = Math.round(
            ((row.data_point_count - missing) / row.data_point_count) * 100
          );
          const barClass =
            pct >= COMPLETENESS_HIGH_THRESHOLD ? "bg-success" : pct >= COMPLETENESS_MEDIUM_THRESHOLD ? "bg-warning" : "bg-error";
          return (
            <div className="flex items-center gap-2">
              <div className="h-2 w-20 shrink-0 rounded-full overflow-hidden bg-border">
                <div
                  className={`h-full rounded-full ${barClass}`}
                  style={{ width: `${pct}%` }}
                />
              </div>
              <span className="w-9 shrink-0 text-xs font-medium tabular-nums text-right text-text">
                {pct}%
              </span>
            </div>
          );
        },
      },
      {
        id: "created_on",
        defaultWidth: 180,
        header: {
          kind: "sort",
          text: t("CREATED_ON", "Created On"),
          onSort: () => {
            if (onSortChange && listSort) {
              setPage(1);
              onSortChange(cycleDatasetSort("created_on", listSort));
            }
          },
          sortIcon: listSort
            ? datasetSortIcon("created_on", listSort)
            : "unfold_more",
          sortAriaLabel: t("SORT", "Sort"),
        },
        headerThStyle: { width: 180, minWidth: 180 },
        filterThExtraProps: { style: { width: 180, minWidth: 180 } },
        filter: null,
        tdExtraProps: { style: { width: 180, minWidth: 180 } },
        cell: ({ row }) => formatDateTime(row.created),
      }
    );

    if (reviewEnabled) {
      cols.push(
        {
          id: "review_date",
          defaultWidth: 160,
          header: reviewDateColumnLabel,
          headerThStyle: { width: 160, minWidth: 160 },
          filterThExtraProps: { style: { width: 160, minWidth: 160 } },
          filter: null,
          tdExtraProps: { style: { width: 160, minWidth: 160 } },
          cell: ({ row }) =>
            formatDateTime(isDataReview ? row.submitted_at : row.approved_on),
        },
        {
          id: "review_by",
          defaultWidth: 150,
          header: reviewByColumnLabel,
          headerThStyle: { width: 150, minWidth: 150 },
          filterThExtraProps: { style: { width: 150, minWidth: 150 } },
          filter: null,
          tdExtraProps: { style: { width: 150, minWidth: 150 } },
          cell: ({ row }) =>
            (
              isDataReview
                ? (row.submitted_by_username ?? row.created_username ?? "")
                : (row.approved_by_username ?? "")
            ).trim() || "-",
        }
      );
    }

    if (hideActionsColumn) return cols;

    cols.push({
      id: "actions",
      layout: DUAL_ACTION_COLUMN_LAYOUT,
      header: dualActionColumnHeader(t("ACTION", "Action")),
      ...dualActionColumnThExtras(),
      filter: null,
      cell: ({ row }) => {
        const isOpenAllowed = canOpenDataset ? canOpenDataset(row) : true;
        const readiness = String(row.datapoint_readiness ?? "").toUpperCase();
        const isDatapointSeeding = readiness === "CREATED";
        const isOpenDisabled = !isOpenAllowed || isDatapointSeeding;
        return (
          <div className="flex flex-nowrap items-center justify-center gap-1.5">
            <GridConfigureButton
              ariaLabel={t("CONFIGURE", "Configure")}
              onClick={(e) => {
                e.stopPropagation();
                onEditDataset(row);
              }}
            />
            <button
              type="button"
              className={TV_GRID_CONFIGURE_LABELED_BTN}
              disabled={isOpenDisabled}
              aria-label={
                isDatapointSeeding
                  ? t("DATASET_BEING_PREPARED", "Dataset is being prepared...")
                  : isOpenAllowed
                    ? t("OPEN", "Open")
                    : t(
                        "DATASET_OPEN_NOT_ALLOWED",
                        "Open is disabled for this dataset status."
                      )
              }
              title={
                isDatapointSeeding
                  ? t("DATASET_BEING_PREPARED", "Dataset is being prepared...")
                  : isOpenAllowed
                    ? t("OPEN", "Open")
                    : t(
                        "DATASET_OPEN_NOT_ALLOWED",
                        "Open is disabled for this dataset status."
                      )
              }
              onClick={() => {
                if (isOpenDisabled) return;
                onOpenDataset(row);
              }}
            >
              {isDatapointSeeding ? (
                <span
                  className="material-icons !text-sm animate-spin"
                  aria-hidden="true"
                >
                  sync
                </span>
              ) : (
                <span className="material-icons !text-sm" aria-hidden="true">
                  open_in_new
                </span>
              )}
              {isDatapointSeeding ? t("PREPARING", "Preparing...") : t("OPEN", "Open")}
            </button>
          </div>
        );
      },
    });

    return cols;
  }, [
    t,
    pagedDatasets,
    selectedIds,
    toggleSelectAll,
    toggleSelect,
    onSortChange,
    listSort,
    setPage,
    search,
    handleSearchChange,
    reviewEnabled,
    isDataReview,
    showStatusFilter,
    hideSelectColumn,
    hideActionsColumn,
    hideSearch,
    embeddedLayout,
    statusFilter,
    statusOptions,
    onStatusFilterChange,
    reviewDateColumnLabel,
    reviewByColumnLabel,
    canOpenDataset,
    onOpenDataset,
    onEditDataset,
    scopeArea,
    scopeTimePeriod,
    areaNameMap,
    timePeriodNameMap,
  ]);

  const columnsWithVisibilityTrigger = useMemo((): EditableGridColumnDef<DatasetListItem>[] => {
    if (!enableColumnVisibility) return theadColumns;
    const triggerCol = buildColumnVisibilityTriggerCol<DatasetListItem>(
      t("COLUMNS"),
      t("SHOW_HIDE_COLUMNS"),
      () => setColVisDrawerOpen(true)
    );
    return [...theadColumns, triggerCol];
  }, [enableColumnVisibility, t, theadColumns]);

  const { hiddenIds, visibleColumns, toggle: toggleColumnVisibility } =
    useColumnVisibility(columnsWithVisibilityTrigger);

  const hideableColumns = useMemo((): ColumnVisibilityItem[] => {
    const alwaysHidden = new Set(["select", "actions", "__col_visibility"]);
    return columnsWithVisibilityTrigger
      .filter((col) => !alwaysHidden.has(col.id))
      .map((col) => {
        let label = DATASET_COLUMN_LABEL_KEYS[col.id]
          ? t(DATASET_COLUMN_LABEL_KEYS[col.id])
          : col.id;
        if (col.id === "review_date") {
          label = reviewDateColumnLabel;
        } else if (col.id === "review_by") {
          label = reviewByColumnLabel;
        } else if (typeof col.header === "string") {
          label = col.header;
        } else if (col.header && typeof col.header === "object") {
          if ("text" in col.header && typeof col.header.text === "string") {
            label = col.header.text;
          }
        }
        return { id: col.id, label };
      });
  }, [
    columnsWithVisibilityTrigger,
    t,
    reviewDateColumnLabel,
    reviewByColumnLabel,
  ]);

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
      {showPromptCard ? (
        <div className="flex flex-1 items-center justify-center p-10">
          <div className="rounded-lg border border-border bg-surface p-10 text-center shadow-sm">
            <span className="material-icons mb-2 !text-sm text-text-muted" aria-hidden>
              conversion_path
            </span>
            <p className="text-sm font-medium text-text">{t("SELECT_WORKFLOW_FIRST")}</p>
            <p className="mt-1 text-xs text-text-muted">
              {t(
                "DATASET_PAGE_SELECT_WORKFLOW_HELP",
                "Choose a workflow, then open a dataset to enter or review data."
              )}
            </p>
          </div>
        </div>
      ) : null}

      {workflowSelected ? (
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          <InlineEditableTable
            wrapClassName="tbl-wrap min-w-0 min-h-0 flex-1"
            tableClassName="tv-grid-table text-left text-xs"
            gridColumns={visibleColumns as EditableGridColumnDef<unknown>[]}
            loading={datasetsLoading}
            loadingLabel={t("LOADING", "Loading...")}
            error={datasetsError}
            onRetry={undefined}
            disableGlobalArrowNavigation
            thead={
              <thead>
                <EditableDataGridThead
                  columns={visibleColumns}
                  showFilterRow={visibleColumns.some((c) => c.filter != null)}
                />
              </thead>
            }
            tbody={
              <ServerDrivenListTbody<DatasetListItem>
                colSpan={visibleColumns.length}
                rows={pagedDatasets}
                columns={visibleColumns}
                getRowId={(d) => String(d.dataset_id)}
                editingRowId={null}
                showLoadingRow={false}
                showEmptyRow={!datasetsLoading && !datasetsError && visibleDatasets.length === 0}
                showDataRows={!datasetsLoading && !datasetsError}
                emptyMessage={t("NO_DATASETS_FOUND", "No datasets found for the selected workflow.")}
                getRowClassName={(dataset) => {
                  const datasetIdStr = String(dataset.dataset_id);
                  const isEditDrawerRow =
                    editDrawerOpen && editDrawerDatasetId === datasetIdStr;
                  return [
                    isEditDrawerRow ? "settings-active" : "",
                    editDrawerOpen ? "tv-grid-row--clickable" : "",
                  ]
                    .filter(Boolean)
                    .join(" ");
                }}
                trProps={(dataset) => {
                  if (!editDrawerOpen) return {};
                  const datasetIdStr = String(dataset.dataset_id);
                  const isEditDrawerRow =
                    editDrawerOpen && editDrawerDatasetId === datasetIdStr;
                  if (isEditDrawerRow) return {};
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
                      onEditDataset(dataset);
                    },
                  };
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
            pagination={
              hideFooter
                ? undefined
                : {
                    page,
                    displayPage: page,
                    totalPages,
                    totalCount: totalListCount,
                    pageSize,
                    onPageChange: setPage,
                    onPageSizeChange: setPageSize,
                    countNoun: t("LABEL_DATASET", "Dataset"),
                    countSpanId: "footer-count-datasets",
                    labels: { t },
                    renderCount: (tc) => (
                      <span id="footer-count-datasets">
                        {`${t("FOOTER_OF_TOTAL_WORKFLOWS").split("{total}")[0]}${tc} ${
                          tc === 1
                            ? t("LABEL_DATASET", "Dataset")
                            : `${t("LABEL_DATASET", "Dataset")}s`
                        }`}
                      </span>
                    ),
                  }
            }
          />
        </div>
      ) : null}
    </div>
  );
}
