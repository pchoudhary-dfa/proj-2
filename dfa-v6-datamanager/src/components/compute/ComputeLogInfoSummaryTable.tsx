"use client";

import {
  EditableDataGridBody,
  EditableDataGridThead,
  InlineEditableTable,
} from "@/components/TableView";
import type { ComputeLogInfo } from "@/lib/api/computeExecutionLogs";
import { useComputeLogInfoSummaryGridColumns } from "@/lib/compute/computeLogInfoSummaryGridColumns";

export function ComputeLogInfoSummaryTable({
  logInfo,
  areaNameByKey,
  t,
}: {
  logInfo: ComputeLogInfo;
  areaNameByKey: Map<string, string>;
  t: (code: string, fallback?: string) => string;
}) {
  const columns = useComputeLogInfoSummaryGridColumns({ t, areaNameByKey });
  const rows = [logInfo];

  return (
    <InlineEditableTable
      wrapClassName="tbl-wrap min-w-0 shrink-0"
      scrollClassName="tbl-scroll overflow-x-auto rounded border border-border bg-surface"
      tableClassName="tv-grid-table tv-grid-compute-log-detail tv-grid-compute-log-summary w-full min-w-[960px]"
      tableAriaLabel={t("COMPUTE_LOG_SUMMARY_TABLE", "Log summary")}
      disableGlobalArrowNavigation
      thead={
        <thead>
          <EditableDataGridThead columns={columns} showFilterRow={false} />
        </thead>
      }
      tbody={
        <tbody className="text-xs">
          <EditableDataGridBody
            rows={rows}
            columns={columns}
            getRowId={(row) => String(row.id)}
            editingRowId={null}
          />
        </tbody>
      }
    />
  );
}
