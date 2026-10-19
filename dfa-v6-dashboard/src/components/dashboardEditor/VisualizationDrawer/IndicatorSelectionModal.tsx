"use client";

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
import { buildApiHeaders } from "@/lib/api/client";

type IndicatorSelectionModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onApply: (items: IndicatorItem[]) => void;
  baseUrl: string;
  locale?: string;
  initialSelectedItems?: IndicatorItem[];
  selectionMode?: "SINGLE" | "MULTIPLE";
};

export function IndicatorSelectionModal({
  isOpen,
  onClose,
  onApply,
  baseUrl,
  initialSelectedItems = [],
  locale,
  selectionMode,
}: IndicatorSelectionModalProps) {
  const apiRef = useRef<IndicatorSelectApi | null>(null);
  const { t } = useCore();
  const isSingle = selectionMode === "SINGLE";

  function handleReady(api: IndicatorSelectApi) {
    apiRef.current = api;
  }

  const indicatorStrings = {
    allTabLabel: t("ALL", "All"),
    searchPlaceholder: t("INDICATOR_SEARCH_PLACEHOLDER", t("SEARCH_INDICATORS", "Search...")),
    selectSector: t("INDICATOR_SELECT_SECTOR", t("SELECT_SECTOR", "Select Sector")),
    selectTheme: t("INDICATOR_SELECT_THEME", t("SELECT_THEME", "Select Theme")),
    selectGoal: t("INDICATOR_SELECT_GOAL", t("SELECT_GOAL", "Select Goal")),
    selectClassification: t("INDICATOR_SELECT_CLASSIFICATION", "Select {type}"),
    pleaseSelectSector: t("INDICATOR_PLEASE_SELECT_SECTOR", "Please select a sector from the dropdown above"),
    pleaseSelectTheme: t("INDICATOR_PLEASE_SELECT_THEME", "Please select a theme from the dropdown above"),
    pleaseSelectGoal: t("INDICATOR_PLEASE_SELECT_GOAL", "Please select a goal from the dropdown above"),
    pleaseSelectClassification: t("INDICATOR_PLEASE_SELECT_CLASSIFICATION", "Please select a {type} from the dropdown above"),
    chooseClassificationOption: t("INDICATOR_CHOOSE_CLASSIFICATION", "— Choose {type} —"),
    loadingLabel: t("COMMON_LOADING", "Loading..."),
    emptyLabel: t("INDICATOR_EMPTY_LABEL", "No indicators available."),
    summaryNone: t("INDICATOR_SUMMARY_NONE", "Select indicator"),
    summaryOne: t("INDICATOR_SUMMARY_ONE", "1 indicator selected"),
    summaryMany: t("INDICATOR_SUMMARY_MANY", "{n} indicators selected"),
    summarySelectedPanelTitle: t("INDICATOR_SELECTED_PANEL_TITLE", "Selected indicators"),
    close: t("COMMON_CLOSE", "Close"),
    selectAll: t("SELECT_ALL", "Select All"),
    deselectAll: t("DESELECT_ALL", "Deselect All"),
  };

  return (
    <SelectionModal<IndicatorItem>
      isOpen={isOpen}
      onClose={onClose}
      title={t("MODAL_SELECT_INDICATOR", "Select Indicator")}
      onApply={onApply}
      getApi={() => apiRef.current}
    >
      <IndicatorSelect
        baseUrl={baseUrl}
        locale={locale}
        headers={buildApiHeaders({ acceptLanguage: locale })}
        multiSelect={!isSingle}
        initialSelectedItems={initialSelectedItems}
        onReady={handleReady}
        loadingComponent={
          <Loader loadingLabel={t("COMMON_LOADING", "Loading...")} size={40} showStatusText />
        }
        strings={indicatorStrings}
      />
    </SelectionModal>
  );
}
