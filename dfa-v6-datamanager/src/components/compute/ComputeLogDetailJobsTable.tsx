"use client";

import { useMemo, useState } from "react";
import { SideNavTruncatingLabel } from "@/components/SideNavListColumn";
import {
  EditableDataGridBody,
  EditableDataGridThead,
  InlineEditableTable,
} from "@/components/TableView";
import type {
  ComputeLogDetailRow,
  ComputeLogSourceDetailRow,
} from "@/lib/api/computeExecutionLogs";
import {
  COMPUTE_LOG_DETAIL_JOBS_COL_COUNT,
  useComputeLogDetailJobsGridColumns,
} from "@/lib/compute/computeLogDetailJobsGridColumns";
import { normalizeLogDetailRow } from "@/lib/compute/logDetailRows";

function formatDataValue(value: string | number | null | undefined): string {
  if (value == null || value === "") return "—";
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return "—";
  return String(n);
}

const SOURCE_DETAIL_COLUMNS = [
  {
    id: "indicator",
    labelKey: "INDICATOR",
    fallback: "Indicator",
    th: "w-[14rem] min-w-[14rem] max-w-[min(240px,38vw)] box-border",
    td: "w-[14rem] min-w-[14rem] max-w-[min(240px,38vw)] box-border",
    truncate: true,
  },
  {
    id: "unit",
    labelKey: "UNIT",
    fallback: "Unit",
    th: "w-[5rem] min-w-[5rem] max-w-[5rem] box-border",
    td: "w-[5rem] min-w-[5rem] max-w-[5rem] box-border",
    truncate: true,
  },
  {
    id: "subgroup",
    labelKey: "SUBGROUP",
    fallback: "Subgroup",
    th: "w-[5rem] min-w-[5rem] max-w-[5rem] box-border",
    td: "w-[5rem] min-w-[5rem] max-w-[5rem] box-border",
    truncate: false,
  },
  {
    id: "area",
    labelKey: "AREA",
    fallback: "Area",
    th: "w-[4.25rem] min-w-[4.25rem] max-w-[4.25rem] box-border",
    td: "w-[4.25rem] min-w-[4.25rem] max-w-[4.25rem] box-border",
    truncate: true,
  },
  {
    id: "time",
    labelKey: "TIME",
    fallback: "Time",
    th: "w-[3.25rem] min-w-[3.25rem] max-w-[3.25rem] box-border whitespace-nowrap",
    td: "w-[3.25rem] min-w-[3.25rem] max-w-[3.25rem] box-border whitespace-nowrap",
    truncate: false,
  },
  {
    id: "source",
    labelKey: "SOURCE",
    fallback: "Source",
    th: "w-[5.5rem] min-w-[5.5rem] max-w-[min(120px,22vw)] box-border",
    td: "w-[5.5rem] min-w-[5.5rem] max-w-[min(120px,22vw)] box-border",
    truncate: true,
  },
  {
    id: "data_value",
    labelKey: "DATA_VALUE",
    fallback: "Data value",
    th: "w-[4.5rem] min-w-[4.5rem] max-w-[4.5rem] box-border whitespace-nowrap",
    td: "w-[4.5rem] min-w-[4.5rem] max-w-[4.5rem] box-border whitespace-nowrap",
    truncate: false,
  },
] as const;

