"use client";

import type { ReactNode } from "react";
import { SelectField } from "@/components/SelectField";

/** Default page-size options for table footers (override via `pageSizes`). */
export const DEFAULT_TABLE_PAGE_SIZES = [25, 50, 100] as const;

/** Default responsive shell: stack on narrow viewports, space-between on `sm+`. */
export const TABLE_PAGINATION_FOOTER_INNER_LAYOUT =
  "flex min-w-0 w-full flex-col gap-1 sm:flex-row sm:items-center sm:justify-between sm:gap-3";

/** 26×26 bordered icon buttons — same as `btn-comp-icon`, tuned for table footers. */
export const TABLE_PAGINATION_FOOTER_BUTTON_CLASS =
  "btn-comp-icon !shadow-none !rounded-[5px]";

/** Default classes for the left cluster (Show + select + counts). */
export const TABLE_PAGINATION_FOOTER_LEFT_GROUP_CLASS =
  "flex flex-wrap items-center gap-2";

function Mi({ name, className = "" }: { name: string; className?: string }) {
  return (
    <span className={`material-icons ${className}`.trim()} aria-hidden>
      {name}
    </span>
  );
}

export type TablePaginationFooterTitles = Partial<{
  first: string;
  previous: string;
  next: string;
  last: string;
}>;

const DEFAULT_TITLES = {
  first: "First page",
  previous: "Previous page",
  next: "Next page",
  last: "Last page",
} as const;

const DEFAULT_PAGE_SIZE_LABEL = (
  <span className="mr-1.5 shrink-0 text-text-muted">Show</span>
);

export type TablePaginationFooterProps = {
  page: number;
  /** Total pages from the server (0 when unknown / empty). */
  totalPages: number;
  totalCount: number;
  /** When set and different from `totalCount`, shown as the full list size (search/filter active). */
  totalCountUnfiltered?: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
  /**
   * Shown in “Page X of Y”. Defaults to `page` when omitted (use API `meta.page`
   * when it can differ from local state during loads).
   */
  displayPage?: number;
  /** Defaults to {@link DEFAULT_TABLE_PAGE_SIZES}. */
  pageSizes?: readonly number[];
  /**
   * Plural noun for the total line, e.g. `"indicators"` → `of 12 indicators`
   * (unless `renderCount` is used).
   */
  countNoun: string;
  /**
   * When true (default), calls `onPageChange(1)` after a page-size change
   * (after `onPageSizeChange`).
   */
  resetPageOnPageSizeChange?: boolean;
  showPageSizeSelect?: boolean;
  showTotalCount?: boolean;
  showPaginationControls?: boolean;
  /**
   * Renders before the page-size control. Defaults to a muted “Show” label;
   * pass `null` to omit.
   */
  pageSizePrefix?: ReactNode | null;
  /** Prepended inside the left group (e.g. filters). */
  leadingSlot?: ReactNode;
  /** Appended inside the right controls group (after nav buttons). */
  trailingSlot?: ReactNode;
  className?: string;
  leftGroupClassName?: string;
  selectClassName?: string;
  /** `aria-label` on the page-size `SelectField` trigger. */
  selectAriaLabel?: string;
  buttonClassName?: string;
  controlsWrapperClassName?: string;
  countSpanId?: string;
  /** Class on each pagination icon. */
  iconClassName?: string;
  /** Class on the “Page X of Y” `<span>` wrapper. */
  pageSummaryClassName?: string;
  /** Prefix before the current page number, default `"Page "`. */
  pageSummaryPrefix?: string;
  /** Word between current and total in the summary, default `" of "`. */
  pageSummaryBetween?: string;
  /**
   * Text between the page-size control and the total count, default `" of "`
   * (ignored if `renderCount` is set).
   */
  countLeadIn?: string;
  buttonTitles?: TablePaginationFooterTitles;
  /** Full control over the total line; `countNoun` / `countLeadIn` are ignored. */
  renderCount?: (totalCount: number) => ReactNode;
  /** Full control over the page summary; `pageSummary*` props are ignored. */
  renderPageSummary?: (
    displayPage: number,
    totalPagesDisplay: number
  ) => ReactNode;
  /**
   * When set, forward navigation uses “next page” (`page + 1`) and the next button
   * is disabled when `hasNextPage` is false (unknown total page count).
   * Omit to use `totalPages` instead (standard server page count).
   */
  hasNextPage?: boolean;
  /** When false, hides the last-page control (e.g. cursor / chunk pagination). */
  showLastPageButton?: boolean;
  /** Renders after the page-size control, before the default count line. */
  afterPageSizeSlot?: ReactNode;
  /**
   * Wraps the left group and pagination controls.
   * Defaults to {@link TABLE_PAGINATION_FOOTER_INNER_LAYOUT}.
   * Pass `null` or `""` to render left + controls as direct children of the root (legacy layout).
   */
  footerInnerClassName?: string | null;
};

