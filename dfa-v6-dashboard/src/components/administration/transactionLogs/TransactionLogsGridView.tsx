"use client";

import {
  DEFAULT_TABLE_PAGE_SIZES,
  TablePaginationFooter,
} from "@/components/TablePaginationFooter";
import {
  InlineEditableTable,
  InlineEditableTHead,
  InlineEditableTBody,
} from "@/components/TableView";
import type { TransactionLogRow } from "@/lib/transactionLogs/mockData";
import { useClientGridState } from "@/hooks/useClientGridState";
import { useTransactionLogsGridColumns } from "./TransactionLogsGridColumns";

const SORT_COLUMNS = [
  { columnId: "logId" },
  { columnId: "eventType" },
  { columnId: "userName" },
  { columnId: "dashboardName" },
  { columnId: "visualizationName" },
  { columnId: "datawarehouseName" },
  { columnId: "created" },
];

const FILTER_COLUMNS = [
  { columnId: "logId" },
  { columnId: "eventType" },
  { columnId: "userName" },
  { columnId: "dashboardName" },
  { columnId: "visualizationName" },
  { columnId: "datawarehouseName" },
  { columnId: "created" },
];

function transactionLogRowId(row: TransactionLogRow): string {
  return row.id;
}

export type TransactionLogsGridViewProps = {
  rows: TransactionLogRow[];
  loading?: boolean;
  emptyMessage?: string;
};

export default function TransactionLogsGridView({
  rows,
  loading = false,
  emptyMessage = "No transaction logs found.",
}: TransactionLogsGridViewProps) {
  const gridState = useClientGridState({
    rows,
    sortColumns: SORT_COLUMNS,
    filterColumns: FILTER_COLUMNS,
    rowId: transactionLogRowId,
  });

  const columns = useTransactionLogsGridColumns({
    sortIconFor: gridState.sortIconFor,
    cycleSort: gridState.cycleSort,
    getColumnFilter: gridState.getColumnFilter,
    setColumnFilter: gridState.setColumnFilter,
  });

  const thead = <InlineEditableTHead columns={columns} />;

  const tbody = (
    <InlineEditableTBody
      columns={columns}
      rows={gridState.paginatedRows}
      rowId={transactionLogRowId}
      loading={loading}
      emptyMessage={emptyMessage}
    />
  );

  return (
    <InlineEditableTable
      wrapClassName="tbl-wrap h-full min-h-0"
      tableClassName="min-w-[1100px]"
      loading={loading}
      tableAriaLabel="Transaction logs"
      thead={thead}
      tbody={tbody}
      footer={
        <TablePaginationFooter
          page={gridState.page}
          totalPages={gridState.totalPages}
          totalCount={gridState.totalRecords}
          pageSize={gridState.pageSize}
          onPageChange={gridState.setPage}
          onPageSizeChange={gridState.setPageSize}
          pageSizes={[...DEFAULT_TABLE_PAGE_SIZES]}
          countNoun="records"
          pageSummaryClassName="mx-1 min-w-[90px] text-center"
        />
      }
    />
  );
}