function SourceDetailsTable({
  rows,
  t,
}: {
  rows: ComputeLogSourceDetailRow[];
  t: (code: string, fallback?: string) => string;
}) {
  if (rows.length === 0) {
    return (
      <p className="px-2 py-1.5 text-xs text-text-muted">
        {t("COMPUTE_LOG_NO_SOURCE_DETAILS", "No source rows.")}
      </p>
    );
  }
  return (
    <div className="tv-grid-wrap overflow-x-auto rounded border border-border bg-surface">
      <table className="tv-grid-table tv-grid-compute-log-detail tv-grid-compute-log-source-detail min-w-[640px]">
        <thead>
          <tr>
            {SOURCE_DETAIL_COLUMNS.map((col) => (
              <th
                key={col.id}
                className={`bg-surface-muted ${col.th}`}
              >
                {t(col.labelKey, col.fallback)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="text-xs">
          {rows.map((src, idx) => (
            <tr key={idx} data-tv-body-row="true">
              {SOURCE_DETAIL_COLUMNS.map((col) => {
                const raw =
                  col.id === "indicator"
                    ? src.iname
                    : col.id === "unit"
                      ? src.uname
                      : col.id === "subgroup"
                        ? src.sname
                        : col.id === "area"
                          ? src.area
                          : col.id === "time"
                            ? src.timeperiod
                            : col.id === "source"
                              ? src.source
                              : formatDataValue(src.dv);
                const text = raw || "—";
                const tdClass =
                  col.id === "data_value"
                    ? `${col.td} tabular-nums`
                    : col.td;
                return (
                  <td
                    key={col.id}
                    className={`!text-xs px-2 py-1 text-text ${tdClass}`}
                  >
                    {col.truncate ? (
                      <SideNavTruncatingLabel
                        text={text}
                        className="block min-w-0 truncate text-xs leading-tight text-text"
                      />
                    ) : (
                      text
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function ComputeLogDetailJobsTable({
  rows,
  totalCount,
  t,
}: {
  rows: ComputeLogDetailRow[];
  totalCount: number;
  t: (code: string, fallback?: string) => string;
}) {
  const [openRowIds, setOpenRowIds] = useState<Set<string>>(() => new Set());

  const normalizedRows = useMemo(
    () => rows.map((row) => normalizeLogDetailRow(row)),
    [rows]
  );

  const toggleRow = (id: number) => {
    const key = String(id);
    setOpenRowIds((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const columns = useComputeLogDetailJobsGridColumns({
    t,
    openRowIds,
    onToggleRow: toggleRow,
  });

  const footer =
    totalCount > 0 ? (
      <p className="shrink-0 px-2 pb-1 pt-1 text-right text-xs text-text-muted">
        {t("COMPUTE_LOG_SHOWING_RECORDS", "Showing {shown} out of {total} records")
          .replace("{shown}", String(normalizedRows.length))
          .replace("{total}", String(totalCount))}
      </p>
    ) : null;

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
      <InlineEditableTable
        wrapClassName="tbl-wrap flex min-h-0 min-w-0 flex-1 flex-col"
        scrollClassName="tbl-scroll min-h-0 min-w-0 flex-1 rounded border border-border bg-surface"
        tableClassName="tv-grid-compute-log-detail min-w-[960px]"
        tableAriaLabel={t("COMPUTE_LOG_JOBS_TABLE", "Log job rows")}
        disableGlobalArrowNavigation
        thead={
          <thead>
            <EditableDataGridThead columns={columns} showFilterRow={false} />
          </thead>
        }
        tbody={
          <tbody className="text-xs">
            <EditableDataGridBody
              rows={normalizedRows}
              columns={columns}
              getRowId={(row) => String(row.id)}
              editingRowId={null}
              renderAfterRow={({ row, rowId }) => {
                if (!openRowIds.has(rowId)) return null;
              const hasSources = row.source_details.length > 0;
              return (
                  <tr className="border-b border-border bg-surface-muted/25">
                    <td
                      colSpan={COMPUTE_LOG_DETAIL_JOBS_COL_COUNT}
                      className="!p-0 align-top"
                    >
                      <div className="border-t border-border px-2 py-2 pl-6">
                        {hasSources ? (
                          <SourceDetailsTable
                            rows={row.source_details}
                            t={t}
                          />
                        ) : (
                          <p className="text-xs text-text-muted">
                            {t(
                              "COMPUTE_LOG_NO_SOURCE_DETAILS",
                              "No source rows."
                            )}
                          </p>
                        )}
                      </div>
                      </td>
                    </tr>
              );
              }}
            />
          </tbody>
        }
        footer={footer}
      />
    </div>
  );
}
