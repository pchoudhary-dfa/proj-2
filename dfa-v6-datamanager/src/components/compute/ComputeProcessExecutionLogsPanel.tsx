"use client";

import {
  Fragment,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { toast } from "sonner";
import { DeletePermanentConfirmModal } from "@/components/DeletePermanentConfirmModal";
import { ExpandChevronButton } from "@/components/ExpandChevronButton";
import {
  DUAL_ACTION_COLUMN_WIDTH,
  DUAL_ACTION_COLUMN_LAYOUT,
  TV_COL_ACTIONS_TD_DUAL,
  TV_GRID_CONFIGURE_BTN,
  TV_GRID_CONFIGURE_LABELED_BTN,
} from "@/components/editableGridColumnClasses";
import type { ComputeProcessListItem } from "@/lib/api/computeProcess";
import {
  deleteComputeExecutionLog,
  deleteComputeProcessTime,
  formatProcessTimeDisplay,
  formatProcessTimeExecutionName,
  listProcessTimeperiods,
  listTimeLogsForProcessTime,
  reExecuteProcessTime,
  type ComputeProcessTimeLogRow,
  type ComputeProcessTimeperiodRow,
} from "@/lib/api/computeExecutionLogs";
import { formatLogDisplayName } from "@/lib/compute/formatLogDisplayName";

/** Legacy Laravel grid: ``d M Y, H:i`` (e.g. ``14 Oct 2024, 06:26``). */
function formatLegacyDateTime(raw: string | null): string {
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

function formatDurationMs(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return "—";
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function logDuration(log: ComputeProcessTimeLogRow): string {
  const start = log.created_at ? new Date(log.created_at).getTime() : NaN;
  const end = log.completed_at
    ? new Date(log.completed_at).getTime()
    : log.updated_at
      ? new Date(log.updated_at).getTime()
      : NaN;
  if (!Number.isFinite(start) || !Number.isFinite(end)) return "—";
  return formatDurationMs(end - start);
}

function statusBadgeClass(status: string | null): string {
  const s = (status || "").toUpperCase();
  if (s === "DONE" || s === "COMPLETED")
    return "bg-emerald-500/15 text-emerald-800 dark:text-emerald-200";
  if (s === "IN-PROGRESS" || s === "PENDING")
    return "bg-amber-500/15 text-amber-900 dark:text-amber-100";
  if (s === "FAILED" || s === "CANCELLED" || s === "DELETED")
    return "bg-rose-500/15 text-rose-900 dark:text-rose-100";
  return "bg-surface-muted text-text-muted";
}

function formatRunStatusLabel(
  status: string | null,
  t: (code: string, fallback?: string) => string
): string {
  const s = (status || "").toUpperCase();
  if (s === "DONE")
    return t("COMPUTE_STATUS_COMPLETED", "Completed");
  if (s === "IN-PROGRESS")
    return t("COMPUTE_STATUS_IN_PROGRESS", "In progress");
  if (s === "PENDING") return t("COMPUTE_STATUS_PENDING", "Pending");
  if (s === "CANCELLED")
    return t("COMPUTE_STATUS_CANCELLED", "Cancelled");
  if (s === "DELETED") return t("COMPUTE_STATUS_DELETED", "Deleted");
  return status?.trim() || "—";
}

export function ComputeProcessExecutionLogsPanel({
  dwId,
  locale,
  process,
  colSpan,
  t,
  canDelete = true,
  onReExecuteSuccess,
}: {
  dwId: string;
  locale: string;
  process: ComputeProcessListItem;
  colSpan: number;
  t: (code: string, fallback?: string) => string;
  canDelete?: boolean;
  onReExecuteSuccess?: () => void;
}) {
  const [tpLoading, setTpLoading] = useState(true);
  const [tpError, setTpError] = useState<string | null>(null);
  const [timeperiods, setTimeperiods] = useState<ComputeProcessTimeperiodRow[]>(
    []
  );

  const [openTimeKeys, setOpenTimeKeys] = useState<Set<string>>(() => new Set());
  const [logsByTimeKey, setLogsByTimeKey] = useState<
    Record<string, ComputeProcessTimeLogRow[] | "loading" | "error">
  >({});
  const [logsErrorByKey, setLogsErrorByKey] = useState<Record<string, string>>(
    {}
  );
  const logsCacheRef = useRef<Record<string, ComputeProcessTimeLogRow[]>>({});

  const [logDeleteTarget, setLogDeleteTarget] = useState<{
    log: ComputeProcessTimeLogRow;
    timeKey: string;
  } | null>(null);
  const [logDeleteLoading, setLogDeleteLoading] = useState(false);

  const [timeDeleteTarget, setTimeDeleteTarget] =
    useState<ComputeProcessTimeperiodRow | null>(null);
  const [timeDeleteLoading, setTimeDeleteLoading] = useState(false);

  const [reExecuting, setReExecuting] = useState<number | null>(null);

  const loadTimeperiods = useCallback(async () => {
    if (!dwId) return;
    setTpLoading(true);
    setTpError(null);
    const res = await listProcessTimeperiods(dwId, process.id, locale);
    setTpLoading(false);
    if (!res.ok) {
      setTpError(res.message);
      setTimeperiods([]);
      return;
    }
    setTimeperiods(res.timeperiods);
  }, [dwId, process.id, locale]);

  useEffect(() => {
    void loadTimeperiods();
  }, [loadTimeperiods]);

  const timeRowKey = (row: ComputeProcessTimeperiodRow) =>
    String(row.process_time_id);

  const ensureLogsLoaded = useCallback(
    async (row: ComputeProcessTimeperiodRow) => {
      const key = timeRowKey(row);
      const cached = logsCacheRef.current[key];
      if (cached) {
        setLogsByTimeKey((prev) => ({ ...prev, [key]: cached }));
        return;
      }
      setLogsByTimeKey((prev) => ({ ...prev, [key]: "loading" }));
      setLogsErrorByKey((prev) => {
        const n = { ...prev };
        delete n[key];
        return n;
      });
      const res = await listTimeLogsForProcessTime(
        dwId,
        row.process_time_id,
        locale
      );
      if (!res.ok) {
        setLogsByTimeKey((prev) => ({ ...prev, [key]: "error" }));
        setLogsErrorByKey((prev) => ({ ...prev, [key]: res.message }));
        return;
      }
      logsCacheRef.current[key] = res.logs;
      setLogsByTimeKey((prev) => ({ ...prev, [key]: res.logs }));
    },
    [dwId, locale]
  );

  const toggleTimeRow = useCallback(
    (row: ComputeProcessTimeperiodRow) => {
      const key = timeRowKey(row);
      setOpenTimeKeys((prev) => {
        const next = new Set(prev);
        if (next.has(key)) next.delete(key);
        else {
          next.add(key);
          void ensureLogsLoaded(row);
        }
        return next;
      });
    },
    [ensureLogsLoaded]
  );

  const openLogInNewTab = useCallback(
    (logId: number) => {
      const path = `/${locale}/${dwId}/compute-engine/execute/logs/${logId}`;
      window.open(path, "_blank", "noopener,noreferrer");
    },
    [dwId, locale]
  );

  const removeLogFromCaches = useCallback(
    (timeKey: string, logId: number) => {
      const list = logsCacheRef.current[timeKey];
      if (list) {
        logsCacheRef.current[timeKey] = list.filter((l) => l.id !== logId);
        setLogsByTimeKey((prev) => {
          const cur = prev[timeKey];
          if (!Array.isArray(cur)) return prev;
          return {
            ...prev,
            [timeKey]: cur.filter((l) => l.id !== logId),
          };
        });
      }
    },
    []
  );

  const onConfirmDeleteProcessTime = useCallback(async () => {
    if (!dwId || !timeDeleteTarget) return;
    setTimeDeleteLoading(true);
    const res = await deleteComputeProcessTime(
      dwId,
      timeDeleteTarget.process_time_id,
      locale
    );
    setTimeDeleteLoading(false);
    if (!res.ok) {
      toast.error(res.message);
      return;
    }
    const key = timeRowKey(timeDeleteTarget);
    delete logsCacheRef.current[key];
    setLogsByTimeKey((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
    setOpenTimeKeys((prev) => {
      const next = new Set(prev);
      next.delete(key);
      return next;
    });
    setTimeperiods((prev) =>
      prev.filter((r) => r.process_time_id !== timeDeleteTarget.process_time_id)
    );
    toast.success(t("COMPUTE_PROCESS_TIME_DELETED", "Run deleted."));
    setTimeDeleteTarget(null);
    onReExecuteSuccess?.();
  }, [dwId, locale, onReExecuteSuccess, t, timeDeleteTarget]);

  const onConfirmDeleteLog = useCallback(async () => {
    if (!dwId || !logDeleteTarget) return;
    setLogDeleteLoading(true);
    const res = await deleteComputeExecutionLog(
      dwId,
      logDeleteTarget.log.id,
      locale
    );
    setLogDeleteLoading(false);
    if (!res.ok) {
      toast.error(res.message);
      return;
    }
    removeLogFromCaches(logDeleteTarget.timeKey, logDeleteTarget.log.id);
    toast.success(t("LOG_DELETED"));
    setLogDeleteTarget(null);
  }, [dwId, locale, logDeleteTarget, removeLogFromCaches, t]);

  const onReExecute = useCallback(
    async (processTimeId: number) => {
      if (!dwId || reExecuting != null) return;
      setReExecuting(processTimeId);
      const res = await reExecuteProcessTime(dwId, processTimeId, locale);
      setReExecuting(null);
      if (!res.ok) {
        toast.error(res.message);
        return;
      }
      toast.success(
        t(
          "COMPUTE_REEXECUTE_STARTED",
          "Re-execution started."
        )
      );
      logsCacheRef.current = {};
      setLogsByTimeKey({});
      setLogsErrorByKey({});
      setOpenTimeKeys(new Set());
      await loadTimeperiods();
      onReExecuteSuccess?.();
    },
    [dwId, locale, loadTimeperiods, onReExecuteSuccess, reExecuting, t]
  );

  return (
    <>
    <tr className="compute-exec-logs-panel border-b border-border bg-surface-muted/30">
      <td colSpan={colSpan} className="!p-0 align-top">
        <div className="relative z-0 isolate border-t border-border px-2 py-2 pl-6">
          {tpLoading ? (
            <p className="text-xs text-text-muted">
              {t("COMPUTE_EXEC_LOGS_LOADING", "Loading execution history…")}
            </p>
          ) : tpError ? (
            <p className="text-xs text-rose-600 dark:text-rose-400">
              {tpError}
            </p>
          ) : timeperiods.length === 0 ? (
            <p className="text-xs text-text-muted">
              {t(
                "COMPUTE_EXEC_LOGS_EMPTY",
                "No runs yet. Execute this process to create logs."
              )}
            </p>
          ) : (
            <>
              <div className="relative z-0 isolate overflow-x-auto rounded border border-border bg-surface">
                <table className="w-full min-w-[480px] border-collapse text-left text-xs">
                  <thead>
                    <tr className="relative z-0 border-b border-border bg-surface-muted/80">
                      <th className="w-8 px-1 py-1.5" aria-hidden />
                      <th className="w-[1%] whitespace-nowrap px-2 py-1.5 font-medium text-text-muted">
                        {t("ID")}
                      </th>
                      <th className="px-2 py-1.5 font-medium text-text-muted">
                        {t("EXECUTION_NAME")}
                      </th>
                      <th className="px-2 py-1.5 font-medium text-text-muted">
                        {t("COMPUTE_EXEC_COL_TIME", "Time")}
                      </th>
                      <th className="px-2 py-1.5 font-medium text-text-muted">
                        {t("CREATED_AT")}
                      </th>
                      <th
                        className="whitespace-nowrap px-2 py-1.5 text-center font-medium text-text-muted"
                        style={{
                          width: DUAL_ACTION_COLUMN_WIDTH,
                          minWidth: DUAL_ACTION_COLUMN_WIDTH,
                          maxWidth: DUAL_ACTION_COLUMN_WIDTH,
                        }}
                      >
                        {t("ACTION", "Action")}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {timeperiods.map((row) => {
                      const key = timeRowKey(row);
                      const open = openTimeKeys.has(key);
                      const logsState = logsByTimeKey[key];
                      const timeLabel = formatProcessTimeDisplay(row);
                      return (
                        <Fragment key={key}>
                          <tr className="border-b border-border/80 hover:bg-surface-muted/40">
                            <td className="add-row-actions-center w-8 min-w-8 max-w-8 px-0.5 py-1 align-middle">
                              <div className="add-row-action-btns">
                                <ExpandChevronButton
                                  expanded={open}
                                  expandAriaLabel={t("EXPAND", "Expand")}
                                  collapseAriaLabel={t("COLLAPSE", "Collapse")}
                                  onClick={() => toggleTimeRow(row)}
                                />
                              </div>
                            </td>
                            <td className="whitespace-nowrap px-2 py-1 align-middle tabular-nums">
                              {row.process_time_id}
                            </td>
                            <td className="max-w-[200px] px-2 py-1 align-middle text-text">
                              <span className="block min-w-0 truncate" title={formatProcessTimeExecutionName(row)}>
                                {formatProcessTimeExecutionName(row)}
                              </span>
                            </td>
                            <td className="px-2 py-1 align-middle text-text">
                              {timeLabel}
                            </td>
                            <td className="px-2 py-1 align-middle">
                              {formatLegacyDateTime(row.created_at)}
                            </td>
                            <td
                              className={`${TV_COL_ACTIONS_TD_DUAL} px-2 py-1 text-center align-middle whitespace-nowrap`}
                            >
                              <div className="add-row-action-btns">
                                <button
                                  type="button"
                                  className={TV_GRID_CONFIGURE_LABELED_BTN}
                                  title={
                                    reExecuting === row.process_time_id
                                      ? t(
                                          "COMPUTE_EXEC_REEXECUTING",
                                          "Starting…"
                                        )
                                      : t("COMPUTE_EXEC_RERUN_LABEL", "Rerun")
                                  }
                                  aria-label={
                                    reExecuting === row.process_time_id
                                      ? t(
                                          "COMPUTE_EXEC_REEXECUTING",
                                          "Starting…"
                                        )
                                      : t("COMPUTE_EXEC_RERUN_LABEL", "Rerun")
                                  }
                                  disabled={reExecuting === row.process_time_id}
                                  onClick={() =>
                                    void onReExecute(row.process_time_id)
                                  }
                                >
                                  <span className="material-icons !text-sm" aria-hidden="true">
                                    refresh
                                  </span>
                                  {reExecuting === row.process_time_id
                                    ? t("COMPUTE_EXEC_REEXECUTING", "Starting…")
                                    : t("COMPUTE_EXEC_RERUN_LABEL", "Rerun")}
                                </button>
                                {canDelete ? (
                                  <button
                                    type="button"
                                    className={TV_GRID_CONFIGURE_BTN}
                                    title={t(
                                      "COMPUTE_EXEC_TIME_DELETE_ARIA",
                                      "Delete run"
                                    )}
                                    aria-label={t(
                                      "COMPUTE_EXEC_TIME_DELETE_ARIA",
                                      "Delete run"
                                    )}
                                    disabled={timeDeleteLoading}
                                    onClick={() => setTimeDeleteTarget(row)}
                                  >
                                    <span
                                      className="material-icons !text-sm"
                                      aria-hidden="true"
                                    >
                                      delete
                                    </span>
                                  </button>
                                ) : null}
                              </div>
                            </td>
                          </tr>
                          {open ? (
                            <tr className="bg-surface-muted/25">
                              <td colSpan={6} className="px-2 py-2 align-top">
                                {logsState === "loading" ||
                                logsState === undefined ? (
                                  <p className="text-xs text-text-muted">
                                    {t("COMPUTE_EXEC_LOGS_LOADING", "Loading execution history…")}
                                  </p>
                                ) : logsState === "error" ? (
                                  <p className="text-xs text-rose-600">
                                    {logsErrorByKey[key] ||
                                      t("COMPUTE_EXEC_LOGS_ERROR", "Could not load logs.")}
                                  </p>
                                ) : logsState.length === 0 ? (
                                  <p className="text-xs text-text-muted">
                                    {t(
                                      "COMPUTE_EXEC_NO_RUN_LOGS",
                                      "No execution logs for this run."
                                    )}
                                  </p>
                                ) : (
                                  <div className="relative z-0 isolate overflow-x-auto rounded border border-border bg-surface">
                                    <table className="w-full min-w-[720px] border-collapse text-left text-xs">
                                      <thead>
                                        <tr className="relative z-0 border-b border-border bg-surface-muted/80">
                                          <th className="px-2 py-1 font-medium text-text-muted">
                                            {t("COMPUTE_EXEC_COL_LOG_NAME", "Log name")}
                                          </th>
                                          <th className="px-2 py-1 font-medium text-text-muted">
                                            {t("COMPUTE_EXEC_COL_STATUS", "Status")}
                                          </th>
                                          <th className="px-2 py-1 font-medium text-text-muted">
                                            {t("COMPUTE_EXEC_COL_JOBS", "Jobs")}
                                          </th>
                                          <th className="px-2 py-1 font-medium text-text-muted">
                                            {t("COMPUTE_EXEC_COL_FAILED", "Failed")}
                                          </th>
                                          <th className="px-2 py-1 font-medium text-text-muted">
                                            {t("COMPUTE_EXEC_COL_START", "Start Time")}
                                          </th>
                                          <th className="px-2 py-1 font-medium text-text-muted">
                                            {t("COMPUTE_EXEC_COL_DURATION", "Duration")}
                                          </th>
                                          <th className="px-2 py-1 font-medium text-text-muted">
                                            {t("COMPUTE_EXEC_COL_END", "End Time")}
                                          </th>
                                          <th className="px-2 py-1 font-medium text-text-muted">
                                            {t("COMPUTE_EXEC_COL_REMARKS", "Remarks")}
                                          </th>
                                          <th
                                            className="whitespace-nowrap px-2 py-1 text-center font-medium text-text-muted"
                                            style={{
                                              width: DUAL_ACTION_COLUMN_WIDTH,
                                              minWidth: DUAL_ACTION_COLUMN_WIDTH,
                                              maxWidth: DUAL_ACTION_COLUMN_WIDTH,
                                            }}
                                          >
                                            {t("ACTION", "Action")}
                                          </th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {logsState.map((log, logIndex) => (
                                          <tr
                                            key={log.id}
                                            className="border-b border-border/70"
                                          >
                                            <td className="px-2 py-1 align-middle text-text">
                                              {formatLogDisplayName(log, logIndex)}
                                            </td>
                                            <td className="px-2 py-1 align-middle">
                                              <span
                                                className={`inline-flex rounded px-1.5 py-0.5 text-xs font-semibold ${statusBadgeClass(log.status)}`}
                                              >
                                                {formatRunStatusLabel(log.status, t)}
                                              </span>
                                            </td>
                                            <td className="px-2 py-1 align-middle tabular-nums text-text">
                                              {log.total_jobs ?? "—"}
                                            </td>
                                            <td className="px-2 py-1 align-middle tabular-nums text-text">
                                              {log.total_failed ?? "—"}
                                            </td>
                                            <td className="px-2 py-1 align-middle whitespace-nowrap">
                                              {formatLegacyDateTime(
                                                log.created_at
                                              )}
                                            </td>
                                            <td className="px-2 py-1 align-middle tabular-nums">
                                              {logDuration(log)}
                                            </td>
                                            <td className="px-2 py-1 align-middle whitespace-nowrap">
                                              {formatLegacyDateTime(
                                                log.completed_at
                                              )}
                                            </td>
                                            <td className="max-w-[180px] px-2 py-1 align-middle break-words">
                                              {log.remarks?.trim()
                                                ? log.remarks
                                                : "—"}
                                            </td>
                                            <td
                                              className={`${TV_COL_ACTIONS_TD_DUAL} px-2 py-1 text-right align-middle whitespace-nowrap`}
                                            >
                                              <div className="add-row-action-btns justify-end">
                                                <button
                                                  type="button"
                                                  className={TV_GRID_CONFIGURE_LABELED_BTN}
                                                  title={t(
                                                    "COMPUTE_EXEC_LOG_VIEW_ARIA",
                                                    "View log in new tab"
                                                  )}
                                                  aria-label={t(
                                                    "COMPUTE_EXEC_LOG_VIEW_ARIA",
                                                    "View log in new tab"
                                                  )}
                                                  onClick={() =>
                                                    openLogInNewTab(log.id)
                                                  }
                                                >
                                                  <span className="material-icons !text-sm" aria-hidden="true">
                                                    visibility
                                                  </span>
                                                  {t("VIEW", "View")}
                                                </button>
                                                {canDelete ? (
                                                  <button
                                                    type="button"
                                                    className={TV_GRID_CONFIGURE_BTN}
                                                    title={t(
                                                      "COMPUTE_EXEC_LOG_DELETE_ARIA",
                                                      "Delete log"
                                                    )}
                                                    aria-label={t(
                                                      "COMPUTE_EXEC_LOG_DELETE_ARIA",
                                                      "Delete log"
                                                    )}
                                                    disabled={logDeleteLoading}
                                                    onClick={() =>
                                                      setLogDeleteTarget({
                                                        log,
                                                        timeKey: key,
                                                      })
                                                    }
                                                  >
                                                    <span
                                                      className="material-icons !text-sm"
                                                      aria-hidden="true"
                                                    >
                                                      delete
                                                    </span>
                                                  </button>
                                                ) : null}
                                              </div>
                                            </td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  </div>
                                )}
                              </td>
                            </tr>
                          ) : null}
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </td>
    </tr>
    <DeletePermanentConfirmModal
      open={timeDeleteTarget != null}
      onClose={() => {
        if (!timeDeleteLoading) setTimeDeleteTarget(null);
      }}
      title={t("COMPUTE_EXEC_TIME_DELETE_TITLE", "Delete run")}
      titleId="dm-compute-exec-time-delete-title"
      closeAriaLabel={t("CLOSE")}
      dismissDisabled={timeDeleteLoading}
      cancelLabel={t("CANCEL", "Cancel")}
      onCancel={() => {
        if (!timeDeleteLoading) setTimeDeleteTarget(null);
      }}
      confirmLabel={t("DELETE", "Delete")}
      confirmLoadingLabel={t("DELETING", "Deleting…")}
      confirmLoading={timeDeleteLoading}
      onConfirm={onConfirmDeleteProcessTime}
    >
      <p className="modal-lead text-xs leading-relaxed text-text">
        {t(
          "COMPUTE_EXEC_TIME_DELETE_LEAD",
          "Delete this execution run and all of its logs? This cannot be undone."
        )}
      </p>
    </DeletePermanentConfirmModal>
    <DeletePermanentConfirmModal
      open={logDeleteTarget != null}
      onClose={() => {
        if (!logDeleteLoading) setLogDeleteTarget(null);
      }}
      title={t("COMPUTE_EXEC_LOG_DELETE_TITLE", "Delete execution log")}
      titleId="dm-compute-exec-log-delete-title"
      closeAriaLabel={t("CLOSE")}
      dismissDisabled={logDeleteLoading}
      cancelLabel={t("CANCEL", "Cancel")}
      onCancel={() => {
        if (!logDeleteLoading) setLogDeleteTarget(null);
      }}
      confirmLabel={t("DELETE", "Delete")}
      confirmLoadingLabel={t("DELETING", "Deleting…")}
      confirmLoading={logDeleteLoading}
      onConfirm={onConfirmDeleteLog}
    >
      <p className="modal-lead text-xs leading-relaxed text-text">
        {t(
          "COMPUTE_EXEC_LOG_DELETE_LEAD",
          "Remove “{name}” from your execution history? This cannot be undone from the UI."
        ).replace(
          "{name}",
          logDeleteTarget
            ? formatLogDisplayName(logDeleteTarget.log)
            : "—"
        )}
      </p>
    </DeletePermanentConfirmModal>
    </>
  );
}
