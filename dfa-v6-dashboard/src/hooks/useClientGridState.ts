"use client";

import type { GridSortIcon } from "@/components/TableView";
import { useEffect, useMemo, useState } from "react";

export type SortDirection = "asc" | "desc" | null;

export type SortState = {
  columnId: string | null;
  direction: SortDirection;
};

function getComparableValue(value: unknown): string | number | null {
  if (value == null) return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    return normalized.length === 0 ? "" : normalized;
  }
  return String(value).toLowerCase();
}

function compareValues(
  left: string | number | null,
  right: string | number | null,
  direction: Exclude<SortDirection, null>,
) {
  if (left == null && right == null) return 0;
  if (left == null) return 1;
  if (right == null) return -1;
  const base =
    typeof left === "number" && typeof right === "number"
      ? left - right
      : String(left).localeCompare(String(right), undefined, {
          numeric: true,
          sensitivity: "base",
        });
  return direction === "asc" ? base : -base;
}

export type ColumnSortConfig<TRow> = {
  columnId: string;
  sortValue?: (row: TRow) => string | number;
  sortable?: boolean;
};

export type ColumnFilterConfig<TRow> = {
  columnId: string;
  filterValue?: (row: TRow) => string;
  filterable?: boolean;
};

type UseClientGridStateOptions<TRow> = {
  rows: TRow[];
  sortColumns: ColumnSortConfig<TRow>[];
  filterColumns: ColumnFilterConfig<TRow>[];
  defaultPageSize?: number;
  rowId: (row: TRow) => string;
};

export function useClientGridState<TRow>({
  rows,
  sortColumns,
  filterColumns,
  defaultPageSize = 10,
  rowId,
}: UseClientGridStateOptions<TRow>) {
  const [pageSize, setPageSize] = useState(defaultPageSize);
  const [page, setPage] = useState(1);
  const [sortState, setSortState] = useState<SortState>({
    columnId: null,
    direction: null,
  });
  const [columnFilters, setColumnFilters] = useState<Record<string, string>>(
    {},
  );

  const filteredRows = useMemo(() => {
    return rows.filter((row) =>
      filterColumns.every((col) => {
        if (col.filterable === false) return true;
        const raw = columnFilters[col.columnId];
        if (!raw?.trim()) return true;
        const needle = raw.trim().toLowerCase();
        const haystack = (
          col.filterValue?.(row) ??
          String((row as Record<string, unknown>)[col.columnId] ?? "")
        ).toLowerCase();
        return haystack.includes(needle);
      }),
    );
  }, [rows, filterColumns, columnFilters]);

  const sortedRows = useMemo(() => {
    const { columnId, direction } = sortState;
    if (!columnId || !direction) return filteredRows;

    const activeCol = sortColumns.find((c) => c.columnId === columnId);
    if (!activeCol || activeCol.sortable === false) return filteredRows;

    const sorted = [...filteredRows];
    sorted.sort((leftRow, rightRow) => {
      const leftRaw = activeCol.sortValue
        ? activeCol.sortValue(leftRow)
        : String((leftRow as Record<string, unknown>)[columnId] ?? "");
      const rightRaw = activeCol.sortValue
        ? activeCol.sortValue(rightRow)
        : String((rightRow as Record<string, unknown>)[columnId] ?? "");
      return compareValues(
        getComparableValue(leftRaw),
        getComparableValue(rightRaw),
        direction,
      );
    });
    return sorted;
  }, [filteredRows, sortColumns, sortState]);

  const totalRecords = sortedRows.length;
  const totalPages = Math.max(1, Math.ceil(totalRecords / pageSize));

  useEffect(() => {
    setPage((prev) => Math.min(Math.max(1, prev), totalPages));
  }, [totalPages]);

  const paginatedRows = useMemo(() => {
    const start = (page - 1) * pageSize;
    return sortedRows.slice(start, start + pageSize);
  }, [sortedRows, page, pageSize]);

  const sortIconFor = (columnId: string): GridSortIcon => {
    if (sortState.columnId !== columnId) return "unfold_more";
    if (sortState.direction === "asc") return "arrow_upward";
    if (sortState.direction === "desc") return "arrow_downward";
    return "unfold_more";
  };

  const cycleSort = (columnId: string) => {
    setPage(1);
    setSortState((prev) => {
      if (prev.columnId !== columnId)
        return { columnId, direction: "asc" as const };
      if (prev.direction === "asc")
        return { columnId, direction: "desc" as const };
      if (prev.direction === "desc") return { columnId: null, direction: null };
      return { columnId, direction: "asc" as const };
    });
  };

  const setColumnFilter = (columnId: string, value: string) => {
    setPage(1);
    setColumnFilters((prev) => ({ ...prev, [columnId]: value }));
  };

  const getColumnFilter = (columnId: string) =>
    columnFilters[columnId] ?? "";

  return {
    page,
    setPage,
    pageSize,
    setPageSize,
    totalRecords,
    totalPages,
    paginatedRows,
    sortState,
    sortIconFor,
    cycleSort,
    columnFilters,
    setColumnFilter,
    getColumnFilter,
  };
}