export function TablePaginationFooter({
  page,
  totalPages,
  totalCount,
  totalCountUnfiltered,
  pageSize,
  onPageChange,
  onPageSizeChange,
  displayPage = page,
  pageSizes = DEFAULT_TABLE_PAGE_SIZES,
  countNoun,
  resetPageOnPageSizeChange = true,
  showPageSizeSelect = true,
  showTotalCount = true,
  showPaginationControls = true,
  pageSizePrefix,
  leadingSlot,
  trailingSlot,
  className = "footer",
  leftGroupClassName = TABLE_PAGINATION_FOOTER_LEFT_GROUP_CLASS,
  selectClassName = "",
  selectAriaLabel = "Rows per page",
  buttonClassName = TABLE_PAGINATION_FOOTER_BUTTON_CLASS,
  controlsWrapperClassName = "flex items-center gap-1",
  countSpanId = "footer-count",
  iconClassName = "!text-sm",
  pageSummaryClassName = "",
  pageSummaryPrefix = "Page ",
  pageSummaryBetween = " of ",
  countLeadIn = " of ",
  buttonTitles,
  renderCount,
  renderPageSummary,
  hasNextPage,
  showLastPageButton = true,
  afterPageSizeSlot,
  footerInnerClassName: footerInnerProp,
}: TablePaginationFooterProps) {
  const innerWrapperClass =
    footerInnerProp === null || footerInnerProp === ""
      ? null
      : footerInnerProp ?? TABLE_PAGINATION_FOOTER_INNER_LAYOUT;

  const pageSizeLabel =
    pageSizePrefix === undefined
      ? showPageSizeSelect
        ? DEFAULT_PAGE_SIZE_LABEL
        : null
      : pageSizePrefix;
  const totalPagesDisplay = totalPages || 1;
  const titles = { ...DEFAULT_TITLES, ...buttonTitles };
  const useHasNextFlag = typeof hasNextPage === "boolean";
  /** Next: disabled when there is no following page. */
  const nextDisabled = useHasNextFlag
    ? !hasNextPage
    : totalPages > 0
      ? page >= totalPages
      : true;
  /**
   * Last page: in `hasNextPage` mode the true last page is unknown until the list ends,
   * so the control stays visible but disabled (avoids jumping to `totalPages` 0).
   */
  const lastDisabled = useHasNextFlag
    ? true
    : totalPages > 0
      ? page >= totalPages
      : true;

  const handlePageSizeChange = (next: number) => {
    onPageSizeChange(next);
    if (resetPageOnPageSizeChange) onPageChange(1);
  };

  const goNext = () => {
    if (useHasNextFlag) onPageChange(page + 1);
    else onPageChange(Math.min(totalPages, page + 1));
  };

  const left = (
    <div className={leftGroupClassName}>
      {leadingSlot}
      {pageSizeLabel}
      {showPageSizeSelect ? (
        <SelectField
          className={["min-w-[3.25rem] max-w-[5rem]", selectClassName]
            .filter(Boolean)
            .join(" ")}
          aria-label={selectAriaLabel}
          value={String(pageSize)}
          onChange={(e) => handlePageSizeChange(Number(e.target.value))}
          options={pageSizes.map((n) => ({
            value: String(n),
            label: String(n),
          }))}
        />
      ) : null}
      {afterPageSizeSlot}
      {showTotalCount
        ? renderCount?.(totalCount) ?? (
            <span id={countSpanId}>
              {countLeadIn}
              {totalCount} {countNoun}
            </span>
          )
        : null}
    </div>
  );

  const controls = showPaginationControls ? (
    <div className={controlsWrapperClassName}>
      <button
        type="button"
        className={buttonClassName}
        disabled={page <= 1}
        onClick={() => onPageChange(1)}
        title={titles.first}
      >
        <Mi name="first_page" className={iconClassName} />
      </button>
      <button
        type="button"
        className={buttonClassName}
        disabled={page <= 1}
        onClick={() => onPageChange(Math.max(1, page - 1))}
        title={titles.previous}
      >
        <Mi name="chevron_left" className={iconClassName} />
      </button>
      <span className={pageSummaryClassName}>
        {renderPageSummary?.(displayPage, totalPagesDisplay) ?? (
          <>
            {pageSummaryPrefix}
            {displayPage}
            {pageSummaryBetween}
            {totalPagesDisplay}
          </>
        )}
      </span>
      <button
        type="button"
        className={buttonClassName}
        disabled={nextDisabled}
        onClick={goNext}
        title={titles.next}
      >
        <Mi name="chevron_right" className={iconClassName} />
      </button>
      {showLastPageButton ? (
        <button
          type="button"
          className={buttonClassName}
          disabled={lastDisabled}
          onClick={() => onPageChange(totalPages)}
          title={titles.last}
        >
          <Mi name="last_page" className={iconClassName} />
        </button>
      ) : null}
      {trailingSlot}
    </div>
  ) : (
    (trailingSlot ?? null)
  );

  return (
    <div className={className}>
      {innerWrapperClass ? (
        <div className={innerWrapperClass}>
          {left}
          {controls}
        </div>
      ) : (
        <>
          {left}
          {controls}
        </>
      )}
    </div>
  );
}
