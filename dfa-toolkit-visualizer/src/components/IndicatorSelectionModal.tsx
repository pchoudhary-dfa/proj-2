"use client";

/**
 * Modal wrapper for IndicatorSelect. Same pattern as AreaSelectionModal, SubgroupSelectionModal,
 * and TimePeriodSelectionModal: only baseUrl, locale, and selected items are passed; indicators
 * and classification options are fetched and cached inside dfa-v6-comp-indicator from
 * baseUrl/indicators, baseUrl/indicator-classifications, and baseUrl/ic/{id}/indicators.
 */
import { useRef } from "react";
import { useCore } from "@/contexts/CoreContext";
import { SelectionModal } from "./SelectionModal";
import {
  IndicatorSelect,
  type IndicatorItem,
  type IndicatorSelectApi,
} from "dfa-v6-comp-indicator";
import "dfa-v6-comp-indicator/styles.css";
import { Loader } from "@/components/Loader";
import { useSignedFetchHeaders } from "@/hooks/useSignedFetchHeaders";

type IndicatorSelectionModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onApply: (items: IndicatorItem[]) => void;
  /** Final base DW URL for /indicators (e.g. from getReferenceApiClientBaseUrl). Options are fetched inside the package. */
  baseUrl: string;
  initialSelectedItems?: IndicatorItem[];
  /** Optional locale for Accept-Language when fetching options (inside the package). */
  locale?: string;
  /** When set, modal is positioned with its left edge at this offset (e.g. filter sidebar width). */
  anchorLeft?: number;
  /** When anchorLeft is set, top offset in px (default 48). */
  anchorTop?: number;
  /** When false, show only indicators (no unit expansion). Default: true (IU mode). */
  enableUnit?: boolean;
};

export function IndicatorSelectionModal({
  isOpen,
  onClose,
  onApply,
  baseUrl,
  initialSelectedItems = [],
  locale,
  anchorLeft,
  anchorTop,
  enableUnit,
}: IndicatorSelectionModalProps) {
  const apiRef = useRef<IndicatorSelectApi | null>(null);
  const { t } = useCore();
  const headers = useSignedFetchHeaders(
    baseUrl ? `${baseUrl}/indicators` : undefined,
    { acceptLanguage: locale }
  );

  function handleReady(api: IndicatorSelectApi) {
    apiRef.current = api;
  }

  const indicatorStrings = {
    searchPlaceholder: t("INDICATOR_SEARCH_PLACEHOLDER"),
    selectSector: t("INDICATOR_SELECT_SECTOR"),
    selectTheme: t("INDICATOR_SELECT_THEME"),
    selectGoal: t("INDICATOR_SELECT_GOAL"),
    pleaseSelectSector: t("INDICATOR_PLEASE_SELECT_SECTOR"),
    pleaseSelectTheme: t("INDICATOR_PLEASE_SELECT_THEME"),
    pleaseSelectGoal: t("INDICATOR_PLEASE_SELECT_GOAL"),
    loadingLabel: t("COMMON_LOADING"),
    emptyLabel: t("INDICATOR_EMPTY_LABEL"),
    summaryNone: t("INDICATOR_SUMMARY_NONE"),
    summaryOne: t("INDICATOR_SUMMARY_ONE"),
    summaryMany: t("INDICATOR_SUMMARY_MANY"),
    summarySelectedPanelTitle: t("INDICATOR_SELECTED_PANEL_TITLE"),
    close: t("COMMON_CLOSE"),
    selectAll: t("COMMON_SELECT_ALL"),
    deselectAll: t("COMMON_DESELECT_ALL"),
  };

  return (
    <SelectionModal<IndicatorItem>
      isOpen={isOpen}
      onClose={onClose}
      title={t("MODAL_SELECT_INDICATOR")}
      onApply={onApply}
      getApi={() => apiRef.current}
      anchorLeft={anchorLeft}
      anchorTop={anchorTop}
    >
      <IndicatorSelect
        baseUrl={baseUrl}
        locale={locale}
        headers={headers}
        initialSelectedItems={initialSelectedItems}
        onReady={handleReady}
        loadingComponent={
          <Loader loadingLabel={t("COMMON_LOADING")} size={40} showStatusText={true} />
        }
        strings={indicatorStrings}
      />
    </SelectionModal>
  );
}
