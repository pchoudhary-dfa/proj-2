"use client";

import { useCallback, useEffect, useId, useMemo, useState } from "react";
import { toast } from "sonner";
import { useCore } from "@/contexts/CoreContext";
import {
  executeComputeProcess,
  type ComputeProcessListItem,
} from "@/lib/api/computeProcess";
import { getRequest } from "@/lib/api/http";
import type { TimePeriodRaw, TimePeriodsListResponse } from "@/lib/api/types";
import {
  getDWAPIURL,
  REFERENCE_PATH_TIME_PERIODS,
} from "@/lib/constants";
import { Modal } from "@/components/Modal";
import { SecondaryButton } from "@/components/SecondaryButton";
import { PrimaryButton } from "@/components/PrimaryButton";
import { SearchInputBar } from "@/components/SearchInputBar";
import { textFieldClassName } from "@/components/TextField";

function defaultExecutionNameLabel(locale: string): string {
  try {
    const d = new Date();
    const formatted = new Intl.DateTimeFormat(locale, {
      dateStyle: "short",
      timeStyle: "short",
    }).format(d);
    return formatted;
  } catch {
    return new Date().toISOString().slice(0, 16).replace("T", " ");
  }
}

/** First non-blank string among API variants (external list often uses `tp_timeperiod`). */
function firstNonBlankStr(...candidates: unknown[]): string {
  for (const c of candidates) {
    if (c == null) continue;
    const s = String(c);
    if (s.trim()) return s;
  }
  return "";
}

/**
 * Align with time period admin page: list API may return `tp_*` keys or `id` without `timeperiod`.
 * Backend OpenAPI sort_field: tp_nid | timeperiod | startdate | enddate | periodicity.
 */
function normalizeTimePeriodListItem(raw: Record<string, unknown>): TimePeriodRaw {
  const idRaw = raw.id ?? raw.timeperiod_nid ?? raw.tp_nid;
  let id: number | undefined;
  if (typeof idRaw === "number" && Number.isFinite(idRaw)) id = idRaw;
  else if (typeof idRaw === "string" && idRaw.trim() !== "") {
    const n = Number(idRaw);
    if (!Number.isNaN(n)) id = n;
  }
  const tp = firstNonBlankStr(raw.tp_timeperiod, raw.timeperiod);
  return {
    ...raw,
    id,
    timeperiod: tp,
  };
}

/** Value sent to compute execute / used as checkbox key (timeperiod string, or nid string fallback). */
function rowTpValue(row: TimePeriodRaw): string {
  const tp = (row.timeperiod ?? "").trim();
  if (tp) return tp;
  if (row.id != null) return String(row.id);
  return "";
}

function tpLabel(row: TimePeriodRaw): string {
  const tp = (row.timeperiod ?? "").trim();
  if (tp) return tp;
  if (row.id != null) return String(row.id);
  return "";
}

export type ComputeExecuteProcessModalProps = {
  open: boolean;
  onClose: () => void;
  dwId: string;
  process: ComputeProcessListItem | null;
  onExecuted: () => void;
};

