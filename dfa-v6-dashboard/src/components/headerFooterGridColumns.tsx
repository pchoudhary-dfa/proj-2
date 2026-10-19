"use client";

import { SearchInputBar } from "@/components/SearchInputBar";
import TableRowActionsMenu, {
  type DashboardRowMenuAction,
} from "@/components/TableRowActionsMenu";
import type { EditableGridColumnDef, GridSortIcon } from "@/components/TableView";
import { DEFAULT_FOOTER_CONFIG, DEFAULT_HEADER_CONFIG } from "@/lib/headerFooter/defaults";
import { generateHeaderFooterHtml } from "@/lib/headerFooter/generateHtml";
import type { HeaderFooterListRow } from "@/lib/headerFooter/types";
import { useCore } from "@/contexts/CoreContext";

function mockRow(
  id: string,
  theme: string,
  createdOn: string,
  modifiedOn: string,
): HeaderFooterListRow {
  const header = {
    ...DEFAULT_HEADER_CONFIG,
    title1Part1: {
      ...DEFAULT_HEADER_CONFIG.title1Part1,
      text: theme,
    },
  };
  const footer = { ...DEFAULT_FOOTER_CONFIG };
  const { headerHTML, footerHTML } = generateHeaderFooterHtml(header, footer);
  return {
    id,
    theme,
    createdOn,
    modifiedOn,
    header,
    footer,
    headerHTML,
    footerHTML,
  };
}

export const MOCK_HEADER_FOOTER_ROWS: HeaderFooterListRow[] = [
  mockRow("1", "SDG Dashboard - Training", "Jul 12, 2024, 4:14:00 PM", "Jul 12, 2024, 4:14:00 PM"),
  mockRow("2", "Socio Economic", "Jun 3, 2024, 11:22:15 AM", "Aug 19, 2024, 9:05:42 AM"),
  mockRow("3", "DFA Quality Education", "May 20, 2024, 2:30:00 PM", "May 20, 2024, 2:30:00 PM"),
  mockRow("4", "Health Indicators", "Apr 8, 2024, 10:00:00 AM", "Sep 1, 2024, 3:45:12 PM"),
  mockRow("5", "Climate Action", "Mar 15, 2024, 8:15:30 AM", "Mar 15, 2024, 8:15:30 AM"),
  mockRow("6", "Gender Equality", "Feb 2, 2024, 1:00:00 PM", "Jul 4, 2024, 4:20:00 PM"),
  mockRow("7", "Clean Water", "Jan 10, 2024, 9:30:00 AM", "Jan 10, 2024, 9:30:00 AM"),
  mockRow("8", "Affordable Energy", "Dec 5, 2023, 5:45:00 PM", "Jun 18, 2024, 11:10:00 AM"),
  mockRow("9", "Industry Innovation", "Nov 22, 2023, 12:00:00 PM", "Nov 22, 2023, 12:00:00 PM"),
];

type HeaderFooterGridColumnsProps = {
  sortIconFor: (columnId: string) => GridSortIcon;
  cycleSort: (columnId: string) => void;
  getColumnFilter: (columnId: string) => string;
  setColumnFilter: (columnId: string, value: string) => void;
  getRowActions?: (row: HeaderFooterListRow) => DashboardRowMenuAction[];
  activeActionRowId: string | null;
  setActiveActionRowId: (updater: (prev: string | null) => string | null) => void;
};

export function useHeaderFooterGridColumns({
  sortIconFor,
  cycleSort,
  getColumnFilter,
  setColumnFilter,
  getRowActions,
  activeActionRowId,
  setActiveActionRowId,
}: HeaderFooterGridColumnsProps): EditableGridColumnDef[] {
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
      id: "theme",
      className: "bg-surface-muted th-search-cell w-[50%] min-w-[50%] align-top",
      header: sortHeader("theme", t("IC_TYPE_TH")),
      filterCell: filterCell("theme"),
      cell: (row: HeaderFooterListRow) => (
        <span className="cell-name font-semibold text-text">{row.theme}</span>
      ),
    },
    {
      id: "createdOn",
      className: "bg-surface-muted th-search-cell w-[20%] min-w-[20%] align-top",
      header: sortHeader("createdOn", t("CREATED_ON")),
      filterCell: filterCell("createdOn"),
      cell: (row: HeaderFooterListRow) => (
        <span className="cell-name">{row.createdOn}</span>
      ),
    },
    {
      id: "modifiedOn",
      className: "bg-surface-muted th-search-cell w-[30%] min-w-[30%] align-top",
      header: sortHeader("modifiedOn", t("MODIFIED_ON")),
      filterCell: filterCell("modifiedOn"),
      cell: (row: HeaderFooterListRow) => {
        const content = <span className="cell-name">{row.modifiedOn}</span>;
        if (!getRowActions) return content;
        return (
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0 flex-1">{content}</div>
            <TableRowActionsMenu
              rowId={row.id}
              isMenuOpen={activeActionRowId === row.id}
              onToggleMenu={(id) =>
                setActiveActionRowId((prev) => (prev === id ? null : id))
              }
              onCloseMenu={() => setActiveActionRowId(() => null)}
              actions={getRowActions(row)}
            />
          </div>
        );
      },
    },
  ];
}
