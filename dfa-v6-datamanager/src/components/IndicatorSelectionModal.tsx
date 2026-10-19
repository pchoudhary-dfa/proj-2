"use client";

/**
 * Modal wrapper for IndicatorSelect — aligned with dfa-v6-visualizer IndicatorSelectionModal.
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
import { buildApiHeaders } from "@/lib/api/client";

type IndicatorSelectionModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onApply: (items: IndicatorItem[]) => void;
  baseUrl: string;
  locale?: string;
  initialSelectedItems?: IndicatorItem[];
  selectionMode?: "SINGLE" | "MULTIPLE";
  /** When set, modal is positioned with its left edge at this offset (e.g. filter sidebar width). */
  anchorLeft?: number;
  /** When anchorLeft is set, top offset in px (default 48). */
  anchorTop?: number;
  /** When true, list flat IUS rows (indicator|unit|subgroup) instead of indicator/IU rows. */
  flatIusList?: boolean;
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
  selectionMode,
  anchorLeft,
  anchorTop,
  flatIusList = false,
  enableUnit,
}: IndicatorSelectionModalProps) {
  const apiRef = useRef<IndicatorSelectApi | null>(null);
  const { t } = useCore();
  const isSingle = selectionMode === "SINGLE";

  function handleReady(api: IndicatorSelectApi) {
    apiRef.current = api;
  }

  const indicatorStrings = {
    allTabLabel: t("ALL", "All"),
    searchPlaceholder: t(
      "INDICATOR_SEARCH_PLACEHOLDER",
      t("SEARCH_INDICATORS", t("PLACEHOLDER_SEARCH", "Search..."))
    ),
    selectSector: t("INDICATOR_SELECT_SECTOR", t("SELECT_SECTOR", "Select Sector")),
    selectTheme: t("INDICATOR_SELECT_THEME", t("SELECT_THEME", "Select Theme")),
    selectGoal: t("INDICATOR_SELECT_GOAL", t("SELECT_GOAL", "Select Goal")),
    selectClassification: t("INDICATOR_SELECT_CLASSIFICATION", "Select {type}"),
    pleaseSelectSector: t(
      "INDICATOR_PLEASE_SELECT_SECTOR",
      t("PLEASE_SELECT_SECTOR", "Please select a sector from the dropdown above")
    ),
    pleaseSelectTheme: t(
      "INDICATOR_PLEASE_SELECT_THEME",
      t("PLEASE_SELECT_THEME", "Please select a theme from the dropdown above")
    ),
    pleaseSelectGoal: t(
      "INDICATOR_PLEASE_SELECT_GOAL",
      t("PLEASE_SELECT_GOAL", "Please select a goal from the dropdown above")
    ),
    pleaseSelectClassification: t(
      "INDICATOR_PLEASE_SELECT_CLASSIFICATION",
      "Please select a {type} from the dropdown above"
    ),
    chooseClassificationOption: t(
      "INDICATOR_CHOOSE_CLASSIFICATION",
      "— Choose {type} —"
    ),
    loadingLabel: t("COMMON_LOADING", t("LOADING", "Loading...")),
    emptyLabel: t(
      "INDICATOR_EMPTY_LABEL",
      t("NO_INDICATORS_FOUND", "No indicators available.")
    ),
    summaryNone: flatIusList
      ? t("IUS_SUMMARY_NONE", t("PLACEHOLDER_SELECT"))
      : t("INDICATOR_SUMMARY_NONE", t("PLACEHOLDER_SELECT")),
    summaryOne: flatIusList
      ? t("IUS_SUMMARY_ONE", t("INDICATOR_SELECTED_ONE"))
      : t("INDICATOR_SUMMARY_ONE", t("INDICATOR_SELECTED_ONE")),
    summaryMany: flatIusList
      ? t("IUS_SUMMARY_MANY", t("INDICATORS_SELECTED_MANY"))
      : t("INDICATOR_SUMMARY_MANY", t("INDICATORS_SELECTED_MANY")),
    summarySelectedPanelTitle: flatIusList
      ? t("COMPUTE_IUS_SELECTED_PANEL_TITLE", t("SELECTED_INDICATORS"))
      : t("INDICATOR_SELECTED_PANEL_TITLE", t("SELECTED_INDICATORS")),
    close: t("COMMON_CLOSE", t("CLOSE")),
    selectAll: t("SELECT_ALL", "Select All"),
    deselectAll: t("DESELECT_ALL", "Deselect All"),
  };

  return (
    <SelectionModal<IndicatorItem>
      isOpen={isOpen}
      onClose={onClose}
      title={flatIusList ? t("SELECT_IUS") : t("MODAL_SELECT_INDICATOR", t("SELECT_INDICATOR"))}
      onApply={onApply}
      getApi={() => apiRef.current}
      anchorLeft={anchorLeft}
      anchorTop={anchorTop}
    >
      <IndicatorSelect
        baseUrl={baseUrl}
        locale={locale}
        headers={buildApiHeaders({ acceptLanguage: locale })}
        multiSelect={!isSingle}
        flatIusList={flatIusList}
        enableUnit={enableUnit}
        initialSelectedItems={initialSelectedItems}
        onReady={handleReady}
        loadingComponent={
          <Loader loadingLabel={t("COMMON_LOADING", t("LOADING"))} size={40} showStatusText />
        }
        strings={indicatorStrings}
      />
    </SelectionModal>
  );
}