export function ComputeExecuteProcessModal({
  open,
  onClose,
  dwId,
  process,
  onExecuted,
}: ComputeExecuteProcessModalProps) {
  const { t, locale } = useCore();
  const titleId = useId();

  const [timeRows, setTimeRows] = useState<TimePeriodRaw[]>([]);
  const [tpLoading, setTpLoading] = useState(false);
  const [tpSearch, setTpSearch] = useState("");
  const [allTimePeriods, setAllTimePeriods] = useState(false);
  const [selectedTp, setSelectedTp] = useState<Set<string>>(new Set());
  const [executionName, setExecutionName] = useState("");
  const [executing, setExecuting] = useState(false);
  const [lastResult, setLastResult] = useState<{
    process_time_log_id: number;
    estimated_jobs: number;
    status: string;
  } | null>(null);

  const loadTimePeriods = useCallback(async () => {
    if (!dwId.trim()) return;
    setTpLoading(true);
    try {
      // Omit `page_size`: backend returns all rows in one response (see time_periods router).
      const sp = new URLSearchParams({
        sort_field: "timeperiod",
        sort_order: "asc",
      });
      const url = `${getDWAPIURL(dwId, REFERENCE_PATH_TIME_PERIODS)}?${sp.toString()}`;
      const json = (await getRequest(url, undefined, {
        suppressErrorMessage: true,
      })) as TimePeriodsListResponse;
      if (json.success !== true || !Array.isArray(json.data)) {
        setTimeRows([]);
        toast.error(
          t("TIME_PERIODS_LOAD_FAILED")
        );
        return;
      }
      setTimeRows(
        json.data.map((item) =>
          normalizeTimePeriodListItem(item as Record<string, unknown>)
        )
      );
    } catch {
      setTimeRows([]);
      toast.error(
        t("TIME_PERIODS_LOAD_FAILED")
      );
    } finally {
      setTpLoading(false);
    }
  }, [dwId, t]);

  useEffect(() => {
    if (!open || !process) return;
    setAllTimePeriods(false);
    setSelectedTp(new Set());
    setTpSearch("");
    setExecutionName(
      `${t("RUN")} ${defaultExecutionNameLabel(locale)}`
    );
    setLastResult(null);
    void loadTimePeriods();
  }, [open, process, loadTimePeriods, locale, t]);

  const toggleTp = useCallback((timeperiod: string) => {
    setSelectedTp((prev) => {
      const next = new Set(prev);
      if (next.has(timeperiod)) next.delete(timeperiod);
      else next.add(timeperiod);
      return next;
    });
  }, []);

  const filteredTimeRows = useMemo(() => {
    const q = tpSearch.trim().toLowerCase();
    if (!q) return timeRows;
    return timeRows.filter((row) =>
      tpLabel(row).toLowerCase().includes(q)
    );
  }, [timeRows, tpSearch]);

  const executionNameOk = executionName.trim().length > 0;

  const timeperiodsPayload = useMemo(() => {
    if (allTimePeriods) return { ids: ["all"] as string[], names: [] as string[] };
    const ids = [...selectedTp];
    const names = ids.map((id) => {
      const row = timeRows.find((r) => rowTpValue(r) === id);
      return row ? tpLabel(row) : id;
    });
    return { ids, names };
  }, [allTimePeriods, selectedTp, timeRows]);

  const handleExecute = async () => {
    if (!process || !dwId.trim()) return;
    const { ids, names } = timeperiodsPayload;
    if (!allTimePeriods && ids.length === 0) {
      toast.error(
        t(
          "COMPUTE_EXECUTE_PICK_TP",
          "Select at least one time period, or turn on “All time periods”."
        )
      );
      return;
    }
    if (!executionNameOk) {
      toast.error(
        t(
          "COMPUTE_EXECUTE_RUN_NAME_REQUIRED",
          "Enter an execution name (required by the server)."
        )
      );
      return;
    }

    setExecuting(true);
    setLastResult(null);
    const res = await executeComputeProcess(
      dwId,
      process.id,
      {
        timeperiods: ids,
        timeperiodsName: names.length ? names : undefined,
        name: executionName.trim(),
      },
      locale
    );
    setExecuting(false);
    if (!res.ok) {
      toast.error(res.message);
      return;
    }
    setLastResult({
      process_time_log_id: res.data.process_time_log_id,
      estimated_jobs: res.data.estimated_jobs,
      status: res.data.status,
    });
    toast.success(
      t(
        "COMPUTE_EXECUTE_STARTED",
        "Compute execution started. Jobs are running in the background."
      )
    );
    onExecuted();
  };

  if (!process) return null;

  return (
    <Modal
      open={open}
      onClose={() => {
        if (executing) return;
        onClose();
      }}
      title={t("EXECUTE_COMPUTE")}
      titleId={titleId}
      dismissDisabled={executing}
      className="max-w-lg"
      footer={
        <div className="flex w-full flex-wrap items-center justify-between gap-2">
          <SecondaryButton type="button" variant="modal" disabled={executing} onClick={onClose}>
            {t("CANCEL", "Cancel")}
          </SecondaryButton>
          <PrimaryButton
            type="button"
            disabled={
              executing ||
              !executionNameOk ||
              (!allTimePeriods && selectedTp.size === 0 && !tpLoading)
            }
            onClick={() => void handleExecute()}
          >
            {executing ? t("STARTING") : t("EXECUTE_COMPUTE")}
          </PrimaryButton>
        </div>
      }
    >
      <div className="flex flex-col gap-4 text-sm">
        <div>
          <label className="form-label mb-1 block text-text-muted">
            {t("TIME_PERIODS_LABEL")}
          </label>
          <SearchInputBar
            embedded
            size="sm"
            type="search"
            wrapperClassName="w-full"
            fieldClassName="w-full"
            value={tpSearch}
            onChange={(e) => setTpSearch(e.target.value)}
            placeholder={t("SEARCH", "Search")}
            autoComplete="off"
            disabled={executing}
            aria-label={t("SEARCH", "Search")}
          />
          <div className="mt-2 overflow-hidden rounded-md border border-border">
            <label
              className={`flex cursor-pointer items-center gap-2 border-b border-border bg-surface-muted px-2 py-2 text-xs ${
                executing || tpLoading ? "cursor-not-allowed opacity-60" : ""
              }`}
            >
              <input
                type="checkbox"
                checked={allTimePeriods}
                disabled={executing || tpLoading}
                onChange={(e) => {
                  const on = e.target.checked;
                  setAllTimePeriods(on);
                  if (on) setSelectedTp(new Set());
                }}
                className="checkbox-comp"
              />
              <span className="font-medium text-text">
                {t("ALL_TIME_PERIODS")}
              </span>
            </label>
            <div className="max-h-52 overflow-y-auto p-2">
              {tpLoading ? (
                <p className="px-1 py-2 text-xs text-text-muted">
                  {t("LOADING")}
                </p>
              ) : timeRows.length === 0 ? (
                <p className="px-1 py-2 text-xs text-text-muted">
                  {t("NO_TIME_PERIODS")}
                </p>
              ) : filteredTimeRows.length === 0 ? (
                <p className="px-1 py-2 text-xs text-text-muted">
                  {t(
                    "COMPUTE_EXECUTE_TP_FILTER_EMPTY",
                    "No time periods match your search."
                  )}
                </p>
              ) : (
                <ul className="space-y-0.5 text-xs">
                  {filteredTimeRows.map((row) => {
                    const id = rowTpValue(row);
                    if (!id) return null;
                    const checked = allTimePeriods || selectedTp.has(id);
                    return (
                      <li key={`tp-row-${row.id ?? id}`}>
                        <label
                          className={`flex cursor-pointer items-center gap-2 rounded px-1 py-1 hover:bg-surface-muted ${
                            executing || tpLoading || allTimePeriods
                              ? "cursor-default"
                              : ""
                          }`}
                          title={tpLabel(row)}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            disabled={executing || tpLoading || allTimePeriods}
                            onChange={() => {
                              if (allTimePeriods) return;
                              toggleTp(id);
                            }}
                            className="checkbox-comp"
                          />
                          <span className="min-w-0 truncate">{tpLabel(row)}</span>
                        </label>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>
        </div>

        <div>
          <label className="form-label mb-1 block text-text-muted">
            <span className="text-error">*</span>{" "}
            {t("EXECUTION_NAME")}
          </label>
          <input
            type="text"
            required
            className={textFieldClassName()}
            disabled={executing}
            value={executionName}
            onChange={(e) => setExecutionName(e.target.value)}
            placeholder={t("EXECUTION_NAME_PLACEHOLDER")}
            aria-required
          />
        </div>

        {lastResult ? (
          <div
            className="rounded-md border border-border px-3 py-2 text-xs"
            role="status"
          >
            <p className="font-medium text-text">
              {t("LAST_RUN")}
            </p>
            <ul className="mt-1 list-inside list-disc text-text-muted">
              <li>
                {t("LOG_ID")}:{" "}
                {lastResult.process_time_log_id}
              </li>
              <li>
                {t("ESTIMATED_JOBS")}:{" "}
                {lastResult.estimated_jobs}
              </li>
              <li>
                {t("STATUS", "Status")}: {lastResult.status}
              </li>
            </ul>
          </div>
        ) : null}
      </div>
    </Modal>
  );
}
