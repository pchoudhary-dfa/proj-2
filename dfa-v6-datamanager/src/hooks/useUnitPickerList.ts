"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fetchUnits, getUnitGid, getUnitName } from "@/lib/api/units";
import type { FetchUnitsParams, UnitRaw } from "@/lib/api/types";
import { API_KEY_FORMAT } from "@/lib/constants";

const UNIT_PICKER_PAGE_SIZE = 50;
const SEARCH_DEBOUNCE_MS = 300;

const SORT_NAME = API_KEY_FORMAT === "external" ? "u_name" : "unit_name";

function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);
  useEffect(() => {
    const id = window.setTimeout(() => setDebouncedValue(value), delay);
    return () => window.clearTimeout(id);
  }, [value, delay]);
  return debouncedValue;
}

function unitSearchByForTerm(term: string): "u_name" | "u_gid" {
  const t = term.trim();
  if (/^[A-Za-z0-9_-]+$/.test(t) && t.includes("_")) return "u_gid";
  return "u_name";
}

export type UnitPickerOption = { id: string; label: string };

export function useUnitPickerList({
  dwId,
  search,
  open,
}: {
  dwId: string;
  search: string;
  open: boolean;
}) {
  const debouncedSearch = useDebounce(search.trim(), SEARCH_DEBOUNCE_MS);
  const [rows, setRows] = useState<UnitRaw[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const fetchGenRef = useRef(0);

  const buildParams = useCallback(
    (pageNum: number): FetchUnitsParams => {
      const base: FetchUnitsParams = {
        page: pageNum,
        page_size: UNIT_PICKER_PAGE_SIZE,
        sort_order: "asc",
        sort_field: SORT_NAME,
      };
      if (debouncedSearch) {
        return {
          ...base,
          search: debouncedSearch,
          search_by: unitSearchByForTerm(debouncedSearch),
        };
      }
      return base;
    },
    [debouncedSearch]
  );

  const mergeRows = useCallback((prev: UnitRaw[], incoming: UnitRaw[]) => {
    const seen = new Set(
      prev.map((u) => getUnitGid(u)).filter((gid): gid is string => Boolean(gid))
    );
    const merged = [...prev];
    for (const row of incoming) {
      const gid = getUnitGid(row);
      if (gid && !seen.has(gid)) {
        seen.add(gid);
        merged.push(row);
      }
    }
    return merged;
  }, []);

  useEffect(() => {
    if (!open || !dwId) return;
    let cancelled = false;
    const gen = ++fetchGenRef.current;
    setLoading(true);
    setPage(1);
    (async () => {
      const res = await fetchUnits(dwId, buildParams(1));
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
      const res = await fetchUnits(dwId, buildParams(nextPage));
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

  const requestMoreIfAvailable = useCallback(() => {
    void loadMore();
  }, [loadMore]);

  const refresh = useCallback(() => {
    fetchGenRef.current += 1;
    setRows([]);
    setPage(1);
    setHasMore(false);
    if (!open || !dwId) return;
    const gen = fetchGenRef.current;
    setLoading(true);
    void (async () => {
      const res = await fetchUnits(dwId, buildParams(1));
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

  const comboOptions = useMemo((): UnitPickerOption[] => {
    return rows
      .map((u) => {
        const id = getUnitGid(u);
        if (!id) return null;
        return { id, label: getUnitName(u) || id };
      })
      .filter((x): x is UnitPickerOption => x != null);
  }, [rows]);

  const exactNameMatch = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return false;
    return rows.some((u) => getUnitName(u).trim().toLowerCase() === q);
  }, [rows, search]);

  return {
    rows,
    comboOptions,
    loading,
    loadingMore,
    hasMore,
    loadMore,
    requestMoreIfAvailable,
    refresh,
    exactNameMatch,
  };
}
