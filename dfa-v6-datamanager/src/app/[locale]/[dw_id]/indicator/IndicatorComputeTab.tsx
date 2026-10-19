"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useState,
} from "react";
import { toast } from "sonner";
import { useCore } from "@/contexts/CoreContext";
import { ComputeIusChip } from "@/components/compute/ComputeIusChip";
import { ComputeIusPickerModal } from "@/components/compute/ComputeIusPickerModal";
import { PrimaryButton } from "@/components/PrimaryButton";
import { Loader } from "@/components/Loader";
import { MainTabsBar } from "@/components/MainTabsBar";
import { SelectField } from "@/components/SelectField";
import {
  SideNavItem,
  SideNavList,
  SideNavListColumn,
  SideNavTruncatingLabel,
} from "@/components/SideNavListColumn";
import { IconBadge, IconBadgeSpacer } from "@/components/IconBadge";
import {
  deleteFormulaForIus,
  getExistingFormulaForIus,
  saveAreaFormula,
  saveMinusFormula,
  savePercentFormula,
  saveTimeFormula,
  resolveIusNames,
  saveTotalFormula,
  timeFrequencyApiToUi,
  timeFrequencyUiToApi,
} from "@/lib/api/computeFormula";
import {
  fetchAreaLevelsOnly,
  type AreaLevelCatalogRow,
} from "@/lib/datamanager/computeProcessFilterCatalog";
import {
  formatIusChipLabel,
  formatIusGidForDisplay,
  iusChipNeedsServerResolve,
  iusLabelLooksUnresolved,
  type IusDisplayLabelContext,
} from "@/lib/compute/iusDisplayLabel";
import { buildIusGid, parseIusGid } from "@/lib/compute/iusGid";
import {
  clearTotalFormulaSources,
  readTotalFormulaSources,
  writeTotalFormulaSources,
} from "@/lib/compute/totalFormulaLocalCache";

type ComputeSubTab = "total" | "minus" | "percentage" | "timePeriod" | "area";

type PersistedOpType = "TOTAL" | "MINUS" | "PERCENT" | "TIME" | "AREA";

const SUB_TAB_TO_OP: Record<ComputeSubTab, PersistedOpType> = {
  total: "TOTAL",
  minus: "MINUS",
  percentage: "PERCENT",
  timePeriod: "TIME",
  area: "AREA",
};

export type ComputeSaveErrorTab =
  | "total"
  | "minus"
  | "percentage"
  | "timePeriod"
  | "area";

export type ComputeSaveResult =
  | { ok: true }
  | { ok: false; tab: ComputeSaveErrorTab };

export type IndicatorComputeTabHandle = {
  /**
   * Validate compute UI, then either persist the one enabled rule (replaces any other
   * type on the server) or delete the server rule when all modes are off. No API calls
   * happen until this runs (checkboxes are UI-only).
   */
  saveComputeIfNeeded: () => Promise<ComputeSaveResult>;
};

type Props = {
  dwId: string;
  /** Route locale (e.g. en); used for Accept-Language on DW APIs */
  locale?: string;
  /**
   * When false, do not GET /compute/formula for the target IUS (avoids calls until the Compute tab is active).
   * Local UI resets when the target IUS changes while this is false.
   */
  loadServerFormula: boolean;
  /**
   * Subgroup GIDs that already have a compute formula for the current unit (GET indicator with subgroup_compute_formula).
   * Drives sidebar checkmarks without N per-subgroup formula requests.
   */
  subgroupGidsWithComputeFormulaFromApi: readonly string[];
  /** Indicator GID for the config row */
  indicatorGid: string;
  /** Indicator display name (form or row); used for IUS chip labels without resolve-ius. */
  indicatorDisplayName: string;
  /** Unit GID for the config row */
  unitGid: string;
  panelSgGids: string[];
  getSubgroupDisplayName: (gid: string) => string;
  /** Resolve unit GID to label (meta + units list). */
  getUnitLabel: (unitGid: string) => string;
  /** Unit label for template strings (e.g. percentage / time-period options). */
  unitDisplayLabel: string;
  /** Disables all editing controls (e.g. user lacks update permission). */
  readOnly?: boolean;
};

export const IndicatorComputeTab = forwardRef<
  IndicatorComputeTabHandle,
  Props
