"use client";

import { useEffect, useRef, useState } from "react";
import { useCore } from "@/contexts/CoreContext";
import { SelectionModal } from "./SelectionModal";
import {
  SubgroupSelect,
  type SubgroupItem,
  type SubgroupSelectApi,
} from "dfa-v6-comp-subgroup";
import "dfa-v6-comp-subgroup/styles.css";
import { Loader } from "@/components/Loader";
import { fetchSubgroupOptionsViaIus } from "@/lib/api/reference";
import { useSignedFetchHeaders } from "@/hooks/useSignedFetchHeaders";

type IndicatorItem = { id: string; label: string; nid?: number };

type SubgroupSelectionModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onApply: (items: SubgroupItem[]) => void;
  /** Final base DW URL for /subgroups and /ius (e.g. from getReferenceApiClientBaseUrl). */
  baseUrl: string;
  initialSelectedItems?: SubgroupItem[];
  /** When provided with length > 0, subgroup options are fetched from /ius for these indicators; result is passed as preloaded data. When empty, subgroup component uses /subgroups API. */
  selectedIndicators?: IndicatorItem[];
  /** Called when a new IUS result is available. Use to filter subgroup selection to only items present in the new options (e.g. after removing an indicator). */
  onPreloadedOptionsReady?: (options: SubgroupItem[]) => void;
  /** Optional locale for Accept-Language when fetching options. */
  locale?: string;
  /** When set, modal is positioned with its left edge at this offset (e.g. filter sidebar width). */
  anchorLeft?: number;
  /** When anchorLeft is set, top offset in px (default 48). */
  anchorTop?: number;
};

function toIndicatorNids(indicators: IndicatorItem[] | undefined): number[] {
  if (!indicators?.length) return [];
  return indicators
    .map((i) => {
      if (i.nid != null && Number.isInteger(i.nid)) return i.nid;
      const id = i.id;
      if (typeof id === "number" && Number.isInteger(id)) return id;
      if (typeof id === "string" && /^\d+$/.test(id)) return Number(id);
      return undefined;
    })
    .filter((n): n is number => n !== undefined);
}

export function SubgroupSelectionModal({
  isOpen,
  onClose,
  onApply,
  baseUrl,
  initialSelectedItems = [],
  selectedIndicators,
  onPreloadedOptionsReady,
  locale,
  anchorLeft,
  anchorTop,
}: SubgroupSelectionModalProps) {
  const apiRef = useRef<SubgroupSelectApi | null>(null);
  const { t } = useCore();
  const headers = useSignedFetchHeaders(
    baseUrl ? `${baseUrl}/subgroups` : undefined,
    { acceptLanguage: locale }
  );
  const [preloadedSubgroupOptions, setPreloadedSubgroupOptions] = useState<
    SubgroupItem[]
  >([]);
  const [iusLoading, setIusLoading] = useState(false);

  const indicatorNids = toIndicatorNids(selectedIndicators);
  const hasIndicators = indicatorNids.length > 0;

  // Fetch IUS only when selected indicators (or baseUrl/locale) change. Intentionally omit onPreloadedOptionsReady
  // so opening the modal does not re-run this effect (parent passes inline callback, new ref every render).
  useEffect(() => {
    if (!hasIndicators) {
      setPreloadedSubgroupOptions([]);
      setIusLoading(false);
      onPreloadedOptionsReady?.([]);
      return;
    }
    setIusLoading(true);
    let cancelled = false;
    fetchSubgroupOptionsViaIus(baseUrl, indicatorNids, {
      acceptLanguage: locale,
    })
      .then((items) => {
        if (!cancelled) {
          setPreloadedSubgroupOptions(items);
          setIusLoading(false);
          onPreloadedOptionsReady?.(items);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setPreloadedSubgroupOptions([]);
          setIusLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only refetch when indicator set or baseUrl/locale change
  }, [baseUrl, locale, hasIndicators, indicatorNids.join(",")]);

  function handleReady(api: SubgroupSelectApi) {
    apiRef.current = api;
  }

  const subgroupStrings = {
    searchPlaceholder: t("SUBGROUP_SEARCH_PLACEHOLDER"),
    selectAll: t("COMMON_SELECT_ALL"),
    deselectAll: t("COMMON_DESELECT_ALL"),
    loadingLabel: t("COMMON_LOADING"),
    emptyLabel: t("SUBGROUP_EMPTY_LABEL"),
    summaryNone: t("SUBGROUP_SUMMARY_NONE"),
    summaryOne: t("SUBGROUP_SUMMARY_ONE"),
    summaryMany: t("SUBGROUP_SUMMARY_MANY"),
    summarySelectedPanelTitle: t("SUBGROUP_SELECTED_PANEL_TITLE"),
    close: t("COMMON_CLOSE"),
  };

  return (
    <SelectionModal<SubgroupItem>
      isOpen={isOpen}
      onClose={onClose}
      title={t("MODAL_SELECT_SUBGROUP")}
      onApply={onApply}
      getApi={() => apiRef.current}
      anchorLeft={anchorLeft}
      anchorTop={anchorTop}
    >
      <div className="flex flex-1 min-h-0 min-w-0 flex-col overflow-hidden">
        {hasIndicators && iusLoading ? (
          <div className="flex flex-1 items-center justify-center text-sm text-gray-500">
            {t("COMMON_LOADING")}
          </div>
        ) : (
          <SubgroupSelect
            baseUrl={baseUrl}
            locale={locale}
            headers={headers}
            preloadedSubgroupOptions={
              hasIndicators ? preloadedSubgroupOptions : undefined
            }
            initialSelectedItems={initialSelectedItems}
            onReady={handleReady}
            loadingComponent={
            <Loader loadingLabel={t("COMMON_LOADING")} size={40} showStatusText={true} />
          }
            strings={subgroupStrings}
          />
        )}
      </div>
    </SelectionModal>
  );
}
