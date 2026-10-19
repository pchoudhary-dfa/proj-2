"use client";

import { PageToolbar } from "@/components/PageToolbar";
import {
  DEFAULT_TABLE_PAGE_SIZES,
  TablePaginationFooter,
} from "@/components/TablePaginationFooter";
import {
  InlineEditableTable,
  InlineEditableTHead,
  InlineEditableTBody,
} from "@/components/TableView";
import { useDatawarehouseGridColumns } from "@/components/datawarehouse/datawarehouseGridColumns";
import { useAppConfig } from "@/contexts/AppConfigContext";
import { useCore } from "@/contexts/CoreContext";
import {
  fetchDatawarehouseList,
  type DatawarehouseListRow,
} from "@/lib/datawarehouse/datawarehouse";
import { useClientGridState } from "@/hooks/useClientGridState";
import { useCallback, useEffect, useState } from "react";

function datawarehouseRowId(row: DatawarehouseListRow): string {
  return row.id;
}

const SORT_COLUMNS = [
  { columnId: "name", sortValue: (row: DatawarehouseListRow) => row.name },
  { columnId: "type", sortValue: (row: DatawarehouseListRow) => row.type },
  { columnId: "database", sortValue: (row: DatawarehouseListRow) => row.database },
  { columnId: "defaultLanguage", sortValue: (row: DatawarehouseListRow) => row.defaultLanguage },
  { columnId: "isActive", sortable: false as const },
];

const FILTER_COLUMNS = [
  { columnId: "name", filterValue: (row: DatawarehouseListRow) => row.name },
  { columnId: "type", filterValue: (row: DatawarehouseListRow) => row.type },
  { columnId: "database", filterValue: (row: DatawarehouseListRow) => row.database },
  { columnId: "defaultLanguage", filterValue: (row: DatawarehouseListRow) => row.defaultLanguage },
  { columnId: "isActive", filterable: false as const },
];

function DatawarehouseShell() {
  const { isLoading: configLoading, error: configError } = useAppConfig();
  const { t } = useCore();
  const [rows, setRows] = useState<DatawarehouseListRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    const result = await fetchDatawarehouseList({ limit: 10, active_only: false });
    if (result.error) {
      setError(result.error);
    } else {
      setRows(result.rows);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!configLoading && !configError) {
      loadData();
    }
  }, [configLoading, configError, loadData]);

  const gridState = useClientGridState({
    rows,
    sortColumns: SORT_COLUMNS,
    filterColumns: FILTER_COLUMNS,
    rowId: datawarehouseRowId,
  });

  const columns = useDatawarehouseGridColumns({
    sortIconFor: gridState.sortIconFor,
    cycleSort: gridState.cycleSort,
    getColumnFilter: gridState.getColumnFilter,
    setColumnFilter: gridState.setColumnFilter,
  });

  if (configLoading) {
    return (
      <div className="app-body flex items-center justify-center">
        <div className="loader">
          <div className="loader__logo">
            <span className="text-lg font-bold text-on-primary">A</span>
          </div>
          <p className="loader__status-text">Loading project configuration...</p>
        </div>
      </div>
    );
  }

  if (configError) {
    return (
      <div className="app-body flex items-center justify-center p-lg">
        <p className="modal-error text-center text-sm">{configError}</p>
      </div>
    );
  }

  const thead = <InlineEditableTHead columns={columns} />;

  const tbody = (
    <InlineEditableTBody
      columns={columns}
      rows={gridState.paginatedRows}
      rowId={datawarehouseRowId}
      loading={loading}
      emptyMessage="No datawarehouse connections found."
    />
  );

  return (
    <div className="app-body flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="flex min-h-0 flex-1">
        <main className="sys-config bg-surface-muted font-body">
          <PageToolbar
            title={t("LABEL_DATAWAREHOUSE", "Datawarehouse")}
            icon="storage"
            onInfoClick={() => {}}
          />

          {error && (
            <div className="mx-5 mt-2 rounded border border-warning-border bg-warning-soft px-3 py-2 text-xs text-warning-text">
              <span className="material-icons mr-1 align-middle !text-sm">warning</span>
              Could not load datawarehouses from server. Showing cached data.
            </div>
          )}

          <div className="flex min-h-0 flex-1 min-w-0 flex-col">
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-md">
              <div className="h-full min-h-0 flex-1">
                <InlineEditableTable
                  wrapClassName="tbl-wrap tbl-wrap--compact-th h-full min-h-0"
                  tableClassName="min-w-[900px]"
                  tableAriaLabel="Datawarehouse connections"
                  loading={loading}
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
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}

export default function DatawarehousePage() {
  return <DatawarehouseShell />;
}
