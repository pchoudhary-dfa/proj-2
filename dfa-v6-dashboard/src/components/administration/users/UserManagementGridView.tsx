"use client";

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
import type { UserRow } from "@/lib/users/users";
import { useCallback, useState } from "react";
import { useClientGridState } from "@/hooks/useClientGridState";
import { useUserManagementGridColumns } from "./UserManagementGridColumns";

const SORT_COLUMNS = [
  { columnId: "username" },
  { columnId: "firstName" },
  { columnId: "lastName" },
  { columnId: "email" },
  { columnId: "lastLogin" },
];

const FILTER_COLUMNS = [
  { columnId: "username" },
  { columnId: "firstName" },
  { columnId: "lastName" },
  { columnId: "email" },
  { columnId: "lastLogin", filterable: false as const },
];

function userRowId(row: UserRow): string {
  return row.id;
}

export type UserManagementGridViewProps = {
  rows: UserRow[];
  selectedIds: Set<string>;
  onSelectedIdsChange: (ids: Set<string>) => void;
  getRowActions: (row: UserRow) => DashboardRowMenuAction[];
  loading?: boolean;
  emptyMessage?: string;
};

export default function UserManagementGridView({
  rows,
  selectedIds,
  onSelectedIdsChange,
  getRowActions,
  loading = false,
  emptyMessage = "No users found.",
}: UserManagementGridViewProps) {
  const [activeActionRowId, setActiveActionRowId] = useState<string | null>(null);

  const gridState = useClientGridState({
    rows,
    sortColumns: SORT_COLUMNS,
    filterColumns: FILTER_COLUMNS,
    rowId: userRowId,
  });

  const pageRowIds = gridState.paginatedRows.map((row) => row.id);
  const allPageSelected =
    pageRowIds.length > 0 && pageRowIds.every((id) => selectedIds.has(id));
  const somePageSelected =
    pageRowIds.some((id) => selectedIds.has(id)) && !allPageSelected;

  const toggleSelectAllOnPage = useCallback(() => {
    const next = new Set(selectedIds);
    if (allPageSelected) {
      pageRowIds.forEach((id) => next.delete(id));
    } else {
      pageRowIds.forEach((id) => next.add(id));
    }
    onSelectedIdsChange(next);
  }, [selectedIds, allPageSelected, pageRowIds, onSelectedIdsChange]);

  const toggleRowSelected = useCallback(
    (rowId: string) => {
      const next = new Set(selectedIds);
      if (next.has(rowId)) next.delete(rowId);
      else next.add(rowId);
      onSelectedIdsChange(next);
    },
    [selectedIds, onSelectedIdsChange],
  );

  const columns = useUserManagementGridColumns({
    sortIconFor: gridState.sortIconFor,
    cycleSort: gridState.cycleSort,
    getColumnFilter: gridState.getColumnFilter,
    setColumnFilter: gridState.setColumnFilter,
    allPageSelected,
    somePageSelected,
    toggleSelectAllOnPage,
    selectedIds,
    toggleRowSelected,
    activeActionRowId,
    setActiveActionRowId,
    getRowActions,
  });

  const rowClassName = useCallback(
    (row: UserRow) => {
      const parts: string[] = [];
      if (selectedIds.has(row.id)) parts.push("selected");
      if (activeActionRowId === row.id) parts.push("relative z-40");
      return parts.length > 0 ? parts.join(" ") : undefined;
    },
    [selectedIds, activeActionRowId],
  );

  const thead = <InlineEditableTHead columns={columns} />;

  const tbody = (
    <InlineEditableTBody
      columns={columns}
      rows={gridState.paginatedRows}
      rowId={userRowId}
      rowClassName={rowClassName}
      loading={loading}
      emptyMessage={emptyMessage}
    />
  );

  return (
    <InlineEditableTable
      wrapClassName="tbl-wrap tbl-wrap--compact-th h-full min-h-0"
      tableClassName="min-w-[900px] tv-grid-cols-sticky-ends"
      loading={loading}
      tableAriaLabel="User management"
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
