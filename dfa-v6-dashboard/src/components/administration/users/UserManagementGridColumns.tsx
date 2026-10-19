"use client";

import { SearchInputBar } from "@/components/SearchInputBar";
import TableRowActionsMenu, {
  type DashboardRowMenuAction,
} from "@/components/TableRowActionsMenu";
import type { EditableGridColumnDef, GridSortIcon } from "@/components/TableView";
import type { UserRow } from "@/lib/users/users";

type UserManagementGridColumnsProps = {
  sortIconFor: (columnId: string) => GridSortIcon;
  cycleSort: (columnId: string) => void;
  getColumnFilter: (columnId: string) => string;
  setColumnFilter: (columnId: string, value: string) => void;
  allPageSelected: boolean;
  somePageSelected: boolean;
  toggleSelectAllOnPage: () => void;
  selectedIds: Set<string>;
  toggleRowSelected: (rowId: string) => void;
  activeActionRowId: string | null;
  setActiveActionRowId: (updater: (prev: string | null) => string | null) => void;
  getRowActions: (row: UserRow) => DashboardRowMenuAction[];
};

export function useUserManagementGridColumns({
  sortIconFor,
  cycleSort,
  getColumnFilter,
  setColumnFilter,
  allPageSelected,
  somePageSelected,
  toggleSelectAllOnPage,
  selectedIds,
  toggleRowSelected,
  activeActionRowId,
  setActiveActionRowId,
  getRowActions,
}: UserManagementGridColumnsProps): EditableGridColumnDef[] {
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
      id: "checkbox",
      className: "bg-surface-muted th-search-cell w-9 align-top",
      cellClassName: "w-9 text-center",
      header: { kind: "empty" },
      headerContent: (
        <div className="flex items-center justify-center">
          <input
            type="checkbox"
            className="checkbox-comp"
            aria-label="Select all on page"
            checked={allPageSelected}
            ref={(el) => {
              if (el) el.indeterminate = somePageSelected;
            }}
            onChange={toggleSelectAllOnPage}
          />
        </div>
      ),
      cell: (row: UserRow) => (
        <input
          type="checkbox"
          className="checkbox-comp"
          aria-label={`Select ${row.username}`}
          checked={selectedIds.has(row.id)}
          onChange={() => toggleRowSelected(row.id)}
        />
      ),
    },
    {
      id: "username",
      className: "bg-surface-muted th-search-cell min-w-[120px] align-top",
      cellClassName: "text-text",
      header: sortHeader("username", "Username"),
      filterCell: filterCell("username"),
      cell: (row: UserRow) => row.username,
    },
    {
      id: "firstName",
      className: "bg-surface-muted th-search-cell min-w-[120px] align-top",
      cellClassName: "text-text",
      header: sortHeader("firstName", "First Name"),
      filterCell: filterCell("firstName"),
      cell: (row: UserRow) => row.firstName,
    },
    {
      id: "lastName",
      className: "bg-surface-muted th-search-cell min-w-[120px] align-top",
      cellClassName: "text-text",
      header: sortHeader("lastName", "Last Name"),
      filterCell: filterCell("lastName"),
      cell: (row: UserRow) => row.lastName,
    },
    {
      id: "email",
      className: "bg-surface-muted th-search-cell min-w-[180px] align-top",
      cellClassName: "text-text",
      header: sortHeader("email", "Email"),
      filterCell: filterCell("email"),
      cell: (row: UserRow) => row.email,
    },
    {
      id: "lastLogin",
      className: "bg-surface-muted th-search-cell min-w-[160px] align-top",
      cellClassName: "text-text-muted",
      header: sortHeader("lastLogin", "Last Login"),
      cell: (row: UserRow) => row.lastLogin,
    },
    {
      id: "actions",
      className: "bg-surface-muted th-search-cell w-10 align-top",
      header: { kind: "sr-only", text: "Actions" },
      cell: (row: UserRow) => (
        <TableRowActionsMenu
          rowId={row.id}
          isMenuOpen={activeActionRowId === row.id}
          onToggleMenu={(id) =>
            setActiveActionRowId((prev) => (prev === id ? null : id))
          }
          onCloseMenu={() => setActiveActionRowId(() => null)}
          actions={getRowActions(row)}
        />
      ),
    },
  ];
}
