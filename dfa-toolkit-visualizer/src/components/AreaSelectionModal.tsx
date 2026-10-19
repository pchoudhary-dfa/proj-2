"use client";

import { useRef } from "react";
import { useCore } from "@/contexts/CoreContext";
import { SelectionModal } from "./SelectionModal";
import {
  AreaSelect,
  type AreaItem,
  type AreaSelectApi,
} from "dfa-v6-comp-area";
import "dfa-v6-comp-area/styles.css";
import { Loader } from "@/components/Loader";
import { useSignedFetchHeaders } from "@/hooks/useSignedFetchHeaders";

type AreaSelectionModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onApply: (items: AreaItem[]) => void;
  /** Final base DW URL for /areas and /area-levels (e.g. from getReferenceApiClientBaseUrl). */
  baseUrl: string;
  /** Optional locale for Accept-Language in reference mode (e.g. from page [locale]). */
  locale?: string;
  initialSelectedItems?: AreaItem[];
  /** SINGLE allows one area; default is MULTIPLE (visualizer filters). */
  selectionMode?: "SINGLE" | "MULTIPLE";
  /** When set, modal is positioned with its left edge at this offset (e.g. filter sidebar width). */
  anchorLeft?: number;
  /** When anchorLeft is set, top offset in px (default 48). */
  anchorTop?: number;
};

export function AreaSelectionModal({
  isOpen,
  onClose,
  onApply,
  baseUrl,
  locale,
  initialSelectedItems = [],
  selectionMode = "MULTIPLE",
  anchorLeft,
  anchorTop,
}: AreaSelectionModalProps) {
  const apiRef = useRef<AreaSelectApi | null>(null);
  const { t } = useCore();
  const isSingle = selectionMode === "SINGLE";
  const headers = useSignedFetchHeaders(
    baseUrl ? `${baseUrl}/areas` : undefined,
    { acceptLanguage: locale }
  );

  function handleReady(api: AreaSelectApi) {
    apiRef.current = api;
  }

  const areaStrings = {
    filterByLevel: t("AREA_FILTER_BY_LEVEL"),
    searchPlaceholder: t("AREA_SEARCH_PLACEHOLDER"),
    expandAll: t("AREA_EXPAND_ALL"),
    collapseAll: t("AREA_COLLAPSE_ALL"),
    selectAll: t("COMMON_SELECT_ALL"),
    deselectAll: t("COMMON_DESELECT_ALL"),
    loadingLabel: t("COMMON_LOADING"),
    emptyLabel: t("AREA_EMPTY_LABEL"),
    summaryNone: t("AREA_SUMMARY_NONE"),
    summaryOne: t("AREA_SUMMARY_ONE"),
    summaryMany: t("AREA_SUMMARY_MANY"),
    summarySelectedPanelTitle: t("AREA_SELECTED_PANEL_TITLE"),
    close: t("COMMON_CLOSE"),
  };

  return (
    <SelectionModal<AreaItem>
      isOpen={isOpen}
      onClose={onClose}
      title={t("MODAL_SELECT_AREA")}
      onApply={onApply}
      getApi={() => apiRef.current}
      anchorLeft={anchorLeft}
      anchorTop={anchorTop}
    >
      <AreaSelect
        baseUrl={baseUrl}
        locale={locale}
        headers={headers}
        multiSelect={!isSingle}
        initialSelectedItems={initialSelectedItems}
        onReady={handleReady}
        loadingComponent={
          <Loader loadingLabel={t("COMMON_LOADING")} size={40} showStatusText={true} />
        }
        strings={areaStrings}
      />
    </SelectionModal>
  );
}
