"use client";

import { SearchInputBar } from "@/components/SearchInputBar";
import type { EditableGridColumnDef, GridSortIcon } from "@/components/TableView";
import { useCore } from "@/contexts/CoreContext";
import type { DatawarehouseListRow } from "@/lib/datawarehouse/datawarehouse";

type DatawarehouseGridColumnsProps = {
  sortIconFor: (columnId: string) => GridSortIcon;
  cycleSort: (columnId: string) => void;
  getColumnFilter: (columnId: string) => string;
  setColumnFilter: (columnId: string, value: string) => void;
};

export function useDatawarehouseGridColumns({
  sortIconFor,
  cycleSort,
  getColumnFilter,
  setColumnFilter,
}: DatawarehouseGridColumnsProps): EditableGridColumnDef[] {
  const { t } = useCore();

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
      id: "name",
      className: "bg-surface-muted th-search-cell min-w-[220px] align-top",
      header: sortHeader("name", t("LABEL_DW_NAME", "Connection Name")),
      filterCell: filterCell("name"),
      cell: (row: DatawarehouseListRow) => (
        <span className="cell-name">{row.name}</span>
      ),
    },
    {
      id: "type",
      className: "bg-surface-muted th-search-cell min-w-[140px] align-top",
      header: sortHeader("type", t("LABEL_DW_TYPE", "Source Type")),
      filterCell: filterCell("type"),
      cell: (row: DatawarehouseListRow) => (
        <span className="cell-name">{row.type}</span>
      ),
    },
    {
      id: "database",
      className: "bg-surface-muted th-search-cell min-w-[200px] align-top",
      header: sortHeader("database", t("LABEL_DW_DATABASE", "Database")),
      filterCell: filterCell("database"),
      cell: (row: DatawarehouseListRow) => (
        <span className="cell-name font-mono text-xs">{row.database}</span>
      ),
    },
    {
      id: "defaultLanguage",
      className: "bg-surface-muted th-search-cell min-w-[120px] align-top",
      header: { kind: "label" as const, text: t("LABEL_DW_LANGUAGE", "Language") },
      filterCell: filterCell("defaultLanguage"),
      cell: (row: DatawarehouseListRow) => (
        <span className="cell-name">{row.defaultLanguage}</span>
      ),
    },
    {
      id: "isActive",
      className: "bg-surface-muted th-search-cell w-20 min-w-[5rem] align-top",
      cellClassName: "text-center",
      header: { kind: "label" as const, text: t("LABEL_DW_ACTIVE", "Active") },
      cell: (row: DatawarehouseListRow) =>
        row.isActive ? (
          <span
            className="material-icons text-success !text-base leading-none"
            aria-label="Active"
            title="Active"
          >
            check_circle
          </span>
        ) : (
          <span
            className="material-icons text-text-muted !text-base leading-none"
            aria-label="Inactive"
            title="Inactive"
          >
            cancel
          </span>
        ),
    },
  ];
}
