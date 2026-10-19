"use client";

import type { ReactNode } from "react";
import {
  DEFAULT_TABLE_PAGE_SIZES,
  TablePaginationFooter,
  type TablePaginationFooterProps,
  type TablePaginationFooterTitles,
} from "@/components/TablePaginationFooter";
import { formatGridFooterTotalCount } from "@/lib/gridListMeta";

/** Localized strings for the standard server-driven list footer. */
export type TablePaginationFooterLabels = {
  t: (key: string) => string;
  /** Muted prefix before page-size select; default `t("SHOW")`. */
  show?: string;
  /** Key for “Page {page} of {pages}”; default `"PAGE_OF"`. */
  pageOf?: string;
  /** Key for filtered-only count; default `"FOOTER_OF_TOTAL_WORKFLOWS"`. */
  filteredOnly?: string;
  /** Key for matching count; default `"FOOTER_MATCHING_OF_TOTAL"`. */
  matching?: string;
  nav?: Partial<TablePaginationFooterTitles>;
  /** Page-size select `aria-label`; default `t("SEARCH")`. */
  rowsPerPage?: string;
};

/**
 * Declarative pagination config — pass list state + `countNoun` (and optional `labels`);
 * {@link resolveTablePaginationFooterProps} / {@link renderTablePaginationFooter} apply defaults.
 */
export type TablePaginationFooterConfig = {
  page: number;
  pageSize: number;
  totalPages: number;
  totalCount: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
  countNoun: string;

  displayPage?: number;
  totalCountUnfiltered?: number;
  pageSizes?: readonly number[];
  resetPageOnPageSizeChange?: boolean;
  showPageSizeSelect?: boolean;
  showTotalCount?: boolean;
  showPaginationControls?: boolean;
  hasNextPage?: boolean;
  showLastPageButton?: boolean;

  /** When set, applies standard list-grid i18n (SHOW label, PAGE_OF summary, nav titles, filtered count). */
  labels?: TablePaginationFooterLabels;

  pageSummaryClassName?: string;
  className?: string;
  leftGroupClassName?: string;
  selectClassName?: string;
  buttonClassName?: string;
  controlsWrapperClassName?: string;
  countSpanId?: string;
  iconClassName?: string;
  footerInnerClassName?: string | null;

  leadingSlot?: ReactNode;
  trailingSlot?: ReactNode;
  afterPageSizeSlot?: ReactNode;

  renderCount?: TablePaginationFooterProps["renderCount"];
  renderPageSummary?: TablePaginationFooterProps["renderPageSummary"];
};

function mutedShowLabel(label: string) {
  return (
    <span className="mr-1.5 shrink-0 text-text-muted">{label}</span>
  );
}

/** Expands declarative config into props for {@link TablePaginationFooter}. */
export function resolveTablePaginationFooterProps(
  config: TablePaginationFooterConfig
): TablePaginationFooterProps {
  const {
    labels,
    renderCount: configRenderCount,
    renderPageSummary: configRenderPageSummary,
    leadingSlot,
    trailingSlot,
    afterPageSizeSlot,
    pageSummaryClassName,
    className,
    leftGroupClassName,
    selectClassName,
    buttonClassName,
    controlsWrapperClassName,
    countSpanId,
    iconClassName,
    footerInnerClassName,
    displayPage,
    pageSizes,
    resetPageOnPageSizeChange,
    showPageSizeSelect,
    showTotalCount,
    showPaginationControls,
    hasNextPage,
    showLastPageButton,
    page,
    pageSize,
    totalPages,
    totalCount,
    totalCountUnfiltered,
    onPageChange,
    onPageSizeChange,
    countNoun,
  } = config;

  const props: TablePaginationFooterProps = {
    page,
    pageSize,
    totalPages,
    totalCount,
    totalCountUnfiltered,
    onPageChange,
    onPageSizeChange,
    countNoun,
    displayPage: displayPage ?? page,
    pageSizes: pageSizes ?? DEFAULT_TABLE_PAGE_SIZES,
    resetPageOnPageSizeChange: resetPageOnPageSizeChange ?? true,
    showPageSizeSelect: showPageSizeSelect ?? true,
    showTotalCount: showTotalCount ?? true,
    showPaginationControls: showPaginationControls ?? true,
    showLastPageButton: showLastPageButton ?? true,
    className: className ?? "footer",
    leadingSlot,
    trailingSlot,
    afterPageSizeSlot,
    pageSummaryClassName,
    leftGroupClassName,
    selectClassName,
    buttonClassName,
    controlsWrapperClassName,
    countSpanId,
    iconClassName,
    footerInnerClassName,
    hasNextPage,
  };

  if (labels) {
    const t = labels.t;
    props.pageSizePrefix = mutedShowLabel(labels.show ?? t("SHOW"));

    if (!configRenderCount) {
      const filteredOnlyKey =
        labels.filteredOnly ?? "FOOTER_OF_TOTAL_WORKFLOWS";
      const matchingKey = labels.matching ?? "FOOTER_MATCHING_OF_TOTAL";
      props.renderCount = (tc) => (
        <span id={countSpanId ?? "footer-count"}>
          {formatGridFooterTotalCount(
            tc,
            totalCountUnfiltered,
            t,
            filteredOnlyKey,
            matchingKey,
            countNoun
          )}
        </span>
      );
    }

    if (!configRenderPageSummary) {
      const pageOfKey = labels.pageOf ?? "PAGE_OF";
      props.renderPageSummary = (dp, tp) =>
        t(pageOfKey)
          .replace("{page}", String(dp))
          .replace("{pages}", String(tp));
    }

    props.buttonTitles = {
      first: labels.nav?.first ?? t("FIRST_PAGE"),
      previous: labels.nav?.previous ?? t("PREVIOUS_PAGE"),
      next: labels.nav?.next ?? t("NEXT_PAGE"),
      last: labels.nav?.last ?? t("LAST_PAGE"),
    };

    props.selectAriaLabel = labels.rowsPerPage ?? t("SEARCH");
  }

  if (configRenderCount) props.renderCount = configRenderCount;
  if (configRenderPageSummary) props.renderPageSummary = configRenderPageSummary;

  return props;
}

export function renderTablePaginationFooter(
  config: TablePaginationFooterConfig
) {
  return (
    <TablePaginationFooter {...resolveTablePaginationFooterProps(config)} />
  );
}
