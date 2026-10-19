"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { getActiveSearchSyncJob, getSearchSyncJobStatus } from "@/lib/api/core";
import { SESSION_STORAGE_KEYS } from "@/lib/constants";
import type { SearchSyncJobRef, SearchSyncJobStatus } from "@/lib/api/types";

const POLL_INTERVAL_MS = 4000;
const MAX_POLL_DURATION_MS = 60 * 60 * 1000; // 60 minutes

type JobStatus = "idle" | "pending" | "processing" | "completed" | "failed";

export function useSearchSyncPoll(
  dataWarehouseId: string | null,
  enabled = false
) {
  const [isRunning, setIsRunning] = useState(false);
  const [status, setStatus] = useState<JobStatus>("idle");
  const [jobRef, setJobRef] = useState<SearchSyncJobRef | null>(null);
  
  const pollStartTimeRef = useRef<number | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  const clearStorage = useCallback(() => {
    if (typeof window !== "undefined") {
      try {
        sessionStorage.removeItem(SESSION_STORAGE_KEYS.SEARCH_SYNC_JOB);
      } catch {
        // ignore
      }
    }
  }, []);

  const persistJobRef = useCallback((ref: SearchSyncJobRef) => {
    if (typeof window !== "undefined") {
      try {
        sessionStorage.setItem(
          SESSION_STORAGE_KEYS.SEARCH_SYNC_JOB,
          JSON.stringify(ref)
        );
      } catch {
        // ignore
      }
    }
  }, []);

  const stopPolling = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    pollStartTimeRef.current = null;
    setIsRunning(false);
  }, []);

  const handleJobComplete = useCallback((statusData: SearchSyncJobStatus) => {
    stopPolling();
    clearStorage();
    setStatus("completed");
    setJobRef(null);
    toast.success("Search tables synced successfully");
  }, [stopPolling, clearStorage]);

  const handleJobFailed = useCallback((statusData: SearchSyncJobStatus) => {
    stopPolling();
    clearStorage();
    setStatus("failed");
    setJobRef(null);
    const errorMsg = statusData.last_error || "Search sync failed";
    toast.error(errorMsg);
  }, [stopPolling, clearStorage]);

  const pollStatus = useCallback(async (ref: SearchSyncJobRef) => {
    if (!dataWarehouseId) return;

    // Check timeout
    if (pollStartTimeRef.current) {
      const elapsed = Date.now() - pollStartTimeRef.current;
      if (elapsed > MAX_POLL_DURATION_MS) {
        stopPolling();
        toast.warning("Search sync is taking longer than expected. Please check back later.");
        return;
      }
    }

    const res = await getSearchSyncJobStatus(dataWarehouseId, ref);
    if (!res.ok) {
      // If status check fails, stop polling but don't clear storage yet
      // (user might refresh and resume)
      stopPolling();
      toast.error(`Failed to check sync status: ${res.error}`);
      return;
    }

    const { data } = res;
    setStatus(data.job_status);

    if (data.job_status === "completed") {
      handleJobComplete(data);
    } else if (data.job_status === "failed") {
      handleJobFailed(data);
    }
    // If pending or processing, keep polling
  }, [dataWarehouseId, stopPolling, handleJobComplete, handleJobFailed]);

  const startJob = useCallback((ref: SearchSyncJobRef) => {
    setJobRef(ref);
    persistJobRef(ref);
    setStatus("pending");
    setIsRunning(true);
    pollStartTimeRef.current = Date.now();

    // Immediately poll once, then set up interval
    pollStatus(ref);
    intervalRef.current = setInterval(() => {
      pollStatus(ref);
    }, POLL_INTERVAL_MS);
  }, [persistJobRef, pollStatus]);

  // Stop polling when feature is disabled (e.g. user signed out)
  useEffect(() => {
    if (enabled) return;
    stopPolling();
    setStatus("idle");
    setJobRef(null);
  }, [enabled, stopPolling]);

  // On mount: restore job from sessionStorage or fetch active job (authenticated only)
  useEffect(() => {
    if (!enabled || !dataWarehouseId) return;

    let restored = false;

    // Try sessionStorage first
    if (typeof window !== "undefined") {
      try {
        const stored = sessionStorage.getItem(SESSION_STORAGE_KEYS.SEARCH_SYNC_JOB);
        if (stored) {
          const ref: SearchSyncJobRef = JSON.parse(stored);
          startJob(ref);
          restored = true;
        }
      } catch {
        // ignore
      }
    }

    // If no stored ref, check for active job (DB mode only)
    if (!restored) {
      getActiveSearchSyncJob(dataWarehouseId).then((res) => {
        if (res.ok && res.data) {
          const ref: SearchSyncJobRef = {
            dw_id: dataWarehouseId,
            job_type: res.data.job_type || "sync_search_index",
            db_job_id: res.data.db_job_id,
            celery_task_id: res.data.celery_task_id,
          };
          startJob(ref);
        }
      });
    }
  }, [enabled, dataWarehouseId, startJob]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, []);

  return {
    isRunning,
    status,
    jobRef,
    startJob,
  };
}
