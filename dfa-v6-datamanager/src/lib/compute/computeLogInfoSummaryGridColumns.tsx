"use client";

import { useMemo } from "react";
import { LogSummaryTruncatedListCell } from "@/components/compute/LogSummaryTruncatedListCell";
import { SideNavTruncatingLabel } from "@/components/SideNavListColumn";
import type { EditableGridColumnDef } from "@/components/TableView";
import type { ComputeLogInfo } from "@/lib/api/computeExecutionLogs";
import { formatLogDisplayName } from "@/lib/compute/formatLogDisplayName";
import {
  formatLogAreasDisplay,
  formatLogTargetIusDisplay,
  formatLogTimeperiodsDisplay,
  logAreaListEntries,
  logTargetIusListItems,
  logTimeListItems,
} from "@/lib/compute/logInfoSummaryDisplay";
/** Legacy Laravel grid: ``d M Y, H:i`` */
export function formatLegacyDateTime(raw: string | null | undefined): string {
  if (!raw?.trim()) return "—";
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return raw;
  const months = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
  ];
  const day = d.getDate();
  const month = months[d.getMonth()] ?? "";
  const year = d.getFullYear();
  const hours = String(d.getHours()).padStart(2, "0");
  const minutes = String(d.getMinutes()).padStart(2, "0");
  return `${day} ${month} ${year}, ${hours}:${minutes}`;
}

function processTypeLabel(
  processType: string,
  t: (code: string, fallback?: string) => string
): string {
  switch (processType) {
    case "TOTAL":
      return t("TOTAL");
    case "MINUS":
      return t("MINUS");
    case "PERCENT":
      return t("PERCENTAGE");
    case "TIME":
      return t("TIME_PERIOD", "Time Period");
    case "AREA":
      return t("AREA", "Area");
    default:
      return processType;
  }
}

function executionTypeLabel(
  logInfo: ComputeLogInfo,
  t: (code: string, fallback?: string) => string
): string {
  const raw = logInfo.process_type || logInfo.execution_type;
  if (!raw) return "—";
  return processTypeLabel(String(raw), t);
}

function logStatusCell(
  logInfo: ComputeLogInfo,
  t: (code: string, fallback?: string) => string
): { primary: string; secondary: string; tone: string } {
  const s = (logInfo.status || "").toUpperCase();
  const total = logInfo.total_jobs ?? 0;
  if (s === "PENDING") {
    return {
      primary: t("COMPUTE_STATUS_PENDING", "Pending"),
      secondary: `${logInfo.total_pending ?? 0} ${t("OF", "of")} ${total}`,
      tone: "pending",
    };
  }
  if (s === "IN-PROGRESS") {
    return {
      primary: t("COMPUTE_STATUS_IN_PROGRESS", "In progress"),
      secondary: `${logInfo.total_executed ?? 0} ${t("OF", "of")} ${total}`,
      tone: "inprogress",
    };
  }
  if (s === "DONE" || s === "COMPLETED") {
    return {
      primary: t("COMPUTE_STATUS_COMPLETED", "Completed"),
      secondary: String(total),
      tone: "done",
    };
  }
  if (s === "CANCELLED") {
    return {
      primary: t("COMPUTE_STATUS_CANCELLED", "Cancelled"),
      secondary: `${logInfo.total_failed ?? 0} ${t("OF", "of")} ${total}`,
      tone: "cancelled",
    };
  }
  if (s === "DELETED") {
    return {
      primary: t("COMPUTE_STATUS_DELETED", "Deleted"),
      secondary: `${logInfo.total_failed ?? 0} ${t("OF", "of")} ${total}`,
      tone: "deleted",
    };
  }
  return {
    primary: logInfo.status?.trim() || "—",
    secondary: "",
    tone: "default",
  };
}

function statusCellClass(tone: string): string {
  switch (tone) {
    case "pending":
      return "bg-[color:color-mix(in_srgb,var(--color-warning)_40%,var(--color-surface))] text-text";
    case "inprogress":
      return "bg-info text-on-primary";
    case "done":
      return "bg-success text-on-primary";
    case "cancelled":
      return "bg-surface-muted text-text";
    case "deleted":
      return "bg-error text-on-primary";
    default:
      return "bg-surface-muted text-text";
  }
}

export type UseComputeLogInfoSummaryGridColumnsParams = {
  t: (code: string, fallback?: string) => string;
  areaNameByKey: Map<string, string>;
};

