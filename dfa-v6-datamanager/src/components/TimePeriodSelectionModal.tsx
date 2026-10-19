"use client";

import { useCallback, useMemo, useRef } from "react";
import { useCore } from "@/contexts/CoreContext";
import { SelectionModal } from "./SelectionModal";
import {
  TimePeriodSelect,
  type TimePeriodItem,
  type TimePeriodSelectApi,
} from "dfa-v6-comp-timeperiod";
import "dfa-v6-comp-timeperiod/styles.css";
import { Loader } from "@/components/Loader";
import { buildApiHeaders } from "@/lib/api/client";

type TimePeriodSelectionModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onApply: (items: TimePeriodItem[]) => void;
  baseUrl: string;
  locale?: string;
  initialSelectedItems?: TimePeriodItem[];
  selectionMode?: "SINGLE" | "MULTIPLE";
  preloadedData?: TimePeriodItem[] | null;
  preloadedDataKey?: string;
  fetchOptions?: () => Promise<TimePeriodItem[]>;
};

export function TimePeriodSelectionModal({
  isOpen,
  onClose,
  onApply,
  baseUrl,
  locale,
  initialSelectedItems = [],
  selectionMode,
  preloadedData,
  preloadedDataKey,
  fetchOptions,
}: TimePeriodSelectionModalProps) {
  const apiRef = useRef<TimePeriodSelectApi | null>(null);
  const { t } = useCore();
  const isSingle = selectionMode === "SINGLE";

  const handleReady = useCallback((api: TimePeriodSelectApi) => {
    apiRef.current = api;
  }, []);

  const timePeriodStrings = useMemo(
    () => ({
      quickSelectLabel: t("QUICK_SELECT", "Quick Select"),
      selectAll: t("COMMON_SELECT_ALL", "Select All"),
      deselectAll: t("COMMON_DESELECT_ALL", "Deselect All"),
      loadingLabel: t("COMMON_LOADING", "Loading..."),
      emptyLabel: t("TIME_PERIOD_EMPTY_LABEL", "No time periods match your search."),
      summaryNone: t("TIME_PERIOD_SUMMARY_NONE", "No time periods selected"),
      summaryOne: t("TIME_PERIOD_SUMMARY_ONE", "1 time period selected"),
      summaryMany: t("TIME_PERIOD_SUMMARY_MANY", "{n} time periods selected"),
      summarySelectedPanelTitle: t("TIME_PERIOD_SELECTED_PANEL_TITLE", "Selected time periods"),
      close: t("COMMON_CLOSE", "Close"),
    }),
    [t],
  );

  const baseUrlNorm = useMemo(() => baseUrl.replace(/\/$/, ""), [baseUrl]);

  return (
    <SelectionModal<TimePeriodItem>
      isOpen={isOpen}
      onClose={onClose}
      title={t("SELECT_TIME_PERIOD", "Select Time Period")}
      onApply={onApply}
      getApi={() => apiRef.current}
    >
      <TimePeriodSelect
        key={`${baseUrlNorm}-${preloadedDataKey ?? "default"}-${isOpen ? "open" : "closed"}`}
        baseUrl={baseUrlNorm}
        locale={locale}
        headers={buildApiHeaders({ acceptLanguage: locale })}
        multiSelect={!isSingle}
        preloadedData={preloadedData}
        fetchOptions={fetchOptions}
        initialSelectedItems={initialSelectedItems}
        onReady={handleReady}
        loadingComponent={
          <Loader loadingLabel={t("COMMON_LOADING", "Loading...")} size={40} showStatusText />
        }
        strings={timePeriodStrings}
      />
    </SelectionModal>
  );
}
