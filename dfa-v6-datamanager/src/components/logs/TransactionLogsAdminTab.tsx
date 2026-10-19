"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { useCore } from "@/contexts/CoreContext";
import { useSidebar } from "@/contexts/SidebarContext";
import { DEFAULT_TABLE_PAGE_SIZES } from "@/components/TablePaginationFooter";
import { parseListMetaTotals } from "@/lib/gridListMeta";
import {
  EditableDataGridThead,
  ServerDrivenListTbody,
  ServerDrivenTable,
  useServerListQuery,
  type ServerListParseResult,
} from "@/components/TableView";
import { LOGS_TRANSACTIONS_API_URL } from "@/lib/constants";
import { TransactionLogDetailModal } from "./TransactionLogDetailModal";
import {
  useTransactionLogsGridColumns,
  type TransactionActionFilter,
  type TransactionLogRow,
  type TransactionStatusFilter,
} from "./transactionLogsGridColumns";
import {
  downloadTransactionLogsExport,
  type ExportTransactionLogsParams,
} from "./transactionLogsExport";

export type { TransactionLogRow };

type TransactionLogsListMeta = {
  total_count: number;
  count: number;
  page: number;
  page_size: number;
  total_pages: number;
};

type TransactionLogsListResponse = {
  success: true;
  data: TransactionLogRow[];
  meta: TransactionLogsListMeta;
};

type TransactionLogsListSortState = {
  columnId: string | null;
  direction: "asc" | "desc" | null;
};

const SORT_FIELD_BY_COLUMN: Record<string, string> = {
  id: "id",
  created: "created",
  action: "action",
  module: "module",
  status: "status",
};

function isTransactionLogsListResponse(r: unknown): r is TransactionLogsListResponse {
  return (
    typeof r === "object" &&
    r !== null &&
    (r as TransactionLogsListResponse).success === true &&
    Array.isArray((r as TransactionLogsListResponse).data)
  );
}

function transactionLogRowId(row: TransactionLogRow): string {
  return String(row.id);
}

function cycleListSort(
  columnId: string,
  prev: TransactionLogsListSortState
): TransactionLogsListSortState {
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
  direction: TransactionLogsListSortState["direction"]
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
  debouncedModule: string,
  debouncedIdentifier: string,
  debouncedDescription: string
): { search?: string; search_by?: string } {
  const path = debouncedPath.trim();
  const module = debouncedModule.trim();
  const identifier = debouncedIdentifier.trim();
  const description = debouncedDescription.trim();
  if (path) return { search: path, search_by: "path" };
  if (module) return { search: module, search_by: "module" };
  if (identifier) return { search: identifier, search_by: "identifier" };
  if (description) return { search: description, search_by: "description" };
  return {};
}

