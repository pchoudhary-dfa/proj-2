"use client";

import { useCallback, useMemo, useRef } from "react";
import { useCore } from "@/contexts/CoreContext";
import { SelectionModal } from "./SelectionModal";
import {
  SubgroupSelect,
  type SubgroupItem,
  type SubgroupSelectApi,
} from "dfa-v6-comp-subgroup";
import "dfa-v6-comp-subgroup/styles.css";
import { Loader } from "@/components/Loader";
import { buildApiHeaders } from "@/lib/api/client";

type SubgroupSelectionModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onApply: (items: SubgroupItem[]) => void;
  baseUrl: string;
  locale?: string;
  initialSelectedItems?: SubgroupItem[];
  selectionMode?: "SINGLE" | "MULTIPLE";
};

export function SubgroupSelectionModal({
  isOpen,
  onClose,
  onApply,
  baseUrl,
  locale,
  initialSelectedItems = [],
  selectionMode,
}: SubgroupSelectionModalProps) {
  const apiRef = useRef<SubgroupSelectApi | null>(null);
  const { t } = useCore();
  const isSingle = selectionMode === "SINGLE";

  const handleReady = useCallback((api: SubgroupSelectApi) => {
    apiRef.current = api;
  }, []);

  const baseUrlNorm = useMemo(() => baseUrl.replace(/\/$/, ""), [baseUrl]);

  const subgroupStrings = useMemo(
    () => ({
      searchPlaceholder: t("SUBGROUP_SEARCH_PLACEHOLDER", "Search subgroups..."),
      selectAll: t("COMMON_SELECT_ALL", "Select All"),
      deselectAll: t("COMMON_DESELECT_ALL", "Deselect All"),
      loadingLabel: t("COMMON_LOADING", "Loading..."),
      emptyLabel: t("SUBGROUP_EMPTY_LABEL", "No subgroups available."),
      summaryNone: t("SUBGROUP_SUMMARY_NONE", "No subgroups selected"),
      summaryOne: t("SUBGROUP_SUMMARY_ONE", "1 subgroup selected"),
      summaryMany: t("SUBGROUP_SUMMARY_MANY", "{n} subgroups selected"),
      summarySelectedPanelTitle: t("SUBGROUP_SELECTED_PANEL_TITLE", "Selected subgroups"),
      close: t("COMMON_CLOSE", "Close"),
    }),
    [t],
  );

  return (
    <SelectionModal<SubgroupItem>
      isOpen={isOpen}
      onClose={onClose}
      title={t("MODAL_SELECT_SUBGROUP", "Select Subgroup")}
      onApply={onApply}
      getApi={() => apiRef.current}
    >
      <SubgroupSelect
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
        strings={subgroupStrings}
      />
    </SelectionModal>
  );
}
