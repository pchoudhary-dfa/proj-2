"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  IndicatorSelect,
  type IndicatorItem,
  type IndicatorSelectApi,
  type IndicatorSelectFetchParams,
} from "dfa-v6-comp-indicator";
import "dfa-v6-comp-indicator/styles.css";
import { Loader } from "@/components/Loader";
import { SelectionModal } from "@/components/SelectionModal";
import { useCore } from "@/contexts/CoreContext";
import { fetchEligibleFormulaTargetIusGids } from "@/lib/api/computeProcess";
import { resolveIusNames } from "@/lib/api/computeFormula";
import { buildApiHeaders } from "@/lib/api/client";
import { getRequest } from "@/lib/api/http";
import type { IndicatorListItem, IndicatorsListResponse } from "@/lib/api/types";
import { formatTargetIusGridLabel } from "@/lib/compute/iusDisplayLabel";
import {
  expandIndicatorsToIusOptions,
  INDICATORS_IUS_PAGE_SIZE,
} from "@/lib/compute/iusFromIndicators";
import { parseIusGid } from "@/lib/compute/iusGid";
import {
  getDWAPIURL,
  REFERENCE_PATH_INDICATORS,
} from "@/lib/constants";

const EMPTY_IUS_GID_LIST: string[] = [];
const EMPTY_EXCLUDE: string[] = [];

export type ComputeIusPickerModalProps = {
  open: boolean;
  onClose: () => void;
  onConfirm: (iusGids: string[]) => void;
  dwId: string;
  locale?: string;
  initialSelected?: string[];
  excludeIusGids?: string[];
  restrictUnitGid?: string;
  singleSelect?: boolean;
  eligibleTargetProcessType?: string | null;
};

