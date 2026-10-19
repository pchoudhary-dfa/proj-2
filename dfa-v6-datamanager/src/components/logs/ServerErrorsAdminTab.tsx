"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { useCore } from "@/contexts/CoreContext";
import type { ToolbarExportConfig } from "@/contexts/SidebarContext";
import { DEFAULT_TABLE_PAGE_SIZES } from "@/components/TablePaginationFooter";
import { parseListMetaTotals } from "@/lib/gridListMeta";
import {
  EditableDataGridThead,
  ServerDrivenListTbody,
  ServerDrivenTable,
  useServerListQuery,
  type ServerListParseResult,
} from "@/components/TableView";
import { LOGS_SERVER_ERRORS_API_URL } from "@/lib/constants";
import { ServerErrorDetailModal } from "./ServerErrorDetailModal";
import {
  useServerErrorsGridColumns,
  type ServerErrorLevelFilter,
  type ServerErrorLogRow,
  type ServerErrorMethodFilter,
} from "./serverErrorsGridColumns";
import {
  downloadServerErrorsExport,
  type ExportServerErrorsParams,
} from "./serverErrorsExport";

export type { ServerErrorLogRow };

type ServerErrorsAdminTabProps = {
  onToolbarExportChange?: (config: ToolbarExportConfig | null) => void;
};

type ServerErrorsListMeta = {
  total_count: number;
  count: number;
  page: number;
  page_size: number;
  total_pages: number;
};

type ServerErrorsListResponse = {
  success: true;
  data: ServerErrorLogRow[];
  meta: ServerErrorsListMeta;
};

type ServerErrorsListSortState = {
  columnId: string | null;
  direction: "asc" | "desc" | null;
};

const SORT_FIELD_BY_COLUMN: Record<string, string> = {
  id: "id",
  created: "created",
  level: "level",
  status_code: "status_code",
};

function isServerErrorsListResponse(r: unknown): r is ServerErrorsListResponse {
  return (
    typeof r === "object" &&
    r !== null &&
    (r as ServerErrorsListResponse).success === true &&
    Array.isArray((r as ServerErrorsListResponse).data)
  );
}

function serverErrorRowId(row: ServerErrorLogRow): string {
  return String(row.id);
}

function cycleListSort(columnId: string, prev: ServerErrorsListSortState): ServerErrorsListSortState {
  if (prev.columnId !== columnId) {
    return { columnId, direction: "asc" };
  }
  if (prev.direction === "asc") {
    return { columnId, direction: "desc" };
  }
  if (prev.direction === "desc") {
    return { columnId: null, direction: null };
  }
  return { columnId, direction: "asc" };
}

function sortHeaderIcon(
  columnId: string,
  activeColumnId: string | null,
  direction: ServerErrorsListSortState["direction"]
): "arrow_upward" | "arrow_downward" | "unfold_more" {
  if (activeColumnId === columnId && direction === "asc") return "arrow_upward";
  if (activeColumnId === columnId && direction === "desc") return "arrow_downward";
  return "unfold_more";
}

function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debouncedValue;
}

function buildListSearch(
  debouncedPath: string,
  debouncedError: string
): { search?: string; search_by?: string } {
  const path = debouncedPath.trim();
  const error = debouncedError.trim();
  if (path) return { search: path, search_by: "path" };
  if (error) return { search: error, search_by: "error_message" };
  return {};
}

