"use client";

import { SearchInputBar } from "@/components/SearchInputBar";
import TableRowActionsMenu, {
  type DashboardRowMenuAction,
} from "@/components/TableRowActionsMenu";
import type { EditableGridColumnDef, GridSortIcon } from "@/components/TableView";
import { useCore } from "@/contexts/CoreContext";
import { buildLocaleAppPath, getLocaleFromPathname } from "@/lib/constants";
import type { DashboardListRow } from "@/lib/dashboards/types";
import Link from "next/link";
import { usePathname } from "next/navigation";

function PublishUrlCell({ url, publishedAt }: { url: string; publishedAt: string }) {
  async function copyUrl() {
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="min-w-0">
      <div className="flex min-w-0 items-center gap-1">
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="min-w-0 truncate text-xs text-primary underline"
        >
          {url}
        </a>
        <button
          type="button"
          onClick={() => void copyUrl()}
          className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded text-text-muted hover:bg-surface-muted hover:text-text"
          aria-label="Copy publish URL"
          title="Copy to clipboard"
        >
          <span className="material-icons !text-sm leading-none">content_copy</span>
        </button>
      </div>
      <p className="mt-0.5 text-[11px] text-text-muted">
        Published date: {publishedAt}
      </p>
    </div>
  );
}

export const MOCK_DASHBOARD_ROWS: DashboardListRow[] = [
  {
    id: "401",
    title: "Climate_change_datastory",
    numericId: 401,
    datawarehouse: "Sample Data warehouse",
    datawarehouseId: "1",
    languages: ["en", "fr", "ar"],
    mapUrl: "https://dfadml.dataforall.org/",
    dashboardUrl: "climate-change-datastory",
    resolution: "Width = 1024px",
    publishUrl: "https://example.com/publish/climate-change",
    publishedAt: "Apr 10, 2026 2:15:00 PM",
    role: "Admin",
    modifiedDate: "May 12, 2026",
    modifiedTime: "10:53:51 AM",
  },
  {
    id: "915",
    title: "enrolment_data",
    numericId: 915,
    datawarehouse: "Sample Data warehouse",
    datawarehouseId: "1",
    languages: ["en", "fr"],
    mapUrl: "https://dfadml.dataforall.org/",
    dashboardUrl: "enrolment-data",
    resolution: "Width = 1024px",
    publishUrl: "https://example.com/publish/enrolment",
    publishedAt: "Apr 11, 2026 9:00:00 AM",
    role: "Admin",
    modifiedDate: "May 10, 2026",
    modifiedTime: "3:22:10 PM",
  },
  {
    id: "1704",
    title: "student_enrolment",
    numericId: 1704,
    datawarehouse: "Sample Data warehouse",
    datawarehouseId: "1",
    languages: ["en", "fr", "ar"],
    mapUrl: "https://dfadml.dataforall.org/",
    dashboardUrl: "student-enrolment",
    resolution: "Width = 1024px",
    publishUrl: "https://example.com/publish/student-enrolment",
    publishedAt: "Apr 12, 2026 11:30:00 AM",
    role: "Admin",
    modifiedDate: "May 8, 2026",
    modifiedTime: "8:15:00 AM",
  },
];

type DashboardsGridColumnsProps = {
  sortIconFor: (columnId: string) => GridSortIcon;
  cycleSort: (columnId: string) => void;
  getColumnFilter: (columnId: string) => string;
  setColumnFilter: (columnId: string, value: string) => void;
  getRowActions?: (row: DashboardListRow) => DashboardRowMenuAction[];
  activeActionRowId: string | null;
  setActiveActionRowId: (updater: (prev: string | null) => string | null) => void;
};

export function useDashboardsGridColumns({
  sortIconFor,
  cycleSort,
  getColumnFilter,
  setColumnFilter,
  getRowActions,
  activeActionRowId,
  setActiveActionRowId,
}: DashboardsGridColumnsProps): EditableGridColumnDef[] {
  const pathname = usePathname();
  const locale = getLocaleFromPathname(pathname);
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
      id: "title",
      className: "bg-surface-muted th-search-cell w-[30%] min-w-[30%] align-top",
      header: sortHeader("title", t("DASHBOARD_TITLE")),
      filterCell: filterCell("title"),
      cell: (row: DashboardListRow) => (
        <Link
          href={buildLocaleAppPath(locale, `dashboard/${row.id}`)}
          className="cell-name text-primary hover:underline"
        >
          {row.title}{" "}
          <span className="text-text-muted">({row.numericId})</span>
        </Link>
      ),
    },
    {
      id: "datawarehouse",
      className: "bg-surface-muted th-search-cell w-[20%] min-w-[20%] align-top",
      header: sortHeader("datawarehouse", t("LABEL_DATAWAREHOUSE")),
      filterCell: filterCell("datawarehouse"),
      cell: (row: DashboardListRow) => (
        <span className="cell-name">
          {row.datawarehouse}{" "}
          <span className="text-text-muted">[{row.languages.join(",")}]</span>
        </span>
      ),
    },
    {
      id: "publishUrl",
      className: "bg-surface-muted th-search-cell w-[35%] min-w-[35%] align-top",
      cellClassName: "!whitespace-normal",
      header: { kind: "label" as const, text: t("PUBLISH_URL") },
      filterCell: filterCell("publishUrl"),
      cell: (row: DashboardListRow) => (
        <PublishUrlCell url={row.publishUrl} publishedAt={row.publishedAt} />
      ),
    },
    {
      id: "role",
      className: "bg-surface-muted th-search-cell w-[8%] min-w-[8%] align-top",
      header: sortHeader("role", t("ROLE")),
      filterCell: filterCell("role"),
      cell: (row: DashboardListRow) => (
        <span className="cell-name">{row.role}</span>
      ),
    },
    {
      id: "modifiedDate",
      className: "bg-surface-muted th-search-cell w-[14%] min-w-[11rem] align-top",
      cellClassName: "!whitespace-normal pr-2",
      header: sortHeader("modifiedDate", t("MODIFIED_ON")),
      filterCell: filterCell("modifiedDate"),
      cell: (row: DashboardListRow) => {
        const content = (
          <div className="text-xs leading-snug">
            <div>{row.modifiedDate}</div>
            <div className="text-text-muted">{row.modifiedTime}</div>
          </div>
        );
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
