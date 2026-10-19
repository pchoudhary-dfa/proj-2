"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getRequest } from "@/lib/api/http";
import type {
  FetchSubgroupsParams,
  SubgroupRaw,
  SubgroupsListResponse,
  SubgroupsListResult,
} from "@/lib/api/types";
import { getDWAPIURL, REFERENCE_PATH_SUBGROUPS } from "@/lib/constants";

const SUBGROUP_PICKER_PAGE_SIZE = 50;
const SEARCH_DEBOUNCE_MS = 300;

function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);
  useEffect(() => {
    const id = window.setTimeout(() => setDebouncedValue(value), delay);
    return () => window.clearTimeout(id);
  }, [value, delay]);
  return debouncedValue;
}

async function fetchSubgroupsPage(
  dwId: string,
  params: FetchSubgroupsParams
): Promise<SubgroupsListResult> {
  const searchParams = new URLSearchParams();
  if (params.page != null) searchParams.set("page", String(params.page));
  if (params.page_size != null) {
    searchParams.set("page_size", String(params.page_size));
  }
  if (params.sort_order) searchParams.set("sort_order", params.sort_order);
  if (params.sort_field) searchParams.set("sort_field", params.sort_field);
  if (params.search != null && params.search !== "") {
    searchParams.set("search", params.search);
  }
  if (params.search_by) searchParams.set("search_by", params.search_by);
  if (params.search_field) searchParams.set("search_field", params.search_field);

  const url = `${getDWAPIURL(dwId, REFERENCE_PATH_SUBGROUPS)}?${searchParams.toString()}`;
  const json = (await getRequest(url, undefined, {
    suppressErrorMessage: true,
  })) as SubgroupsListResponse | SubgroupsListResult;
  if ((json as SubgroupsListResponse).success === true) {
    return json as SubgroupsListResponse;
  }
  return json as SubgroupsListResult;
}

export type SubgroupPickerOption = { id: string; label: string };

export function useSubgroupPickerList({
  dwId,
  search,
  open,
  getSubgroupGid,
  getSubgroupName,
}: {
  dwId: string;
  search: string;
  open: boolean;
  getSubgroupGid: (s: SubgroupRaw) => string | null;
  getSubgroupName: (s: SubgroupRaw) => string;
}) {
  const debouncedSearch = useDebounce(search.trim(), SEARCH_DEBOUNCE_MS);
  const [rows, setRows] = useState<SubgroupRaw[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const fetchGenRef = useRef(0);

  const buildParams = useCallback(
    (pageNum: number): FetchSubgroupsParams => {
      const base: FetchSubgroupsParams = {
        page: pageNum,
        page_size: SUBGROUP_PICKER_PAGE_SIZE,
        sort_order: "asc",
        sort_field: "sv_order",
      };
      if (debouncedSearch) {
        return {
          ...base,
          search: debouncedSearch,
          search_by: "subgroup",
          search_field: "subgroup_val",
        };
      }
      return base;
    },
    [debouncedSearch]
  );

  const mergeRows = useCallback(
    (prev: SubgroupRaw[], incoming: SubgroupRaw[]) => {
      const seen = new Set(
        prev.map((s) => getSubgroupGid(s)).filter((gid): gid is string => Boolean(gid))
      );
      const merged = [...prev];
      for (const row of incoming) {
        const gid = getSubgroupGid(row);
        if (gid && !seen.has(gid)) {
          seen.add(gid);
          merged.push(row);
        }
      }
      return merged;
    },
    [getSubgroupGid]
  );

  useEffect(() => {
    if (!open || !dwId) return;
    let cancelled = false;
    const gen = ++fetchGenRef.current;
    setLoading(true);
    setPage(1);
    (async () => {
      const res = await fetchSubgroupsPage(dwId, buildParams(1));
      if (cancelled || gen !== fetchGenRef.current) return;
      if (res.success && res.data) {
        setRows(res.data);
        setHasMore(res.meta.page < res.meta.total_pages);
      } else {
        setRows([]);
        setHasMore(false);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [open, dwId, debouncedSearch, buildParams]);

  const loadMore = useCallback(async () => {
    if (!dwId || loading || loadingMore || !hasMore) return;
    const nextPage = page + 1;
    setLoadingMore(true);
    try {
      const res = await fetchSubgroupsPage(dwId, buildParams(nextPage));
      if (res.success && res.data) {
        setRows((prev) => mergeRows(prev, res.data));
        setPage(nextPage);
        setHasMore(res.meta.page < res.meta.total_pages);
      } else {
        setHasMore(false);
      }
    } finally {
      setLoadingMore(false);
    }
  }, [dwId, loading, loadingMore, hasMore, page, buildParams, mergeRows]);

  const refresh = useCallback(() => {
    fetchGenRef.current += 1;
    setRows([]);
    setPage(1);
    setHasMore(false);
    if (!open || !dwId) return;
    const gen = fetchGenRef.current;
    setLoading(true);
    void (async () => {
      const res = await fetchSubgroupsPage(dwId, buildParams(1));
      if (gen !== fetchGenRef.current) return;
      if (res.success && res.data) {
        setRows(res.data);
        setHasMore(res.meta.page < res.meta.total_pages);
      } else {
        setRows([]);
        setHasMore(false);
      }
      setLoading(false);
    })();
  }, [open, dwId, buildParams]);

  const comboOptions = useMemo((): SubgroupPickerOption[] => {
    return rows
      .map((s) => {
        const id = getSubgroupGid(s);
        if (!id) return null;
        return { id, label: getSubgroupName(s) || id };
      })
      .filter((x): x is SubgroupPickerOption => x != null);
  }, [rows, getSubgroupGid, getSubgroupName]);

  const exactNameMatch = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return false;
    return rows.some(
      (s) => getSubgroupName(s).trim().toLowerCase() === q
    );
  }, [rows, search, getSubgroupName]);

  return {
    rows,
    comboOptions,
    loading,
    loadingMore,
    hasMore,
    loadMore,
    refresh,
    exactNameMatch,
  };
}
