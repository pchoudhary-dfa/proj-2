"use client";

/**
 * Modal wrapper for TimePeriodSelect. Same pattern as AreaSelectionModal and SubgroupSelectionModal:
 * only baseUrl, locale, and selected items are passed; options are fetched and cached inside
 * dfa-v6-comp-timeperiod from baseUrl/time-periods.
 */
import { useRef } from "react";
import { useCore } from "@/contexts/CoreContext";
import { SelectionModal } from "./SelectionModal";
import {
  TimePeriodSelect,
  type TimePeriodItem,
  type TimePeriodSelectApi,
} from "dfa-v6-comp-timeperiod";
import "dfa-v6-comp-timeperiod/styles.css";
import { Loader } from "@/components/Loader";
import { useSignedFetchHeaders } from "@/hooks/useSignedFetchHeaders";

type TimePeriodSelectionModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onApply: (items: TimePeriodItem[]) => void;
  /** Final base DW URL for /time-periods (e.g. from getReferenceApiClientBaseUrl). Options are fetched inside the package. */
  baseUrl: string;
  initialSelectedItems?: TimePeriodItem[];
  /**
   * When provided and non-empty, these time periods are used as options and no API call is made
   * (e.g. from chart data). When undefined, null, or empty, the modal fetches all time periods from the API.
   */
  preloadedData?: TimePeriodItem[] | null;
  /** Optional locale for Accept-Language when fetching options (inside the package). */
  locale?: string;
  /** When set, modal is positioned with its left edge at this offset (e.g. filter sidebar width). */
  anchorLeft?: number;
  /** When anchorLeft is set, top offset in px (default 48). */
  anchorTop?: number;
};

export function TimePeriodSelectionModal({
  isOpen,
  onClose,
  onApply,
  baseUrl,
  initialSelectedItems = [],
  preloadedData,
  locale,
  anchorLeft,
  anchorTop,
}: TimePeriodSelectionModalProps) {
  const apiRef = useRef<TimePeriodSelectApi | null>(null);
  const { t } = useCore();
  const headers = useSignedFetchHeaders(
    baseUrl ? `${baseUrl}/time-periods` : undefined,
    { acceptLanguage: locale }
  );

  function handleReady(api: TimePeriodSelectApi) {
    apiRef.current = api;
  }

  const timePeriodStrings = {
    quickSelectLabel: t("TIMEPERIOD_QUICK_SELECT_LABEL"),
    recent5: t("TIMEPERIOD_RECENT_5"),
    recent10: t("TIMEPERIOD_RECENT_10"),
    recent20: t("TIMEPERIOD_RECENT_20"),
    selectAll: t("COMMON_SELECT_ALL"),
    deselectAll: t("COMMON_DESELECT_ALL"),
    loadingLabel: t("COMMON_LOADING"),
    emptyLabel: t("TIMEPERIOD_EMPTY_LABEL"),
    summaryNone: t("TIMEPERIOD_SUMMARY_NONE"),
    summaryOne: t("TIMEPERIOD_SUMMARY_ONE"),
    summaryMany: t("TIMEPERIOD_SUMMARY_MANY"),
    summarySelectedPanelTitle: t("TIMEPERIOD_SELECTED_PANEL_TITLE"),
    close: t("COMMON_CLOSE"),
  };

  return (
    <SelectionModal<TimePeriodItem>
      isOpen={isOpen}
      onClose={onClose}
      title={t("MODAL_SELECT_TIME_PERIOD")}
      onApply={onApply}
      getApi={() => apiRef.current}
      anchorLeft={anchorLeft}
      anchorTop={anchorTop}
    >
      <div className="flex flex-1 min-h-0 min-w-0 flex-col overflow-hidden">
        <TimePeriodSelect
          baseUrl={baseUrl}
          locale={locale}
          headers={headers}
          preloadedData={preloadedData}
          initialSelectedItems={initialSelectedItems}
          onReady={handleReady}
          loadingComponent={
            <Loader loadingLabel={t("COMMON_LOADING")} size={40} showStatusText={true} />
          }
          strings={timePeriodStrings}
        />
      </div>
    </SelectionModal>
  );
}
