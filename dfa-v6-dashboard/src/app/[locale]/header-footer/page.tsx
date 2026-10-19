"use client";

import { PageToolbar } from "@/components/PageToolbar";
import HeaderFooterDrawer from "@/components/headerFooter/HeaderFooterDrawer";
import {
  MOCK_HEADER_FOOTER_ROWS,
  useHeaderFooterGridColumns,
} from "@/components/headerFooterGridColumns";
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
import { clearStoredAuthUser, getStoredAuthUser } from "@/lib/auth/user";
import {
  duplicateRow,
  EMPTY_HEADER_FOOTER_FORM,
  formValuesToRow,
  rowToFormValues,
  type HeaderFooterFormValues,
  type HeaderFooterListRow,
} from "@/lib/headerFooter/types";
import { useClientGridState } from "@/hooks/useClientGridState";
import { useRouter } from "next/navigation";
import { useCallback, useMemo, useState } from "react";

type DrawerMode = "create" | "edit";

function headerFooterRowId(row: HeaderFooterListRow): string {
  return row.id;
}

const SORT_COLUMNS = [
  { columnId: "theme", sortValue: (row: HeaderFooterListRow) => row.theme },
  { columnId: "createdOn", sortValue: (row: HeaderFooterListRow) => row.createdOn },
  { columnId: "modifiedOn", sortValue: (row: HeaderFooterListRow) => row.modifiedOn },
];

const FILTER_COLUMNS = [
  { columnId: "theme", filterValue: (row: HeaderFooterListRow) => row.theme },
  { columnId: "createdOn", filterValue: (row: HeaderFooterListRow) => row.createdOn },
  { columnId: "modifiedOn", filterValue: (row: HeaderFooterListRow) => row.modifiedOn },
];

function HeaderFooterShell() {
  const router = useRouter();
  const { isLoading, error } = useAppConfig();
  const [rows, setRows] = useState<HeaderFooterListRow[]>(MOCK_HEADER_FOOTER_ROWS);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerMode, setDrawerMode] = useState<DrawerMode>("create");
  const [editingRowId, setEditingRowId] = useState<string | null>(null);
  const [drawerInitialValues, setDrawerInitialValues] =
    useState<HeaderFooterFormValues>(EMPTY_HEADER_FOOTER_FORM);
  const [saving, setSaving] = useState(false);
  const [activeActionRowId, setActiveActionRowId] = useState<string | null>(null);
  const [userLabel] = useState<string>(() => {
    const user = getStoredAuthUser();
    if (user?.username) return user.username;
    if (user?.email) return user.email;
    return "";
  });

  const gridState = useClientGridState({
    rows,
    sortColumns: SORT_COLUMNS,
    filterColumns: FILTER_COLUMNS,
    rowId: headerFooterRowId,
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
    setDrawerInitialValues({ ...EMPTY_HEADER_FOOTER_FORM });
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

  const handleDelete = useCallback(
    (rowId: string) => {
      const row = rows.find((r) => r.id === rowId);
      if (!row) return;
      const confirmed = window.confirm(
        `Delete theme "${row.theme}"? This cannot be undone.`,
      );
      if (!confirmed) return;
      setRows((prev) => prev.filter((r) => r.id !== rowId));
    },
    [rows],
  );

  const handleDuplicate = useCallback(
    (rowId: string) => {
      const row = rows.find((r) => r.id === rowId);
      if (!row) return;
      setRows((prev) => [duplicateRow(row), ...prev]);
    },
    [rows],
  );

  const getRowActions = useCallback(
    (row: HeaderFooterListRow): DashboardRowMenuAction[] => [
      {
        id: "edit",
        label: "Edit",
        icon: "edit",
        onClick: (id) => openEditDrawer(id),
      },
      {
        id: "duplicate",
        label: "Create Copy",
        icon: "content_copy",
        onClick: (id) => handleDuplicate(id),
      },
      {
        id: "delete",
        label: "Delete",
        icon: "delete",
        danger: true,
        onClick: (id) => handleDelete(id),
      },
    ],
    [handleDelete, handleDuplicate, openEditDrawer],
  );

  const handleSaveDrawer = useCallback(
    async (values: HeaderFooterFormValues) => {
      if (!values.theme.trim()) {
        window.alert("Please enter a theme name.");
        return;
      }

      setSaving(true);
      try {
        if (drawerMode === "edit" && editingRow) {
          const updated = formValuesToRow(values, editingRow);
          setRows((prev) =>
            prev.map((r) => (r.id === editingRow.id ? updated : r)),
          );
        } else {
          setRows((prev) => [formValuesToRow(values, null), ...prev]);
        }
        closeDrawer();
      } finally {
        setSaving(false);
      }
    },
    [closeDrawer, drawerMode, editingRow],
  );

  async function handleSignOut() {
    try {
      await fetch("/api/auth/logout", {
        method: "POST",
        credentials: "include",
      });
    } catch {
      /* ignore */
    }
    clearStoredAuthUser();
    router.push("/");
    router.refresh();
  }

  const columns = useHeaderFooterGridColumns({
    sortIconFor: gridState.sortIconFor,
    cycleSort: gridState.cycleSort,
    getColumnFilter: gridState.getColumnFilter,
    setColumnFilter: gridState.setColumnFilter,
    getRowActions,
    activeActionRowId,
    setActiveActionRowId,
  });

  const rowClassName = useCallback(
    (row: HeaderFooterListRow) =>
      activeActionRowId === row.id ? "relative z-40" : undefined,
    [activeActionRowId],
  );

  if (isLoading) {
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
      rowId={headerFooterRowId}
      rowClassName={rowClassName}
      emptyMessage="No header/footer themes found."
    />
  );

  return (
    <div className="app-body flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="flex min-h-0 flex-1">
        <main className="sys-config bg-surface-muted font-body">
          <PageToolbar
            title="Header and Footer"
            icon="density_large"
            onAddClick={openCreateDrawer}
          />

          <div className="flex min-h-0 flex-1 flex-col overflow-hidden p-0">
            <div className="card mt-0 flex min-h-0 flex-1 flex-col shadow-sm">
              <InlineEditableTable
                wrapClassName="tbl-wrap h-full min-h-0"
                tableClassName="min-w-[720px]"
                tableAriaLabel="Header and Footer themes"
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
        </main>
      </div>

      <HeaderFooterDrawer
        open={drawerOpen}
        mode={drawerMode}
        initialValues={drawerInitialValues}
        saving={saving}
        onClose={closeDrawer}
        onSave={handleSaveDrawer}
      />
    </div>
  );
}

export default function HeaderFooterPage() {
  return <HeaderFooterShell />;
}