export default function TransactionLogsAdminTab() {
  const { t } = useCore();
  const { dwId, setToolbarExport } = useSidebar();
  const scrollRef = useRef<HTMLDivElement>(null);
  const exportBusyRef = useRef(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(DEFAULT_TABLE_PAGE_SIZES[0] ?? 20);
  const [listSort, setListSort] = useState<TransactionLogsListSortState>({
    columnId: "id",
    direction: "desc",
  });

  const [colFilterPath, setColFilterPath] = useState("");
  const [colFilterModule, setColFilterModule] = useState("");
  const [colFilterIdentifier, setColFilterIdentifier] = useState("");
  const [colFilterDescription, setColFilterDescription] = useState("");
  const [actionFilter, setActionFilter] = useState<TransactionActionFilter>("");
  const [statusFilter, setStatusFilter] = useState<TransactionStatusFilter>("");

  const [detailRow, setDetailRow] = useState<TransactionLogRow | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  const debouncedPath = useDebounce(colFilterPath, 300);
  const debouncedModule = useDebounce(colFilterModule, 300);
  const debouncedIdentifier = useDebounce(colFilterIdentifier, 300);
  const debouncedDescription = useDebounce(colFilterDescription, 300);

  const dwIdFilter = useMemo(() => {
    const n = Number.parseInt(String(dwId).trim(), 10);
    return Number.isFinite(n) ? n : undefined;
  }, [dwId]);

  const listSearch = useMemo(
    () =>
      buildListSearch(
        debouncedPath,
        debouncedModule,
        debouncedIdentifier,
        debouncedDescription
      ),
    [debouncedPath, debouncedModule, debouncedIdentifier, debouncedDescription]
  );

  const listQuery = useMemo(() => {
    const sortField =
      listSort.direction != null && listSort.columnId
        ? SORT_FIELD_BY_COLUMN[listSort.columnId]
        : undefined;
    return {
      page,
      page_size: pageSize,
      ...(dwIdFilter != null ? { dw_id: dwIdFilter } : {}),
      ...(sortField && listSort.direction
        ? { sort_field: sortField, sort_order: listSort.direction }
        : { sort_field: "id", sort_order: "desc" }),
      ...(actionFilter ? { action: actionFilter } : {}),
      ...(statusFilter ? { status: statusFilter } : {}),
      ...listSearch,
    };
  }, [
    page,
    pageSize,
    dwIdFilter,
    listSort.columnId,
    listSort.direction,
    actionFilter,
    statusFilter,
    listSearch,
  ]);

  const parseListResponse = useCallback(
    (json: unknown): ServerListParseResult<TransactionLogRow, TransactionLogsListMeta> => {
      if (!isTransactionLogsListResponse(json)) {
        const msg =
          typeof json === "object" &&
          json !== null &&
          typeof (json as { err_message?: string }).err_message === "string"
            ? (json as { err_message: string }).err_message
            : t("TRANSACTION_LOGS_LOAD_FAILED", "Failed to load transaction logs");
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

  const listState = useServerListQuery<TransactionLogRow, TransactionLogsListMeta>({
    listUrl: LOGS_TRANSACTIONS_API_URL,
    query: listQuery,
    parseListResponse,
  });

  const { rows, loading, totalCount, totalCountUnfiltered, totalPages, meta } =
    listState;

  const exportParams = useMemo((): ExportTransactionLogsParams => {
    const sortField =
      listSort.direction != null && listSort.columnId
        ? SORT_FIELD_BY_COLUMN[listSort.columnId]
        : "id";
    const sortOrder =
      listSort.direction != null && listSort.columnId ? listSort.direction : "desc";
    return {
      ...(dwIdFilter != null ? { dw_id: dwIdFilter } : {}),
      sort_field: sortField,
      sort_order: sortOrder,
      ...(actionFilter ? { action: actionFilter } : {}),
      ...(statusFilter ? { status: statusFilter } : {}),
      ...listSearch,
    };
  }, [
    dwIdFilter,
    listSort.columnId,
    listSort.direction,
    actionFilter,
    statusFilter,
    listSearch,
  ]);

  const runExport = useCallback(async () => {
    if (exportBusyRef.current) return;
    exportBusyRef.current = true;
    try {
      const result = await downloadTransactionLogsExport(exportParams);
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
    setToolbarExport({
      onClick: () => void runExport(),
      disabled: totalCount === 0 || loading,
    });
    return () => setToolbarExport(null);
  }, [setToolbarExport, runExport, totalCount, loading]);

  useEffect(() => {
    setPage(1);
  }, [
    debouncedPath,
    debouncedModule,
    debouncedIdentifier,
    debouncedDescription,
    actionFilter,
    statusFilter,
    listSort.columnId,
    listSort.direction,
    pageSize,
    dwIdFilter,
  ]);

  const handleViewRow = useCallback((row: TransactionLogRow) => {
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
  const onSortAction = useCallback(
    () => setListSort((prev) => cycleListSort("action", prev)),
    []
  );
  const onSortModule = useCallback(
    () => setListSort((prev) => cycleListSort("module", prev)),
    []
  );
  const onSortStatus = useCallback(
    () => setListSort((prev) => cycleListSort("status", prev)),
    []
  );

  const columns = useTransactionLogsGridColumns({
    t,
    colFilterPath,
    setColFilterPath,
    colFilterModule,
    setColFilterModule,
    colFilterIdentifier,
    setColFilterIdentifier,
    colFilterDescription,
    setColFilterDescription,
    actionFilter,
    setActionFilter,
    statusFilter,
    setStatusFilter,
    onSortId,
    onSortCreated,
    onSortAction,
    onSortModule,
    onSortStatus,
    idSortIcon: sortHeaderIcon("id", listSort.columnId, listSort.direction),
    createdSortIcon: sortHeaderIcon("created", listSort.columnId, listSort.direction),
    actionSortIcon: sortHeaderIcon("action", listSort.columnId, listSort.direction),
    moduleSortIcon: sortHeaderIcon("module", listSort.columnId, listSort.direction),
    statusSortIcon: sortHeaderIcon("status", listSort.columnId, listSort.direction),
    onViewRow: handleViewRow,
  });

  const activeRowId = detailRow ? transactionLogRowId(detailRow) : null;

  return (
    <>
      <ServerDrivenTable<TransactionLogRow, TransactionLogsListMeta>
          listState={listState}
          columns={columns}
          scrollRef={scrollRef}
          tableClassName="min-w-[1580px]"
          loadingLabel={t("LOADING", "Loading…")}
          retryLabel={t("RETRY", "Retry")}
          renderThead={() => (
            <thead>
              <EditableDataGridThead columns={columns} />
            </thead>
          )}
          tbody={
            <ServerDrivenListTbody<TransactionLogRow>
              colSpan={columns.length}
              rows={rows}
              columns={columns}
              getRowId={transactionLogRowId}
              activeRowId={activeRowId}
              editingRowId=""
              emptyMessage={t("TRANSACTION_LOGS_EMPTY", "No transaction logs found.")}
              showLoadingRow={false}
              showEmptyRow={!loading && rows.length === 0}
              showDataRows={!loading}
              getRowClassName={(row) =>
                detailRow && transactionLogRowId(row) === transactionLogRowId(detailRow)
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
            countNoun: t("TRANSACTION_LOGS", "Transaction Logs"),
            labels: { t },
          }}
        />

      <TransactionLogDetailModal
        open={detailOpen}
        row={detailRow}
        onClose={closeDetail}
        t={t}
      />
    </>
  );
}
