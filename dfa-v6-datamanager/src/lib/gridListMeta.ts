/** Shared list API pagination meta (matches backend `ListPaginationMetaSchema`). */
export type ListPaginationMeta = {
  total_count: number;
  total_pages: number;
  count?: number;
  page?: number;
  page_size?: number;
  total_count_unfiltered?: number;
};

export function readTotalCountUnfiltered(
  meta: { total_count_unfiltered?: number } | null | undefined
): number | undefined {
  const u = meta?.total_count_unfiltered;
  return typeof u === "number" && u >= 0 ? u : undefined;
}

export function parseListMetaTotals(meta: ListPaginationMeta) {
  return {
    totalCount: meta.total_count,
    totalPages: meta.total_pages,
    totalCountUnfiltered: readTotalCountUnfiltered(meta),
  };
}

/**
 * Footer total line: "of {filtered} users" or "of {filtered} matching out of {total} {noun}" when filtered.
 */
export function formatGridFooterTotalCount(
  filteredCount: number,
  unfilteredCount: number | undefined,
  t: (key: string) => string,
  filteredOnlyKey: string,
  matchingKey = "FOOTER_MATCHING_OF_TOTAL",
  /** Appended after the count phrase (e.g. `t("INDICATORS")` for “of 12 indicators”). */
  nounSuffix?: string
): string {
  const suffix = nounSuffix ? ` ${nounSuffix}` : "";
  if (
    unfilteredCount != null &&
    Number.isFinite(unfilteredCount) &&
    unfilteredCount !== filteredCount
  ) {
    return (
      t(matchingKey)
        .replace("{filtered}", String(filteredCount))
        .replace("{total}", String(unfilteredCount)) + suffix
    );
  }
  const prefix = t(filteredOnlyKey).split("{total}")[0] ?? "";
  return `${prefix}${filteredCount}${suffix}`;
}