export function ComputeIusPickerModal({
  open,
  onClose,
  onConfirm,
  dwId,
  locale,
  initialSelected = EMPTY_IUS_GID_LIST,
  excludeIusGids = EMPTY_EXCLUDE,
  restrictUnitGid,
  singleSelect = false,
  eligibleTargetProcessType = null,
}: ComputeIusPickerModalProps) {
  const { t } = useCore();
  const apiRef = useRef<IndicatorSelectApi | null>(null);
  const eligibleMode = Boolean(eligibleTargetProcessType?.trim());
  const [eligibleGidSet, setEligibleGidSet] = useState<Set<string>>(() => new Set());
  const [eligibleLabelByGid, setEligibleLabelByGid] = useState<Map<string, string>>(
    () => new Map()
  );
  const [eligibleReady, setEligibleReady] = useState(!eligibleMode);
  const [selectedCount, setSelectedCount] = useState(0);

  const baseUrl = useMemo(
    () => (dwId ? getDWAPIURL(dwId, "") : ""),
    [dwId]
  );

  const excludeSet = useMemo(() => new Set(excludeIusGids), [excludeIusGids]);

  useEffect(() => {
    if (!open || !dwId || !eligibleMode) {
      setEligibleGidSet(new Set());
      setEligibleLabelByGid(new Map());
      setEligibleReady(!eligibleMode);
      return;
    }
    let cancelled = false;
    setEligibleReady(false);
    (async () => {
      const pt = eligibleTargetProcessType!.trim();
      try {
        const r = await fetchEligibleFormulaTargetIusGids(dwId, pt, locale);
        if (cancelled) return;
        if (!r.ok) {
          setEligibleGidSet(new Set());
          setEligibleLabelByGid(new Map());
          return;
        }
        let gids = r.ius_gids.filter((g) => g && !excludeSet.has(g));
        const ru = restrictUnitGid?.trim();
        if (ru) {
          gids = gids.filter((gid) => {
            const p = parseIusGid(gid);
            return p != null && p[1] === ru;
          });
        }
        const names =
          gids.length > 0 ? await resolveIusNames(dwId, gids, locale) : {};
        if (cancelled) return;
        const labels = new Map<string, string>();
        for (const gid of gids) {
          const n = names[gid]?.trim();
          const raw = n && n.length > 0 ? n : gid;
          labels.set(gid, formatTargetIusGridLabel(raw));
        }
        setEligibleGidSet(new Set(gids));
        setEligibleLabelByGid(labels);
      } finally {
        if (!cancelled) setEligibleReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, dwId, eligibleMode, eligibleTargetProcessType, locale, excludeSet, restrictUnitGid]);

  const fetchIndicatorsCacheKey = useMemo(() => {
    if (!eligibleMode) return undefined;
    const pt = eligibleTargetProcessType?.trim() ?? "";
    const gids = [...eligibleGidSet].sort().join("\u0000");
    return `${dwId}|${pt}|${gids}`;
  }, [dwId, eligibleMode, eligibleTargetProcessType, eligibleGidSet]);

  const fetchFlatIusForParams = useCallback(
    async (params: IndicatorSelectFetchParams): Promise<IndicatorItem[]> => {
      const icId =
        params.icIdentifier ?? params.sector ?? params.goal ?? params.theme;
      const icType =
        params.icType ??
        (params.sector ? "SC" : params.goal ? "GL" : params.theme ? "TH" : undefined);

      if (eligibleMode && !icId) {
        const rows: IndicatorItem[] = [];
        for (const gid of eligibleGidSet) {
          rows.push({
            id: gid,
            label: eligibleLabelByGid.get(gid) ?? gid,
          });
        }
        rows.sort((a, b) =>
          a.label.localeCompare(b.label, undefined, { sensitivity: "base" })
        );
        return rows;
      }

      const indicators: IndicatorListItem[] = [];
      const unitMeta: Record<string, { u_name?: string; unit_name?: string }> = {};
      const subgroupMeta: Record<
        string,
        { sg_name?: string; subgroup_val_name?: string }
      > = {};
      let page = 1;
      let totalPages = 1;

      while (page <= totalPages) {
        const sp = new URLSearchParams();
        sp.set("page", String(page));
        sp.set("page_size", String(INDICATORS_IUS_PAGE_SIZE));
        sp.set("subgroup", "true");
        sp.set("default_subgroup_only", "false");
        sp.set("sort_field", "i_order");
        sp.set("sort_order", "asc");
        if (icId) {
          sp.set("ic_identifier", icId);
          if (icType) sp.set("ic_type", icType);
        }
        const url = `${getDWAPIURL(dwId, REFERENCE_PATH_INDICATORS)}?${sp}`;
        const json = (await getRequest(url, undefined, {
          suppressErrorMessage: true,
        })) as IndicatorsListResponse | { success?: false };
        if (!json || json.success !== true || !Array.isArray(json.data)) break;
        indicators.push(...json.data);
        Object.assign(unitMeta, (json.meta?.unit ?? {}) as typeof unitMeta);
        Object.assign(
          subgroupMeta,
          (json.meta?.subgroup ?? {}) as typeof subgroupMeta
        );
        totalPages = json.meta?.total_pages ?? 1;
        page += 1;
      }

      let options = expandIndicatorsToIusOptions(
        indicators,
        unitMeta,
        subgroupMeta,
        { restrictUnitGid, excludeGids: excludeSet }
      );

      if (eligibleMode) {
        options = options.filter((row) => eligibleGidSet.has(row.id));
        options = options.map((row) => ({
          id: row.id,
          label: eligibleLabelByGid.get(row.id) ?? row.label,
        }));
      }

      return options.map((row) => ({ id: row.id, label: row.label }));
    },
    [
      dwId,
      eligibleMode,
      eligibleGidSet,
      eligibleLabelByGid,
      excludeSet,
      restrictUnitGid,
    ]
  );

  const handleReady = useCallback((api: IndicatorSelectApi) => {
    apiRef.current = api;
    setSelectedCount(api.getSelected().length);
  }, []);

  const handleChange = useCallback((selected: IndicatorItem[]) => {
    setSelectedCount(selected.length);
  }, []);

  const handleApply = useCallback(
    (items: IndicatorItem[]) => {
      onConfirm(items.map((i) => String(i.id)));
    },
    [onConfirm]
  );

  const indicatorStrings = {
    allTabLabel: t("ALL", "All"),
    searchPlaceholder: t(
      "INDICATOR_SEARCH_PLACEHOLDER",
      t("SEARCH_INDICATORS", "Search indicators...")
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
    emptyLabel: eligibleMode
      ? t(
          "COMPUTE_NO_ELIGIBLE_TARGET_IUS",
          "No IUS have a saved formula for this operation yet. Configure formulas on the indicator first, then add processes here."
        )
      : t(
          "INDICATOR_EMPTY_LABEL",
          t("NO_INDICATORS_FOUND", "No indicators available.")
        ),
    summaryNone: t("IUS_SUMMARY_NONE", "No IUS selected"),
    summaryOne: t("IUS_SUMMARY_ONE", "1 IUS selected"),
    summaryMany: t("IUS_SUMMARY_MANY", "{n} IUS selected"),
    summarySelectedPanelTitle: t(
      "COMPUTE_IUS_SELECTED_PANEL_TITLE",
      "Selected IUS"
    ),
    close: t("COMMON_CLOSE", t("CLOSE")),
    selectAll: t("SELECT_ALL", "Select All"),
    deselectAll: t("DESELECT_ALL", "Deselect All"),
  };

  const initialItems = useMemo(
    () => initialSelected.map((id) => ({ id, label: id })),
    [initialSelected]
  );

  if (!open) return null;

  return (
    <SelectionModal<IndicatorItem>
      isOpen={open}
      onClose={onClose}
      title={t("SELECT_IUS")}
      onApply={handleApply}
      getApi={() => apiRef.current}
      applyDisabled={selectedCount === 0}
      applyLabel={t("ADD_SELECTED", t("MODAL_APPLY", "Apply"))}
    >
      {eligibleMode && !eligibleReady ? (
        <div className="dtk-ind-root">
          <div className="dtk-ind-loading-slot flex flex-1 items-center justify-center p-6">
            <Loader loadingLabel={t("COMMON_LOADING", t("LOADING"))} />
          </div>
        </div>
      ) : (
        <IndicatorSelect
          key={`${dwId}-${eligibleMode ? eligibleTargetProcessType : "all"}-${singleSelect ? "1" : "0"}`}
          baseUrl={baseUrl}
          fetchIndicators={eligibleMode ? fetchFlatIusForParams : undefined}
          fetchIndicatorsCacheKey={fetchIndicatorsCacheKey}
          locale={locale}
          headers={buildApiHeaders({ acceptLanguage: locale })}
          multiSelect={!singleSelect}
          flatIusList={!eligibleMode}
          restrictUnitGid={restrictUnitGid}
          excludeIusGids={excludeIusGids}
          initialSelectedItems={initialItems}
          onReady={handleReady}
          onChange={handleChange}
          loadingComponent={
            <Loader loadingLabel={t("COMMON_LOADING", t("LOADING"))} size={40} showStatusText />
          }
          strings={indicatorStrings}
        />
      )}
    </SelectionModal>
  );
}
