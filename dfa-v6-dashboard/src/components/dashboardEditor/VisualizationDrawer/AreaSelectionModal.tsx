"use client";

import { useCallback, useMemo, useRef } from "react";
import { useCore } from "@/contexts/CoreContext";
import { SelectionModal } from "./SelectionModal";
import {
  AreaSelect,
  type AreaItem,
  type AreaSelectApi,
} from "dfa-v6-comp-area";
import "dfa-v6-comp-area/styles.css";
import { Loader } from "@/components/Loader";
import { buildApiHeaders } from "@/lib/api/client";

type AreaSelectionModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onApply: (items: AreaItem[]) => void;
  baseUrl: string;
  locale?: string;
  initialSelectedItems?: AreaItem[];
  selectionMode?: "SINGLE" | "MULTIPLE";
};

export function AreaSelectionModal({
  isOpen,
  onClose,
  onApply,
  baseUrl,
  locale,
  initialSelectedItems = [],
  selectionMode,
}: AreaSelectionModalProps) {
  const apiRef = useRef<AreaSelectApi | null>(null);
  const { t } = useCore();
  const isSingle = selectionMode === "SINGLE";

  const handleReady = useCallback((api: AreaSelectApi) => {
    apiRef.current = api;
  }, []);

  const baseUrlNorm = useMemo(() => baseUrl.replace(/\/$/, ""), [baseUrl]);

  const areaStrings = useMemo(
    () => ({
      filterByLevel: t("AREA_FILTER_BY_LEVEL", "Filter by Level"),
      searchPlaceholder: t("AREA_SEARCH_PLACEHOLDER", "Search areas..."),
      expandAll: t("AREA_EXPAND_ALL", "Expand All"),
      collapseAll: t("AREA_COLLAPSE_ALL", "Collapse All"),
      selectAll: t("COMMON_SELECT_ALL", "Select All"),
      deselectAll: t("COMMON_DESELECT_ALL", "Deselect All"),
      loadingLabel: t("COMMON_LOADING", "Loading..."),
      emptyLabel: t("AREA_EMPTY_LABEL", "No areas to display."),
      summaryNone: t("AREA_SUMMARY_NONE", "No areas selected"),
      summaryOne: t("AREA_SUMMARY_ONE", "1 area selected"),
      summaryMany: t("AREA_SUMMARY_MANY", "{n} areas selected"),
      summarySelectedPanelTitle: t("AREA_SELECTED_PANEL_TITLE", "Selected areas"),
      close: t("COMMON_CLOSE", "Close"),
    }),
    [t],
  );

  return (
    <SelectionModal<AreaItem>
      isOpen={isOpen}
      onClose={onClose}
      title={t("MODAL_SELECT_AREA", "Select Area")}
      onApply={onApply}
      getApi={() => apiRef.current}
    >
      <AreaSelect
        key={`${baseUrlNorm}-${isOpen ? "open" : "closed"}`}
        baseUrl={baseUrlNorm}
        locale={locale}
        headers={buildApiHeaders({ acceptLanguage: locale })}
        multiSelect={!isSingle}
        initialSelectedItems={initialSelectedItems}
        onReady={handleReady}
        loadingComponent={
          <Loader loadingLabel={t("COMMON_LOADING", "Loading...")} size={40} showStatusText />
        }
        strings={areaStrings}
      />
    </SelectionModal>
  );
}
