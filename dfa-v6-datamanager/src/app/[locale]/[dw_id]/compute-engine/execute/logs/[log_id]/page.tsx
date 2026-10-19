"use client";

import {
  useCallback,
  useEffect,
  useState,
} from "react";
import { toast } from "sonner";
import { SecondaryButton } from "@/components/SecondaryButton";
import { PrimaryButton } from "@/components/PrimaryButton";
import { useParams } from "next/navigation";
import { useCore } from "@/contexts/CoreContext";
import { ComputeLogDetailJobsTable } from "@/components/compute/ComputeLogDetailJobsTable";
import { ComputeLogInfoSummaryTable } from "@/components/compute/ComputeLogInfoSummaryTable";
import {
  downloadComputeLogExport,
  getComputeLogDetails,
  type ComputeLogDetailRow,
  type ComputeLogInfo,
} from "@/lib/api/computeExecutionLogs";
import {
  buildAreaNameByKey,
  fetchAllAreasCatalog,
} from "@/lib/datamanager/computeProcessFilterCatalog";

const PAGE_LIMIT = 100;

export default function ComputeExecutionLogDetailPage() {
  const params = useParams();
  const locale = String(params?.locale ?? "en").trim();
  const dwId = String(params?.dw_id ?? "").trim();
  const logIdRaw = String(params?.log_id ?? "").trim();
  const logId = Number(logIdRaw);
  const { t } = useCore();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [logInfo, setLogInfo] = useState<ComputeLogInfo | null>(null);
  const [details, setDetails] = useState<ComputeLogDetailRow[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [offset, setOffset] = useState(0);
  const [appending, setAppending] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [areaNameByKey, setAreaNameByKey] = useState(
    () => new Map<string, string>()
  );

  useEffect(() => {
    if (!dwId.trim()) return;
    let cancelled = false;
    void (async () => {
      const areas = await fetchAllAreasCatalog(dwId);
      if (cancelled) return;
      setAreaNameByKey(buildAreaNameByKey(areas));
    })();
    return () => {
      cancelled = true;
    };
  }, [dwId]);

  const onExportLog = useCallback(async () => {
    if (!dwId || !Number.isFinite(logId) || exporting) return;
    setExporting(true);
    const res = await downloadComputeLogExport(dwId, logId, "xlsx");
    setExporting(false);
    if (!res.ok) {
      toast.error(res.message);
      return;
    }
    toast.success(t("EXPORT_SUCCESS", "Export downloaded."));
  }, [dwId, exporting, logId, t]);

  const fetchPage = useCallback(
    async (requestOffset: number, append: boolean) => {
      if (!dwId || !Number.isFinite(logId) || logId < 1) {
        setError(t("COMPUTE_LOG_INVALID_ID", "Invalid log id."));
        setLoading(false);
        setAppending(false);
        return;
      }
      if (append) setAppending(true);
      else {
        setLoading(true);
        setError(null);
        setLogInfo(null);
      }
      const res = await getComputeLogDetails(dwId, logId, {
        locale,
        limit: PAGE_LIMIT,
        offset: requestOffset,
      });
      setLoading(false);
      setAppending(false);
      if (!res.ok) {
        setError(res.message);
        if (!append) {
          setLogInfo(null);
          setDetails([]);
        }
        setHasMore(false);
        return;
      }
      setLogInfo(res.log_info);
      setTotalCount(res.total_count);
      setHasMore(res.has_more);
      if (append) {
        setDetails((prev) => [...prev, ...res.details]);
        setOffset(requestOffset + res.details.length);
      } else {
        setDetails(res.details);
        setOffset(res.details.length);
      }
    },
    [dwId, logId, locale, t]
  );

  useEffect(() => {
    if (!Number.isFinite(logId) || logId < 1) return;
    setDetails([]);
    setOffset(0);
    void fetchPage(0, false);
  }, [dwId, logId, locale, fetchPage]);

  const onLoadMore = useCallback(() => {
    if (!hasMore || loading || appending) return;
    void fetchPage(offset, true);
  }, [appending, fetchPage, hasMore, loading, offset]);

  const invalidLogId = !Number.isFinite(logId) || logId < 1;

  if (invalidLogId) {
    return (
      <div className="flex min-h-screen flex-col bg-surface-muted p-6 text-sm text-text">
        <p>{t("COMPUTE_LOG_INVALID_ID", "Invalid log id.")}</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-1 flex-col overflow-hidden bg-surface-muted text-text">
      <div className="mx-auto flex min-h-0 w-full flex-1 flex-col gap-3 overflow-hidden p-3">
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-2">
          <h1 className="text-sm font-semibold text-text">
            {t("LOG_DETAILS", "Log details")}
          </h1>
          {logInfo ? (
            <SecondaryButton
              type="button"
              icon="download"
              disabled={exporting}
              onClick={() => void onExportLog()}
              title={t("TOOLBAR_DOWNLOAD_EXCEL", "Download Excel")}
            >
              {exporting
                ? t("EXPORTING", "Exporting…")
                : t("EXPORT", "Export")}
            </SecondaryButton>
          ) : null}
        </div>

        {error && !logInfo ? (
          <p className="shrink-0 text-xs text-rose-600 dark:text-rose-400">
            {error}
          </p>
        ) : null}

        {loading && !logInfo ? (
          <p className="text-xs text-text-muted">
            {t("COMPUTE_EXEC_LOGS_LOADING", "Loading execution history…")}
          </p>
        ) : null}

        {logInfo ? (
          <ComputeLogInfoSummaryTable
            logInfo={logInfo}
            areaNameByKey={areaNameByKey}
            t={t}
          />
        ) : null}

        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          {details.length === 0 && logInfo && !loading ? (
            <p className="text-xs text-text-muted">
              {t("COMPUTE_LOG_NO_DETAIL_ROWS", "No job rows for this log.")}
            </p>
          ) : details.length > 0 ? (
            <ComputeLogDetailJobsTable
              rows={details}
              totalCount={totalCount}
              t={t}
            />
          ) : null}
        </div>

        {hasMore ? (
          <div className="flex shrink-0 justify-center pb-2">
            <PrimaryButton
              type="button"
              disabled={loading || appending}
              onClick={() => void onLoadMore()}
            >
              {t("LOAD_MORE", "Load more")}
              {totalCount > 0
                ? ` (${details.length}/${totalCount})`
                : null}
            </PrimaryButton>
          </div>
        ) : null}
      </div>
    </div>
  );
}