export function useComputeLogInfoSummaryGridColumns({
  t,
  areaNameByKey,
}: UseComputeLogInfoSummaryGridColumnsParams): EditableGridColumnDef<ComputeLogInfo>[] {
  return useMemo((): EditableGridColumnDef<ComputeLogInfo>[] => {
    const selectionsCountLabel = t("SELECTIONS_COUNT", "{count} selection(s)");

    return [
      {
        id: "id",
        layout: { width: 1, unit: "%" },
        header: t("ID"),
        filterCell: null,
        cell: ({ row }) => <span className="text-text">{row.id}</span>,
      },
      {
        id: "log_name",
        layout: { width: 6, unit: "%" },
        header: t("LOG_NAME", "Log name"),
        filterCell: null,
        tdExtraProps: { className: "max-w-0 overflow-hidden" },
        cell: ({ row }) => (
          <SideNavTruncatingLabel
            text={formatLogDisplayName(row)}
            className="block min-w-0 truncate text-xs leading-tight text-text"
          />
        ),
      },
      {
        id: "type",
        layout: { width: 5, unit: "%" },
        header: t("TYPE", "Type"),
        filterCell: null,
        cell: ({ row }) => (
          <span className="text-text">{executionTypeLabel(row, t)}</span>
        ),
      },
      {
        id: "area_level",
        layout: { width: 6, unit: "%" },
        header: t("AREA_LEVEL", "Area level"),
        filterCell: null,
        cell: ({ row }) => {
          const label =
            row.area_level_name?.trim() &&
            String(row.area_level_name).toLowerCase() !== "all"
              ? row.area_level_name
              : t("ALL", "All");
          return <span className="text-text">{label}</span>;
        },
      },
      {
        id: "areas",
        layout: { width: 9, unit: "%" },
        header: t("AREAS_UNDER", "Areas under"),
        filterCell: null,
        tdExtraProps: { className: "max-w-0 overflow-hidden" },
        cell: ({ row }) => {
          const areaSummaryItems = logAreaListEntries(row, t, areaNameByKey).map(
            (entry) => ({
              label: entry.name,
              modalDetail:
                entry.key.toLowerCase() === "all" || entry.key === entry.name
                  ? undefined
                  : entry.key,
            })
          );
          return (
            <LogSummaryTruncatedListCell
              items={areaSummaryItems}
              fallbackDisplay={formatLogAreasDisplay(row, t, areaNameByKey)}
              modalTitle={t("AREAS_UNDER", "Areas under")}
              modalTitleId="dm-log-summary-areas-title"
              seeMoreAriaLabel={t(
                "COMPUTE_LOG_AREAS_SEE_MORE_ARIA",
                "View full list of areas"
              )}
              modalCountLabel={selectionsCountLabel}
              t={t}
            />
          );
        },
      },
      {
        id: "target_ius",
        layout: { width: 27, unit: "%" ,main: true},
        header: t("SELECT_TARGET_INDICATORS", "Target indicators"),
        filterCell: null,
        tdExtraProps: { className: "max-w-0 overflow-hidden" },
        cell: ({ row }) => (
          <LogSummaryTruncatedListCell
            items={logTargetIusListItems(row)}
            fallbackDisplay={formatLogTargetIusDisplay(row)}
            modalTitle={t("SELECT_TARGET_INDICATORS", "Target indicators")}
            modalTitleId="dm-log-summary-ius-title"
            seeMoreAriaLabel={t(
              "TARGET_IUS_SEE_MORE_ARIA",
              "View full list of target indicator unit subgroups"
            )}
            modalCountLabel={selectionsCountLabel}
            t={t}
          />
        ),
      },
      {
        id: "time",
        layout: { width: 7, unit: "%" },
        header: t("TIME", "Time"),
        filterCell: null,
        tdExtraProps: { className: "max-w-0 overflow-hidden" },
        cell: ({ row }) => (
          <LogSummaryTruncatedListCell
            items={logTimeListItems(row, t)}
            fallbackDisplay={formatLogTimeperiodsDisplay(row, t)}
            modalTitle={t("TIME", "Time")}
            modalTitleId="dm-log-summary-time-title"
            seeMoreAriaLabel={t(
              "COMPUTE_LOG_TIME_SEE_MORE_ARIA",
              "View full list of time periods"
            )}
            modalCountLabel={selectionsCountLabel}
            t={t}
          />
        ),
      },
      {
        id: "status",
        layout: { width: 7, unit: "%" },
        header: t("COMPUTE_EXEC_COL_STATUS", "Status"),
        filterCell: null,
        cell: ({ row }) => {
          const status = logStatusCell(row, t);
          return (
            <div
              className={`rounded-sm px-1 py-0.5 ${statusCellClass(status.tone)}`}
            >
              <div>{status.primary}</div>
              {status.secondary ? (
                <div className="text-[11px] opacity-90">{status.secondary}</div>
              ) : null}
            </div>
          );
        },
      },
      {
        id: "start",
        layout: { width: 10, unit: "%" },
        header: t("COMPUTE_EXEC_COL_START", "Start Time"),
        filterCell: null,
        cell: ({ row }) => formatLegacyDateTime(row.created_at),
      },
      {
        id: "duration",
        layout: { width: 6, unit: "%" },
        header: t("COMPUTE_EXEC_COL_DURATION", "Duration"),
        filterCell: null,
        cell: ({ row }) => row.duration_display?.trim() || "—",
      },
      {
        id: "end",
        layout: { width: 10, unit: "%" },
        header: t("COMPUTE_EXEC_COL_END", "End Time"),
        filterCell: null,
        cell: ({ row }) => formatLegacyDateTime(row.completed_at),
      },
    ];
  }, [areaNameByKey, t]);
}