export default function ServerErrorsAdminTab({
  onToolbarExportChange,
}: ServerErrorsAdminTabProps) {
  const { t } = useCore();
  const scrollRef = useRef<HTMLDivElement>(null);
  const exportBusyRef = useRef(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(DEFAULT_TABLE_PAGE_SIZES[0] ?? 20);
  const [listSort, setListSort] = useState<ServerErrorsListSortState>({
    columnId: "id",
    direction: "desc",
  });

  const [colFilterPath, setColFilterPath] = useState("");
  const [colFilterError, setColFilterError] = useState("");
  const [levelFilter, setLevelFilter] = useState<ServerErrorLevelFilter>("");
  const [methodFilter, setMethodFilter] = useState<ServerErrorMethodFilter>("");
  const [colFilterStatus, setColFilterStatus] = useState("");

  const [detailRow, setDetailRow] = useState<ServerErrorLogRow | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  const debouncedPath = useDebounce(colFilterPath, 300);
  const debouncedError = useDebounce(colFilterError, 300);
  const debouncedStatus = useDebounce(colFilterStatus, 300);

  const listSearch = useMemo(
    () => buildListSearch(debouncedPath, debouncedError),
    [debouncedPath, debouncedError]
  );

  const statusCodeFilter = useMemo(() => {
    const raw = debouncedStatus.trim();
    if (!raw) return undefined;
    const n = Number.parseInt(raw, 10);
    return Number.isFinite(n) ? n : undefined;
  }, [debouncedStatus]);

  const listQuery = useMemo(() => {
    const sortField =
      listSort.direction != null && listSort.columnId
        ? SORT_FIELD_BY_COLUMN[listSort.columnId]
        : undefined;
    return {
      page,
      page_size: pageSize,
      ...(sortField && listSort.direction
        ? { sort_field: sortField, sort_order: listSort.direction }
        : { sort_field: "id", sort_order: "desc" }),
      ...(levelFilter ? { level: levelFilter } : {}),
      ...(methodFilter ? { method: methodFilter } : {}),
      ...(statusCodeFilter != null ? { status_code: statusCodeFilter } : {}),
      ...listSearch,
    };
  }, [
    page,
    pageSize,
    listSort.columnId,
    listSort.direction,
    levelFilter,
    methodFilter,
    statusCodeFilter,
    listSearch,
  ]);

  const parseListResponse = useCallback(
    (json: unknown): ServerListParseResult<ServerErrorLogRow, ServerErrorsListMeta> => {
      if (!isServerErrorsListResponse(json)) {
        const msg =
          typeof json === "object" &&
          json !== null &&
          typeof (json as { err_message?: string }).err_message === "string"
            ? (json as { err_message: string }).err_message
            : t("SERVER_ERRORS_LOAD_FAILED", "Failed to load server errors");
        return { ok: false, message: msg };
      }
      const meta = json.meta;
      const totals = parseListMetaTotals(meta);
      return {
        ok: true,
        rows: json.data,
        ...totals,
        meta,
      };
    },
    [t]
  );

  const listState = useServerListQuery<ServerErrorLogRow, ServerErrorsListMeta>({
    listUrl: LOGS_SERVER_ERRORS_API_URL,
    query: listQuery,
    parseListResponse,
  });

  const { rows, loading, totalCount, totalCountUnfiltered, totalPages, meta } =
    listState;

  const exportParams = useMemo((): ExportServerErrorsParams => {
    const sortField =
      listSort.direction != null && listSort.columnId
        ? SORT_FIELD_BY_COLUMN[listSort.columnId]
        : "id";
    const sortOrder =
      listSort.direction != null && listSort.columnId
        ? listSort.direction
        : "desc";
    return {
      sort_field: sortField,
      sort_order: sortOrder,
      ...(levelFilter ? { level: levelFilter } : {}),
      ...(methodFilter ? { method: methodFilter } : {}),
      ...(statusCodeFilter != null ? { status_code: statusCodeFilter } : {}),
      ...listSearch,
    };
  }, [
    listSort.columnId,
    listSort.direction,
    levelFilter,
    methodFilter,
    statusCodeFilter,
    listSearch,
  ]);

  const runExport = useCallback(async () => {
    if (exportBusyRef.current) return;
    exportBusyRef.current = true;
    try {
      const result = await downloadServerErrorsExport(exportParams);
      if (!result.ok) {
        toast.error(t("ERROR_MESSAGE").replace("{message}", result.message));
      } else {
        toast.success(t("EXPORT_SUCCESS"));
      }
    } catch (e) {
      toast.error(
        t("ERROR_MESSAGE").replace(
          "{message}",
          e instanceof Error ? e.message : t("EXPORT_FAILED")
        )
      );
    } finally {
      exportBusyRef.current = false;
    }
  }, [exportParams, t]);

  useEffect(() => {
    if (!onToolbarExportChange) return;
    onToolbarExportChange({
      onClick: () => void runExport(),
      disabled: totalCount === 0 || loading,
    });
    return () => onToolbarExportChange(null);
  }, [onToolbarExportChange, runExport, totalCount, loading]);

  useEffect(() => {
    setPage(1);
  }, [
    debouncedPath,
    debouncedError,
    debouncedStatus,
    levelFilter,
    methodFilter,
    listSort.columnId,
    listSort.direction,
    pageSize,
  ]);

  const handleViewRow = useCallback((row: ServerErrorLogRow) => {
    setDetailRow(row);
    setDetailOpen(true);
  }, []);

  const closeDetail = useCallback(() => {
    setDetailOpen(false);
    setDetailRow(null);
  }, []);

  const onSortId = useCallback(
    () => setListSort((prev) => cycleListSort("id", prev)),
    []
  );
  const onSortCreated = useCallback(
    () => setListSort((prev) => cycleListSort("created", prev)),
    []
  );
  const onSortLevel = useCallback(
    () => setListSort((prev) => cycleListSort("level", prev)),
    []
  );
  const onSortStatus = useCallback(
    () => setListSort((prev) => cycleListSort("status_code", prev)),
    []
  );

  const columns = useServerErrorsGridColumns({
    t,
    colFilterPath,
    setColFilterPath,
    colFilterError,
    setColFilterError,
    levelFilter,
    setLevelFilter,
    methodFilter,
    setMethodFilter,
    colFilterStatus,
    setColFilterStatus,
    onSortId,
    onSortCreated,
    onSortLevel,
    onSortStatus,
    idSortIcon: sortHeaderIcon("id", listSort.columnId, listSort.direction),
    createdSortIcon: sortHeaderIcon("created", listSort.columnId, listSort.direction),
    levelSortIcon: sortHeaderIcon("level", listSort.columnId, listSort.direction),
    statusSortIcon: sortHeaderIcon("status_code", listSort.columnId, listSort.direction),
    onViewRow: handleViewRow,
  });

  const activeRowId = detailRow ? serverErrorRowId(detailRow) : null;

  return (
    <>
      <div className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden overflow-x-hidden rounded-b-md border-x border-b border-border bg-surface">
        <ServerDrivenTable<ServerErrorLogRow, ServerErrorsListMeta>
          listState={listState}
          columns={columns}
          scrollRef={scrollRef}
          tableClassName="min-w-[1280px]"
          loadingLabel={t("LOADING", "Loading…")}
          retryLabel={t("RETRY", "Retry")}
          renderThead={() => (
            <thead>
              <EditableDataGridThead columns={columns} />
            </thead>
          )}
          tbody={
            <ServerDrivenListTbody<ServerErrorLogRow>
              colSpan={columns.length}
              rows={rows}
              columns={columns}
              getRowId={serverErrorRowId}
              activeRowId={activeRowId}
              editingRowId=""
              emptyMessage={t("SERVER_ERRORS_EMPTY", "No server errors found.")}
              showLoadingRow={false}
              showEmptyRow={!loading && rows.length === 0}
              showDataRows={!loading}
              getRowClassName={(row) =>
                detailRow && serverErrorRowId(row) === serverErrorRowId(detailRow)
                  ? "settings-active"
                  : ""
              }
            />
          }
          pagination={{
            page,
            displayPage: meta?.page ?? page,
            totalPages,
            totalCount,
            totalCountUnfiltered,
            pageSize,
            onPageChange: setPage,
            onPageSizeChange: setPageSize,
            countNoun: t("SERVER_ERRORS", "Server Errors"),
            labels: { t },
          }}
        />
      </div>

      <ServerErrorDetailModal
        open={detailOpen}
        row={detailRow}
        onClose={closeDetail}
        t={t}
      />
    </>
  );
}
