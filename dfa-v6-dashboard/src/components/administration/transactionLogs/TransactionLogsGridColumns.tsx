"use client";

import { SearchInputBar } from "@/components/SearchInputBar";
import type { EditableGridColumnDef, GridSortIcon } from "@/components/TableView";
import type { TransactionLogRow } from "@/lib/transactionLogs/mockData";

function displayCell(value: string) {
  return value.trim() ? value : "-";
}

type TransactionLogsGridColumnsProps = {
  sortIconFor: (columnId: string) => GridSortIcon;
  cycleSort: (columnId: string) => void;
  getColumnFilter: (columnId: string) => string;
  setColumnFilter: (columnId: string, value: string) => void;
};

export function useTransactionLogsGridColumns({
  sortIconFor,
  cycleSort,
  getColumnFilter,
  setColumnFilter,
}: TransactionLogsGridColumnsProps): EditableGridColumnDef[] {
  const sortHeader = (columnId: string, text: string) => ({
    kind: "sort" as const,
    text,
    sortIcon: sortIconFor(columnId),
    sortAriaLabel: `Sort by ${text}`,
    onSort: () => cycleSort(columnId),
  });

  const filterCell = (columnId: string) => (
    <SearchInputBar
      embedded
      size="xs"
      placeholder="Search..."
      value={getColumnFilter(columnId)}
      onChange={(e) => setColumnFilter(columnId, e.target.value)}
    />
  );

  return [
    {
      id: "logId",
      className: "bg-surface-muted th-search-cell w-16 align-top",
      cellClassName: "text-text",
      header: sortHeader("logId", "Id"),
      filterCell: filterCell("logId"),
      cell: (row: TransactionLogRow) => row.logId,
    },
    {
      id: "eventType",
      className: "bg-surface-muted th-search-cell min-w-[140px] align-top",
      cellClassName: "text-text",
      header: sortHeader("eventType", "Event Type"),
      filterCell: filterCell("eventType"),
      cell: (row: TransactionLogRow) => row.eventType,
    },
    {
      id: "userName",
      className: "bg-surface-muted th-search-cell min-w-[100px] align-top",
      cellClassName: "text-text",
      header: sortHeader("userName", "User Name"),
      filterCell: filterCell("userName"),
      cell: (row: TransactionLogRow) => row.userName,
    },
    {
      id: "dashboardName",
      className: "bg-surface-muted th-search-cell min-w-[160px] align-top",
      cellClassName: "text-text",
      header: sortHeader("dashboardName", "Dashboard Name"),
      filterCell: filterCell("dashboardName"),
      cell: (row: TransactionLogRow) => displayCell(row.dashboardName),
    },
    {
      id: "visualizationName",
      className: "bg-surface-muted th-search-cell min-w-[140px] align-top",
      cellClassName: "text-text",
      header: sortHeader("visualizationName", "Visualization Name"),
      filterCell: filterCell("visualizationName"),
      cell: (row: TransactionLogRow) => displayCell(row.visualizationName),
    },
    {
      id: "datawarehouseName",
      className: "bg-surface-muted th-search-cell min-w-[160px] align-top",
      cellClassName: "text-text",
      header: sortHeader("datawarehouseName", "Datawarehouse Name"),
      filterCell: filterCell("datawarehouseName"),
      cell: (row: TransactionLogRow) => displayCell(row.datawarehouseName),
    },
    {
      id: "created",
      className: "bg-surface-muted th-search-cell min-w-[180px] align-top",
      cellClassName: "text-text-muted",
      header: sortHeader("created", "Created"),
      filterCell: filterCell("created"),
      cell: (row: TransactionLogRow) => row.created,
    },
  ];
}
