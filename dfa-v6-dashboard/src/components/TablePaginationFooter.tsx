"use client";

import type { ReactNode } from "react";

export const DEFAULT_TABLE_PAGE_SIZES = [10, 25, 50, 100] as const;

export const TABLE_PAGINATION_FOOTER_INNER_LAYOUT =
  "flex min-w-0 w-full flex-col gap-1 sm:flex-row sm:items-center sm:justify-between sm:gap-3";

export const TABLE_PAGINATION_FOOTER_LEFT_GROUP_CLASS =
  "flex flex-wrap items-center gap-2";

function Mi({ name, className = "" }: { name: string; className?: string }) {
  return (
    <span className={`material-icons ${className}`.trim()} aria-hidden>
      {name}
    </span>
  );
}

export type TablePaginationFooterProps = {
  page: number;
  totalPages: number;
  totalCount: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
  pageSizes?: readonly number[];
  countNoun: string;
  pageSummaryClassName?: string;
};

export function TablePaginationFooter({
  page,
  totalPages,
  totalCount,
  pageSize,
  onPageChange,
  onPageSizeChange,
  pageSizes = DEFAULT_TABLE_PAGE_SIZES,
  countNoun,
  pageSummaryClassName = "mx-1 min-w-[90px] text-center",
}: TablePaginationFooterProps) {
  const totalPagesDisplay = totalPages || 1;

  const handlePageSizeChange = (next: number) => {
    onPageSizeChange(next);
    onPageChange(1);
  };

  return (
    <div className="footer">
      <div className={TABLE_PAGINATION_FOOTER_INNER_LAYOUT}>
        <div className={TABLE_PAGINATION_FOOTER_LEFT_GROUP_CLASS}>
          <span className="mr-1.5 shrink-0 text-text-muted">Show</span>
          <select
            className="pg-sel"
            aria-label="Rows per page"
            value={String(pageSize)}
            onChange={(e) => handlePageSizeChange(Number(e.target.value))}
          >
            {pageSizes.map((n) => (
              <option key={n} value={String(n)}>
                {n}
              </option>
            ))}
          </select>
          <span>
            {" of "}
            {totalCount} {countNoun}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            className="pg-btn"
            disabled={page <= 1}
            onClick={() => onPageChange(1)}
            title="First page"
          >
            <Mi name="first_page" className="!text-sm" />
          </button>
          <button
            type="button"
            className="pg-btn"
            disabled={page <= 1}
            onClick={() => onPageChange(Math.max(1, page - 1))}
            title="Previous page"
          >
            <Mi name="chevron_left" className="!text-sm" />
          </button>
          <span className={pageSummaryClassName}>
            Page {page} of {totalPagesDisplay}
          </span>
          <button
            type="button"
            className="pg-btn"
            disabled={page >= totalPages}
            onClick={() => onPageChange(Math.min(totalPages, page + 1))}
            title="Next page"
          >
            <Mi name="chevron_right" className="!text-sm" />
          </button>
          <button
            type="button"
            className="pg-btn"
            disabled={page >= totalPages}
            onClick={() => onPageChange(totalPages)}
            title="Last page"
          >
            <Mi name="last_page" className="!text-sm" />
          </button>
        </div>
      </div>
    </div>
  );
}
