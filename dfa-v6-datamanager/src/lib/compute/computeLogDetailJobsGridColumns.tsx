"use client";

import { useMemo } from "react";
import { ExpandChevronButton } from "@/components/ExpandChevronButton";
import { SideNavTruncatingLabel } from "@/components/SideNavListColumn";
import type { EditableGridColumnDef } from "@/components/TableView";
import type { ComputeLogDetailRow } from "@/lib/api/computeExecutionLogs";

export const COMPUTE_LOG_DETAIL_JOBS_COL_COUNT = 10;

function formatDataValue(value: string | number | null | undefined): string {
  if (value == null || value === "") return "—";
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return "—";
  return String(n);
}

export type UseComputeLogDetailJobsGridColumnsParams = {
  t: (code: string, fallback?: string) => string;
  openRowIds: Set<string>;
  onToggleRow: (id: number) => void;
};

export function useComputeLogDetailJobsGridColumns({
  t,
  openRowIds,
  onToggleRow,
}: UseComputeLogDetailJobsGridColumnsParams): EditableGridColumnDef<ComputeLogDetailRow>[] {
  return useMemo(
    (): EditableGridColumnDef<ComputeLogDetailRow>[] => [
      {
        id: "log_id",
        layout: { width: 60, sticky: "left"},
        header: t("COMPUTE_LOG_COL_LOG_ID", "Log Id"),
        filterCell: null,
        className: "tabular-nums",
        cell: ({ row }) => {
          const rowKey = String(row.id);
          const open = openRowIds.has(rowKey);
          return (
            <div className="flex min-w-0 items-center gap-0.5">
              <div className="add-row-action-btns shrink-0">
                <ExpandChevronButton
                  expanded={open}
                  expandAriaLabel={t("EXPAND", "Expand")}
                  collapseAriaLabel={t("COLLAPSE", "Collapse")}
                  onClick={() => onToggleRow(row.id)}
                />
              </div>
              <span className="min-w-0 truncate text-xs">{row.id}</span>
            </div>
          );
        },
      },
      {
        id: "job_type",
        layout: { width: 68 },
        header: t("COMPUTE_LOG_COL_JOB_TYPE", "Job type"),
        filterCell: null,
        cell: ({ row }) => (
          <span className="text-text">{row.process_type || "—"}</span>
        ),
      },
      {
        id: "indicator",
        layout: { width: 208, maxWidth: 240 },
        header: t("INDICATOR", "Indicator"),
        filterCell: null,
        cell: ({ row }) => (
          <SideNavTruncatingLabel
            text={row.target_iname || "—"}
            className="block min-w-0 truncate text-xs leading-tight text-text"
          />
        ),
      },
      {
        id: "unit",
        layout: { width: 76 },
        header: t("UNIT", "Unit"),
        filterCell: null,
        cell: ({ row }) => (
          <SideNavTruncatingLabel
            text={row.target_uname || "—"}
            className="block min-w-0 truncate text-xs leading-tight text-text"
          />
        ),
      },
      {
        id: "subgroup",
        layout: { width: 84 },
        header: t("SUBGROUP", "Subgroup"),
        filterCell: null,
        cell: ({ row }) => (
          <span className="min-w-0 break-words text-text">
            {row.target_sname || "—"}
          </span>
        ),
      },
      {
        id: "area",
        layout: { width: 84 },
        header: t("AREA", "Area"),
        filterCell: null,
        cell: ({ row }) => (
          <SideNavTruncatingLabel
            text={row.area_name || row.area_id || "—"}
            className="block min-w-0 truncate text-xs leading-tight text-text"
          />
        ),
      },
      {
        id: "time",
        layout: { width: 60 },
        header: t("TIME", "Time"),
        filterCell: null,
        cell: ({ row }) => (
          <span className="text-text">{row.time_period || "—"}</span>
        ),
      },
      {
        id: "source",
        layout: { width: 96, maxWidth: 132 },
        header: t("SOURCE", "Source"),
        filterCell: null,
        cell: ({ row }) => (
          <SideNavTruncatingLabel
            text={row.source_name?.trim() || "—"}
            className="block min-w-0 truncate text-xs leading-tight text-text"
          />
        ),
      },
      {
        id: "data_value",
        layout: { width: 88 },
        header: t("DATA_VALUE", "Data value"),
        filterCell: null,
        className: "tabular-nums",
        cell: ({ row }) => (
          <span className="text-text">{formatDataValue(row.data_value)}</span>
        ),
      },
      {
        id: "remarks",
        layout: { width: 176, maxWidth: 260 },
        header: t("REMARKS", "Remarks"),
        filterCell: null,
        cell: ({ row }) => {
          const text =
            row.remarks?.trim() ||
            (row.job_status === "FAILED"
              ? row.error_message?.trim() || "—"
              : "—");
          return (
            <SideNavTruncatingLabel
              text={text}
              className="block min-w-0 truncate text-xs leading-tight text-text"
            />
          );
        },
      },
    ],
    [onToggleRow, openRowIds, t]
  );
}
