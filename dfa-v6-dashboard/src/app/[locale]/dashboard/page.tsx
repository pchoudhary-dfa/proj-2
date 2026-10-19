"use client";

import DashboardDrawer from "@/components/dashboard/DashboardDrawer";
import { PageToolbar } from "@/components/PageToolbar";
import {
  MOCK_DASHBOARD_ROWS,
  useDashboardsGridColumns,
} from "@/components/dashboard/dashboardsGridColumns";
import type { DashboardRowMenuAction } from "@/components/TableRowActionsMenu";
import {
  DEFAULT_TABLE_PAGE_SIZES,
  TablePaginationFooter,
} from "@/components/TablePaginationFooter";
import {
  InlineEditableTable,
  InlineEditableTHead,
  InlineEditableTBody,
} from "@/components/TableView";
import { useAppConfig } from "@/contexts/AppConfigContext";
import { getStoredAuthUser } from "@/lib/auth/user";
import {
  DatawarehouseOption,
  EMPTY_DASHBOARD_FORM,
  formValuesToRow,
  rowToFormValues,
  type DashboardFormValues,
  type DashboardListRow,
} from "@/lib/dashboards/types";
import { useClientGridState } from "@/hooks/useClientGridState";
import { useCallback, useEffect, useMemo, useState } from "react";
import { DatawarehouseListRow, fetchDatawarehouseList } from "@/lib/datawarehouse/datawarehouse";
import { useCore } from "@/contexts/CoreContext";
import { toast } from "sonner";

type DrawerMode = "create" | "edit";

function getMissingFields(values: DashboardFormValues): string[] {
  const missing: string[] = [];
  if (!values.dashboardName.trim()) missing.push("Dashboard Name");
  if (!values.mapUrl.trim()) missing.push("Map URL");
  if (!values.dashboardUrl.trim()) missing.push("Dashboard URL");
  if (!values.resolution.trim()) missing.push("Resolution");
  if (!values.datawarehouseId) missing.push("Datawarehouse Connection");
  return missing;
}

function dashboardRowId(row: DashboardListRow): string {
  return row.id;
}

const SORT_COLUMNS = [
  { columnId: "title", sortValue: (row: DashboardListRow) => row.title },
  { columnId: "datawarehouse", sortValue: (row: DashboardListRow) => row.datawarehouse },
  { columnId: "publishUrl", sortable: false as const },
  { columnId: "role", sortValue: (row: DashboardListRow) => row.role },
  { columnId: "modifiedDate", sortValue: (row: DashboardListRow) => `${row.modifiedDate} ${row.modifiedTime}` },
];

const FILTER_COLUMNS = [
  { columnId: "title", filterValue: (row: DashboardListRow) => `${row.title} (${row.numericId})` },
  { columnId: "datawarehouse", filterValue: (row: DashboardListRow) => `${row.datawarehouse} [${row.languages.join(",")}]` },
  { columnId: "publishUrl", filterValue: (row: DashboardListRow) => row.publishUrl },
  { columnId: "role" },
  { columnId: "modifiedDate", filterValue: (row: DashboardListRow) => `${row.modifiedDate} ${row.modifiedTime}` },
];