>(function IndicatorComputeTab(
  {
    dwId,
    locale,
    loadServerFormula,
    subgroupGidsWithComputeFormulaFromApi,
    indicatorGid,
    indicatorDisplayName,
    unitGid,
    panelSgGids,
    getSubgroupDisplayName,
    getUnitLabel,
    unitDisplayLabel,
    readOnly = false,
  },
  ref
) {
  const { t } = useCore();
  const [selectedSgGid, setSelectedSgGid] = useState<string | null>(null);
  const [subTab, setSubTab] = useState<ComputeSubTab>("total");

  const [totalEnabled, setTotalEnabled] = useState(false);
  const [minusEnabled, setMinusEnabled] = useState(false);
  const [pctEnabled, setPctEnabled] = useState(false);
  const [tpEnabled, setTpEnabled] = useState(false);

  const [serverOperationType, setServerOperationType] = useState<string | null>(
    null
  );
  /** Subgroups whose target IUS already has any saved compute formula (sidebar checkmarks). */
  const [sgWithFormula, setSgWithFormula] = useState<ReadonlySet<string>>(
    () => new Set()
  );
  const [formulaLoading, setFormulaLoading] = useState(false);
  const [totalSaving, setTotalSaving] = useState(false);
  const [minusSaving, setMinusSaving] = useState(false);
  const [pctSaving, setPctSaving] = useState(false);
  const [tpSaving, setTpSaving] = useState(false);
  const [sourceIusGids, setSourceIusGids] = useState<string[]>([]);
  const [sourcesUnknown, setSourcesUnknown] = useState(false);

  const [minuendIusGid, setMinuendIusGid] = useState<string | null>(null);
  const [subtrahendIusGid, setSubtrahendIusGid] = useState<string | null>(null);
  const [numeratorIusGid, setNumeratorIusGid] = useState<string | null>(null);
  const [denominatorIusGid, setDenominatorIusGid] = useState<string | null>(null);

  const [iusPicker, setIusPicker] = useState<{
    open: boolean;
    mode: "total" | "minuend" | "subtrahend" | "numerator" | "denominator";
  }>({ open: false, mode: "total" });

  const [pctMultiplier, setPctMultiplier] = useState("100");
  const [pctDecimals, setPctDecimals] = useState("");
  const [pctDenomArea, setPctDenomArea] = useState(false);
  const [pctAreaSearch, setPctAreaSearch] = useState("");
  const [pctLatestData, setPctLatestData] = useState(false);

  const [tpTargetFreq, setTpTargetFreq] = useState("half_yearly");
  const [tpSourceFreq, setTpSourceFreq] = useState("quarterly");
  const [tpAgg, setTpAgg] = useState("average");
  const [tpApplyAll, setTpApplyAll] = useState(false);
  const [tpApplyOther, setTpApplyOther] = useState(false);
  const [tpOverwrite, setTpOverwrite] = useState(false);
  const [tpDecimals, setTpDecimals] = useState("0");

  const [areaLevelsCatalog, setAreaLevelsCatalog] = useState<
    AreaLevelCatalogRow[]
  >([]);
  const [areaEnabled, setAreaEnabled] = useState(false);
  const [areaTargetLevelKey, setAreaTargetLevelKey] = useState("");
  const [areaSourceLevelKey, setAreaSourceLevelKey] = useState("");
  const [areaAgg, setAreaAgg] = useState("average");
  const [areaPopulateMid, setAreaPopulateMid] = useState(false);
  const [areaApplyAll, setAreaApplyAll] = useState(false);
  const [areaApplyOther, setAreaApplyOther] = useState(false);
  const [areaOverwrite, setAreaOverwrite] = useState(false);
  const [areaDecimals, setAreaDecimals] = useState("0");
  const [areaSaving, setAreaSaving] = useState(false);

  useEffect(() => {
    if (!dwId.trim()) {
      setAreaLevelsCatalog([]);
      return;
    }
    let cancelled = false;
    void fetchAreaLevelsOnly(dwId).then((rows) => {
      if (!cancelled) setAreaLevelsCatalog(rows);
    });
    return () => {
      cancelled = true;
    };
  }, [dwId]);

  useEffect(() => {
    if (panelSgGids.length === 0) {
      setSelectedSgGid(null);
      return;
    }
    setSelectedSgGid((prev) =>
      prev && panelSgGids.includes(prev) ? prev : panelSgGids[0]
    );
  }, [panelSgGids]);

  const targetIusGid = useMemo(() => {
    const i = indicatorGid.trim();
    const u = unitGid.trim();
    const s = selectedSgGid?.trim() ?? "";
    if (!i || !u || !s) return null;
    return buildIusGid(i, u, s);
  }, [indicatorGid, unitGid, selectedSgGid]);

  const targetConfigReady = Boolean(targetIusGid);

  const formulaWireKey = useMemo(
    () => [...subgroupGidsWithComputeFormulaFromApi].sort().join("\u0001"),
    [subgroupGidsWithComputeFormulaFromApi]
  );

  useEffect(() => {
    setSgWithFormula(new Set(subgroupGidsWithComputeFormulaFromApi));
  }, [formulaWireKey, subgroupGidsWithComputeFormulaFromApi]);

  const resetPctLocal = useCallback(() => {
    setPctEnabled(false);
    setNumeratorIusGid(null);
    setDenominatorIusGid(null);
    setPctMultiplier("100");
    setPctDecimals("");
    setPctDenomArea(false);
    setPctAreaSearch("");
    setPctLatestData(false);
  }, []);

  const resetTpLocal = useCallback(() => {
    setTpEnabled(false);
    setTpTargetFreq("half_yearly");
    setTpSourceFreq("quarterly");
    setTpAgg("average");
    setTpApplyAll(false);
    setTpApplyOther(false);
    setTpOverwrite(false);
    setTpDecimals("0");
  }, []);

  const resetAreaLocal = useCallback(() => {
    setAreaEnabled(false);
    setAreaTargetLevelKey("");
    setAreaSourceLevelKey("");
    setAreaAgg("average");
    setAreaPopulateMid(false);
    setAreaApplyAll(false);
    setAreaApplyOther(false);
    setAreaOverwrite(false);
    setAreaDecimals("0");
  }, []);

  /** Clear local UI for every compute mode except `keep` (mutual exclusivity). */
  const clearLocalComputeExcept = useCallback(
    (keep: PersistedOpType) => {
      if (keep !== "TOTAL") {
        setTotalEnabled(false);
        setSourceIusGids([]);
        setSourcesUnknown(false);
        if (targetIusGid) clearTotalFormulaSources(dwId, targetIusGid);
      }
      if (keep !== "MINUS") {
        setMinusEnabled(false);
        setMinuendIusGid(null);
        setSubtrahendIusGid(null);
      }
      if (keep !== "PERCENT") {
        resetPctLocal();
      }
      if (keep !== "TIME") {
        resetTpLocal();
      }
      if (keep !== "AREA") {
        resetAreaLocal();
      }
    },
    [targetIusGid, dwId, resetPctLocal, resetTpLocal, resetAreaLocal]
  );

  /** If more than one mode is enabled (stale state), keep the one for the visible sub-tab. */
  useEffect(() => {
    const n =
      (totalEnabled ? 1 : 0) +
      (minusEnabled ? 1 : 0) +
      (pctEnabled ? 1 : 0) +
      (tpEnabled ? 1 : 0) +
      (areaEnabled ? 1 : 0);
    if (n <= 1) return;
    clearLocalComputeExcept(SUB_TAB_TO_OP[subTab]);
  }, [
    totalEnabled,
    minusEnabled,
    pctEnabled,
    tpEnabled,
    areaEnabled,
    subTab,
    clearLocalComputeExcept,
  ]);

  useEffect(() => {
    if (!dwId || !targetIusGid) {
      setServerOperationType(null);
      setTotalEnabled(false);
      setSourceIusGids([]);
      setSourcesUnknown(false);
      setMinusEnabled(false);
      setMinuendIusGid(null);
      setSubtrahendIusGid(null);
      resetPctLocal();
      resetTpLocal();
      resetAreaLocal();
      return;
    }

    if (!loadServerFormula) {
      setServerOperationType(null);
      setTotalEnabled(false);
      setSourceIusGids([]);
      setSourcesUnknown(false);
      setMinusEnabled(false);
      setMinuendIusGid(null);
      setSubtrahendIusGid(null);
      resetPctLocal();
      resetTpLocal();
      resetAreaLocal();
      return;
    }

    let cancelled = false;
    (async () => {
      setFormulaLoading(true);
      const r = await getExistingFormulaForIus(dwId, targetIusGid, locale);
      if (cancelled) return;
      setFormulaLoading(false);

      if (!r.ok) {
        toast.error(r.message);
        setServerOperationType(null);
        setTotalEnabled(false);
        setSourceIusGids([]);
        setSourcesUnknown(false);
        setMinusEnabled(false);
        setMinuendIusGid(null);
        setSubtrahendIusGid(null);
        resetPctLocal();
        resetTpLocal();
        resetAreaLocal();
        return;
      }

      const d = r.data;
      if (!d.exists) {
        clearTotalFormulaSources(dwId, targetIusGid);
        setServerOperationType(null);
        setTotalEnabled(false);
        setSourceIusGids([]);
        setSourcesUnknown(false);
        setMinusEnabled(false);
        setMinuendIusGid(null);
        setSubtrahendIusGid(null);
        resetPctLocal();
        resetTpLocal();
        resetAreaLocal();
        return;
      }

      setServerOperationType(d.operation_type ?? null);

      if (d.operation_type === "TOTAL") {
        resetPctLocal();
        resetTpLocal();
        resetAreaLocal();
        setMinusEnabled(false);
        setMinuendIusGid(null);
        setSubtrahendIusGid(null);
        setTotalEnabled(true);
        const cached = readTotalFormulaSources(dwId, targetIusGid);
        if (cached && cached.length > 0) {
          setSourceIusGids(cached);
          setSourcesUnknown(false);
        } else {
          setSourceIusGids([]);
          setSourcesUnknown(true);
        }
      } else if (d.operation_type === "MINUS") {
        resetPctLocal();
        resetTpLocal();
        resetAreaLocal();
        clearTotalFormulaSources(dwId, targetIusGid);
        setTotalEnabled(false);
        setSourceIusGids([]);
        setSourcesUnknown(false);
        setMinusEnabled(true);
        setMinuendIusGid(d.minuend_ius?.trim() || null);
        setSubtrahendIusGid(d.subtrahend_ius?.trim() || null);
      } else if (d.operation_type === "PERCENT") {
        resetTpLocal();
        resetAreaLocal();
        clearTotalFormulaSources(dwId, targetIusGid);
        setTotalEnabled(false);
        setSourceIusGids([]);
        setSourcesUnknown(false);
        setMinusEnabled(false);
        setMinuendIusGid(null);
        setSubtrahendIusGid(null);
        setPctEnabled(true);
        setNumeratorIusGid(d.numerator_ius?.trim() || null);
        setDenominatorIusGid(d.denominator_ius?.trim() || null);
        setPctDenomArea(Boolean(d.den_area_specific));
        setPctAreaSearch(
          String(d.den_area_name ?? d.den_area_id ?? "").trim()
        );
        setPctLatestData(Boolean(d.is_most_recent));
        setPctMultiplier(
          d.den_multiplier != null && d.den_multiplier !== undefined
            ? String(d.den_multiplier)
            : ""
        );
        setPctDecimals(
          d.target_decimal != null && d.target_decimal !== undefined
            ? String(d.target_decimal)
            : ""
        );
      } else if (d.operation_type === "TIME") {
        resetPctLocal();
        resetAreaLocal();
        clearTotalFormulaSources(dwId, targetIusGid);
        setTotalEnabled(false);
        setSourceIusGids([]);
        setSourcesUnknown(false);
        setMinusEnabled(false);
        setMinuendIusGid(null);
        setSubtrahendIusGid(null);
        setTpEnabled(true);
        setTpTargetFreq(timeFrequencyApiToUi(d.target_tp_freq ?? "H"));
        setTpSourceFreq(timeFrequencyApiToUi(d.source_tp_freq ?? "Q"));
        setTpAgg(d.aggregation_type === "avg" ? "average" : "sum");
        setTpDecimals(
          d.target_decimal != null && d.target_decimal !== undefined
            ? String(d.target_decimal)
            : "0"
        );
        setTpApplyAll(false);
        setTpApplyOther(false);
        setTpOverwrite(false);
      } else if (d.operation_type === "AREA") {
        resetPctLocal();
        resetTpLocal();
        clearTotalFormulaSources(dwId, targetIusGid);
        setTotalEnabled(false);
        setSourceIusGids([]);
        setSourcesUnknown(false);
        setMinusEnabled(false);
        setMinuendIusGid(null);
        setSubtrahendIusGid(null);
        setAreaEnabled(true);
        setAreaTargetLevelKey(
          d.target_area_level != null ? String(d.target_area_level) : ""
        );
        setAreaSourceLevelKey(
          d.source_area_level != null ? String(d.source_area_level) : ""
        );
        setAreaAgg(d.aggregation_type === "sum" ? "sum" : "average");
        setAreaPopulateMid(Boolean(d.populate_mid_levels));
        setAreaApplyAll(false);
        setAreaApplyOther(false);
        setAreaOverwrite(false);
        setAreaDecimals(
          d.target_decimal != null && d.target_decimal !== undefined
            ? String(d.target_decimal)
            : "0"
        );
      } else {
        clearTotalFormulaSources(dwId, targetIusGid);
        setTotalEnabled(false);
        setSourceIusGids([]);
        setSourcesUnknown(false);
        setMinusEnabled(false);
        setMinuendIusGid(null);
        setSubtrahendIusGid(null);
        resetPctLocal();
        resetTpLocal();
        resetAreaLocal();
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    dwId,
    targetIusGid,
    locale,
    loadServerFormula,
    resetPctLocal,
    resetTpLocal,
    resetAreaLocal,
  ]);

  const iusGidsToLabel = useMemo(() => {
    const s = new Set<string>();
    for (const g of sourceIusGids) if (g) s.add(g);
    if (minuendIusGid) s.add(minuendIusGid);
    if (subtrahendIusGid) s.add(subtrahendIusGid);
    if (numeratorIusGid) s.add(numeratorIusGid);
    if (denominatorIusGid) s.add(denominatorIusGid);
    return Array.from(s);
  }, [
    sourceIusGids,
    minuendIusGid,
    subtrahendIusGid,
    numeratorIusGid,
    denominatorIusGid,
  ]);

  const iusLabelCtx = useMemo<IusDisplayLabelContext>(
    () => ({
      homeIndicatorGid: indicatorGid.trim(),
      homeIndicatorName:
        indicatorDisplayName.trim() || indicatorGid.trim(),
      homeUnitGid: unitGid.trim(),
      getUnitLabel,
      getSubgroupLabel: getSubgroupDisplayName,
    }),
    [
      indicatorGid,
      indicatorDisplayName,
      unitGid,
      getUnitLabel,
      getSubgroupDisplayName,
    ]
  );

  const iusLabels = useMemo(() => {
    const out: Record<string, string> = {};
    for (const g of iusGidsToLabel) {
      out[g] = formatIusChipLabel(g, iusLabelCtx);
    }
    return out;
  }, [iusGidsToLabel, iusLabelCtx]);

  const [resolvedIusLabels, setResolvedIusLabels] = useState<
    Record<string, string>
  >({});

  useEffect(() => {
    if (!dwId || iusGidsToLabel.length === 0) {
      setResolvedIusLabels({});
      return;
    }
    const needResolve = iusGidsToLabel.filter((g) => {
      if (iusChipNeedsServerResolve(g, iusLabelCtx)) return true;
      const local = iusLabels[g] ?? formatIusChipLabel(g, iusLabelCtx);
      return iusLabelLooksUnresolved(g, local);
    });
    if (needResolve.length === 0) {
      setResolvedIusLabels({});
      return;
    }
    let cancelled = false;
    void resolveIusNames(dwId, needResolve, locale).then((data) => {
      if (cancelled) return;
      const merged: Record<string, string> = {};
      for (const g of needResolve) {
        const fromApi = (data[g] ?? "").trim();
        if (fromApi) merged[g] = fromApi;
      }
      setResolvedIusLabels(merged);
    });
    return () => {
      cancelled = true;
    };
  }, [dwId, locale, iusGidsToLabel, iusLabels, iusLabelCtx]);

  const handleTotalCheck = useCallback(
    (checked: boolean) => {
      if (checked) {
        clearLocalComputeExcept("TOTAL");
        setTotalEnabled(true);
        return;
      }
      setTotalEnabled(false);
      setSourceIusGids([]);
      setSourcesUnknown(false);
      if (targetIusGid) clearTotalFormulaSources(dwId, targetIusGid);
    },
    [clearLocalComputeExcept, targetIusGid, dwId]
  );

  const handleMinusCheck = useCallback(
    (checked: boolean) => {
      if (checked) {
        clearLocalComputeExcept("MINUS");
        setMinusEnabled(true);
        return;
      }
      setMinusEnabled(false);
      setMinuendIusGid(null);
      setSubtrahendIusGid(null);
    },
    [clearLocalComputeExcept]
  );

  const handlePctCheck = useCallback(
    (checked: boolean) => {
      if (checked) {
        clearLocalComputeExcept("PERCENT");
        setPctEnabled(true);
        return;
      }
      resetPctLocal();
    },
    [clearLocalComputeExcept, resetPctLocal]
  );

  const handleTpCheck = useCallback(
    (checked: boolean) => {
      if (checked) {
        clearLocalComputeExcept("TIME");
        setTpEnabled(true);
        return;
      }
      resetTpLocal();
    },
    [clearLocalComputeExcept, resetTpLocal]
  );

  const handleAreaCheck = useCallback(
    (checked: boolean) => {
      if (checked) {
        clearLocalComputeExcept("AREA");
        setAreaEnabled(true);
        return;
      }
      resetAreaLocal();
    },
    [clearLocalComputeExcept, resetAreaLocal]
  );

  const persistTotalToServer = useCallback(async (): Promise<boolean> => {
    if (!targetIusGid || sourceIusGids.length === 0) {
      return false;
    }
    const r = await saveTotalFormula(
      dwId,
      targetIusGid,
      sourceIusGids,
      locale
    );
    if (!r.ok) {
      toast.error(r.message);
      return false;
    }
    writeTotalFormulaSources(dwId, targetIusGid, sourceIusGids);
    setServerOperationType("TOTAL");
    setSourcesUnknown(false);
    return true;
  }, [targetIusGid, sourceIusGids, dwId, locale]);

  const persistMinusToServer = useCallback(async (): Promise<boolean> => {
    if (!targetIusGid || !minuendIusGid || !subtrahendIusGid) {
      return false;
    }
    const r = await saveMinusFormula(
      dwId,
      targetIusGid,
      minuendIusGid,
      subtrahendIusGid,
      locale
    );
    if (!r.ok) {
      toast.error(r.message);
      return false;
    }
    setServerOperationType("MINUS");
    return true;
  }, [targetIusGid, minuendIusGid, subtrahendIusGid, dwId, locale]);

  const persistPercentToServer = useCallback(async (): Promise<boolean> => {
    if (!targetIusGid || !numeratorIusGid || !denominatorIusGid) {
      return false;
    }
    const multRaw = pctMultiplier.trim();
    let den_multiplier: number | null = null;
    if (multRaw !== "") {
      const n = Number(multRaw);
      if (!Number.isFinite(n) || n <= 0) {
        toast.error(
          t(
            "COMPUTE_MULTIPLIER_INVALID",
            "Multiplier must be a positive number or empty for a ratio."
          )
        );
        return false;
      }
      den_multiplier = n;
    }
    const decRaw = pctDecimals.trim();
    let target_decimal: number | null | undefined = undefined;
    if (decRaw !== "") {
      const d = parseInt(decRaw, 10);
      if (!Number.isFinite(d) || d < 0 || d > 10) {
        toast.error(
          t(
            "COMPUTE_DECIMALS_INVALID",
            "Decimals must be between 0 and 10."
          )
        );
        return false;
      }
      target_decimal = d;
    } else {
      target_decimal = null;
    }
    const areaTrim = pctAreaSearch.trim();
    const r = await savePercentFormula(
      dwId,
      {
        target_ius: targetIusGid,
        numerator_ius: numeratorIusGid,
        denominator_ius: denominatorIusGid,
        target_decimal,
        den_area_specific: pctDenomArea,
        den_area_id: pctDenomArea && areaTrim ? areaTrim : null,
        den_area_name: pctDenomArea && areaTrim ? areaTrim : null,
        den_multiplier,
        is_most_recent: pctLatestData,
      },
      locale
    );
    if (!r.ok) {
      toast.error(r.message);
      return false;
    }
    setServerOperationType("PERCENT");
    return true;
  }, [
    targetIusGid,
    numeratorIusGid,
    denominatorIusGid,
    pctMultiplier,
    pctDecimals,
    pctDenomArea,
    pctAreaSearch,
    pctLatestData,
    dwId,
    locale,
    t,
  ]);

  const persistTimeToServer = useCallback(async (): Promise<boolean> => {
    if (!targetIusGid) return false;
    const decRaw = tpDecimals.trim();
    let target_decimal: number | null | undefined = null;
    if (decRaw !== "") {
      const d = parseInt(decRaw, 10);
      if (!Number.isFinite(d) || d < 0 || d > 10) {
        toast.error(
          t(
            "COMPUTE_DECIMALS_INVALID",
            "Decimals must be between 0 and 10."
          )
        );
        return false;
      }
      target_decimal = d;
    }
    const bulk_operations =
      tpApplyAll || tpApplyOther || tpOverwrite
        ? {
            time_all_sub: tpApplyAll,
            time_oth_sub: tpApplyOther && !tpApplyAll,
            time_all_overwrite: tpOverwrite,
          }
        : undefined;
    const r = await saveTimeFormula(
      dwId,
      {
        target_ius: targetIusGid,
        target_tp_freq: timeFrequencyUiToApi(tpTargetFreq),
        source_tp_freq: timeFrequencyUiToApi(tpSourceFreq),
        aggregation_type: tpAgg === "average" ? "avg" : "sum",
        target_decimal,
        bulk_operations,
      },
      locale
    );
    if (!r.ok) {
      toast.error(r.message);
      return false;
    }
    setServerOperationType("TIME");
    return true;
  }, [
    targetIusGid,
    tpDecimals,
    tpApplyAll,
    tpApplyOther,
    tpOverwrite,
    tpTargetFreq,
    tpSourceFreq,
    tpAgg,
    dwId,
    locale,
    t,
  ]);

  const persistAreaToServer = useCallback(async (): Promise<boolean> => {
    if (!targetIusGid) return false;
    const tL = parseInt(areaTargetLevelKey, 10);
    const sL = parseInt(areaSourceLevelKey, 10);
    if (
      !Number.isFinite(tL) ||
      !Number.isFinite(sL) ||
      areaTargetLevelKey === "" ||
      areaSourceLevelKey === ""
    ) {
      toast.error(
        t(
          "COMPUTE_AREA_LEVELS_REQUIRED",
          "Choose both target and source area levels."
        )
      );
      return false;
    }
    if (tL >= sL) {
      toast.error(
        t(
          "COMPUTE_AREA_LEVELS_ORDER",
          "Target area level must be less than source area level (coarser parent vs finer children)."
        )
      );
      return false;
    }
    const decRaw = areaDecimals.trim();
    let target_decimal: number | null | undefined = null;
    if (decRaw !== "") {
      const d = parseInt(decRaw, 10);
      if (!Number.isFinite(d) || d < 0 || d > 10) {
        toast.error(
          t(
            "COMPUTE_DECIMALS_INVALID",
            "Decimals must be between 0 and 10."
          )
        );
        return false;
      }
      target_decimal = d;
    }
    const bulk_operations =
      areaApplyAll || areaApplyOther || areaOverwrite
        ? {
            area_all_sub: areaApplyAll,
            area_oth_sub: areaApplyOther && !areaApplyAll,
            area_all_overwrite: areaOverwrite,
          }
        : undefined;
    const r = await saveAreaFormula(
      dwId,
      {
        target_ius: targetIusGid,
        target_area_level: tL,
        source_area_level: sL,
        aggregation_type: areaAgg === "average" ? "avg" : "sum",
        populate_mid_levels: areaPopulateMid,
        target_decimal,
        bulk_operations,
      },
      locale
    );
    if (!r.ok) {
      toast.error(r.message);
      return false;
    }
    setServerOperationType("AREA");
    return true;
  }, [
    targetIusGid,
    areaTargetLevelKey,
    areaSourceLevelKey,
    areaDecimals,
    areaApplyAll,
    areaApplyOther,
    areaOverwrite,
    areaAgg,
    areaPopulateMid,
    dwId,
    locale,
    t,
  ]);

  const bumpSubgroupFormulaBadge = useCallback(
    (sgGid: string | null, hasFormula: boolean) => {
      const sg = (sgGid ?? "").trim();
      if (!sg) return;
      setSgWithFormula((prev) => {
        const n = new Set(prev);
        if (hasFormula) n.add(sg);
        else n.delete(sg);
        return n;
      });
    },
    []
  );

  useImperativeHandle(
    ref,
    () => ({
      saveComputeIfNeeded: async (): Promise<ComputeSaveResult> => {
        if (!targetIusGid) return { ok: true };

        const persistedOp = serverOperationType;

        const totalComplete =
          totalEnabled && sourceIusGids.length > 0;
        const minusComplete =
          minusEnabled && Boolean(minuendIusGid && subtrahendIusGid);
        const pctComplete =
          pctEnabled && Boolean(numeratorIusGid && denominatorIusGid);
        const tArea = parseInt(areaTargetLevelKey, 10);
        const sArea = parseInt(areaSourceLevelKey, 10);
        const areaComplete =
          areaEnabled &&
          areaTargetLevelKey !== "" &&
          areaSourceLevelKey !== "" &&
          Number.isFinite(tArea) &&
          Number.isFinite(sArea) &&
          tArea < sArea;

        if (totalEnabled && !totalComplete) {
          return { ok: false, tab: "total" };
        }
        if (minusEnabled && !minusComplete) {
          return { ok: false, tab: "minus" };
        }
        if (pctEnabled && !pctComplete) {
          return { ok: false, tab: "percentage" };
        }
        if (areaEnabled && !areaComplete) {
          return { ok: false, tab: "area" };
        }

        if (totalComplete) {
          setTotalSaving(true);
          const ok = await persistTotalToServer();
          setTotalSaving(false);
          if (ok) bumpSubgroupFormulaBadge(selectedSgGid, true);
          return ok ? { ok: true } : { ok: false, tab: "total" };
        }
        if (minusComplete) {
          setMinusSaving(true);
          const ok = await persistMinusToServer();
          setMinusSaving(false);
          if (ok) bumpSubgroupFormulaBadge(selectedSgGid, true);
          return ok ? { ok: true } : { ok: false, tab: "minus" };
        }
        if (pctComplete) {
          setPctSaving(true);
          const ok = await persistPercentToServer();
          setPctSaving(false);
          if (ok) bumpSubgroupFormulaBadge(selectedSgGid, true);
          return ok ? { ok: true } : { ok: false, tab: "percentage" };
        }
        if (tpEnabled) {
          setTpSaving(true);
          const ok = await persistTimeToServer();
          setTpSaving(false);
          if (ok) bumpSubgroupFormulaBadge(selectedSgGid, true);
          return ok ? { ok: true } : { ok: false, tab: "timePeriod" };
        }
        if (areaComplete) {
          setAreaSaving(true);
          const ok = await persistAreaToServer();
          setAreaSaving(false);
          if (ok) bumpSubgroupFormulaBadge(selectedSgGid, true);
          return ok ? { ok: true } : { ok: false, tab: "area" };
        }

        if (persistedOp === "TOTAL") {
          setTotalSaving(true);
          const del = await deleteFormulaForIus(
            dwId,
            "TOTAL",
            targetIusGid,
            locale
          );
          setTotalSaving(false);
          if (!del.ok) {
            toast.error(del.message);
            return { ok: false, tab: "total" };
          }
          clearTotalFormulaSources(dwId, targetIusGid);
          setSourceIusGids([]);
          setSourcesUnknown(false);
          setServerOperationType(null);
          bumpSubgroupFormulaBadge(selectedSgGid, false);
          return { ok: true };
        }
        if (persistedOp === "MINUS") {
          setMinusSaving(true);
          const del = await deleteFormulaForIus(
            dwId,
            "MINUS",
            targetIusGid,
            locale
          );
          setMinusSaving(false);
          if (!del.ok) {
            toast.error(del.message);
            return { ok: false, tab: "minus" };
          }
          setMinuendIusGid(null);
          setSubtrahendIusGid(null);
          setServerOperationType(null);
          bumpSubgroupFormulaBadge(selectedSgGid, false);
          return { ok: true };
        }
        if (persistedOp === "PERCENT") {
          setPctSaving(true);
          const del = await deleteFormulaForIus(
            dwId,
            "PERCENT",
            targetIusGid,
            locale
          );
          setPctSaving(false);
          if (!del.ok) {
            toast.error(del.message);
            return { ok: false, tab: "percentage" };
          }
          setServerOperationType(null);
          bumpSubgroupFormulaBadge(selectedSgGid, false);
          return { ok: true };
        }
        if (persistedOp === "TIME") {
          setTpSaving(true);
          const del = await deleteFormulaForIus(
            dwId,
            "TIME",
            targetIusGid,
            locale
          );
          setTpSaving(false);
          if (!del.ok) {
            toast.error(del.message);
            return { ok: false, tab: "timePeriod" };
          }
          setServerOperationType(null);
          bumpSubgroupFormulaBadge(selectedSgGid, false);
          return { ok: true };
        }
        if (persistedOp === "AREA") {
          setAreaSaving(true);
          const del = await deleteFormulaForIus(
            dwId,
            "AREA",
            targetIusGid,
            locale
          );
          setAreaSaving(false);
          if (!del.ok) {
            toast.error(del.message);
            return { ok: false, tab: "area" };
          }
          setServerOperationType(null);
          bumpSubgroupFormulaBadge(selectedSgGid, false);
          return { ok: true };
        }

        return { ok: true };
      },
    }),
    [
      targetIusGid,
      selectedSgGid,
      serverOperationType,
      totalEnabled,
      minusEnabled,
      pctEnabled,
      tpEnabled,
      areaEnabled,
      areaTargetLevelKey,
      areaSourceLevelKey,
      sourceIusGids.length,
      minuendIusGid,
      subtrahendIusGid,
      numeratorIusGid,
      denominatorIusGid,
      persistTotalToServer,
      persistMinusToServer,
      persistPercentToServer,
      persistTimeToServer,
      persistAreaToServer,
      bumpSubgroupFormulaBadge,
      dwId,
      locale,
    ]
  );

  const removeSource = useCallback((iusGid: string) => {
    setSourceIusGids((prev) => prev.filter((x) => x !== iusGid));
  }, []);

  const exampleSgQuoted = useMemo(() => {
    const gid = selectedSgGid ?? panelSgGids[0];
    if (!gid) return "—";
    return getSubgroupDisplayName(gid);
  }, [selectedSgGid, panelSgGids, getSubgroupDisplayName]);

  const unitQuoted = unitDisplayLabel.trim() || "—";

  const subTabButtons: { id: ComputeSubTab; label: string; icon: string }[] = [
    { id: "total", label: t("TOTAL"), icon: "functions" },
    { id: "minus", label: t("MINUS"), icon: "remove" },
    { id: "percentage", label: t("PERCENTAGE"), icon: "percent" },
    { id: "timePeriod", label: t("TIME_PERIOD", "Time Period"), icon: "calendar_month" },
    { id: "area", label: t("AREA", "Area"), icon: "map" },
  ];

  const isComputeSubTabConfigured = useCallback(
    (id: ComputeSubTab) => {
      switch (id) {
        case "total":
          return serverOperationType === "TOTAL";
        case "minus":
          return serverOperationType === "MINUS";
        case "percentage":
          return serverOperationType === "PERCENT";
        case "timePeriod":
          return serverOperationType === "TIME";
        case "area":
          return serverOperationType === "AREA";
        default:
          return false;
      }
    },
    [serverOperationType]
  );

  const areaLevelOptions = useMemo(
    () =>
      areaLevelsCatalog.map((row) => ({
        value: String(row.al_level),
        label: `${row.al_level} — ${row.al_name}`,
      })),
    [areaLevelsCatalog]
  );

  const freqOptions = useMemo(
    () => [
      { value: "annual", label: t("ANNUALLY", "Annually") },
      { value: "half_yearly", label: t("HALF_YEARLY", "Half-yearly") },
      { value: "quarterly", label: t("QUARTERLY", "Quarterly") },
      { value: "monthly", label: t("MONTHLY", "Monthly") },
    ],
    [t]
  );

  const aggOptions = useMemo(
    () => [
      { value: "sum", label: t("SUM") },
      { value: "average", label: t("AVERAGE") },
    ],
    [t]
  );

  const chipLabel = useCallback(
    (iusGid: string) =>
      resolvedIusLabels[iusGid]?.trim() ||
      iusLabels[iusGid] ||
      formatIusChipLabel(iusGid, iusLabelCtx) ||
      formatIusGidForDisplay(iusGid, iusLabelCtx) ||
      iusGid,
    [resolvedIusLabels, iusLabels, iusLabelCtx]
  );

  return (
    <div className="compute-tab-root">
      <div className="compute-layout">
        <SideNavListColumn
          width={220}
          className="min-w-[160px] max-w-[420px] shrink-0"
        >
          <SideNavList>
            {panelSgGids.length === 0 ? (
              <p className="side-nav-empty">
                {t(
                  "COMPUTE_NO_SUBGROUPS",
                  "Add subgroups on the Subgroups tab to configure compute rules."
                )}
              </p>
            ) : (
              panelSgGids.map((gid) => (
                <SideNavItem
                  key={gid}
                  active={selectedSgGid === gid}
                  onClick={() => setSelectedSgGid(gid)}
                >
                  {sgWithFormula.has(gid) ? (
                    <IconBadge symbol="tick" ariaHidden />
                  ) : (
                    <IconBadgeSpacer />
                  )}
                  <SideNavTruncatingLabel text={getSubgroupDisplayName(gid)} />
                </SideNavItem>
              ))
            )}
          </SideNavList>
        </SideNavListColumn>
        <div className="compute-main">
          <MainTabsBar<ComputeSubTab>
            className="shrink-0 !px-4"
            tablistAccessibility={{}}
            tabs={subTabButtons.map((b) => ({
              value: b.id,
              icon: b.icon,
              tabClassName: "gap-1",
              label: (
                <>
                  <span>{b.label}</span>
                  {isComputeSubTabConfigured(b.id) ? (
                    <IconBadge
                      symbol="tick"
                      size="sm"
                      title={t(
                        "COMPUTE_TAB_CONFIGURED",
                        "Compute rule saved for this subgroup"
                      )}
                      ariaLabel={t(
                        "COMPUTE_TAB_CONFIGURED",
                        "Compute rule saved for this subgroup"
                      )}
                    />
                  ) : null}
                </>
              ),
            }))}
            activeValue={subTab}
            onSelect={setSubTab}
          />
          <fieldset disabled={readOnly} className="compute-card m-0 min-w-0 border-0 p-0">
            {subTab === "total" && (
              <div className="compute-section">
                {!indicatorGid.trim() || !unitGid.trim() ? (
                  <p className="compute-callout-warning">
                    {t(
                      "COMPUTE_INDICATOR_UNIT_REQUIRED",
                      "Set the indicator and unit on this row before configuring compute."
                    )}
                  </p>
                ) : null}

                {sourcesUnknown ? (
                  <p className="compute-callout-warning text-xs font-normal leading-snug">
                    {t(
                      "COMPUTE_TOTAL_SOURCES_CACHE_HINT",
                      "A Total rule exists on the server, but this app cannot load which rows are summed until the API returns that list. This browser shows the last saved selection from here only—it may be incomplete on a new device or after edits elsewhere."
                    )}
                  </p>
                ) : null}

                <label className="compute-check-row">
                  <input
                    type="checkbox"
                    className="checkbox-comp shrink-0"
                    checked={totalEnabled}
                    disabled={!targetConfigReady || formulaLoading || totalSaving}
                    onChange={(e) => void handleTotalCheck(e.target.checked)}
                  />
                  <span className="compute-check-title text-xs">
                    {t(
                      "COMPUTE_TOTAL_ENABLE",
                      "Total — Enable compute to calculate sum of subgroups"
                    )}
                  </span>
                </label>
                <p className="compute-hint">
                  {t("COMPUTE_TOTAL_EXAMPLE", "Example: Total = Male + Female")}
                </p>
                <div className="compute-rule-sep" />
                <div className="compute-ius-slot">
                  <PrimaryButton
                    type="button"
                    disabled={
                      !totalEnabled || !targetConfigReady || totalSaving
                    }
                    onClick={() =>
                      setIusPicker({ open: true, mode: "total" })
                    }
                  >
                    + {t("SELECT_IUS")}
                  </PrimaryButton>
                  {sourceIusGids.length > 0 ? (
                    <ul className="compute-ius-chips">
                      {sourceIusGids.map((gid) => (
                        <ComputeIusChip
                          key={gid}
                          label={chipLabel(gid)}
                          disabled={totalSaving}
                          removeAriaLabel={t("REMOVE")}
                          onRemove={() => removeSource(gid)}
                        />
                      ))}
                    </ul>
                  ) : null}
                </div>
              </div>
            )}

            {subTab === "minus" && (
              <div className="compute-section">
                {!indicatorGid.trim() || !unitGid.trim() ? (
                  <p className="compute-callout-warning">
                    {t(
                      "COMPUTE_INDICATOR_UNIT_REQUIRED",
                      "Set the indicator and unit on this row before configuring compute."
                    )}
                  </p>
                ) : null}

                <label className="compute-check-row">
                  <input
                    type="checkbox"
                    className="checkbox-comp shrink-0"
                    checked={minusEnabled}
                    disabled={
                      !targetConfigReady || formulaLoading || minusSaving
                    }
                    onChange={(e) => void handleMinusCheck(e.target.checked)}
                  />
                  <span className="compute-check-title text-xs">
                    {t(
                      "COMPUTE_MINUS_ENABLE",
                      "Minus — Enable compute to calculate the difference"
                    )}
                  </span>
                </label>
                <p className="compute-hint">
                  {t("COMPUTE_MINUS_EXAMPLE", "Example: Female = Total - Male")}
                </p>
                <div className="compute-rule-sep" />
                <div className="compute-stack">
                  <div className="sp-field">
                    <div className="form-label">
                      {t("MINUEND")}
                    </div>
                    <div className="compute-ius-slot">
                      {minuendIusGid ? (
                        <ul className="compute-ius-chips">
                          <ComputeIusChip
                            label={chipLabel(minuendIusGid)}
                            disabled={minusSaving || !minusEnabled}
                            removeAriaLabel={t("REMOVE")}
                            onRemove={() => setMinuendIusGid(null)}
                          />
                        </ul>
                      ) : null}
                      <PrimaryButton
                        type="button"
                        disabled={
                          !minusEnabled || !targetConfigReady || minusSaving
                        }
                        onClick={() =>
                          setIusPicker({ open: true, mode: "minuend" })
                        }
                      >
                        + {t("SELECT_IUS")}
                      </PrimaryButton>
                    </div>
                  </div>
                  <div className="compute-op-row" aria-hidden>
                    —
                  </div>
                  <div className="sp-field">
                    <div className="form-label">
                      {t("SUBTRAHEND")}
                    </div>
                    <div className="compute-ius-slot">
                      {subtrahendIusGid ? (
                        <ul className="compute-ius-chips">
                          <ComputeIusChip
                            label={chipLabel(subtrahendIusGid)}
                            disabled={minusSaving || !minusEnabled}
                            removeAriaLabel={t("REMOVE")}
                            onRemove={() => setSubtrahendIusGid(null)}
                          />
                        </ul>
                      ) : null}
                      <PrimaryButton
                        type="button"
                        disabled={
                          !minusEnabled || !targetConfigReady || minusSaving
                        }
                        onClick={() =>
                          setIusPicker({ open: true, mode: "subtrahend" })
                        }
                      >
                        + {t("SELECT_IUS")}
                      </PrimaryButton>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {subTab === "percentage" && (
              <div className="compute-section">
                {!indicatorGid.trim() || !unitGid.trim() ? (
                  <p className="compute-callout-warning">
                    {t(
                      "COMPUTE_INDICATOR_UNIT_REQUIRED",
                      "Set the indicator and unit on this row before configuring compute."
                    )}
                  </p>
                ) : null}

                <label className="compute-check-row">
                  <input
                    type="checkbox"
                    className="checkbox-comp shrink-0"
                    checked={pctEnabled}
                    disabled={
                      !targetConfigReady || formulaLoading || pctSaving
                    }
                    onChange={(e) => void handlePctCheck(e.target.checked)}
                  />
                  <span className="compute-check-title text-xs">
                    {t(
                      "COMPUTE_PCT_ENABLE",
                      "Percentage — Enable Compute to calculate Percentage using Numerator and Denominator"
                    )}
                  </span>
                </label>
                <p className="compute-hint">
                  {t(
                    "COMPUTE_PCT_EXAMPLE",
                    "Example: % Male = Male / Total Population Size"
                  )}
                </p>
                <div className="compute-stack mt-4 gap-3">
                  <div className="sp-field">
                    <div className="form-label">
                      {t("NUMERATOR")}
                    </div>
                    <div className="compute-ius-slot compute-ius-slot--pct">
                      {numeratorIusGid ? (
                        <ul className="compute-ius-chips">
                          <ComputeIusChip
                            label={chipLabel(numeratorIusGid)}
                            disabled={pctSaving || !pctEnabled}
                            removeAriaLabel={t("REMOVE")}
                            onRemove={() => setNumeratorIusGid(null)}
                          />
                        </ul>
                      ) : null}
                      <PrimaryButton
                        type="button"
                        disabled={
                          !pctEnabled || !targetConfigReady || pctSaving
                        }
                        onClick={() =>
                          setIusPicker({ open: true, mode: "numerator" })
                        }
                      >
                        + {t("ADD_INDICATOR")}
                      </PrimaryButton>
                    </div>
                  </div>
                  <div
                    className="compute-op-row compute-op-div compute-op-div--pct"
                    aria-hidden
                  >
                    ÷
                  </div>
                  <div className="sp-field">
                    <div className="form-label">
                      {t("DENOMINATOR")}
                    </div>
                    <div className="compute-ius-slot compute-ius-slot--pct">
                      {denominatorIusGid ? (
                        <ul className="compute-ius-chips">
                          <ComputeIusChip
                            label={chipLabel(denominatorIusGid)}
                            disabled={pctSaving || !pctEnabled}
                            removeAriaLabel={t("REMOVE")}
                            onRemove={() => setDenominatorIusGid(null)}
                          />
                        </ul>
                      ) : null}
                      <PrimaryButton
                        type="button"
                        disabled={
                          !pctEnabled || !targetConfigReady || pctSaving
                        }
                        onClick={() =>
                          setIusPicker({ open: true, mode: "denominator" })
                        }
                      >
                        + {t("ADD_INDICATOR")}
                      </PrimaryButton>
                    </div>
                  </div>
                </div>
                <div className="compute-rule-sep" />
                <div className="compute-pct-advanced">
                  <div className="sp-field min-w-0">
                    <label className="form-label" htmlFor="compute-mult">
                      {t("MULTIPLIER")}
                    </label>
                    <input
                      id="compute-mult"
                      className="field-comp--md w-full max-w-[120px]"
                      value={pctMultiplier}
                      disabled={!pctEnabled || pctSaving}
                      onChange={(e) => setPctMultiplier(e.target.value)}
                    />
                    <p className="compute-hint ml-0 mt-1.5">
                      {t(
                        "COMPUTE_MULTIPLIER_HINT",
                        "Use 100 to calculate Percentage. Use a multiplier value in other cases. Keep blank for Ratios."
                      )}
                    </p>
                  </div>
                  <div className="compute-decimals mt-3">
                    <label
                      className="form-label"
                      htmlFor="compute-pct-dec"
                    >
                      {t("DECIMALS")}
                    </label>
                    <input
                      id="compute-pct-dec"
                      className="field-comp--md w-full max-w-[72px]"
                      value={pctDecimals}
                      disabled={!pctEnabled || pctSaving}
                      onChange={(e) => setPctDecimals(e.target.value)}
                      placeholder="0–10"
                    />
                  </div>
                  <div className="compute-pct-options">
                    <label className="compute-check-row compute-check-row items-center">
                      <input
                        type="checkbox"
                        className="checkbox-comp shrink-0"
                        checked={pctDenomArea}
                        disabled={!pctEnabled || pctSaving}
                        onChange={(e) => setPctDenomArea(e.target.checked)}
                      />
                      <span className="compute-check-title text-xs font-medium">
                        {t("SELECT_DENOM_AREA")}
                      </span>
                    </label>
                    <input
                      className="field-comp--md w-full"
                      value={pctAreaSearch}
                      disabled={!pctEnabled || pctSaving}
                      onChange={(e) => setPctAreaSearch(e.target.value)}
                      placeholder={t(
                        "COMPUTE_SEARCH_AREA_PLACEHOLDER",
                        "Search area…"
                      )}
                      aria-label={t(
                        "COMPUTE_SEARCH_AREA_PLACEHOLDER",
                        "Search area…"
                      )}
                    />
                    <label className="compute-check-row compute-check-row items-center mt-3">
                      <input
                        type="checkbox"
                        className="checkbox-comp shrink-0"
                        checked={pctLatestData}
                        disabled={!pctEnabled || pctSaving}
                        onChange={(e) => setPctLatestData(e.target.checked)}
                      />
                      <span className="compute-check-title text-xs font-medium">
                        {t(
                          "COMPUTE_LATEST_DATA_CHECK",
                          "Use latest data if same time period data not available"
                        )}
                      </span>
                    </label>
                  </div>
                </div>
              </div>
            )}

            {subTab === "timePeriod" && (
              <div className="compute-section">
                {!indicatorGid.trim() || !unitGid.trim() ? (
                  <p className="compute-callout-warning">
                    {t(
                      "COMPUTE_INDICATOR_UNIT_REQUIRED",
                      "Set the indicator and unit on this row before configuring compute."
                    )}
                  </p>
                ) : null}

                <label className="compute-check-row">
                  <input
                    type="checkbox"
                    className="checkbox-comp shrink-0"
                    checked={tpEnabled}
                    disabled={
                      !targetConfigReady || formulaLoading || tpSaving
                    }
                    onChange={(e) => void handleTpCheck(e.target.checked)}
                  />
                  <span className="compute-check-title text-xs">
                    {t(
                      "COMPUTE_TP_ENABLE",
                      "Time period — Enable compute for totaling time periods"
                    )}
                  </span>
                </label>
                <p className="compute-hint">
                  {t("COMPUTE_TP_EXAMPLE", "Example: Annual = Q1 + Q2 + Q3 + Q4")}
                </p>
                <div className="compute-rule-sep" />
                <div className="compute-tp-row">
                  <div className="compute-tp-field sp-field">
                    <label className="form-label" htmlFor="tp-target">
                      {t("TARGET_FREQUENCY")}
                    </label>
                    <SelectField
                      id="tp-target"
                      className="w-full"
                      value={tpTargetFreq}
                      disabled={!tpEnabled || tpSaving}
                      onChange={(e) => setTpTargetFreq(e.target.value)}
                      options={freqOptions}
                    />
                  </div>
                  <div className="compute-tp-field sp-field">
                    <label className="form-label" htmlFor="tp-source">
                      {t("SOURCE_FREQUENCY")}
                    </label>
                    <SelectField
                      id="tp-source"
                      className="w-full"
                      value={tpSourceFreq}
                      disabled={!tpEnabled || tpSaving}
                      onChange={(e) => setTpSourceFreq(e.target.value)}
                      options={freqOptions}
                    />
                  </div>
                  <div className="compute-tp-field sp-field">
                    <label className="form-label" htmlFor="tp-agg">
                      {t("AGGREGATION_TYPE")}
                    </label>
                    <SelectField
                      id="tp-agg"
                      className="w-full"
                      value={tpAgg}
                      disabled={!tpEnabled || tpSaving}
                      onChange={(e) => setTpAgg(e.target.value)}
                      options={aggOptions}
                    />
                  </div>
                </div>
                <label className="compute-check-row mt-4">
                  <input
                    type="checkbox"
                    className="checkbox-comp shrink-0"
                    checked={tpApplyAll}
                    disabled={!tpEnabled || tpSaving}
                    onChange={(e) => {
                      const v = e.target.checked;
                      setTpApplyAll(v);
                      if (v) setTpApplyOther(false);
                    }}
                  />
                  <span className="compute-check-title text-xs font-medium leading-snug">
                    {t(
                      "COMPUTE_APPLY_ALL_SUBGROUPS",
                      'Apply to all subgroups ("{subgroup}") of all indicators with the same unit ("{unit}")?'
                    )
                      .replace("{subgroup}", exampleSgQuoted)
                      .replace("{unit}", unitQuoted)}
                  </span>
                </label>
                <label className="compute-check-row mt-2">
                  <input
                    type="checkbox"
                    className="checkbox-comp shrink-0"
                    checked={tpApplyOther}
                    disabled={!tpEnabled || tpSaving}
                    onChange={(e) => {
                      const v = e.target.checked;
                      setTpApplyOther(v);
                      if (v) setTpApplyAll(false);
                    }}
                  />
                  <span className="compute-check-title text-xs font-medium leading-snug">
                    {t(
                      "COMPUTE_APPLY_OTHER_SUBGROUPS",
                      'Apply to other subgroups of this indicator with the same unit ("{unit}")?'
                    ).replace("{unit}", unitQuoted)}
                  </span>
                </label>
                <label className="compute-check-row mt-2">
                  <input
                    type="checkbox"
                    className="checkbox-comp shrink-0"
                    checked={tpOverwrite}
                    disabled={!tpEnabled || tpSaving}
                    onChange={(e) => setTpOverwrite(e.target.checked)}
                  />
                  <span className="compute-check-title text-xs font-medium">
                    {t("OVERWRITE_FORMULAS")}
                  </span>
                </label>
                <div className="compute-rule-sep" />
                <div className="compute-decimals">
                  <label className="form-label" htmlFor="tp-dec">
                    {t("COMPUTE_DECIMALS", "Decimals")}
                  </label>
                  <input
                    id="tp-dec"
                    className="field-comp--md w-full max-w-[72px]"
                    value={tpDecimals}
                    disabled={!tpEnabled || tpSaving}
                    onChange={(e) => setTpDecimals(e.target.value)}
                  />
                </div>
              </div>
            )}

            {subTab === "area" && (
              <div className="compute-section">
                {!indicatorGid.trim() || !unitGid.trim() ? (
                  <p className="compute-callout-warning">
                    {t(
                      "COMPUTE_INDICATOR_UNIT_REQUIRED",
                      "Set the indicator and unit on this row before configuring compute."
                    )}
                  </p>
                ) : null}

                <label className="compute-check-row">
                  <input
                    type="checkbox"
                    className="checkbox-comp shrink-0"
                    checked={areaEnabled}
                    disabled={
                      !targetConfigReady || formulaLoading || areaSaving
                    }
                    onChange={(e) => void handleAreaCheck(e.target.checked)}
                  />
                  <span className="compute-check-title text-xs">
                    {t(
                      "COMPUTE_AREA_ENABLE",
                      "Area — Enable compute to roll up values from finer areas into parent areas"
                    )}
                  </span>
                </label>
                <p className="compute-hint">
                  {t(
                    "COMPUTE_AREA_EXAMPLE",
                    "Example: aggregate child-area data into each parent area at the target level (same indicator, unit, and subgroup)."
                  )}
                </p>
                <p className="compute-hint text-text-muted">
                  {t(
                    "COMPUTE_AREA_LEVEL_HINT",
                    "Target level must be a smaller area_level number than the source level (coarser parent vs finer children), matching your warehouse hierarchy."
                  )}
                </p>
                <div className="compute-rule-sep" />
                <div className="compute-tp-row">
                  <div className="compute-tp-field sp-field">
                    <label className="form-label" htmlFor="area-target-lvl">
                      {t(
                        "COMPUTE_AREA_TARGET_LEVEL",
                        "Target area level (parent)"
                      )}
                    </label>
                    <SelectField
                      id="area-target-lvl"
                      className="w-full"
                      value={areaTargetLevelKey}
                      disabled={!areaEnabled || areaSaving || areaLevelOptions.length === 0}
                      onChange={(e) => setAreaTargetLevelKey(e.target.value)}
                      options={[
                        {
                          value: "",
                          label: t("ANY"),
                        },
                        ...areaLevelOptions,
                      ]}
                    />
                  </div>
                  <div className="compute-tp-field sp-field">
                    <label className="form-label" htmlFor="area-source-lvl">
                      {t(
                        "COMPUTE_AREA_SOURCE_LEVEL",
                        "Source area level (children)"
                      )}
                    </label>
                    <SelectField
                      id="area-source-lvl"
                      className="w-full"
                      value={areaSourceLevelKey}
                      disabled={!areaEnabled || areaSaving || areaLevelOptions.length === 0}
                      onChange={(e) => setAreaSourceLevelKey(e.target.value)}
                      options={[
                        {
                          value: "",
                          label: t("ANY"),
                        },
                        ...areaLevelOptions,
                      ]}
                    />
                  </div>
                  <div className="compute-tp-field sp-field">
                    <label className="form-label" htmlFor="area-agg">
                      {t("AGGREGATION_TYPE")}
                    </label>
                    <SelectField
                      id="area-agg"
                      className="w-full"
                      value={areaAgg}
                      disabled={!areaEnabled || areaSaving}
                      onChange={(e) => setAreaAgg(e.target.value)}
                      options={aggOptions}
                    />
                  </div>
                </div>
                <label className="compute-check-row mt-4">
                  <input
                    type="checkbox"
                    className="checkbox-comp shrink-0"
                    checked={areaPopulateMid}
                    disabled={!areaEnabled || areaSaving}
                    onChange={(e) => setAreaPopulateMid(e.target.checked)}
                  />
                  <span className="compute-check-title text-xs font-medium leading-snug">
                    {t(
                      "COMPUTE_AREA_POPULATE_MID",
                      "Populate intermediate levels (cascade step by step toward the target)"
                    )}
                  </span>
                </label>
                <label className="compute-check-row mt-2">
                  <input
                    type="checkbox"
                    className="checkbox-comp shrink-0"
                    checked={areaApplyAll}
                    disabled={!areaEnabled || areaSaving}
                    onChange={(e) => {
                      const v = e.target.checked;
                      setAreaApplyAll(v);
                      if (v) setAreaApplyOther(false);
                    }}
                  />
                  <span className="compute-check-title text-xs font-medium leading-snug">
                    {t(
                      "COMPUTE_APPLY_ALL_SUBGROUPS",
                      'Apply to all subgroups ("{subgroup}") of all indicators with the same unit ("{unit}")?'
                    )
                      .replace("{subgroup}", exampleSgQuoted)
                      .replace("{unit}", unitQuoted)}
                  </span>
                </label>
                <label className="compute-check-row mt-2">
                  <input
                    type="checkbox"
                    className="checkbox-comp shrink-0"
                    checked={areaApplyOther}
                    disabled={!areaEnabled || areaSaving}
                    onChange={(e) => {
                      const v = e.target.checked;
                      setAreaApplyOther(v);
                      if (v) setAreaApplyAll(false);
                    }}
                  />
                  <span className="compute-check-title text-xs font-medium leading-snug">
                    {t(
                      "COMPUTE_APPLY_OTHER_SUBGROUPS",
                      'Apply to other subgroups of this indicator with the same unit ("{unit}")?'
                    ).replace("{unit}", unitQuoted)}
                  </span>
                </label>
                <label className="compute-check-row mt-2">
                  <input
                    type="checkbox"
                    className="checkbox-comp shrink-0"
                    checked={areaOverwrite}
                    disabled={!areaEnabled || areaSaving}
                    onChange={(e) => setAreaOverwrite(e.target.checked)}
                  />
                  <span className="compute-check-title text-xs font-medium">
                    {t("OVERWRITE_FORMULAS")}
                  </span>
                </label>
                <div className="compute-rule-sep" />
                <div className="compute-decimals">
                  <label className="form-label" htmlFor="area-dec">
                    {t("COMPUTE_DECIMALS", "Decimals")}
                  </label>
                  <input
                    id="area-dec"
                    className="field-comp--md w-full max-w-[72px]"
                    value={areaDecimals}
                    disabled={!areaEnabled || areaSaving}
                    onChange={(e) => setAreaDecimals(e.target.value)}
                  />
                </div>
              </div>
            )}
          </fieldset>
        </div>
        {formulaLoading ? (
          <div
            className="sp-panel-tab-loading-overlay"
            aria-live="polite"
            aria-busy="true"
          >
            <Loader loadingLabel={t("LOADING", "Loading...")} size={48} />
          </div>
        ) : null}
      </div>

      <ComputeIusPickerModal
        open={iusPicker.open}
        onClose={() => setIusPicker((s) => ({ ...s, open: false }))}
        dwId={dwId}
        locale={locale}
        restrictUnitGid={unitGid.trim() || undefined}
        excludeIusGids={targetIusGid ? [targetIusGid] : []}
        singleSelect={iusPicker.mode !== "total"}
        initialSelected={
          iusPicker.mode === "total"
            ? sourceIusGids
            : iusPicker.mode === "minuend"
              ? minuendIusGid
                ? [minuendIusGid]
                : []
              : iusPicker.mode === "subtrahend"
                ? subtrahendIusGid
                  ? [subtrahendIusGid]
                  : []
                : iusPicker.mode === "numerator"
                  ? numeratorIusGid
                    ? [numeratorIusGid]
                    : []
                  : denominatorIusGid
                    ? [denominatorIusGid]
                    : []
        }
        onConfirm={(gids) => {
          if (iusPicker.mode === "total") setSourceIusGids(gids);
          else if (iusPicker.mode === "minuend")
            setMinuendIusGid(gids[0] ?? null);
          else if (iusPicker.mode === "subtrahend")
            setSubtrahendIusGid(gids[0] ?? null);
          else if (iusPicker.mode === "numerator")
            setNumeratorIusGid(gids[0] ?? null);
          else setDenominatorIusGid(gids[0] ?? null);
        }}
      />
    </div>
  );
});

IndicatorComputeTab.displayName = "IndicatorComputeTab";