function DashboardShell() {
  const {t} = useCore();
  const { isLoading: configLoading, error: configError } = useAppConfig();
  const [rows, setRows] = useState<DashboardListRow[]>(MOCK_DASHBOARD_ROWS);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerMode, setDrawerMode] = useState<DrawerMode>("create");
  const [editingRowId, setEditingRowId] = useState<string | null>(null);
  const [drawerInitialValues, setDrawerInitialValues] =
    useState<DashboardFormValues>(EMPTY_DASHBOARD_FORM);
  const [saving, setSaving] = useState(false);
  const [activeActionRowId, setActiveActionRowId] = useState<string | null>(null);
  const [userLabel] = useState<string>(() => {
    const user = getStoredAuthUser();
    if (user?.username) return user.username;
    if (user?.email) return user.email;
    return "";
  });

  const [error, setError] = useState<string | null>(null);
  const [datawarehouseOptions,setDatawarehouseOptions] = useState<DatawarehouseOption[]>([]);

  const loadData = useCallback(async () => {
    setError(null);
    const result = await fetchDatawarehouseList({ limit: 10, active_only: true });
    if (result.error) {
      setError(result.error);
    } else {
      setDatawarehouseOptions(result.rows.map((dw) => ({ value: dw.id, label: dw.name })));
    }
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
    rowId: dashboardRowId,
  });

  const editingRow = useMemo(
    () => rows.find((row) => row.id === editingRowId) ?? null,
    [rows, editingRowId],
  );

  const closeDrawer = useCallback(() => {
    setDrawerOpen(false);
    setEditingRowId(null);
  }, []);

  const openCreateDrawer = useCallback(() => {
    setDrawerMode("create");
    setEditingRowId(null);
    setDrawerInitialValues({ ...EMPTY_DASHBOARD_FORM });
    setDrawerOpen(true);
  }, []);

  const openEditDrawer = useCallback(
    (rowId: string) => {
      const row = rows.find((r) => r.id === rowId);
      if (!row) return;
      setDrawerMode("edit");
      setEditingRowId(rowId);
      setDrawerInitialValues(rowToFormValues(row));
      setDrawerOpen(true);
    },
    [rows],
  );

  const handleDelete = useCallback((rowId: string) => {
    const row = rows.find((r) => r.id === rowId);
    if (!row) return;
    const confirmed = window.confirm(
      `Delete dashboard "${row.title}"? This cannot be undone.`,
    );
    if (!confirmed) return;
    setRows((prev) => prev.filter((r) => r.id !== rowId));
  }, [rows]);

  const handleOpenDashboard = useCallback(
    (rowId: string) => {
      const row = rows.find((r) => r.id === rowId);
      if (!row?.publishUrl) return;
      window.open(row.publishUrl, "_blank", "noopener,noreferrer");
    },
    [rows],
  );

  const handleUnpublish = useCallback((rowId: string) => {
    const row = rows.find((r) => r.id === rowId);
    if (!row) return;
    const confirmed = window.confirm(
      `Unpublish dashboard "${row.title}"? This cannot be undone.`,
    );
    if (!confirmed) return;
    setRows((prev) => prev.filter((r) => r.id !== rowId));
  }, [rows]);

  const handleCreateCopy = useCallback((rowId: string) => {
    const row = rows.find((r) => r.id === rowId);
    if (!row) return;
    const confirmed = window.confirm(
      `Create copy of dashboard "${row.title}"?`,
    );
    if (!confirmed) return;
    setRows((prev) => [...prev, row]);
  }, [rows]);

  const getRowActions = useCallback(
    (row: DashboardListRow): DashboardRowMenuAction[] => [
      {
        id: "preview",
        label: "Preview",
        icon: "visibility",
        onClick: () => handleOpenDashboard(row.id),
      },
      {
        id: "modify",
        label: "Modify",
        icon: "edit_square",
        onClick: (id) => openEditDrawer(id),
      },
      {
        id: "delete",
        label: "Delete",
        icon: "delete",
        danger: true,
        onClick: (id) => handleDelete(id),
      },
      {
        id: "unpublish",
        label: "Unpublish",
        icon: "visibility_off",
        danger: true,
        onClick: (id) => handleUnpublish(id),
      },
      {
        id: "create_copy",
        label: "Create Copy",
        icon: "file_copy",
        danger: true,
        onClick: (id) => handleCreateCopy(id),
      },
    ],
    [handleDelete, handleOpenDashboard, openEditDrawer, handleUnpublish, handleCreateCopy],
  );

  const resolveDatawarehouseLabel = useCallback((id: string) => {
    return (
      datawarehouseOptions.find((dw) => dw.value === id)?.label ?? id
    );
  }, [datawarehouseOptions]);

  const handleSaveDrawer = useCallback(
    async (values: DashboardFormValues) => {
      const missing = getMissingFields(values);
      if (missing.length > 0) {
        toast.error(
          t("FILL_REQUIRED_FIELDS_DATAWAREHOUSE").replace("{fields}", missing.join(", "))
        );        
        return;
      }

      setSaving(true);
      try {
        const dwLabel = resolveDatawarehouseLabel(values.datawarehouseId);
        if (drawerMode === "edit" && editingRow) {
          const updated = formValuesToRow(values, editingRow, dwLabel);
          setRows((prev) =>
            prev.map((r) => (r.id === editingRow.id ? updated : r)),
          );
        } else {
          const created = formValuesToRow(values, null, dwLabel);
          setRows((prev) => [created, ...prev]);
        }
        closeDrawer();
      } finally {
        setSaving(false);
      }
    },
    [closeDrawer, drawerMode, editingRow, resolveDatawarehouseLabel],
  );

  const columns = useDashboardsGridColumns({
    sortIconFor: gridState.sortIconFor,
    cycleSort: gridState.cycleSort,
    getColumnFilter: gridState.getColumnFilter,
    setColumnFilter: gridState.setColumnFilter,
    getRowActions,
    activeActionRowId,
    setActiveActionRowId,
  });

  const rowClassName = useCallback(
    (row: DashboardListRow) =>
      activeActionRowId === row.id ? "relative z-40" : undefined,
    [activeActionRowId],
  );

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

  if (error) {
    return (
      <div className="app-body flex items-center justify-center p-lg">
        <p className="modal-error text-center text-sm">{error}</p>
      </div>
    );
  }

  const thead = <InlineEditableTHead columns={columns} />;

  const tbody = (
    <InlineEditableTBody
      columns={columns}
      rows={gridState.paginatedRows}
      rowId={dashboardRowId}
      rowClassName={rowClassName}
      emptyMessage="No records found."
    />
  );

  return (
    <div className="app-body flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="flex min-h-0 flex-1">
        <main className="sys-config bg-surface-muted font-body">
          <PageToolbar
            title="Dashboards"
            icon="dashboard"
            onAddClick={openCreateDrawer}
            trailingMeta={
              <div className="flex shrink-0 flex-col items-end gap-0.5 text-xs text-text-muted sm:flex-row sm:items-center border border-border rounded-lg px-1.5 py-1 font-semibold">
                <span className="inline-flex items-center gap-1">
                  <span className="material-icons !text-sm leading-none" aria-hidden>
                    sync
                  </span>
                  Refreshes every 24h - Last:
                </span>
                <span className="text-text">14 Apr, 2026</span>
              </div>
            }
          />

          <div className="flex min-h-0 flex-1 min-w-0 flex-col">
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-md">
              <div className="h-full min-h-0 flex-1">
                <InlineEditableTable
                  wrapClassName="tbl-wrap tbl-wrap--compact-th h-full min-h-0"
                  tableClassName="min-w-[980px]"
                  tableAriaLabel="Dashboards"
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

      <DashboardDrawer
        open={drawerOpen}
        mode={drawerMode}
        initialValues={drawerInitialValues}
        datawarehouseOptions={datawarehouseOptions}
        saving={saving}
        onClose={closeDrawer}
        onSave={handleSaveDrawer}
      />
    </div>
  );
}

export default function DashboardPage() {
  return <DashboardShell />;
}
