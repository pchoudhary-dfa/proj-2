"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import type { AreaItem, PreloadedAreaItem } from "dfa-v6-comp-area";
import type { IndicatorItem } from "dfa-v6-comp-indicator";
import type { TimePeriodItem } from "dfa-v6-comp-timeperiod";
import Drawer from "@/components/Drawer";
import { Modal } from "@/components/Modal";
import { PrimaryButton } from "@/components/PrimaryButton";
import { PrimarySaveButton } from "@/components/PrimarySaveButton";
import { SecondaryButton } from "@/components/SecondaryButton";
import { ItemSelectionModal } from "@/components/ItemSelectionModal";
import { type MultiSelectOption } from "@/components/MultiSelectDropdown";
import {
  DatasetListTable,
  type DatasetSortState,
} from "./DatasetListTable";
import {
  DatasetDataPointsTable,
  type DataPointCommentTitle,
  type DataPointEditValues,
  type DataPointsSortState,
} from "./DatasetDataPointsTable";
import FileImport from "@/components/FileImport";
import { CommentPanel } from "./CommentPanel";
import { ExpandChevronButton } from "@/components/ExpandChevronButton";
import { AreaSelectionModal } from "@/components/AreaSelectionModal";
import { IndicatorSelectionModal } from "@/components/IndicatorSelectionModal";
import { TimePeriodSelectionModal } from "@/components/TimePeriodSelectionModal";
import { Loader } from "@/components/Loader";
import { TextAreaField } from "@/components/TextAreaField";
import { textFieldClassName } from "@/components/TextField";
import { SelectField, type SelectFieldOption } from "@/components/SelectField";
import { MainTabsBar } from "@/components/MainTabsBar";
import { buildListRequestUrl } from "@/components/TableView";
import { StatusChip } from "@/components/StatusChip";
import { useCore } from "@/contexts/CoreContext";
import { useSidebarOptional } from "@/contexts/SidebarContext";
import { useDwCrudPermissions } from "@/hooks/useDwCrudPermissions";
import {
  DW_ROUTE_PERMISSIONS,
  getStoredWorkflowAreaContentIds,
  getStoredWorkflowCodes,
  isSuperAdmin,
} from "@/lib/auth/user";
import { deleteRequest, getFileResponse, getRequest, patchRequest, postRequest } from "@/lib/api/http";
import { fetchAllDwSources } from "@/lib/api/sources";
import { DEFAULT_TABLE_PAGE_SIZES } from "@/components/TablePaginationFooter";
import { renderTablePaginationFooter } from "@/components/tablePaginationFooterConfig";
import { TV_GRID_CONFIGURE_BTN } from "@/components/editableGridColumnClasses";
import type {
  DataEntryGetResult,
  DataPointsGetResult,
  DataPointsImportResult,
  DataPointsMeta,
  DataPointsImportLogDetail,
  DataPointsImportLogSummary,
  ImportBatchJobLog,
  DataPointsPatchItem,
  DataPointsPatchPayload,
  DataPointsPatchResult,
  DataPointsRow,
  DatasetCreateResult,
  DatasetListItem,
  DatasetPatchPayload,
  DatasetPatchResult,
  DatasetReviewPayload,
  DatasetReviewResult,
  DatasetStage,
  DatasetsListResult,
  FetchDatasetValidationRulesResult,
  IndicatorValidationRuleRow,
  WorkflowListItem,
  WorkflowsListResponse,
  WorkflowsListResult,
} from "@/lib/api/types";
import {
  REFERENCE_PATH_COMMENTS,
  getDWAPIURL,
  REFERENCE_PATH_AREAS,
  REFERENCE_PATH_AREA_LEVELS,
  REFERENCE_PATH_DATA_POINTS,
  REFERENCE_PATH_DATA_POINTS_IMPORT,
  REFERENCE_PATH_DATA_POINTS_IMPORT_LOGS,
  REFERENCE_PATH_DATASET,
  REFERENCE_PATH_INDICATORS,
  REFERENCE_PATH_TIME_PERIODS,
  REFERENCE_PATH_WORKFLOW,
} from "@/lib/constants";

const Mi = ({ name, className = "" }: { name: string; className?: string }) => (
  <span className={`material-icons ${className}`.trim()} aria-hidden>
    {name}
  </span>
);

function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);
  useEffect(() => {
    const t = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debouncedValue;
}

type DatasetFlowPageProps = {
  locale: string;
  dwId: string;
  section: "data-entry" | "data-review";
  datasetId?: string;
};

type DataPointsReviewFilter = "ALL" | "APPROVED" | "REJECTED" | "PENDING_REVIEW";

type DataEntryScopeMode = "SINGLE" | "MULTIPLE";

type DataEntryScopeConfig = {
  indicator: DataEntryScopeMode;
  timePeriod: DataEntryScopeMode;
  area: DataEntryScopeMode;
};

type DatasetEditFormSnapshot = {
  datasetDraftName: string;
  datasetAreaNids: string[];
  datasetAreaItems: AreaItem[];
  datasetIusNids: number[];
  datasetIndicatorItems: IndicatorItem[];
  datasetTimeperiodNids: string[];
  datasetTimePeriodItems: TimePeriodItem[];
  datasetSourceNids: string[];
};

type DatasetAssociationCounts = {
  dataPointCount: number;
  reviewStageCount: number;
  reviewSliceCount: number;
  actionLogCount: number;
};

type WorkflowLevelCountResult = {
  success?: boolean;
  data?: unknown;
  meta?: {
    count?: unknown;
    total_count?: unknown;
  };
  message?: string;
  err_message?: string;
};

type DatasetCommentsCountResult = {
  success?: boolean;
  data?: unknown;
};

const DEFAULT_DATA_ENTRY_SCOPE: DataEntryScopeConfig = {
  indicator: "MULTIPLE",
  timePeriod: "MULTIPLE",
  area: "MULTIPLE",
};

function firstNonBlank(...values: unknown[]): string {
  for (const value of values) {
    if (value == null) continue;
    const text = String(value).trim();
    if (text) return text;
  }
  return "";
}

function parsePositiveNids(values: string[]): number[] {
  const out: number[] = [];
  const seen = new Set<number>();
  for (const value of values) {
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed <= 0 || seen.has(parsed)) continue;
    seen.add(parsed);
    out.push(parsed);
  }
  return out;
}

function parseNidsFromUnknown(values: unknown): string[] {
  if (!Array.isArray(values)) return [];
  const out: string[] = [];
  const seen = new Set<number>();
  for (const value of values) {
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed <= 0 || seen.has(parsed)) continue;
    seen.add(parsed);
    out.push(String(parsed));
  }
  return out;
}

function parsePositiveInteger(value: unknown): number | undefined {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) return undefined;
  return parsed;
}

function normalizeCommentCount(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.trunc(parsed) : 0;
}

function getDataPointIdForReview(row: DataPointsRow): number | undefined {
  return parsePositiveInteger(row.data_point_id ?? row.dt_nid);
}

function getDataPointRowKey(row: DataPointsRow): string {
  return String(
    row.data_point_id ??
      row.dt_nid ??
      [
        row.ius_nid ?? "ius",
        row.tp_nid ?? "tp",
        row.ar_nid ?? "ar",
        row.i_nid ?? "i",
        row.u_nid ?? "u",
        row.sg_nid ?? "sg",
      ].join("-")
  );
}

function getDataPointValue(row: DataPointsRow): string {
  if (row.dt_is_textual) {
    return firstNonBlank(
      row.dt_text_value,
      row.approved_textual_value,
      row.approved_value,
      row.dt_value
    );
  }
  return firstNonBlank(
    row.dt_value,
    row.approved_value,
    row.dt_text_value,
    row.approved_textual_value
  );
}

function normalizeDataEntryScope(value: string | null | undefined): DataEntryScopeMode {
  return String(value ?? "").trim().toUpperCase() === "SINGLE" ? "SINGLE" : "MULTIPLE";
}

function normalizeDataEntryTimeperiodFrequency(value: string | null | undefined): string {
  const raw = (value ?? "").trim();
  if (!raw) return "";
  const upper = raw.toUpperCase();
  if (upper === "ALL") return "ALL";
  if (upper === "MONTHLY") return "M";
  if (upper === "QUARTERLY") return "Q";
  if (upper === "ANNUALLY") return "A";
  if (["A", "M", "Q"].includes(upper)) return upper;
  return raw;
}

function parseWorkflowAreaLevel(value: unknown): number | null {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.floor(n);
}

function enforceScopeSelection(values: string[], scope: DataEntryScopeMode): string[] {
  if (scope !== "SINGLE") return values;
  const picked = values.length > 0 ? values[values.length - 1] : "";
  return picked ? [picked] : [];
}

function uniqueOptions(items: MultiSelectOption[]): MultiSelectOption[] {
  const seen = new Set<string>();
  const out: MultiSelectOption[] = [];
  for (const item of items) {
    if (!item.value || seen.has(item.value)) continue;
    seen.add(item.value);
    out.push(item);
  }
  return out;
}

type GenericListResult = {
  success?: boolean;
  data?: unknown;
};

function parseListItems(payload: unknown): Record<string, unknown>[] {
  const result = payload as GenericListResult;
  if (result?.success !== true) return [];
  return Array.isArray(result.data) ? (result.data as Record<string, unknown>[]) : [];
}

type AreaLevelCatalogRow = {
  al_level: number;
  al_name: string;
};

function parseAreaLevelCatalogResponse(payload: unknown): AreaLevelCatalogRow[] {
  const result = payload as GenericListResult;
  if (result?.success !== true || !Array.isArray(result.data)) return [];
  const out: AreaLevelCatalogRow[] = [];
  for (const item of result.data) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const level = Number(o.al_level);
    const name = typeof o.al_name === "string" ? o.al_name.trim() : "";
    if (!Number.isFinite(level) || level <= 0 || !name) continue;
    out.push({ al_level: level, al_name: name });
  }
  return out.sort((a, b) => a.al_level - b.al_level);
}

function isForbiddenResponse(payload: unknown): boolean {
  if (typeof payload !== "object" || payload == null) return false;
  const data = payload as Record<string, unknown>;
  return Number(data.status_code) === 403;
}

function isWorkflowsListResponse(
  response: WorkflowsListResult
): response is WorkflowsListResponse {
  return response.success === true && Array.isArray((response as WorkflowsListResponse).data);
}

function isDatasetsListResponse(
  response: DatasetsListResult
): response is DatasetsListResult & { success: true; data: { datasets: DatasetListItem[] } } {
  return response.success === true && Array.isArray(response.data?.datasets);
}

const DATA_REVIEW_OPENABLE_STATUSES = new Set(["PENDING_REVIEW", "REVISION", "APPROVED"]);
const DATA_ENTRY_DELETABLE_STATUSES = new Set(["DRAFT"]);
const DATA_ENTRY_READ_ONLY_DATASET_STATUSES = new Set(["APPROVED", "PENDING_REVIEW"]);
const REVIEW_SUCCESS_QUERY_KEY = "review_success";
const REVIEW_SUCCESS_APPROVED_AT_LEVEL = "approved_at_level";
const REVIEW_SUCCESS_PUBLISHED = "published";

function getDatasetStatusToken(status: unknown): string {
  return String(status ?? "").trim().toUpperCase();
}

const DATASET_STATUS_LABEL_FALLBACKS: Record<string, string> = {
  APPROVED: "Approved",
  PENDING_REVIEW: "Pending review",
  REVISION: "Revision",
  DRAFT: "Draft",
};

function getDatasetStatusLabel(
  status: unknown,
  t: (code: string, fallback?: string) => string
): string {
  const raw = String(status ?? "").trim();
  if (!raw) return "";
  const token = raw.toUpperCase();
  return t(token, DATASET_STATUS_LABEL_FALLBACKS[token] ?? raw);
}

function recordToAreaItem(data: Record<string, unknown>, fallbackNid: string): AreaItem {
  const rawNid = data.ar_nid;
  const nidNum =
    typeof rawNid === "number"
      ? rawNid
      : typeof rawNid === "string" && Number.isFinite(Number(rawNid))
        ? Number(rawNid)
        : Number.isFinite(Number(fallbackNid))
          ? Number(fallbackNid)
          : undefined;
  const areaId = firstNonBlank(data.ar_id, data.a_id);
  const id = areaId || (nidNum != null ? String(nidNum) : fallbackNid.trim());
  const label = firstNonBlank(data.ar_name, data.ar_id, data.name, id);
  return {
    id,
    label,
    ...(nidNum != null && Number.isFinite(nidNum) ? { nid: nidNum } : {}),
  };
}

function recordToTimePeriodItem(data: Record<string, unknown>, fallbackNid: string): TimePeriodItem {
  const rawNid = data.tp_nid ?? data.timeperiod_nid;
  const nidNum =
    typeof rawNid === "number"
      ? rawNid
      : typeof rawNid === "string" && Number.isFinite(Number(rawNid))
        ? Number(rawNid)
        : Number.isFinite(Number(fallbackNid))
          ? Number(fallbackNid)
          : undefined;
  const id = nidNum != null ? String(nidNum) : fallbackNid.trim();
  const label = firstNonBlank(data.tp_timeperiod, data.timeperiod, data.tp_gid, data.timeperiod_gid, id);
  return {
    id,
    label,
    ...(nidNum != null && Number.isFinite(nidNum) ? { nid: nidNum } : {}),
  };
}

async function hydrateAreaItemsForNids(dwId: string, nids: string[]): Promise<AreaItem[]> {
  if (!dwId || nids.length === 0) return [];
  const base = getDWAPIURL(dwId, REFERENCE_PATH_AREAS);
  const fetched = await Promise.all(
    nids.map(async (nid) => {
      const trimmed = nid.trim();
      if (!trimmed) return null;
      try {
        const json = (await getRequest(`${base}/${encodeURIComponent(trimmed)}`, undefined, {
          suppressErrorMessage: true,
        })) as { success?: boolean; data?: unknown };
        if (json.success !== true || !json.data || typeof json.data !== "object") return null;
        return recordToAreaItem(json.data as Record<string, unknown>, trimmed);
      } catch {
        return null;
      }
    })
  );
  return nids.map((nid, i) => {
    const hit = fetched[i];
    if (hit) return hit;
    const t = nid.trim();
    const num = Number(t);
    return {
      id: t,
      label: t,
      ...(Number.isInteger(num) && num > 0 ? { nid: num } : {}),
    } as AreaItem;
  });
}

async function hydrateTimePeriodItemsForNids(
  dwId: string,
  nids: string[],
  fallbackOptions: TimePeriodItem[]
): Promise<TimePeriodItem[]> {
  if (!dwId || nids.length === 0) return [];

  const fallbackByNid = new Map<string, TimePeriodItem>();
  for (const option of fallbackOptions) {
    const key = String(option.nid ?? option.id).trim();
    if (!key) continue;
    if (!fallbackByNid.has(key)) fallbackByNid.set(key, option);
  }

  const base = getDWAPIURL(dwId, REFERENCE_PATH_TIME_PERIODS);
  const fetched = await Promise.all(
    nids.map(async (nid) => {
      const trimmed = nid.trim();
      if (!trimmed) return null;
      const fallbackHit = fallbackByNid.get(trimmed);
      if (fallbackHit) {
        return {
          id: String(fallbackHit.id),
          label: fallbackHit.label,
          ...(fallbackHit.nid != null ? { nid: fallbackHit.nid } : {}),
        };
      }
      try {
        const json = (await getRequest(`${base}/${encodeURIComponent(trimmed)}`, undefined, {
          suppressErrorMessage: true,
        })) as { success?: boolean; data?: unknown };
        if (json.success !== true || !json.data || typeof json.data !== "object") return null;
        return recordToTimePeriodItem(json.data as Record<string, unknown>, trimmed);
      } catch {
        return null;
      }
    })
  );

  return nids.map((nid, i) => {
    const hit = fetched[i];
    if (hit) return hit;
    const t = nid.trim();
    const num = Number(t);
    return {
      id: t,
      label: t,
      ...(Number.isInteger(num) && num > 0 ? { nid: num } : {}),
    } as TimePeriodItem;
  });
}

async function hydrateIusItemsForNids(
  dwId: string,
  iusNids: number[]
): Promise<IndicatorItem[]> {
  if (!dwId || iusNids.length === 0) return [];
  const url = `${getDWAPIURL(dwId, REFERENCE_PATH_INDICATORS)}?subgroup=true&ius=true`;
  try {
    const json = (await getRequest(url, undefined, {
      suppressErrorMessage: true,
    })) as {
      success?: boolean;
      data?: Record<string, unknown>[];
      meta?: { unit?: Record<string, Record<string, unknown>>; subgroup?: Record<string, Record<string, unknown>> };
    };
    if (!json.success || !Array.isArray(json.data)) return [];

    const unitMeta = (json.meta?.unit ?? {}) as Record<
      string,
      { unit_name?: string; u_name?: string }
    >;
    const subgroupMeta = (json.meta?.subgroup ?? {}) as Record<
      string,
      { sg_name?: string }
    >;

    const nidSet = new Set(iusNids);
    const result: IndicatorItem[] = [];

    for (const item of json.data) {
      const indicatorGid =
        (item.indicator_gid as string) ??
        (item.i_gid as string) ??
        "";
      const indicatorName =
        (item.indicator_name as string) ??
        (item.i_name as string) ??
        (item.short_name as string) ??
        indicatorGid;

      const sGidMap = (item.s_gid as Record<string, { sg_gid?: string[]; ius_nid?: number[] }>) ?? {};

      for (const [unitGid, sgData] of Object.entries(sGidMap)) {
        const unitInfo = unitMeta[unitGid];
        const unitName = unitInfo?.unit_name ?? unitInfo?.u_name ?? unitGid;

        const sgGidList = sgData.sg_gid ?? [];
        const iusNidList = sgData.ius_nid ?? [];

        for (let idx = 0; idx < sgGidList.length; idx++) {
          const iusNid = iusNidList[idx];
          if (iusNid == null || !nidSet.has(iusNid)) continue;

          const sgGid = sgGidList[idx];
          const sgName = subgroupMeta[sgGid]?.sg_name ?? sgGid;
          const compositeId = `${indicatorGid}|${unitGid}|${sgGid}`;

          result.push({
            id: compositeId,
            label: `${indicatorName}, ${unitName} - ${sgName}`,
            iusNid,
            unitGid,
            unitName,
            subgroupGid: sgGid,
            subgroupName: sgName,
          });
        }
      }
    }

    return result;
  } catch {
    return [];
  }
}

export function DatasetFlowPage({
  locale,
  dwId,
  section,
  datasetId,
}: DatasetFlowPageProps) {
  const { t } = useCore();
  const router = useRouter();
  const pathname = usePathname() ?? "";
  const searchParams = useSearchParams();
  const sidebar = useSidebarOptional();
  const setToolbarExtra = sidebar?.setToolbarExtra;
  const setSidebarCollapsed = sidebar?.setSidebarCollapsed;
  const dwPermissionsVersion = sidebar?.dwPermissionsVersion ?? 0;
  const {
    canCreate: canDwCreateDataEntryDataset,
    canDelete: canDwDeleteDataEntryDataset,
    canUpdate: canDwUpdateDataEntryDataset,
  } = useDwCrudPermissions(DW_ROUTE_PERMISSIONS.dataManagement.dataEntry);

  const urlWorkflowId = searchParams.get("workflow_id") ?? "";

  const [workflows, setWorkflows] = useState<WorkflowListItem[]>([]);
  const [workflowsLoading, setWorkflowsLoading] = useState(false);
  const [workflowsError, setWorkflowsError] = useState<string | null>(null);
  const [workflowId, setWorkflowId] = useState(urlWorkflowId);

  const [datasets, setDatasets] = useState<DatasetListItem[]>([]);
  const [datasetsLoading, setDatasetsLoading] = useState(false);
  const [datasetsError, setDatasetsError] = useState<string | null>(null);
  const [datasetStatusFilter, setDatasetStatusFilter] = useState("");
  const [selectedDatasetCount, setSelectedDatasetCount] = useState(0);
  const [selectedDatasetForDelete, setSelectedDatasetForDelete] = useState<DatasetListItem | null>(null);
  const [selectedDatasetsForDelete, setSelectedDatasetsForDelete] = useState<DatasetListItem[]>([]);

  const [datasetPage, setDatasetPage] = useState(1);
  const [datasetPageSize, setDatasetPageSize] = useState<number>(DEFAULT_TABLE_PAGE_SIZES[0]);
  const [datasetListSort, setDatasetListSort] = useState<DatasetSortState>({
    columnId: null,
    direction: null,
  });
  const [datasetSearch, setDatasetSearch] = useState("");
  const [datasetTotalCount, setDatasetTotalCount] = useState(0);
  const [datasetTotalPages, setDatasetTotalPages] = useState(0);

  const debouncedDatasetSearch = useDebounce(datasetSearch, 300);

  const datasetSearchParam = useMemo(() => {
    const s = debouncedDatasetSearch.trim();
    return s ? s : undefined;
  }, [debouncedDatasetSearch]);

  const datasetSearchByParam = useMemo(
    () => (datasetSearchParam ? "dataset_name" : undefined),
    [datasetSearchParam]
  );

  const [dataEntryScope, setDataEntryScope] = useState<DataEntryScopeConfig>(
    DEFAULT_DATA_ENTRY_SCOPE
  );
  const [dataEntryShowPreviousTime, setDataEntryShowPreviousTime] = useState(false);
  const [workflowTimePeriodFrequency, setWorkflowTimePeriodFrequency] = useState("");
  const [workflowCurrTimeperiodNid, setWorkflowCurrTimeperiodNid] = useState<number | null>(null);
  const [workflowAreaLevel, setWorkflowAreaLevel] = useState<number | null>(null);
  const [areaLevelCatalog, setAreaLevelCatalog] = useState<AreaLevelCatalogRow[]>([]);
  const [isDataEntryScopeResolved, setIsDataEntryScopeResolved] = useState(false);
  const [datasetInfoAreaMap, setDatasetInfoAreaMap] = useState<Map<number, string>>(new Map());
  const [datasetInfoTimePeriodMap, setDatasetInfoTimePeriodMap] = useState<Map<number, string>>(new Map());

  const [dataPointRows, setDataPointRows] = useState<DataPointsRow[]>([]);
  const [dataPointsLoading, setDataPointsLoading] = useState(false);
  const [dataPointsError, setDataPointsError] = useState<string | null>(null);
  const [dataPointsPage, setDataPointsPage] = useState(1);
  const [dataPointsPageSize, setDataPointsPageSize] = useState<number>(DEFAULT_TABLE_PAGE_SIZES[0]);
  const [dataPointsReviewFilter, setDataPointsReviewFilter] = useState<DataPointsReviewFilter>("ALL");
  const [dataPointsMeta, setDataPointsMeta] = useState<DataPointsMeta | null>(null);
  const [validationRulesMap, setValidationRulesMap] = useState<Record<string, IndicatorValidationRuleRow[]>>({});

  const [dpListSort, setDpListSort] = useState<DataPointsSortState>({
    columnId: null,
    direction: null,
  });
  const [dpColSearchIndicator, setDpColSearchIndicator] = useState("");
  const [dpColSearchSubgroup, setDpColSearchSubgroup] = useState("");
  const [dpColSearchArea, setDpColSearchArea] = useState("");
  const [datasetDetailSourceNids, setDatasetDetailSourceNids] = useState<string[]>([]);
  const [dpSourceFilterNids, setDpSourceFilterNids] = useState<string[]>([]);

  const dpActiveSearch = dpColSearchIndicator || dpColSearchSubgroup || dpColSearchArea;
  const dpActiveSearchBy = dpColSearchIndicator
    ? "indicator_unit"
    : dpColSearchSubgroup
      ? "subgroup"
      : dpColSearchArea
        ? "area"
        : null;

  const debouncedDpSearch = useDebounce(dpActiveSearch, 300);
  const debouncedDpSearchBy = useDebounce(dpActiveSearchBy, 300);

  const dpSearchParam = useMemo(() => {
    const s = debouncedDpSearch.trim();
    return s ? s : undefined;
  }, [debouncedDpSearch]);

  const dpSearchByParam = useMemo(
    () => (dpSearchParam ? debouncedDpSearchBy ?? undefined : undefined),
    [dpSearchParam, debouncedDpSearchBy]
  );
  const prevDataPointsDatasetIdRef = useRef<string | undefined>(undefined);
  const isInitializingSourceFilterRef = useRef(false);
  const blockedDetailsRedirectedRef = useRef(false);
  const datasetDetailsAccessCheckedRef = useRef("");
  const forbiddenDetailsRedirectHandledRef = useRef("");
  const skipUrlWorkflowSyncRef = useRef(false);
  const loadDatasetsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const datasetEditHydrateSeqRef = useRef(0);
  const datasetEditCommentCountFetchSeqRef = useRef(0);
  const datasetEditFormSnapshotRef = useRef<DatasetEditFormSnapshot | null>(null);
  const [datasetStatus, setDatasetStatus] = useState("");
  const [datasetStatusLoaded, setDatasetStatusLoaded] = useState(false);
  const [datasetWorkflowId, setDatasetWorkflowId] = useState("");
  const [datasetWorkflowName, setDatasetWorkflowName] = useState("");
  const [datasetStages, setDatasetStages] = useState<DatasetStage[]>([]);
  const [datasetName, setDatasetName] = useState("");
  const [datasetTimePeriodNidsForDataPoints, setDatasetTimePeriodNidsForDataPoints] = useState<string[]>(
    []
  );

  const [editedValues, setEditedValues] = useState<Map<string, DataPointEditValues>>(new Map());
  const [dataPointDataSaveErrorKeys, setDataPointDataSaveErrorKeys] = useState<Set<string>>(
    () => new Set()
  );
  const dataPointRowByKey = useMemo(() => {
    const map = new Map<string, DataPointsRow>();
    for (const row of dataPointRows) {
      map.set(getDataPointRowKey(row), row);
    }
    return map;
  }, [dataPointRows]);
  const [saveDraftLoading, setSaveDraftLoading] = useState(false);
  const [dataPointSelectionCount, setDataPointSelectionCount] = useState(0);
  const [selectedReviewRows, setSelectedReviewRows] = useState<DataPointsRow[]>([]);
  const [selectedDataEntryRows, setSelectedDataEntryRows] = useState<DataPointsRow[]>([]);
  const [deleteDataPointsLoading, setDeleteDataPointsLoading] = useState(false);
  const [reviewSelectionResetToken, setReviewSelectionResetToken] = useState(0);
  const [reviewConfirmOpen, setReviewConfirmOpen] = useState(false);
  const [reviewActionType, setReviewActionType] = useState<"approve" | "reject">("approve");
  const [reviewComment, setReviewComment] = useState("");
  const [reviewCommentTouched, setReviewCommentTouched] = useState(false);
  const [reviewLoading, setReviewLoading] = useState(false);
  const [submitForReviewLoading, setSubmitForReviewLoading] = useState(false);
  const [sendBackLoading, setSendBackLoading] = useState(false);
  const [datasetActionConfirmOpen, setDatasetActionConfirmOpen] = useState(false);
  const [datasetActionType, setDatasetActionType] = useState<
    "submit_for_review" | "publish_data" | "send_back" | null
  >(null);

  const [datasetDrawerOpen, setDatasetDrawerOpen] = useState(false);
  const [datasetDrawerMode, setDatasetDrawerMode] = useState<"create" | "edit">("create");
  const [drawerTab, setDrawerTab] = useState<"dataset" | "comment" | "import-logs">("dataset");
  const [datasetEditId, setDatasetEditId] = useState("");
  const [datasetEditStatus, setDatasetEditStatus] = useState("");
  const [datasetDraftName, setDatasetDraftName] = useState("");
  const [datasetAreaNids, setDatasetAreaNids] = useState<string[]>([]);
  const [datasetAreaItems, setDatasetAreaItems] = useState<AreaItem[]>([]);
  const [datasetIusNids, setDatasetIusNids] = useState<number[]>([]);
  const [datasetIndicatorItems, setDatasetIndicatorItems] = useState<IndicatorItem[]>([]);
  const [datasetTimeperiodNids, setDatasetTimeperiodNids] = useState<string[]>([]);
  const [datasetTimePeriodItems, setDatasetTimePeriodItems] = useState<TimePeriodItem[]>([]);
  const [datasetSourceNids, setDatasetSourceNids] = useState<string[]>([]);
  const [datasetSaveLoading, setDatasetSaveLoading] = useState(false);
  const [datasetHydrateLoading, setDatasetHydrateLoading] = useState(false);

  const [datasetDeleteConfirmOpen, setDatasetDeleteConfirmOpen] = useState(false);
  const [datasetDeleteLoading, setDatasetDeleteLoading] = useState(false);
  const [datasetAssociationLoading, setDatasetAssociationLoading] = useState(false);
  const [datasetDeleteBlocked, setDatasetDeleteBlocked] = useState(false);
  const [datasetDeleteTargets, setDatasetDeleteTargets] = useState<Array<{ id: string; name: string }>>(
    []
  );
  const [datasetAssociationCounts, setDatasetAssociationCounts] =
    useState<DatasetAssociationCounts | null>(null);
  const [workflowLevelCountById, setWorkflowLevelCountById] = useState<Record<string, number>>({});

  const [datasetAreaOpen, setDatasetAreaOpen] = useState(false);
  const [datasetIndicatorModalOpen, setDatasetIndicatorModalOpen] = useState(false);
  const [datasetTimeperiodOpen, setDatasetTimeperiodOpen] = useState(false);
  const [datasetSourceOpen, setDatasetSourceOpen] = useState(false);

  const [timePeriodOptions, setTimePeriodOptions] = useState<MultiSelectOption[]>([]);
  const [sourceOptions, setSourceOptions] = useState<MultiSelectOption[]>([]);
  const [resolvedPrevTimePeriodLabel, setResolvedPrevTimePeriodLabel] = useState("");

  const [dpCommentDrawerOpen, setDpCommentDrawerOpen] = useState(false);
  const [dpCommentDataPointId, setDpCommentDataPointId] = useState<number | null>(null);
  const [dpCommentDrawerTitle, setDpCommentDrawerTitle] = useState<DataPointCommentTitle | null>(null);
  const [dpCommentLocked, setDpCommentLocked] = useState(false);
  const [datasetCommentCount, setDatasetCommentCount] = useState(0);
  const [datasetEditCommentCount, setDatasetEditCommentCount] = useState(0);
  const [dataPointsImportOpen, setDataPointsImportOpen] = useState(false);
  const [dataPointsExportLoading, setDataPointsExportLoading] = useState(false);
  const [datapointReadiness, setDatapointReadiness] = useState("");
  const [datasetEditDatapointReadiness, setDatasetEditDatapointReadiness] = useState("");
  const [activeImportRequestId, setActiveImportRequestId] = useState<string | null>(null);
  const [importLogsPollToken, setImportLogsPollToken] = useState(0);
  const [hasRunningImports, setHasRunningImports] = useState(false);
  const prevDatapointReadinessRef = useRef("");

  const workflowListUrl = useMemo(
    () => (dwId ? getDWAPIURL(dwId, REFERENCE_PATH_WORKFLOW) : ""),
    [dwId]
  );
  const datasetListUrl = useMemo(
    () => (dwId ? getDWAPIURL(dwId, REFERENCE_PATH_DATASET) : ""),
    [dwId]
  );
  const dataPointsUrl = useMemo(
    () => (dwId ? getDWAPIURL(dwId, REFERENCE_PATH_DATA_POINTS) : ""),
    [dwId]
  );
  const timePeriodsListUrl = useMemo(
    () => (dwId ? getDWAPIURL(dwId, REFERENCE_PATH_TIME_PERIODS) : ""),
    [dwId]
  );
  const referenceBaseUrl = useMemo(() => (dwId ? getDWAPIURL(dwId, "") : ""), [dwId]);
  const datasetBasePath = useMemo(
    () => `/${locale}/${dwId}/${section}/dataset`,
    [dwId, locale, section]
  );
  /** Remember workflow on the dataset list so browser Back restores it after visiting a dataset. */
  const datasetListWorkflowStorageKey = useMemo(
    () => `dfa.dm.datasetList.workflow.v1:${encodeURIComponent(dwId)}:${section}`,
    [dwId, section]
  );
  /** Share workflow level counts from list screen to details screen. */
  const workflowLevelCountStorageKey = useMemo(
    () => `dfa.dm.datasetList.workflow-level-count.v1:${encodeURIComponent(dwId)}:${section}`,
    [dwId, section]
  );
  const isDataEntryOrReviewDatasetRoute = useMemo(
    () =>
      /\/data-entry\/dataset(?:\/|$)/.test(pathname) ||
      /\/data-review\/dataset(?:\/|$)/.test(pathname),
    [pathname]
  );

  const isDatasetDetailsPage = Boolean(datasetId);
  const isDataEntry = section === "data-entry";
  const isDataReview = section === "data-review";
  const hideDatasetDrawerEditActions = isDataReview;
  const autoCollapsedDetailsKeyRef = useRef("");

  useEffect(() => {
    if (!setSidebarCollapsed) return;
    const detailsKey = isDatasetDetailsPage
      ? `${section}:${String(datasetId ?? "").trim()}`
      : "";
    if (detailsKey && autoCollapsedDetailsKeyRef.current !== detailsKey) {
      setSidebarCollapsed(true);
      autoCollapsedDetailsKeyRef.current = detailsKey;
    }
    if (!detailsKey) {
      autoCollapsedDetailsKeyRef.current = "";
    }
  }, [datasetId, isDatasetDetailsPage, section, setSidebarCollapsed]);

  const canOpenDataset = useCallback(
    (dataset: DatasetListItem | null | undefined): boolean => {
      if (!dataset) return false;
      if (isDataEntry) return true;
      const status = getDatasetStatusToken(dataset.dataset_status);
      if (isDataReview) return DATA_REVIEW_OPENABLE_STATUSES.has(status);
      return false;
    },
    [isDataEntry, isDataReview]
  );
  const canDeleteDataset = useCallback(
    (dataset: DatasetListItem | null | undefined): boolean => {
      if (!dataset || !isDataEntry) return false;
      if (!canDwDeleteDataEntryDataset) return false;
      return DATA_ENTRY_DELETABLE_STATUSES.has(getDatasetStatusToken(dataset.dataset_status));
    },
    [canDwDeleteDataEntryDataset, isDataEntry]
  );
  const resolvedDetailsWorkflowId = useMemo(
    () => String(isDatasetDetailsPage ? datasetWorkflowId || workflowId : workflowId).trim(),
    [datasetWorkflowId, isDatasetDetailsPage, workflowId]
  );
  const selectedWorkflow = useMemo(
    () =>
      workflows.find((workflow) =>
        String(workflow.workflow_id) === resolvedDetailsWorkflowId
      ),
    [resolvedDetailsWorkflowId, workflows]
  );
  const selectedWorkflowId = useMemo(
    () => resolvedDetailsWorkflowId,
    [resolvedDetailsWorkflowId]
  );
  const scopeConfigWorkflowId = useMemo(
    () => String(isDatasetDetailsPage ? datasetWorkflowId || workflowId : workflowId).trim(),
    [datasetWorkflowId, isDatasetDetailsPage, workflowId]
  );
  const dataEntryDatasetActionType = useMemo<"submit_for_review" | "publish_data">(() => {
    if (!selectedWorkflow) return "submit_for_review";
    const allowReview = Boolean(selectedWorkflow.allow_review);
    const reviewLevelCount = workflowLevelCountById[selectedWorkflowId];
    if (!allowReview) return "publish_data";
    if (reviewLevelCount == null) return "submit_for_review";
    if (reviewLevelCount === 0) return "publish_data";
    return "submit_for_review";
  }, [selectedWorkflow, selectedWorkflowId, workflowLevelCountById]);
  /**
   * Workflow has an actual review pipeline only when `allow_review` is true AND
   * the configured review level count is > 0. Used (e.g. by the delete-dataset
   * modal) to suppress review-stage / review-slice / action-log counts that
   * carry no meaning otherwise.
   */
  const datasetSupportsReviewFlow = useMemo<boolean>(() => {
    if (!selectedWorkflow) return false;
    if (!selectedWorkflow.allow_review) return false;
    const reviewLevelCount = workflowLevelCountById[selectedWorkflowId];
    if (reviewLevelCount == null) return false;
    return reviewLevelCount > 0;
  }, [selectedWorkflow, selectedWorkflowId, workflowLevelCountById]);
  const showWorkflowDropdown = !isDatasetDetailsPage;

  const dataSetsLabel = t("DATASET", "Dataset");

  const workflowOptions = useMemo<SelectFieldOption[]>(
    () => [
      { value: "", label: t("PLACEHOLDER_SELECT") },
      ...workflows.map((workflow) => ({
        value: String(workflow.workflow_id),
        label:
          (workflow.workflow_name ?? workflow.workflow_code ?? "").trim() ||
          String(workflow.workflow_id),
      })),
    ],
    [t, workflows]
  );

  const workflowName = useMemo(() => {
    const selectedName = selectedWorkflow
      ? (selectedWorkflow.workflow_name ?? selectedWorkflow.workflow_code ?? "").trim()
      : "";
    if (selectedName) return selectedName;
    return datasetWorkflowName.trim();
  }, [datasetWorkflowName, selectedWorkflow]);

  const dataPointsTotalCount = useMemo(() => {
    const tc = dataPointsMeta?.total_count;
    if (typeof tc === "number" && tc >= 0) return tc;
    return dataPointRows.length;
  }, [dataPointsMeta?.total_count, dataPointRows.length]);

  const dataPointsTotalPages = useMemo(() => {
    const tp = dataPointsMeta?.total_pages;
    if (typeof tp === "number" && tp > 0) return tp;
    return Math.max(1, Math.ceil(dataPointsTotalCount / dataPointsPageSize));
  }, [dataPointsMeta?.total_pages, dataPointsPageSize, dataPointsTotalCount]);
  const dataPointsTabCounts = useMemo(() => {
    const allCountRaw = dataPointsMeta?.count;
    const approvedCountRaw = dataPointsMeta?.approved_count;
    const rejectedCountRaw = dataPointsMeta?.rejected_count;
    const pendingCountRaw = dataPointsMeta?.pending_count;
    const fallbackApproved = dataPointRows.filter(
      (row) => String(row.review_status ?? "").trim().toUpperCase() === "APPROVED"
    ).length;
    const fallbackRejected = dataPointRows.filter(
      (row) => String(row.review_status ?? "").trim().toUpperCase() === "REJECTED"
    ).length;
    const fallbackPending = dataPointRows.filter(
      (row) => String(row.review_status ?? "").trim().toUpperCase() === "PENDING_REVIEW"
    ).length;
    return {
      all: typeof allCountRaw === "number" && allCountRaw >= 0 ? allCountRaw : dataPointRows.length,
      approved:
        typeof approvedCountRaw === "number" && approvedCountRaw >= 0 ? approvedCountRaw : fallbackApproved,
      rejected:
        typeof rejectedCountRaw === "number" && rejectedCountRaw >= 0 ? rejectedCountRaw : fallbackRejected,
      pending:
        typeof pendingCountRaw === "number" && pendingCountRaw >= 0 ? pendingCountRaw : fallbackPending,
    };
  }, [
    dataPointRows,
    dataPointsMeta?.approved_count,
    dataPointsMeta?.rejected_count,
    dataPointsMeta?.pending_count,
    dataPointsMeta?.count,
  ]);

  const allowedAreaContentIds = useMemo(() => {
    if (isSuperAdmin()) return [];
    if (!resolvedDetailsWorkflowId) return [];
    return getStoredWorkflowAreaContentIds({
      workflowCode: selectedWorkflow?.workflow_code,
      workflowId: resolvedDetailsWorkflowId,
      resourceCode: "dm_dw_area",
    });
  }, [dwPermissionsVersion, resolvedDetailsWorkflowId, selectedWorkflow]);

  const [preloadedAreaItems, setPreloadedAreaItems] = useState<PreloadedAreaItem[]>([]);

  const loadPreloadedAreas = useCallback(async () => {
    if (!dwId) {
      setPreloadedAreaItems([]);
      return;
    }

    if (isSuperAdmin()) {
      setPreloadedAreaItems([]);
      return;
    }

    if (allowedAreaContentIds.length === 0) {
      setPreloadedAreaItems([]);
      return;
    }
    const base = getDWAPIURL(dwId, REFERENCE_PATH_AREAS);
    const params = new URLSearchParams({
      identifier: allowedAreaContentIds.join(","),
      identifier_children: "false",
    });
    try {
      const json = (await getRequest(`${base}?${params.toString()}`, undefined, {
        suppressErrorMessage: true,
      })) as { success?: boolean; data?: PreloadedAreaItem[] };
      if (json.success && Array.isArray(json.data)) {
        setPreloadedAreaItems(json.data);
      } else {
        setPreloadedAreaItems([]);
      }
    } catch {
      setPreloadedAreaItems([]);
    }
  }, [allowedAreaContentIds, dwId]);

  useEffect(() => {
    void loadPreloadedAreas();
  }, [loadPreloadedAreas]);

  const resetDatasetDrawerFormFields = useCallback(() => {
    datasetEditCommentCountFetchSeqRef.current += 1;
    setDrawerTab("dataset");
    setDatasetDraftName("");
    setDatasetAreaNids([]);
    setDatasetAreaItems([]);
    setDatasetIusNids([]);
    setDatasetIndicatorItems([]);
    setDatasetTimeperiodNids([]);
    setDatasetTimePeriodItems([]);
    setDatasetSourceNids([]);
    setDatasetAreaOpen(false);
    setDatasetIndicatorModalOpen(false);
    setDatasetTimeperiodOpen(false);
    setDatasetSourceOpen(false);
    setDatasetHydrateLoading(false);
    setDatasetEditCommentCount(0);
    setDatasetEditDatapointReadiness("");
  }, []);

  const resetDatasetDrawerForm = useCallback(() => {
    setDatasetDrawerMode("create");
    setDatasetEditId("");
    setDatasetEditStatus("");
    datasetEditFormSnapshotRef.current = null;
    resetDatasetDrawerFormFields();
  }, [resetDatasetDrawerFormFields]);

  const closeDatasetDrawer = useCallback(() => {
    if (datasetSaveLoading) return;
    setDatasetDrawerOpen(false);
    resetDatasetDrawerForm();
    setSidebarCollapsed?.(false);
  }, [datasetSaveLoading, resetDatasetDrawerForm, setSidebarCollapsed]);

  const isDatasetDrawerReadOnly = useMemo(() => {
    if (datasetDrawerMode === "create") {
      if (!isDataEntry) return false;
      return !canDwCreateDataEntryDataset;
    }
    if (datasetDrawerMode !== "edit") return false;
    if (isDataReview) return true;
    if (!isDataEntry) return false;
    if (!canDwUpdateDataEntryDataset) return true;
    return String(datasetEditStatus ?? "").trim().toUpperCase() !== "DRAFT";
  }, [
    canDwCreateDataEntryDataset,
    canDwUpdateDataEntryDataset,
    datasetDrawerMode,
    datasetEditStatus,
    isDataEntry,
    isDataReview,
  ]);

  const datasetDrawerTitle = useMemo(() => {
    if (datasetDrawerMode === "edit") {
      const name = datasetDraftName.trim() || "—";
      return t("DATASET_DRAWER_TITLE_EDIT", "Dataset: {name}").replace("{name}", name);
    }
    return t("DATASET_DRAWER_TITLE_ADD", "Dataset: Add");
  }, [datasetDrawerMode, datasetDraftName, t]);

  const dataEntryIndicatorScopeHint = useMemo(
    () =>
      dataEntryScope.indicator === "SINGLE"
        ? t("_SCOPE_SELECTION_SINGLE", "Allowed: single selection.")
        : t("SCOPE_SELECTION_MULTIPLE", "Allowed: multiple selections."),
    [dataEntryScope.indicator, t]
  );

  const workflowTimePeriodFrequencyDisplay = useMemo(() => {
    const f = workflowTimePeriodFrequency.trim().toUpperCase();
    if (!f || f === "ALL") {
      return t("TIMEPERIOD_FREQ_ALL", "All frequencies");
    }
    if (f === "M") return t("TIMEPERIOD_FREQ_MONTHLY", "Monthly");
    if (f === "Q") return t("TIMEPERIOD_FREQ_QUARTERLY", "Quarterly");
    if (f === "A") return t("TIMEPERIOD_FREQ_ANNUAL", "Annual");
    return workflowTimePeriodFrequency.trim() || t("TIMEPERIOD_FREQ_ALL", "All frequencies");
  }, [t, workflowTimePeriodFrequency]);

  const dataEntryTimePeriodScopeHint = useMemo(() => {
    const scopePart =
      dataEntryScope.timePeriod === "SINGLE"
        ? t("_SCOPE_SELECTION_SINGLE", "Allowed: single selection.")
        : t("SCOPE_SELECTION_MULTIPLE", "Allowed: multiple selections.");
    return `${workflowTimePeriodFrequencyDisplay} · ${scopePart}`;
  }, [dataEntryScope.timePeriod, t, workflowTimePeriodFrequencyDisplay]);

  const workflowAreaLevelDisplayName = useMemo(() => {
    if (workflowAreaLevel == null || workflowAreaLevel <= 0) return "";
    const row = areaLevelCatalog.find((r) => r.al_level === workflowAreaLevel);
    return row?.al_name?.trim() ?? "";
  }, [areaLevelCatalog, workflowAreaLevel]);

  const dataEntryAreaScopeHint = useMemo(() => {
    const scopePart =
      dataEntryScope.area === "SINGLE"
        ? t("_SCOPE_SELECTION_SINGLE", "Allowed: single selection.")
        : t("SCOPE_SELECTION_MULTIPLE", "Allowed: multiple selections.");
    let levelPart: string;
    if (workflowAreaLevel != null && workflowAreaLevel > 0) {
      const label = workflowAreaLevelDisplayName;
      levelPart = label
        ? t("AREA_LEVEL_NAMED", "Area level: {name}").replace("{name}", label)
        : t("AREA_LEVEL_N", "Area level: {level}").replace("{level}", String(workflowAreaLevel));
    } else {
      levelPart = t("AREA_LEVEL_NOT_SET", "Area level: not configured");
    }
    return `${levelPart} · ${scopePart}`;
  }, [dataEntryScope.area, t, workflowAreaLevel, workflowAreaLevelDisplayName]);

  const goToDatasetList = useCallback(
    (reviewSuccess?: string) => {
    const nextWorkflowId = String(datasetWorkflowId || workflowId).trim();
      const params = new URLSearchParams();
      if (nextWorkflowId) params.set("workflow_id", nextWorkflowId);
      if (reviewSuccess) params.set(REVIEW_SUCCESS_QUERY_KEY, reviewSuccess);
      const query = params.toString();
      const target = query ? `${datasetBasePath}?${query}` : datasetBasePath;
    router.push(target);
    },
    [datasetBasePath, datasetWorkflowId, router, workflowId]
  );
  const replaceToDatasetList = useCallback(() => {
    const nextWorkflowId = String(datasetWorkflowId || workflowId).trim();
    const target = nextWorkflowId
      ? `${datasetBasePath}?workflow_id=${encodeURIComponent(nextWorkflowId)}`
      : datasetBasePath;
    router.replace(target);
  }, [datasetBasePath, datasetWorkflowId, router, workflowId]);

  const openCreateDatasetDrawer = useCallback(() => {
    if (!canDwCreateDataEntryDataset) return;
    if (!workflowId) {
      toast.error(t("SELECT_WORKFLOW_FIRST"));
      return;
    }
    resetDatasetDrawerForm();
    if (allowedAreaContentIds.length === 1) {
      const singleAreaNid = allowedAreaContentIds[0];
      const found = preloadedAreaItems.find((a) => a.ar_nid === singleAreaNid);
      if (found) {
        const areaItem: AreaItem = {
          id: found.ar_id || String(found.ar_nid),
          label: found.ar_name || found.ar_id || String(found.ar_nid),
          nid: found.ar_nid,
        };
        setDatasetAreaNids([String(singleAreaNid)]);
        setDatasetAreaItems([areaItem]);
      }
    }
    setDatasetDrawerMode("create");
    setDatasetHydrateLoading(false);
    setSidebarCollapsed?.(true);
    setDatasetDrawerOpen(true);
  }, [allowedAreaContentIds, canDwCreateDataEntryDataset, preloadedAreaItems, resetDatasetDrawerForm, setSidebarCollapsed, t, workflowId]);

  const handleClearDatasetDrawer = useCallback(() => {
    const currentDraftName = datasetDraftName;
    resetDatasetDrawerFormFields();
    setDatasetDraftName(currentDraftName);
  }, [datasetDraftName, resetDatasetDrawerFormFields]);

  const openDatasetAreaPicker = useCallback(() => {
    setDatasetAreaOpen(true);
  }, [t, workflowAreaLevel]);

  const loadWorkflows = useCallback(async () => {
    if (!workflowListUrl) return;
    setWorkflowsLoading(true);
    setWorkflowsError(null);
    const url = buildListRequestUrl(workflowListUrl, {
      is_active: true,
      ...(isDataReview ? { allow_review: true } : {}),
    });
    try {
      const json = (await getRequest(url, undefined, {
        suppressErrorMessage: true,
      })) as WorkflowsListResult;
      if (!isWorkflowsListResponse(json)) {
        const msg =
          typeof json.err_message === "string" && json.err_message.trim()
            ? json.err_message
            : t("WORKFLOWS_LOAD_FAILED");
        setWorkflows([]);
        setWorkflowsError(msg);
        return;
      }
      let data = json.data.filter((w) => w.is_active);
      if (!isSuperAdmin()) {
        const allowedCodes = getStoredWorkflowCodes();
        if (allowedCodes.length > 0) {
          const codeSet = new Set(allowedCodes);
          data = data.filter((w) => codeSet.has(w.workflow_code));
        }
      }
      setWorkflows(data);
    } finally {
      setWorkflowsLoading(false);
    }
  }, [t, workflowListUrl, dwPermissionsVersion, isDataReview]);

  const loadDataEntryScope = useCallback(
    async (wfId: string) => {
      if (!dwId || !wfId) {
        setDataEntryScope(DEFAULT_DATA_ENTRY_SCOPE);
        setDataEntryShowPreviousTime(false);
        setWorkflowTimePeriodFrequency("");
        setWorkflowCurrTimeperiodNid(null);
        setWorkflowAreaLevel(null);
        return;
      }
      const url = `${getDWAPIURL(dwId, REFERENCE_PATH_DATASET)}/workflow/${encodeURIComponent(wfId)}?include_workflow=false`;
      try {
        const json = (await getRequest(url, undefined, {
          suppressErrorMessage: true,
        })) as DataEntryGetResult;
        if (json.success !== true || !json.data) {
          setDataEntryScope(DEFAULT_DATA_ENTRY_SCOPE);
          setDataEntryShowPreviousTime(false);
          setWorkflowTimePeriodFrequency("");
          setWorkflowCurrTimeperiodNid(null);
          setWorkflowAreaLevel(null);
          return;
        }
        const timePeriodScope = normalizeDataEntryScope(json.data.scope_timeperiod);
        setDataEntryScope({
          indicator: normalizeDataEntryScope(json.data.scope_indicator),
          timePeriod: timePeriodScope,
          area: normalizeDataEntryScope(json.data.scope_area),
        });
        setDataEntryShowPreviousTime(
          // timePeriodScope === "SINGLE" && Boolean(json.data.show_previous_time)
          Boolean(json.data.show_previous_time)
        );
        setWorkflowTimePeriodFrequency(
          normalizeDataEntryTimeperiodFrequency(json.data.timeperiod_frequency)
        );
        setWorkflowCurrTimeperiodNid(
          parsePositiveInteger(json.data.curr_timeperiod_nid) ?? null
        );
        setWorkflowAreaLevel(parseWorkflowAreaLevel(json.data.area_level));
      } catch {
        setDataEntryScope(DEFAULT_DATA_ENTRY_SCOPE);
        setDataEntryShowPreviousTime(false);
        setWorkflowTimePeriodFrequency("");
        setWorkflowCurrTimeperiodNid(null);
        setWorkflowAreaLevel(null);
      }
    },
    [dwId]
  );

  const datasetListQuery = useMemo(() => {
    const sort_field =
      datasetListSort.direction != null && datasetListSort.columnId != null
        ? datasetListSort.columnId
        : undefined;
    const sort_order =
      datasetListSort.direction != null && sort_field != null
        ? datasetListSort.direction
        : undefined;
    return {
      ...(sort_field != null && sort_order != null ? { sort_field, sort_order } : {}),
      ...(datasetSearchParam
        ? { search: datasetSearchParam, ...(datasetSearchByParam ? { search_by: datasetSearchByParam } : {}) }
        : {}),
    };
  }, [datasetListSort.columnId, datasetListSort.direction, datasetSearchParam, datasetSearchByParam]);

  useEffect(() => {
    setDatasetPage(1);
  }, [debouncedDatasetSearch, datasetStatusFilter]);

  const loadDatasets = useCallback(async () => {
    if (!datasetListUrl || !workflowId) {
      setDatasets([]);
      setDatasetsError(null);
      return;
    }
    setDatasetsLoading(true);
    setDatasetsError(null);
    try {
      const requestedStatus = datasetStatusFilter
        ? String(datasetStatusFilter).trim().toUpperCase()
        : undefined;
      const fetchByParams = async (
        baseUrl: string,
        params: Record<string, string | number | boolean | null | undefined>
      ) => {
        const url = buildListRequestUrl(baseUrl, params);
        return (await getRequest(url, undefined, {
          suppressErrorMessage: true,
        })) as DatasetsListResult;
      };

      const listUrl = isDataReview
        ? `${datasetListUrl}/review`
        : datasetListUrl;

      const byWorkflowId = await fetchByParams(listUrl, {
        workflow_id: workflowId,
        status: requestedStatus,
        sort_field: datasetListQuery.sort_field,
        sort_order: datasetListQuery.sort_order,
        search: datasetListQuery.search,
        search_by: datasetListQuery.search_by,
      });
      if (!isDatasetsListResponse(byWorkflowId)) {
        const msg =
          typeof byWorkflowId.err_message === "string"
            ? byWorkflowId.err_message
            : typeof byWorkflowId.message === "string" && byWorkflowId.message.trim()
              ? byWorkflowId.message
              : t("DATASETS_LOAD_FAILED");
        setDatasets([]);
        setDatasetsError(msg);
        return;
      }

      setDatasets(byWorkflowId.data.datasets);
      const meta = (byWorkflowId as unknown as { meta?: { total_count?: number; total_pages?: number } }).meta;
      if (meta) {
        if (typeof meta.total_count === "number") setDatasetTotalCount(meta.total_count);
        if (typeof meta.total_pages === "number") setDatasetTotalPages(meta.total_pages);
      } else {
        setDatasetTotalCount(byWorkflowId.data.datasets.length);
        setDatasetTotalPages(1);
      }
    } finally {
      setDatasetsLoading(false);
    }
  }, [datasetListQuery, datasetListUrl, datasetStatusFilter, isDataReview, t, workflowId]);

  useEffect(() => {
    const needsArea = dataEntryScope.area === "SINGLE";
    const needsTimePeriod = dataEntryScope.timePeriod === "SINGLE";
    if (!dwId || (!needsArea && !needsTimePeriod)) {
      setDatasetInfoAreaMap(new Map());
      setDatasetInfoTimePeriodMap(new Map());
      return;
    }
    let cancelled = false;
    const run = async () => {
      if (needsArea) {
        const uniqueNids = [...new Set(datasets.flatMap((d) => d.area_nids ?? []))];
        if (uniqueNids.length > 0) {
          const items = await hydrateAreaItemsForNids(dwId, uniqueNids.map(String));
          if (cancelled) return;
          const map = new Map<number, string>();
          for (const item of items) {
            if (item.nid != null) map.set(item.nid, item.label);
          }
          setDatasetInfoAreaMap(map);
        } else {
          if (!cancelled) setDatasetInfoAreaMap(new Map());
        }
      }
      if (needsTimePeriod) {
        const uniqueNids = [...new Set(datasets.flatMap((d) => d.timeperiod_nids ?? []))];
        if (uniqueNids.length > 0) {
          const items = await hydrateTimePeriodItemsForNids(dwId, uniqueNids.map(String), []);
          if (cancelled) return;
          const map = new Map<number, string>();
          for (const item of items) {
            if (item.nid != null) map.set(item.nid, item.label);
          }
          setDatasetInfoTimePeriodMap(map);
        } else {
          if (!cancelled) setDatasetInfoTimePeriodMap(new Map());
        }
      }
    };
    run();
    return () => { cancelled = true; };
  }, [datasets, dataEntryScope, dwId]);

  const loadWorkflowLevelCount = useCallback(
    async (wfId: string) => {
      if (!workflowListUrl || !wfId) return;
      const url = `${workflowListUrl}/${encodeURIComponent(wfId)}/level`;
      try {
        const json = (await getRequest(url, undefined, {
          suppressErrorMessage: true,
        })) as WorkflowLevelCountResult;
        if (json.success !== true) return;
        const countFromMeta = Number(json.meta?.count);
        const count =
          Number.isFinite(countFromMeta) && countFromMeta >= 0
            ? countFromMeta
            : Array.isArray(json.data)
              ? json.data.length
              : 0;
        setWorkflowLevelCountById((prev) => {
          const next = { ...prev, [wfId]: count };
          try {
            sessionStorage.setItem(workflowLevelCountStorageKey, JSON.stringify(next));
          } catch {
            // ignore storage failures (private mode, quota)
          }
          return next;
        });
      } catch {
        // keep fallback on workflow.review_level_count when this call fails
      }
    },
    [workflowLevelCountStorageKey, workflowListUrl]
  );

  const dpListQuery = useMemo(() => {
    const sort_field =
      dpListSort.direction != null && dpListSort.columnId != null
        ? dpListSort.columnId
        : undefined;
    const sort_order =
      dpListSort.direction != null && sort_field != null
        ? dpListSort.direction
        : undefined;
    return {
      ...(sort_field != null && sort_order != null ? { sort_field, sort_order } : {}),
      ...(dpSearchParam
        ? { search: dpSearchParam, ...(dpSearchByParam ? { search_by: dpSearchByParam } : {}) }
        : {}),
    };
  }, [dpListSort.columnId, dpListSort.direction, dpSearchParam, dpSearchByParam]);

  const datasetSourceFilterOptions = useMemo(() => {
    if (!datasetDetailSourceNids.length) return [];
    const nidSet = new Set(datasetDetailSourceNids);
    return sourceOptions.filter((o) => nidSet.has(o.value));
  }, [sourceOptions, datasetDetailSourceNids]);

  useEffect(() => {
    setDataPointsPage(1);
  }, [debouncedDpSearch]);

  const fetchDataPoints = useCallback(
    async (
      override?: { page?: number; page_size?: number; reviewFilter?: DataPointsReviewFilter }
    ): Promise<string> => {
      if (!dataPointsUrl || !datasetId) {
        setDataPointRows([]);
        setDataPointsError(null);
        setDataPointsMeta(null);
        setDatasetTimePeriodNidsForDataPoints([]);
        setDatasetCommentCount(0);
        setDataPointsLoading(false);
        return "";
      }
      const page = override?.page ?? dataPointsPage;
      const page_size = override?.page_size ?? dataPointsPageSize;
      const reviewFilter = override?.reviewFilter ?? dataPointsReviewFilter;
      setDataPointsLoading(true);
      setDataPointsError(null);
      setDatasetTimePeriodNidsForDataPoints([]);

      let localSrcNidsFromDetail: string[] = [];

      if (datasetListUrl) {
        try {
          const detailUrl = `${datasetListUrl}/${encodeURIComponent(datasetId)}`;
          const detailJson = (await getRequest(detailUrl, undefined, {
            suppressErrorMessage: true,
          })) as {
            success?: boolean;
            data?: DatasetListItem;
            err_message?: string;
            message?: string;
            detail?: string;
            status_code?: number;
            status?: number;
            code?: number;
          };
          if (isDataReview && isForbiddenResponse(detailJson)) {
            const detailsKey = `${section}:${datasetId}`;
            if (forbiddenDetailsRedirectHandledRef.current !== detailsKey) {
              forbiddenDetailsRedirectHandledRef.current = detailsKey;
              toast.success(
                t(
                  "DATASET_ALREADY_APPROVED_AT_THIS_LEVEL",
                  "This dataset is already approved at this level"
                )
              );
              goToDatasetList();
            }
            setDataPointsLoading(false);
            return "";
          }
          if (detailJson.success && detailJson.data) {
            const selectedTimePeriodNids = parseNidsFromUnknown(detailJson.data.timeperiod_nids);
            setDatasetTimePeriodNidsForDataPoints(selectedTimePeriodNids);
            setDatasetCommentCount(normalizeCommentCount(detailJson.data.cmnt_cnt));
            const detailName = (detailJson.data.dataset_name ?? "").trim();
            if (detailName) setDatasetName(detailName);
            const detailStatus = firstNonBlank(detailJson.data.dataset_status);
            if (detailStatus) {
              setDatasetStatus(detailStatus);
              setDatasetStatusLoaded(true);
            }
            const detailWorkflowId = String(detailJson.data.workflow_id ?? "").trim();
            if (detailWorkflowId) setDatasetWorkflowId(detailWorkflowId);
            const detailWorkflowName = String(detailJson.data.workflow_name ?? "").trim();
            if (detailWorkflowName) setDatasetWorkflowName(detailWorkflowName);
            if (Array.isArray(detailJson.data.stages)) {
              setDatasetStages(detailJson.data.stages);
            }
            const readiness = String(detailJson.data.datapoint_readiness ?? "").trim();
            if (readiness) setDatapointReadiness(readiness);
            localSrcNidsFromDetail = parseNidsFromUnknown(detailJson.data.source_nids);
            setDatasetDetailSourceNids(localSrcNidsFromDetail);
            if (dpSourceFilterNids.length === 0 && localSrcNidsFromDetail.length > 0) {
              isInitializingSourceFilterRef.current = true;
              setDpSourceFilterNids([localSrcNidsFromDetail[0]]);
            }
          }
        } catch {
          setDatasetTimePeriodNidsForDataPoints([]);
          // proceed without dataset-specific nids
        }
      }

      const srcNidsForUrl =
        dpSourceFilterNids.length > 0
          ? dpSourceFilterNids
          : localSrcNidsFromDetail.length > 0
            ? [localSrcNidsFromDetail[0]]
            : [];

      const url = buildListRequestUrl(dataPointsUrl, {
        dataset_id: datasetId,
        ...((isDataReview || (isDataEntry && dataEntryDatasetActionType === "submit_for_review")) && reviewFilter !== "ALL" ? { review_status: reviewFilter } : {}),
        page,
        page_size,
        ...(srcNidsForUrl.length > 0 ? { src_identifier: srcNidsForUrl.join(",") } : {}),
        sort_field: dpListQuery.sort_field,
        sort_order: dpListQuery.sort_order,
        search: dpListQuery.search,
        search_by: dpListQuery.search_by,
      });
      try {
        const json = (await getRequest(url, undefined, {
          suppressErrorMessage: true,
        })) as DataPointsGetResult;
        if (json.success !== true || !Array.isArray(json.data)) {
          const msg =
            typeof json.err_message === "string" && json.err_message.trim()
              ? json.err_message
              : typeof json.message === "string" && json.message.trim()
                ? json.message
                : t("DATA_POINTS_LOAD_FAILED", "Failed to load data points.");
          setDataPointRows([]);
          setDataPointsMeta(null);
          setDataPointsError(null);
          toast.error(msg);
          return "";
        }
        const metaStatus = firstNonBlank(json.meta?.dataset_status);
        if (metaStatus) {
          setDatasetStatus(metaStatus);
          setDatasetStatusLoaded(true);
        }
        setDataPointsMeta(json.meta ?? null);
        setDataPointRows(json.data);
        return getDatasetStatusToken(metaStatus);
      } finally {
        setDataPointsLoading(false);
      }
    },
    [
      dataPointsPage,
      dataPointsPageSize,
      dataPointsReviewFilter,
      dataPointsUrl,
      datasetId,
      datasetListUrl,
      dpListQuery,
      dpSourceFilterNids,
      goToDatasetList,
      isDataReview,
      section,
      t,
    ]
  );

  const fetchValidationRules = useCallback(async () => {
    if (!dwId || !datasetId) {
      setValidationRulesMap({});
      return;
    }
    const url = `${getDWAPIURL(dwId, REFERENCE_PATH_INDICATORS)}/validation-rules?dataset_id=${encodeURIComponent(datasetId)}`;
    try {
      const json = (await getRequest(url, undefined, { suppressErrorMessage: true })) as FetchDatasetValidationRulesResult;
      if (json.success === true && json.data && typeof json.data === "object" && !Array.isArray(json.data)) {
        setValidationRulesMap(json.data);
      }
    } catch {
      // non-critical: fall back to plain text inputs
    }
  }, [dwId, datasetId]);

  const handleExportDataPoints = useCallback(async () => {
    if (!dataPointsUrl || !datasetId) return;
    setDataPointsExportLoading(true);
    try {
      const url = buildListRequestUrl(dataPointsUrl, {
        dataset_id: datasetId,
        export: true,
        ...((isDataReview || (isDataEntry && dataEntryDatasetActionType === "submit_for_review")) &&
        dataPointsReviewFilter !== "ALL"
          ? { review_status: dataPointsReviewFilter }
          : {}),
        sort_field: dpListQuery.sort_field,
        sort_order: dpListQuery.sort_order,
        search: dpListQuery.search,
        search_by: dpListQuery.search_by,
      });
      const res = await getFileResponse(url);
      const contentType = res.headers.get("Content-Type") ?? "";
      if (!res.ok) {
        if (contentType.includes("application/json")) {
          try {
            const json = (await res.json()) as { err_message?: string; message?: string };
            toast.error(
              json.err_message ??
                json.message ??
                t("DATA_POINTS_EXPORT_FAILED", "Failed to export data points.")
            );
          } catch {
            toast.error(t("DATA_POINTS_EXPORT_FAILED", "Failed to export data points."));
          }
        } else {
          toast.error(t("DATA_POINTS_EXPORT_FAILED", "Failed to export data points."));
        }
        return;
      }
      if (contentType.includes("application/json")) {
        try {
          const json = (await res.json()) as { err_message?: string; message?: string };
          toast.error(
            json.err_message ??
              json.message ??
              t("DATA_POINTS_EXPORT_FAILED", "Failed to export data points.")
          );
        } catch {
          toast.error(t("DATA_POINTS_EXPORT_FAILED", "Failed to export data points."));
        }
        return;
      }
      const blob = await res.blob();
      const cd = res.headers.get("Content-Disposition");
      let filename = `data-points-dataset-${datasetId}.xlsx`;
      if (cd) {
        const quoted = cd.match(/filename="([^"]+)"/i);
        const unquoted = cd.match(/filename=([^;\s]+)/i);
        const raw = quoted?.[1] ?? unquoted?.[1];
        if (raw) filename = raw.replace(/^["']|["']$/g, "");
      }
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = blobUrl;
      a.download = filename;
      a.rel = "noopener";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(blobUrl);
      toast.success(t("DATA_POINTS_EXPORT_SUCCESS", "Data points export downloaded."));
    } catch {
      toast.error(t("DATA_POINTS_EXPORT_FAILED", "Failed to export data points."));
    } finally {
      setDataPointsExportLoading(false);
    }
  }, [
    dataEntryDatasetActionType,
    dataPointsReviewFilter,
    dataPointsUrl,
    datasetId,
    dpListQuery.search,
    dpListQuery.search_by,
    dpListQuery.sort_field,
    dpListQuery.sort_order,
    isDataEntry,
    isDataReview,
    t,
  ]);

  const handleDataPointsFileImport = useCallback(
    async ({ file }: { file: File | null; format: "csv" | "xlsx" }) => {
      if (!datasetListUrl || !datasetId || !file || !canDwCreateDataEntryDataset) return;
      const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
      if (ext !== "csv" && ext !== "xlsx") {
        toast.error(
          t(
            "IMPORT_CSV_XLSX_ONLY",
            "Upload a CSV or XLSX file in the same format as the export file."
          )
        );
        throw new Error("data-points-import-format");
      }
      const fd = new FormData();
      fd.append("file", file);
      const url = `${datasetListUrl}/${encodeURIComponent(datasetId)}${REFERENCE_PATH_DATA_POINTS_IMPORT}`;
      const json = (await postRequest(url, fd, undefined, undefined, {
        suppressErrorMessage: true,
      })) as {
        success?: boolean;
        message?: string;
        err_message?: string;
        data?: DataPointsImportResult;
      };
      if (json.success !== true) {
        const err =
          typeof json.err_message === "string" && json.err_message.trim()
            ? json.err_message
            : typeof json.message === "string" && json.message.trim()
              ? json.message
              : t("DATA_POINTS_IMPORT_FAILED", "Failed to import data points.");
        toast.error(err);
        throw new Error("data-points-import-failed");
      }
      const data = json.data;
      if (data?.import_async) {
        const readiness = String(data.datapoint_readiness ?? "UPDATED").trim();
        if (readiness) setDatapointReadiness(readiness);
        setActiveImportRequestId(data.request_id ?? null);
        setImportLogsPollToken((n) => n + 1);
        toast.info(
          t(
            "DATA_POINTS_IMPORT_QUEUED",
            "Import queued. Processing in background…"
          )
        );
        return;
      }
      toast.success(
        typeof json.message === "string" && json.message.trim()
          ? json.message
          : t("DATA_POINTS_IMPORT_SUCCESS", "Data points imported successfully.")
      );
      await fetchDataPoints();
    },
    [canDwCreateDataEntryDataset, datasetId, datasetListUrl, fetchDataPoints, t]
  );

  const loadTimePeriods = useCallback(async () => {
    if (!timePeriodsListUrl) {
      setTimePeriodOptions([]);
      return [];
    }
    const url = buildListRequestUrl(timePeriodsListUrl, {
      timeperiod_frequency:
        workflowTimePeriodFrequency && workflowTimePeriodFrequency !== "ALL"
          ? workflowTimePeriodFrequency
          : undefined,
      ...(workflowCurrTimeperiodNid != null && workflowCurrTimeperiodNid > 0
        ? { max_timeperiod_nid: workflowCurrTimeperiodNid }
        : {}),
      sort_field: "enddate",
      sort_order: "asc",
    });
    try {
      const json = (await getRequest(url, undefined, {
        suppressErrorMessage: true,
      })) as unknown;
      const items = parseListItems(json);
      const rows = items
        .map((item) => {
          const nid = parsePositiveInteger(
            item.timeperiod_nid ?? item.tp_nid ?? item.id
          );
          if (nid == null) return null;
          const label = firstNonBlank(item.tp_timeperiod, item.timeperiod, String(nid));
          return { nid, label };
        })
        .filter((row): row is NonNullable<typeof row> => row != null);

      const mapped = uniqueOptions(
        rows.map((row) => ({
          value: String(row.nid),
          label: row.label,
        }))
      );
      setTimePeriodOptions(mapped);
      return mapped.map((option) => {
        const parsedNid = parsePositiveInteger(option.value);
        return {
          id: option.value,
          label: option.label,
          ...(parsedNid != null ? { nid: parsedNid } : {}),
        };
      });
    } catch {
      setTimePeriodOptions([]);
      return [];
    }
  }, [timePeriodsListUrl, workflowTimePeriodFrequency, workflowCurrTimeperiodNid]);

  const preloadedTimePeriodItems = useMemo<TimePeriodItem[]>(
    () =>
      timePeriodOptions.map((option) => {
        const parsedNid = parsePositiveInteger(option.value);
        return {
          id: option.value,
          label: option.label,
          ...(parsedNid != null ? { nid: parsedNid } : {}),
        };
      }),
    [timePeriodOptions]
  );
  const getPreloadedTimePeriodItems = useCallback(
    async () => preloadedTimePeriodItems,
    [preloadedTimePeriodItems]
  );

  const loadSources = useCallback(async () => {
    if (!dwId.trim()) {
      setSourceOptions([]);
      return;
    }
    const res = await fetchAllDwSources(dwId, locale);
    if (!res.ok) {
      setSourceOptions([]);
      return;
    }
    const mapped = uniqueOptions(
      res.rows.map((item) => {
        const row = item as Record<string, unknown>;
        const value = firstNonBlank(row.src_nid, row.ic_nid, row.src_gid, row.ic_gid);
        const label = firstNonBlank(
          row.src_name,
          row.ic_name,
          row.src_short_name,
          row.src_title,
          row.title,
          value
        );
        return { value, label };
      })
    );
    setSourceOptions(mapped);
  }, [dwId, locale]);

  useEffect(() => {
    void loadWorkflows();
  }, [loadWorkflows]);

  useEffect(() => {
    if (skipUrlWorkflowSyncRef.current) {
      if (urlWorkflowId === workflowId) {
        skipUrlWorkflowSyncRef.current = false;
      }
      return;
    }
    if (urlWorkflowId && urlWorkflowId !== workflowId) {
      setWorkflowId(urlWorkflowId);
    }
  }, [urlWorkflowId, workflowId]);

  useEffect(() => {
    if (!showWorkflowDropdown || !workflowId) return;
    try {
      sessionStorage.setItem(datasetListWorkflowStorageKey, workflowId);
    } catch {
      // ignore storage failures (private mode, quota)
    }
  }, [datasetListWorkflowStorageKey, showWorkflowDropdown, workflowId]);

  useEffect(() => {
    if (isDatasetDetailsPage) return;
    const reviewSuccess = String(searchParams.get(REVIEW_SUCCESS_QUERY_KEY) ?? "").trim();
    if (!reviewSuccess) return;
    if (reviewSuccess === REVIEW_SUCCESS_PUBLISHED) {
      toast.success(t("DATASET_PUBLISH_SUCCESS", "Dataset published successfully."));
    } else if (reviewSuccess === REVIEW_SUCCESS_APPROVED_AT_LEVEL) {
      toast.success(
        t(
          "DATASET_REVIEW_APPROVED_REDIRECT_SUCCESS",
          "Dataset approved at this level succesfully"
        )
      );
    } else {
      return;
    }

    const params = new URLSearchParams(searchParams.toString());
    params.delete(REVIEW_SUCCESS_QUERY_KEY);
    const nextQuery = params.toString();
    router.replace(nextQuery ? `${pathname}?${nextQuery}` : pathname);
  }, [isDatasetDetailsPage, pathname, router, searchParams, t]);

  useEffect(() => {
    if (!showWorkflowDropdown || workflowsLoading || workflows.length === 0) return;
    if (workflowId) return;

    let stored: string | null = null;
    try {
      stored = sessionStorage.getItem(datasetListWorkflowStorageKey);
    } catch {
      stored = null;
    }
    const storedTrimmed = (stored ?? "").trim();
    const storedValid =
      storedTrimmed !== "" &&
      workflows.some((w) => String(w.workflow_id) === storedTrimmed);
    const firstId = String(workflows[0]?.workflow_id ?? "");
    const nextId = storedValid ? storedTrimmed : firstId;
    if (!nextId) return;
    setWorkflowId(nextId);
    const currentWorkflowQuery = String(searchParams.get("workflow_id") ?? "").trim();
    if (currentWorkflowQuery === nextId) return;
    const params = new URLSearchParams(searchParams.toString());
    params.set("workflow_id", nextId);
    router.replace(`${pathname}?${params.toString()}`);
  }, [
    datasetListWorkflowStorageKey,
    pathname,
    router,
    searchParams,
    showWorkflowDropdown,
    workflowId,
    workflows,
    workflowsLoading,
  ]);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(workflowLevelCountStorageKey);
      if (!raw) {
        setWorkflowLevelCountById({});
        return;
      }
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      if (!parsed || typeof parsed !== "object") {
        setWorkflowLevelCountById({});
        return;
      }
      const normalized = Object.entries(parsed).reduce<Record<string, number>>((acc, [key, value]) => {
        const count = Number(value);
        if (!key.trim()) return acc;
        if (!Number.isFinite(count) || count < 0) return acc;
        acc[key] = count;
        return acc;
      }, {});
      setWorkflowLevelCountById(normalized);
    } catch {
      setWorkflowLevelCountById({});
    }
  }, [workflowLevelCountStorageKey]);

  useEffect(() => {
    if (isDatasetDetailsPage) return;
    if (loadDatasetsTimerRef.current != null) {
      clearTimeout(loadDatasetsTimerRef.current);
    }
    loadDatasetsTimerRef.current = setTimeout(() => {
      loadDatasetsTimerRef.current = null;
      void loadDatasets();
    }, 0);
    return () => {
      if (loadDatasetsTimerRef.current != null) {
        clearTimeout(loadDatasetsTimerRef.current);
        loadDatasetsTimerRef.current = null;
      }
    };
  }, [isDatasetDetailsPage, loadDatasets]);

  const hasSeedingDatasets = useMemo(
    () =>
      datasets.some(
        (d) => String(d.datapoint_readiness ?? "").toUpperCase() === "CREATED"
      ),
    [datasets]
  );

  const refreshDatasetReadiness = useCallback(async () => {
    if (!datasetListUrl || !datasetId || !isDatasetDetailsPage) return;
    try {
      const detailUrl = `${datasetListUrl}/${encodeURIComponent(datasetId)}`;
      const detailJson = (await getRequest(detailUrl, undefined, {
        suppressErrorMessage: true,
      })) as { success?: boolean; data?: DatasetListItem };
      if (detailJson.success && detailJson.data) {
        const readiness = String(detailJson.data.datapoint_readiness ?? "").trim();
        if (readiness) setDatapointReadiness(readiness);
      }
    } catch {
      // ignore refresh errors
    }
  }, [datasetId, datasetListUrl, isDatasetDetailsPage]);

  const isDatapointPopulationInProgress = useMemo(() => {
    const r = String(datapointReadiness ?? "").toUpperCase();
    return r === "CREATED" || r === "UPDATED";
  }, [datapointReadiness]);

  const shouldPollSeedingOnList = useMemo(
    () => !isDatasetDetailsPage && hasSeedingDatasets,
    [hasSeedingDatasets, isDatasetDetailsPage]
  );

  const shouldPollDetailImportReadiness = useMemo(
    () =>
      isDatasetDetailsPage &&
      String(datapointReadiness ?? "").toUpperCase() === "UPDATED",
    [datapointReadiness, isDatasetDetailsPage]
  );

  const shouldPollImportLogs = useMemo(() => hasRunningImports, [hasRunningImports]);

  useEffect(() => {
    if (!shouldPollSeedingOnList) return;
    const timer = setInterval(() => {
      void loadDatasets();
    }, 5000);
    return () => clearInterval(timer);
  }, [loadDatasets, shouldPollSeedingOnList]);

  useEffect(() => {
    if (!shouldPollDetailImportReadiness) return;
    const timer = setInterval(() => {
      void refreshDatasetReadiness();
    }, 5000);
    return () => clearInterval(timer);
  }, [refreshDatasetReadiness, shouldPollDetailImportReadiness]);

  useEffect(() => {
    if (!shouldPollImportLogs) return;
    const timer = setInterval(() => {
      setImportLogsPollToken((n) => n + 1);
    }, 5000);
    return () => clearInterval(timer);
  }, [shouldPollImportLogs]);

  useEffect(() => {
    if (!datasetEditId || !datasetDrawerOpen) return;
    const found = datasets.find((d) => String(d.dataset_id) === datasetEditId);
    if (found) {
      const readiness = String(found.datapoint_readiness ?? "").trim();
      if (readiness) setDatasetEditDatapointReadiness(readiness);
    }
  }, [datasetDrawerOpen, datasetEditId, datasets]);

  useEffect(() => {
    const prev = prevDatapointReadinessRef.current;
    const current = String(datapointReadiness ?? "").toUpperCase();
    if (prev === "UPDATED" && current === "COMPLETED") {
      toast.success(
        t("DATA_POINTS_IMPORT_SUCCESS", "Data points imported successfully.")
      );
      void fetchDataPoints();
      setActiveImportRequestId(null);
    } else if (prev === "UPDATED" && current === "FAILED") {
      toast.error(t("DATA_POINTS_IMPORT_FAILED", "Failed to import data points."));
    }
    prevDatapointReadinessRef.current = current;
  }, [datapointReadiness, fetchDataPoints, t]);

  useEffect(() => {
    if (!isDataEntry || isDatasetDetailsPage) return;
    const wfId = String(workflowId).trim();
    if (!wfId) return;
    void loadWorkflowLevelCount(wfId);
  }, [isDataEntry, isDatasetDetailsPage, loadWorkflowLevelCount, workflowId]);

  useEffect(() => {
    if (!isDatasetDetailsPage) return;
    const id = String(datasetId ?? "");
    const switched = prevDataPointsDatasetIdRef.current !== id;
    prevDataPointsDatasetIdRef.current = id;
    if (switched) {
      setDataPointsPage(1);
      setDataPointsReviewFilter("ALL");
      setDataPointSelectionCount(0);
      setSelectedReviewRows([]);
      setSelectedDataEntryRows([]);
      setDatasetStatus("");
      setDatasetStatusLoaded(false);
      setDatapointReadiness("");
      setActiveImportRequestId(null);
      setDatasetWorkflowId("");
      setDatasetWorkflowName("");
      setDatasetStages([]);
      setDpListSort({ columnId: null, direction: null });
      setDpColSearchIndicator("");
      setDpColSearchSubgroup("");
      setDpColSearchArea("");
      setDatasetDetailSourceNids([]);
      setDpSourceFilterNids([]);
      setValidationRulesMap({});
      void fetchDataPoints({ page: 1, page_size: dataPointsPageSize, reviewFilter: "ALL" });
      void fetchValidationRules();
      return;
    }
    if (isInitializingSourceFilterRef.current) {
      isInitializingSourceFilterRef.current = false;
      return;
    }
    void fetchDataPoints();
  }, [
    dataPointsPage,
    dataPointsPageSize,
    datasetId,
    fetchDataPoints,
    fetchValidationRules,
    isDatasetDetailsPage,
  ]);

  useEffect(() => {
    if (!isDatasetDetailsPage || !datasetId || !datasetListUrl) return;
    const found = datasets.find((d) => String(d.dataset_id) === datasetId);
    if (found) {
      setDatasetName(found.dataset_name?.trim() || String(found.dataset_id));
      setDatasetCommentCount(normalizeCommentCount(found.cmnt_cnt));
      const foundWorkflowId = String(found.workflow_id ?? "").trim();
      if (foundWorkflowId) setDatasetWorkflowId(foundWorkflowId);
      const foundWorkflowName = String(found.workflow_name ?? "").trim();
      if (foundWorkflowName) setDatasetWorkflowName(foundWorkflowName);
      const foundReadiness = String(found.datapoint_readiness ?? "").trim();
      if (foundReadiness) setDatapointReadiness(foundReadiness);
      return;
    }
    setDatasetName(datasetId);
    setDatasetCommentCount(0);
  }, [datasetId, datasetListUrl, datasets, isDatasetDetailsPage]);

  useEffect(() => {
    if (!isDatasetDetailsPage) {
      blockedDetailsRedirectedRef.current = false;
      datasetDetailsAccessCheckedRef.current = "";
      forbiddenDetailsRedirectHandledRef.current = "";
      return;
    }
    const detailsAccessKey = `${isDataEntry ? "entry" : isDataReview ? "review" : "other"}:${String(
      datasetId ?? ""
    ).trim()}`;
    if (datasetDetailsAccessCheckedRef.current === detailsAccessKey) return;
    const statusToken = getDatasetStatusToken(datasetStatus);
    if (!statusToken) return;
    datasetDetailsAccessCheckedRef.current = detailsAccessKey;
    const isOpenAllowed = isDataEntry
      ? true
      : isDataReview
        ? DATA_REVIEW_OPENABLE_STATUSES.has(statusToken)
        : false;
    if (isOpenAllowed) {
      blockedDetailsRedirectedRef.current = false;
      return;
    }
    if (blockedDetailsRedirectedRef.current) return;
    blockedDetailsRedirectedRef.current = true;
    toast.error(
      t(
        "DATASET_OPEN_NOT_ALLOWED",
        "This dataset cannot be opened in the current section for its current status."
      )
    );
    replaceToDatasetList();
  }, [datasetId, datasetStatus, isDataEntry, isDataReview, isDatasetDetailsPage, replaceToDatasetList, t]);

  useEffect(() => {
    if (!scopeConfigWorkflowId) {
      setDataEntryScope(DEFAULT_DATA_ENTRY_SCOPE);
      setDataEntryShowPreviousTime(false);
      setWorkflowTimePeriodFrequency("");
      setWorkflowCurrTimeperiodNid(null);
      setWorkflowAreaLevel(null);
      setIsDataEntryScopeResolved(false);
      setTimePeriodOptions([]);
      return;
    }
    setIsDataEntryScopeResolved(false);
    setTimePeriodOptions([]);
    void loadDataEntryScope(scopeConfigWorkflowId).finally(() => {
      setIsDataEntryScopeResolved(true);
    });
  }, [loadDataEntryScope, scopeConfigWorkflowId]);

  useEffect(() => {
    void loadSources();
  }, [loadSources]);

  useEffect(() => {
    if (!dwId) {
      setAreaLevelCatalog([]);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const json = await getRequest(getDWAPIURL(dwId, REFERENCE_PATH_AREA_LEVELS), undefined, {
          suppressErrorMessage: true,
        });
        if (cancelled) return;
        setAreaLevelCatalog(parseAreaLevelCatalogResponse(json));
      } catch {
        if (!cancelled) setAreaLevelCatalog([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [dwId]);

  useEffect(() => {
    if (!scopeConfigWorkflowId || !isDataEntryScopeResolved) return;
    void loadTimePeriods();
  }, [isDataEntryScopeResolved, loadTimePeriods, scopeConfigWorkflowId]);

  useEffect(() => {
    if (!datasetTimeperiodOpen) return;
    void loadTimePeriods();
  }, [datasetTimeperiodOpen, loadTimePeriods]);

  useEffect(() => {
    if (timePeriodOptions.length === 0) return;
    const allowed = new Set(timePeriodOptions.map((option) => option.value));
    setDatasetTimeperiodNids((prev) => {
      const next = prev.filter((nid) => allowed.has(nid));
      return next.length === prev.length ? prev : next;
    });
    setDatasetTimePeriodItems((prev) => {
      const next = prev.filter((item) => allowed.has(String(item.nid ?? item.id)));
      return next.length === prev.length ? prev : next;
    });
  }, [timePeriodOptions]);

  useEffect(() => {
    if (!isDatasetDetailsPage) {
      setDataPointSelectionCount(0);
      setSelectedReviewRows([]);
      setSelectedDataEntryRows([]);
    }
  }, [isDatasetDetailsPage]);

  const handleDeleteSelectedDataPoints = useCallback(async () => {
    if (selectedDataEntryRows.length === 0) {
      toast.error(t("TOOLBAR_SELECT_HINT", "Select a row first"));
      return;
    }

    if (!dataPointsUrl || !datasetId) return;
    const parsedDatasetId = parsePositiveInteger(datasetId);
    if (!parsedDatasetId) return;

    const deletedIds = selectedDataEntryRows
      .map((row) => parsePositiveInteger(row.data_point_id ?? row.dt_nid))
      .filter((id): id is number => id != null);

    if (deletedIds.length === 0) return;

    setDeleteDataPointsLoading(true);
    try {
      const payload = {
        dataset_id: parsedDatasetId,
        deleted: deletedIds.map((dataPointId) => ({ data_point_id: dataPointId })),
      };
      const json = (await patchRequest(dataPointsUrl, payload, undefined, undefined, {
        suppressErrorMessage: true,
      })) as DataPointsPatchResult;

      if (!json.success) {
        const msg =
          typeof json.err_message === "string"
            ? json.err_message
            : typeof json.message === "string" && json.message.trim()
              ? json.message
              : t("DATA_POINTS_DELETE_FAILED", "Failed to delete data points.");
        toast.error(msg);
        return;
      }

      setReviewSelectionResetToken((prev) => prev + 1);
      setSelectedDataEntryRows([]);
      setDataPointSelectionCount(0);
      await fetchDataPoints();
    } catch {
      toast.error(t("DATA_POINTS_DELETE_FAILED", "Failed to delete data points."));
    } finally {
      setDeleteDataPointsLoading(false);
    }
  }, [selectedDataEntryRows, t, dataPointsUrl, datasetId, fetchDataPoints]);

  const handleUndoDeletedDataPoint = useCallback(async (row: DataPointsRow) => {
    if (!dataPointsUrl || !datasetId) return;
    const parsedDatasetId = parsePositiveInteger(datasetId);
    if (!parsedDatasetId) return;

    const dpId = parsePositiveInteger(row.data_point_id ?? row.dt_nid);
    if (!dpId) return;

    try {
      const payload = { dataset_id: parsedDatasetId, restore: [{ data_point_id: dpId }] };
      const json = (await patchRequest(dataPointsUrl, payload, undefined, undefined, {
        suppressErrorMessage: true,
      })) as DataPointsPatchResult;

      if (!json.success) {
        const msg =
          typeof json.err_message === "string"
            ? json.err_message
            : typeof json.message === "string" && json.message.trim()
              ? json.message
              : t("DATA_POINTS_RESTORE_FAILED", "Failed to restore data point.");
        toast.error(msg);
        return;
      }

      await fetchDataPoints();
    } catch {
      toast.error(t("DATA_POINTS_RESTORE_FAILED", "Failed to restore data point."));
    }
  }, [dataPointsUrl, datasetId, fetchDataPoints, t]);

  const handleOpenDataset = useCallback(
    (dataset: DatasetListItem) => {
      if (String(dataset.datapoint_readiness ?? "").toUpperCase() === "CREATED") {
        toast.info(
          t("DATASET_BEING_PREPARED", "Dataset is being prepared...")
        );
        return;
      }
      if (!canOpenDataset(dataset)) {
        toast.error(
          t(
            "DATASET_OPEN_NOT_ALLOWED",
            "This dataset cannot be opened in the current section for its current status."
          )
        );
        return;
      }
      const id = String(dataset.dataset_id ?? "").trim();
      if (!id) return;
      const datasetWorkflowIdFromRow = String(dataset.workflow_id ?? "").trim();
      const nextWorkflowId = datasetWorkflowIdFromRow || String(workflowId).trim();
      const targetBase = `${datasetBasePath}/${encodeURIComponent(id)}`;
      const target = nextWorkflowId
        ? `${targetBase}?workflow_id=${encodeURIComponent(nextWorkflowId)}`
        : targetBase;
      router.push(target);
    },
    [canOpenDataset, datasetBasePath, router, t, workflowId]
  );

  const openEditDatasetDrawer = useCallback(
    (dataset: DatasetListItem) => {
      if (!workflowId) {
        toast.error(t("SELECT_WORKFLOW_FIRST"));
        return;
      }
      setDatasetDrawerMode("edit");
      setDatasetEditId(String(dataset.dataset_id));
      setDatasetEditStatus(String(dataset.dataset_status ?? ""));
      setDatasetEditDatapointReadiness(String(dataset.datapoint_readiness ?? ""));
      setDatasetDraftName(String(dataset.dataset_name ?? "").trim());
      setDatasetEditCommentCount(normalizeCommentCount(dataset.cmnt_cnt));
      setDatasetAreaNids(
        enforceScopeSelection(parseNidsFromUnknown(dataset.area_nids), dataEntryScope.area)
      );

      const nids = parsePositiveNids(parseNidsFromUnknown(dataset.ius_nids));
      setDatasetIusNids(nids);
      setDatasetIndicatorItems([]);

      setDatasetTimeperiodNids(
        enforceScopeSelection(
          parseNidsFromUnknown(dataset.timeperiod_nids),
          dataEntryScope.timePeriod
        )
      );
      setDatasetSourceNids(parseNidsFromUnknown(dataset.source_nids));
      setDatasetAreaItems([]);
      setDatasetTimePeriodItems([]);
      setDatasetHydrateLoading(true);
      setSidebarCollapsed?.(true);
      setDatasetDrawerOpen(true);
      datasetEditFormSnapshotRef.current = null;
      const commentFetchSeq = ++datasetEditCommentCountFetchSeqRef.current;
      const datasetIdForComments = String(dataset.dataset_id).trim();
      if (datasetIdForComments && dwId) {
        void (async () => {
          try {
            const commentsUrl = `${getDWAPIURL(dwId, REFERENCE_PATH_DATASET)}/${encodeURIComponent(
              datasetIdForComments
            )}${REFERENCE_PATH_COMMENTS}`;
            const commentsJson = (await getRequest(commentsUrl, undefined, {
              suppressErrorMessage: true,
            })) as DatasetCommentsCountResult;
            if (commentFetchSeq !== datasetEditCommentCountFetchSeqRef.current) return;
            const nextCount =
              commentsJson.success === true && Array.isArray(commentsJson.data)
                ? commentsJson.data.length
                : 0;
            setDatasetEditCommentCount(nextCount);
          } catch {
            if (commentFetchSeq !== datasetEditCommentCountFetchSeqRef.current) return;
            setDatasetEditCommentCount(0);
          }
        })();
      } else {
        setDatasetEditCommentCount(0);
      }

      const areaNidsForHydrate = enforceScopeSelection(
        parseNidsFromUnknown(dataset.area_nids),
        dataEntryScope.area
      );
      const timePeriodNidsForHydrate = enforceScopeSelection(
        parseNidsFromUnknown(dataset.timeperiod_nids),
        dataEntryScope.timePeriod
      );
      const seq = ++datasetEditHydrateSeqRef.current;
      void (async () => {
        try {
          const [nextAreas, nextTimePeriods, nextIndicators] = await Promise.all([
            hydrateAreaItemsForNids(dwId, areaNidsForHydrate),
            hydrateTimePeriodItemsForNids(dwId, timePeriodNidsForHydrate, preloadedTimePeriodItems),
            hydrateIusItemsForNids(dwId, nids),
          ]);
          if (seq !== datasetEditHydrateSeqRef.current) return;
          setDatasetAreaItems(nextAreas);
          setDatasetIndicatorItems(nextIndicators);
          setDatasetTimePeriodItems(nextTimePeriods);
          datasetEditFormSnapshotRef.current = {
            datasetDraftName: String(dataset.dataset_name ?? "").trim(),
            datasetAreaNids: [...areaNidsForHydrate],
            datasetAreaItems: nextAreas.map((a) => ({ ...a })),
            datasetIusNids: [...nids],
            datasetIndicatorItems: nextIndicators.map((i) => ({ ...i })),
            datasetTimeperiodNids: [...timePeriodNidsForHydrate],
            datasetTimePeriodItems: nextTimePeriods.map((tp) => ({ ...tp })),
            datasetSourceNids: [...parseNidsFromUnknown(dataset.source_nids)],
          };
        } finally {
          if (seq === datasetEditHydrateSeqRef.current) {
            setDatasetHydrateLoading(false);
          }
        }
      })();
    },
    [
      dataEntryScope.area,
      dataEntryScope.timePeriod,
      dwId,
      preloadedTimePeriodItems,
      setSidebarCollapsed,
      t,
      workflowId,
    ]
  );

  const handleSaveDataset = useCallback(async () => {
    if (isDatasetDrawerReadOnly) return;
    if (!datasetListUrl) return;
    if (!workflowId) {
      toast.error(t("SELECT_WORKFLOW_FIRST"));
      return;
    }
    const name = datasetDraftName.trim();
    if (!name) {
      toast.error(t("DATASET_NAME_REQUIRED"));
      return;
    }
    const areaNids = parsePositiveNids(datasetAreaNids);
    if (areaNids.length === 0) {
      toast.error(t("DATASET_AREA_REQUIRED", "Please select at least one area."));
      return;
    }
    if (datasetIusNids.length === 0) {
      toast.error(t("DATASET_INDICATOR_REQUIRED", "Please select at least one indicator."));
      return;
    }
    const tpNids = parsePositiveNids(datasetTimeperiodNids);
    if (tpNids.length === 0) {
      toast.error(t("DATASET_TIMEPERIOD_REQUIRED", "Please select at least one time period."));
      return;
    }
    const sourceNids = parsePositiveNids(datasetSourceNids);
    if (sourceNids.length === 0) {
      toast.error(t("DATASET_SOURCES_REQUIRED", "Please select at least one source."));
      return;
    }

    const payload: DatasetPatchPayload = {
      dataset_name: name,
      area_nids: areaNids,
      ius_nids: datasetIusNids,
      timeperiod_nids: tpNids,
      source_nids: sourceNids,
    };
    setDatasetSaveLoading(true);
    try {
      if (datasetDrawerMode === "create") {
        const createPayload: Record<string, unknown> = {
          ...payload,
          workflow_id: Number(workflowId),
        };
        const json = (await postRequest(
          datasetListUrl,
          createPayload,
          undefined,
          undefined,
          { suppressErrorMessage: true }
        )) as DatasetCreateResult;
        if (!json.success) {
          const msg =
            typeof json.err_message === "string"
              ? json.err_message
              : typeof json.message === "string" && json.message.trim()
                ? json.message
                : t("DATASET_CREATE_FAILED");
          toast.error(msg);
          return;
        }
        await loadDatasets();
        closeDatasetDrawer();
        toast.success(t("DATASET_CREATE_SUCCESS"));
        return;
      }

      if (!datasetEditId) return;
      const patchUrl = `${datasetListUrl}/${encodeURIComponent(datasetEditId)}`;
      const json = (await patchRequest(
        patchUrl,
        payload,
        undefined,
        undefined,
        { suppressErrorMessage: true }
      )) as DatasetPatchResult;
      if (!json.success) {
        const msg =
          typeof json.err_message === "string"
            ? json.err_message
            : typeof json.message === "string" && json.message.trim()
              ? json.message
              : t("DATASET_UPDATE_FAILED", "Failed to update dataset.");
        toast.error(msg);
        return;
      }
      await loadDatasets();
      closeDatasetDrawer();
      toast.success(t("DATASET_UPDATE_SUCCESS", "Dataset updated successfully."));
    } finally {
      setDatasetSaveLoading(false);
    }
  }, [
    closeDatasetDrawer,
    datasetAreaNids,
    datasetDraftName,
    datasetDrawerMode,
    datasetEditId,
    datasetIusNids,
    datasetListUrl,
    datasetSourceNids,
    datasetTimeperiodNids,
    isDatasetDrawerReadOnly,
    loadDatasets,
    t,
    workflowId,
  ]);

  const closeDatasetDeleteModal = useCallback(() => {
    if (datasetDeleteLoading) return;
    setDatasetDeleteConfirmOpen(false);
    setDatasetDeleteBlocked(false);
    setDatasetDeleteTargets([]);
    setDatasetAssociationCounts(null);
    setDatasetAssociationLoading(false);
  }, [datasetDeleteLoading]);

  const openDatasetDeleteBlockedModal = useCallback((target?: { id: string; name: string }) => {
    setDatasetDeleteBlocked(true);
    setDatasetDeleteTargets(target ? [target] : []);
    setDatasetAssociationCounts(null);
    setDatasetAssociationLoading(false);
    setDatasetDeleteConfirmOpen(true);
  }, []);

  const handleOpenDatasetDeleteModal = useCallback(
    async (datasetsToDeleteInput: DatasetListItem | DatasetListItem[]) => {
      if (!canDwDeleteDataEntryDataset) return;
      const datasetsToDelete = Array.isArray(datasetsToDeleteInput)
        ? datasetsToDeleteInput
        : [datasetsToDeleteInput];
      const targets = datasetsToDelete.map((dataset) => ({
        id: String(dataset.dataset_id),
        name: String(dataset.dataset_name ?? "").trim(),
      }));
      if (targets.length === 0) return;

      if (datasetsToDelete.some((dataset) => !canDeleteDataset(dataset))) {
        openDatasetDeleteBlockedModal(targets.length === 1 ? targets[0] : undefined);
        return;
      }
      if (!datasetListUrl) return;
      setDatasetAssociationLoading(true);
      setDatasetDeleteBlocked(false);
      setDatasetDeleteConfirmOpen(false);
      setDatasetDeleteTargets(targets);
      setDatasetAssociationCounts(null);

      const cumulativeCounts: DatasetAssociationCounts = {
        dataPointCount: 0,
        reviewStageCount: 0,
        reviewSliceCount: 0,
        actionLogCount: 0,
      };
      try {
        for (const target of targets) {
          const associationUrl = `${datasetListUrl}/${encodeURIComponent(
            target.id
          )}/association-count`;
          const json = (await getRequest(associationUrl, undefined, {
            suppressErrorMessage: true,
          })) as {
            success?: boolean;
            message?: string;
            err_message?: string;
            data?: {
              data_point_count?: unknown;
              review_stage_count?: unknown;
              review_slice_count?: unknown;
              action_log_count?: unknown;
            };
          };
          if (!json.success) {
            const msg =
              typeof json.err_message === "string"
                ? json.err_message
                : typeof json.message === "string" && json.message.trim()
                  ? json.message
                  : t(
                      "DATASET_ASSOCIATION_COUNT_FAILED",
                      "Failed to load dataset associations before delete."
                    );
            toast.error(msg);
            setDatasetDeleteTargets([]);
            return;
          }
          cumulativeCounts.dataPointCount += Number(json.data?.data_point_count ?? 0) || 0;
          cumulativeCounts.reviewStageCount += Number(json.data?.review_stage_count ?? 0) || 0;
          cumulativeCounts.reviewSliceCount += Number(json.data?.review_slice_count ?? 0) || 0;
          cumulativeCounts.actionLogCount += Number(json.data?.action_log_count ?? 0) || 0;
        }
        setDatasetAssociationCounts(cumulativeCounts);
        setDatasetDeleteConfirmOpen(true);
      } finally {
        setDatasetAssociationLoading(false);
      }
    },
    [
      canDeleteDataset,
      canDwDeleteDataEntryDataset,
      datasetListUrl,
      openDatasetDeleteBlockedModal,
      t,
    ]
  );

  const handleConfirmDeleteDataset = useCallback(async () => {
    if (datasetDeleteBlocked) return;
    if (!datasetListUrl || datasetDeleteTargets.length === 0) return;
    setDatasetDeleteLoading(true);
    try {
      let deletedCount = 0;
      const failedTargets: string[] = [];

      for (const target of datasetDeleteTargets) {
        const deleteUrl = `${datasetListUrl}/${encodeURIComponent(target.id)}`;
        const json = (await deleteRequest(deleteUrl, undefined, undefined, {
          suppressErrorMessage: true,
        })) as {
          success?: boolean;
          message?: string;
          err_message?: string;
        };
        if (!json.success) {
          failedTargets.push(target.name || target.id);
          continue;
        }
        deletedCount += 1;
      }

      if (deletedCount > 0) {
        await loadDatasets();
      }
      closeDatasetDeleteModal();

      if (failedTargets.length === 0) {
        toast.success(
          deletedCount > 1
            ? t("DATASET_DELETE_SUCCESS_MULTI", "{count} datasets deleted successfully.").replace(
                "{count}",
                String(deletedCount)
              )
            : t("DATASET_DELETE_SUCCESS", "Dataset deleted successfully.")
        );
        return;
      }

      if (deletedCount > 0) {
        toast.success(
          t("DATASET_DELETE_SUCCESS_MULTI", "{count} datasets deleted successfully.").replace(
            "{count}",
            String(deletedCount)
          )
        );
      }
      toast.error(
        t("DATASET_DELETE_PARTIAL_FAILED", "Failed to delete {count} selected datasets.").replace(
          "{count}",
          String(failedTargets.length)
        )
      );
    } finally {
      setDatasetDeleteLoading(false);
    }
  }, [closeDatasetDeleteModal, datasetDeleteBlocked, datasetDeleteTargets, datasetListUrl, loadDatasets, t]);

  const handleEditRow = useCallback(
    (rowKey: string, field: keyof DataPointEditValues, value: string) => {
      setEditedValues((prev) => {
        const next = new Map(prev);
        const existing = next.get(rowKey) ?? {};
        const merged: DataPointEditValues = { ...existing, [field]: value };
        const row = dataPointRowByKey.get(rowKey);

        if (row) {
          const originalDataValue = String(getDataPointValue(row) ?? "").trim();
          const originalFootnote = String(row.footnote ?? "").trim();
          const nextDataValue = String(merged.dataValue ?? getDataPointValue(row) ?? "").trim();
          const nextFootnote = String(merged.footnote ?? row.footnote ?? "").trim();

          if (nextDataValue === originalDataValue) {
            delete merged.dataValue;
          }
          if (nextFootnote === originalFootnote) {
            delete merged.footnote;
          }
        }

        if (Object.keys(merged).length === 0) {
          next.delete(rowKey);
        } else {
          next.set(rowKey, merged);
        }
        return next;
      });
      if (field === "dataValue") {
        setDataPointDataSaveErrorKeys((prev) => {
          if (!prev.has(rowKey)) return prev;
          const next = new Set(prev);
          next.delete(rowKey);
          return next;
        });
      }
    },
    [dataPointRowByKey]
  );

  const handleDataPointCommentClick = useCallback(
    (dataPointId: number, title: DataPointCommentTitle, isCommentLocked: boolean) => {
      setDpCommentDataPointId(dataPointId);
      setDpCommentDrawerTitle(title);
      setDpCommentLocked(isCommentLocked);
      setDpCommentDrawerOpen(true);
    },
    []
  );
  const handleDatasetCommentClick = useCallback(() => {
    if (!datasetId) return;
    const datasetTitle = `${t("DATASET", "Dataset")}: ${(datasetName || datasetId).trim()}`;
    setDpCommentDataPointId(null);
    setDpCommentDrawerTitle(({
      primary: datasetTitle || t("DATASET", "Dataset"),
      secondary: "",
    }));
    setDpCommentLocked(getDatasetStatusToken(datasetStatus) === "APPROVED");
    setDpCommentDrawerOpen(true);
  }, [datasetId, datasetName, datasetStatus, t]);
  const closeDpCommentDrawer = useCallback(() => {
    setDpCommentDrawerOpen(false);
    setDpCommentDataPointId(null);
    setDpCommentDrawerTitle(null);
    setDpCommentLocked(false);
  }, []);

  const handleDatasetDrawerCommentCountChange = useCallback((count: number) => {
    setDatasetEditCommentCount(normalizeCommentCount(count));
  }, []);

  const handleDpDrawerCommentCountChange = useCallback(
    (count: number) => {
      const nextCount = normalizeCommentCount(count);
      if (dpCommentDataPointId == null) {
        setDatasetCommentCount(nextCount);
        return;
      }
      setDataPointRows((prev) =>
        prev.map((row) => {
          const rowId = parsePositiveInteger(row.data_point_id ?? row.dt_nid);
          if (rowId !== dpCommentDataPointId) return row;
          return { ...row, cmnt_cnt: nextCount };
        })
      );
    },
    [dpCommentDataPointId]
  );

  const saveEditedDataPoints = useCallback(
    async ({
      showSuccessToast = false,
      showNoChangesToast = false,
      draftPartialValidation = false,
    }: {
      showSuccessToast?: boolean;
      showNoChangesToast?: boolean;
      draftPartialValidation?: boolean;
    } = {}): Promise<boolean> => {
      if (!dataPointsUrl || !datasetId) return false;

      const parsedDatasetId = parsePositiveInteger(datasetId);
      if (!parsedDatasetId) {
        toast.error(t("DATA_POINTS_SAVE_FAILED", "Failed to save data points."));
        return false;
      }

      const buildPatchItem = (row: DataPointsRow, edits?: DataPointEditValues): DataPointsPatchItem => {
        const dataPointId = parsePositiveInteger(row.data_point_id);
        const dataInput = String(edits?.dataValue ?? getDataPointValue(row) ?? "").trim();
        const footnoteText = firstNonBlank(edits?.footnote, row.footnote);
        return {
          ...(dataPointId ? { data_point_id: dataPointId } : {}),
          dt_value: dataInput,
          footnote: footnoteText,
        };
      };

      const invalidKeys: string[] = [];
      const validSaveRows: { rowKey: string; patchItem: DataPointsPatchItem }[] = [];

      for (const row of dataPointRows) {
        const rowKey = getDataPointRowKey(row);
        const edits = editedValues.get(rowKey);
        if (!edits) continue;

        const dataInput = String(edits?.dataValue ?? getDataPointValue(row) ?? "").trim();
        if (dataInput === "") {
          invalidKeys.push(rowKey);
          continue;
        }

        validSaveRows.push({ rowKey, patchItem: buildPatchItem(row, edits) });
      }

      const dataPoints = validSaveRows.map((r) => r.patchItem);
      const savedRowKeysOnSuccess = validSaveRows.map((r) => r.rowKey);

      if (!draftPartialValidation && invalidKeys.length > 0) {
        setDataPointDataSaveErrorKeys(new Set(invalidKeys));
        toast.error(
          t(
            "DATA_POINTS_SAVE_EMPTY_DATA",
            "Enter data for each edited row before continuing, or remove empty edits."
          )
        );
        return false;
      }

      if (draftPartialValidation) {
        setDataPointDataSaveErrorKeys(new Set(invalidKeys));
      } else {
        setDataPointDataSaveErrorKeys(new Set());
      }

      if (dataPoints.length === 0) {
        if (draftPartialValidation && invalidKeys.length > 0) {
          toast.error(
            t(
              "DATA_POINTS_SAVE_EMPTY_DATA",
              "Enter data for each edited row before continuing, or remove empty edits."
            )
          );
          return false;
        }
        if (showNoChangesToast) {
          toast.success(t("DATA_POINTS_SAVE_SUCCESS", "Draft saved successfully."));
        }
        return true;
      }

      setSaveDraftLoading(true);
      try {
        const payload: DataPointsPatchPayload = {
          dataset_id: parsedDatasetId,
          data_points: dataPoints,
        };
        const json = (await patchRequest(dataPointsUrl, payload, undefined, undefined, {
          suppressErrorMessage: true,
        })) as DataPointsPatchResult;

        if (!json.success) {
          const msg =
            typeof json.err_message === "string"
              ? json.err_message
              : typeof json.message === "string" && json.message.trim()
                ? json.message
                : t("DATA_POINTS_SAVE_FAILED", "Failed to save data points.");
          toast.error(msg);
          return false;
        }

        setEditedValues((prev) => {
          const next = new Map(prev);
          for (const k of savedRowKeysOnSuccess) {
            next.delete(k);
          }
          return next;
        });
        await fetchDataPoints();
        if (showSuccessToast) {
          if (draftPartialValidation && invalidKeys.length > 0) {
            toast.success(
              t(
                "DATA_POINTS_SAVE_PARTIAL_SUCCESS",
                "Draft saved for rows with data. Rows without data were skipped."
              )
            );
          } else {
            toast.success(t("DATA_POINTS_SAVE_SUCCESS", "Draft saved successfully."));
          }
        }
        return true;
      } finally {
        setSaveDraftLoading(false);
      }
    },
    [dataPointRows, dataPointsUrl, datasetId, editedValues, fetchDataPoints, t]
  );

  const handleSaveDataPointsDraft = useCallback(async () => {
    await saveEditedDataPoints({
      draftPartialValidation: true,
      showSuccessToast: true,
      showNoChangesToast: true,
    });
  }, [saveEditedDataPoints]);

  const handleSubmitForReview = useCallback(async (): Promise<boolean> => {
    if (!datasetListUrl || !datasetId) return false;
    const parsedDatasetId = parsePositiveInteger(datasetId);
    if (!parsedDatasetId) {
      toast.error(t("DATASET_ID_MISSING", "Dataset ID is missing."));
      return false;
    }
    const dataPointsSaved = await saveEditedDataPoints({
      showSuccessToast: false,
      showNoChangesToast: false,
    });
    if (!dataPointsSaved) return false;

    setSubmitForReviewLoading(true);
    try {
      const payload = {
        dataset_id: parsedDatasetId,
        status: "PENDING_REVIEW" as const,
      };
      const json = (await patchRequest(datasetListUrl, payload, undefined, undefined, {
        suppressErrorMessage: true,
      })) as DatasetPatchResult;

      if (!json.success) {
        const msg =
          typeof json.err_message === "string"
            ? json.err_message
            : typeof json.message === "string" && json.message.trim()
              ? json.message
              : t("DATASET_SUBMIT_FOR_REVIEW_FAILED", "Failed to submit dataset for review.");
        toast.error(msg);
        return false;
      }

      await fetchDataPoints();
      await loadDatasets();
      toast.success(t("DATASET_SUBMIT_FOR_REVIEW_SUCCESS", "Dataset submitted for review."));
      return true;
    } finally {
      setSubmitForReviewLoading(false);
    }
  }, [datasetId, datasetListUrl, fetchDataPoints, loadDatasets, saveEditedDataPoints, t]);

  const handlePublishDataset = useCallback(async (): Promise<boolean> => {
    if (!datasetListUrl || !datasetId) return false;
    const parsedDatasetId = parsePositiveInteger(datasetId);
    if (!parsedDatasetId) {
      toast.error(t("DATASET_ID_MISSING", "Dataset ID is missing."));
      return false;
    }
    const dataPointsSaved = await saveEditedDataPoints({
      showSuccessToast: false,
      showNoChangesToast: false,
    });
    if (!dataPointsSaved) return false;

    setSubmitForReviewLoading(true);
    try {
      const payload = {
        dataset_id: parsedDatasetId,
        status: "PENDING_REVIEW" as const,
      };
      const json = (await patchRequest(datasetListUrl, payload, undefined, undefined, {
        suppressErrorMessage: true,
      })) as DatasetPatchResult;

      if (!json.success) {
        const msg =
          typeof json.err_message === "string"
            ? json.err_message
            : typeof json.message === "string" && json.message.trim()
              ? json.message
              : t("DATASET_PUBLISH_FAILED", "Failed to publish dataset.");
        toast.error(msg);
        return false;
      }

      await fetchDataPoints();
      await loadDatasets();
      toast.success(t("DATASET_PUBLISH_SUCCESS", "Dataset published successfully."));
      return true;
    } finally {
      setSubmitForReviewLoading(false);
    }
  }, [datasetId, datasetListUrl, fetchDataPoints, loadDatasets, saveEditedDataPoints, t]);

  const handleSendBackDataset = useCallback(async (): Promise<boolean> => {
    if (!datasetListUrl || !datasetId) return false;
    const hasRejected = dataPointsTabCounts.rejected > 0;
    const allApproved =
      dataPointsTabCounts.approved > 0 &&
      dataPointsTabCounts.rejected === 0 &&
      dataPointsTabCounts.pending === 0;
    const nextReviewStatus: "REVISION" | "APPROVED" =
      allApproved && !hasRejected ? "APPROVED" : "REVISION";

    setSendBackLoading(true);
    try {
      const reviewUrl = `${datasetListUrl}/${encodeURIComponent(datasetId)}/review`;
      const payload: DatasetReviewPayload = { status: nextReviewStatus };
      const json = (await postRequest(reviewUrl, payload, undefined, undefined, {
        suppressErrorMessage: true,
      })) as DatasetReviewResult;

      if (!json.success) {
        const msg =
          typeof json.err_message === "string"
            ? json.err_message
            : typeof json.message === "string" && json.message.trim()
              ? json.message
              : t("DATA_REVIEW_SEND_BACK_FAILED", "Failed to send dataset back for revision.");
        toast.error(msg);
        return false;
      }

      setReviewSelectionResetToken((prev) => prev + 1);
      setSelectedReviewRows([]);
      setDataPointSelectionCount(0);
      if (nextReviewStatus !== "APPROVED") {
        toast.success(t("DATA_REVIEW_SEND_BACK_SUCCESS", "Dataset sent back for revision."));
      }
      return true;
    } finally {
      setSendBackLoading(false);
    }
  }, [dataPointsTabCounts.approved, dataPointsTabCounts.pending, dataPointsTabCounts.rejected, datasetId, datasetListUrl, t]);

  const openDatasetActionConfirm = useCallback(
    (action: "submit_for_review" | "publish_data" | "send_back") => {
      if (!datasetId) return;
      setDatasetActionType(action);
      setDatasetActionConfirmOpen(true);
    },
    [datasetId]
  );

  const closeDatasetActionConfirm = useCallback(() => {
    const actionLoading =
      datasetActionType === "submit_for_review" || datasetActionType === "publish_data"
        ? submitForReviewLoading
        : datasetActionType === "send_back"
          ? sendBackLoading
          : false;
    if (actionLoading) return;
    setDatasetActionConfirmOpen(false);
    setDatasetActionType(null);
  }, [datasetActionType, sendBackLoading, submitForReviewLoading]);

  const handleConfirmDatasetAction = useCallback(async () => {
    if (datasetActionType === "submit_for_review") {
      const success = await handleSubmitForReview();
      if (success) {
        closeDatasetActionConfirm();
        goToDatasetList();
      }
      return;
    }
    if (datasetActionType === "publish_data") {
      const success = await handlePublishDataset();
      if (success) {
        closeDatasetActionConfirm();
        goToDatasetList();
      }
      return;
    }
    if (datasetActionType === "send_back") {
      const success = await handleSendBackDataset();
      if (success) {
        closeDatasetActionConfirm();
        const hasRejected = dataPointsTabCounts.rejected > 0;
        const allApproved =
          dataPointsTabCounts.approved > 0 &&
          dataPointsTabCounts.rejected === 0 &&
          dataPointsTabCounts.pending === 0;
        const activeStage = datasetStages.find((stage) => stage.stage_status === "ACTIVE");
        const isLastStage = activeStage
          ? !datasetStages.some((stage) => stage.level_no > activeStage.level_no)
          : false;
        goToDatasetList(
          allApproved && !hasRejected
            ? isLastStage
              ? REVIEW_SUCCESS_PUBLISHED
              : REVIEW_SUCCESS_APPROVED_AT_LEVEL
            : undefined
        );
      }
    }
  }, [
    closeDatasetActionConfirm,
    dataPointsTabCounts.approved,
    dataPointsTabCounts.pending,
    dataPointsTabCounts.rejected,
    datasetStages,
    datasetActionType,
    goToDatasetList,
    handlePublishDataset,
    handleSendBackDataset,
    handleSubmitForReview,
  ]);

  const closeReviewConfirmModal = useCallback(() => {
    if (reviewLoading) return;
    setReviewConfirmOpen(false);
    setReviewComment("");
    setReviewCommentTouched(false);
  }, [reviewLoading]);

  const openReviewConfirmModal = useCallback(
    (action: "approve" | "reject") => {
      if (!datasetId) return;
      if (selectedReviewRows.length === 0) {
        toast.error(t("TOOLBAR_SELECT_HINT", "Select a row first"));
        return;
      }
      setReviewActionType(action);
      setReviewComment("");
      setReviewCommentTouched(false);
      setReviewConfirmOpen(true);
    },
    [datasetId, selectedReviewRows.length, t]
  );

  const handleSubmitReviewDecision = useCallback(async () => {
    if (!datasetListUrl || !datasetId) return;

    const decisionRows = selectedReviewRows
      .map((row) => ({ row, dataPointId: getDataPointIdForReview(row) }))
      .filter((item): item is { row: DataPointsRow; dataPointId: number } => item.dataPointId != null);

    if (decisionRows.length === 0) {
      toast.error(t("DATA_REVIEW_INVALID_SELECTION", "Selected rows are missing data point id."));
      return;
    }

    const commentText = reviewComment.trim();
    if (reviewActionType === "reject" && !commentText) {
      setReviewCommentTouched(true);
      toast.error(
        t("DATA_REVIEW_REJECT_COMMENT_REQUIRED", "Comment is required to reject selected rows.")
      );
      return;
    }
    const payload: DatasetReviewPayload =
      reviewActionType === "approve"
        ? {
            approved: decisionRows.map(({ dataPointId }) => ({
              data_point_id: dataPointId,
              ...(commentText ? { comment: commentText } : {}),
            })),
            rejected: [],
          }
        : {
            approved: [],
            rejected: decisionRows.map(({ dataPointId }) => ({
              data_point_id: dataPointId,
              ...(commentText ? { comment: commentText } : {}),
            })),
          };

    setReviewLoading(true);
    try {
      const reviewUrl = `${datasetListUrl}/${encodeURIComponent(datasetId)}/review`;
      const json = (await postRequest(reviewUrl, payload, undefined, undefined, {
        suppressErrorMessage: true,
      })) as DatasetReviewResult;

      if (!json.success) {
        const msg =
          typeof json.err_message === "string"
            ? json.err_message
            : typeof json.message === "string" && json.message.trim()
              ? json.message
              : t("DATA_REVIEW_ACTION_FAILED", "Failed to submit review decision.");
        toast.error(msg);
        return;
      }

      closeReviewConfirmModal();
      setReviewSelectionResetToken((prev) => prev + 1);
      setSelectedReviewRows([]);
      setDataPointSelectionCount(0);
      await fetchDataPoints();
      toast.success(
        reviewActionType === "approve"
          ? t("DATA_REVIEW_APPROVE_SUCCESS", "Selected rows approved successfully.")
          : t("DATA_REVIEW_REJECT_SUCCESS", "Selected rows rejected successfully.")
      );
    } finally {
      setReviewLoading(false);
    }
  }, [
    closeReviewConfirmModal,
    datasetId,
    datasetListUrl,
    fetchDataPoints,
    reviewActionType,
    reviewComment,
    reviewCommentTouched,
    selectedReviewRows,
    t,
  ]);
  const isRejectCommentMissing = reviewActionType === "reject" && !reviewComment.trim();
  const isSendBackDisabledByPendingCount = dataPointsTabCounts.pending > 0;
  const isDataEntryDatasetReadOnly = useMemo(
    () =>
      isDataEntry && DATA_ENTRY_READ_ONLY_DATASET_STATUSES.has(getDatasetStatusToken(datasetStatus)),
    [datasetStatus, isDataEntry]
  );
  const datasetStatusLabel = useMemo(
    () => getDatasetStatusLabel(datasetStatus, t),
    [datasetStatus, t]
  );

  const toolbarExtra = useMemo<ReactNode>(() => {
    if (isDatasetDetailsPage) {
      return (
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <nav className="flex min-w-0 items-center gap-1 text-xs text-text-muted" aria-label="Breadcrumb">
            {workflowName ? (
              <>
                <span className="truncate">{workflowName}</span>
              </>
            ) : null}
            <span className="text-border">|</span>
            <span className="truncate font-semibold text-text">{datasetName || datasetId}</span>
          </nav>
          <StatusChip
            status={datasetStatus}
            label={datasetStatusLabel || "\u2014"}
            className="ml-1"
          />
          <button
            type="button"
            className={`${TV_GRID_CONFIGURE_BTN} !h-8 !w-8 !min-w-8 relative overflow-visible`}
            disabled={!datasetId}
            onClick={handleDatasetCommentClick}
            title={t("DATASET_COMMENTS", "Dataset Comments")}
            aria-label={t("DATASET_COMMENTS", "Dataset Comments")}
          >
            <span className="material-icons !text-sm" aria-hidden="true">
              chat_bubble_outline
            </span>
            {datasetCommentCount > 0 && (
              
              <span
              className="absolute -right-[0.60rem] -top-1 inline-flex min-w-[16px] items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold leading-4 text-white"
              aria-hidden="true"
            >
              {datasetCommentCount}
            </span>)}
          </button>
          <div className="flex-1" />
          <div className="flex shrink-0 items-center gap-2">
            {isDataEntry && datasetStatusLoaded && !isDataEntryDatasetReadOnly ? (
              <SecondaryButton
                type="button"
                icon="upload"
                disabled={
                  !datasetId ||
                  !canDwCreateDataEntryDataset ||
                  isDatapointPopulationInProgress
                }
                onClick={() => {
                  if (!canDwCreateDataEntryDataset) return;
                  setDataPointsImportOpen(true);
                }}
                title={t("IMPORT", "Import")}
              >
                {t("IMPORT", "Import")}
              </SecondaryButton>
            ) : null}
            <SecondaryButton
              type="button"
              icon="download"
              disabled={!datasetId || dataPointsExportLoading || dataPointsLoading}
              onClick={() => void handleExportDataPoints()}
              title={t("TOOLBAR_DOWNLOAD_EXCEL", "Download Excel")}
            >
              {t("EXPORT", "Export")}
            </SecondaryButton>
          </div>
        </div>
      );
    }

    return (
      <div className="flex min-w-0 flex-1 items-center gap-2">
        {showWorkflowDropdown ? (
          <SelectField
            className="min-w-[220px] max-w-[340px]"
            value={workflowId}
            disabled={workflowsLoading || Boolean(workflowsError)}
            options={workflowOptions}
            searchEnabled={false}
            onChange={(e) => {
              const nextWorkflowId = e.target.value;
              if (!nextWorkflowId) return;
              if (nextWorkflowId === workflowId) {
                if (nextWorkflowId) void loadDatasets();
                return;
              }
              skipUrlWorkflowSyncRef.current = true;
              setWorkflowId(nextWorkflowId);
              setDatasets([]);
              setDatasetsError(null);
              setSelectedDatasetCount(0);
              setSelectedDatasetForDelete(null);
              setSelectedDatasetsForDelete([]);
              setDatasetSearch("");
              setDatasetListSort({ columnId: null, direction: null });
              setDatasetPage(1);
              const params = new URLSearchParams(searchParams.toString());
              params.set("workflow_id", nextWorkflowId);
              router.replace(`${pathname}?${params.toString()}`);
            }}
            aria-busy={workflowsLoading}
          />
        ) : null}
        {showWorkflowDropdown ? (
          <>
            <Mi name="chevron_right" className="!text-sm text-text-muted" />
            <span className="text-xs font-medium text-text-muted whitespace-nowrap">{dataSetsLabel}</span>
          </>
        ) : null}
        {showWorkflowDropdown && workflowsError ? (
          <span className="text-xs text-error">{workflowsError}</span>
        ) : null}
        {showWorkflowDropdown ? <div className="mx-2 h-5 w-px shrink-0 bg-border" /> : null}
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <div className="flex flex-wrap items-center gap-1">
            {isDataEntry ? (
              <>
                {canDwCreateDataEntryDataset ? (
                  <PrimaryButton
                    type="button"
                    icon="add"
                    disabled={!workflowId}
                    onClick={openCreateDatasetDrawer}
                    title={!workflowId ? t("SELECT_WORKFLOW_FIRST") : undefined}
                  >
                    {t("ADD", "Add")}
                  </PrimaryButton>
                ) : null}
                {canDwDeleteDataEntryDataset ? (
                  selectedDatasetCount > 0 ? (
                    <PrimaryButton
                      type="button"
                      variant="destructive"
                      icon="delete"
                      onClick={() => {
                        if (selectedDatasetCount > 1) {
                          const hasBlockedStatus = selectedDatasetsForDelete.some(
                            (dataset) => !canDeleteDataset(dataset)
                          );
                          if (hasBlockedStatus) {
                            openDatasetDeleteBlockedModal();
                            return;
                          }
                          void handleOpenDatasetDeleteModal(selectedDatasetsForDelete);
                          return;
                        }
                        if (!selectedDatasetForDelete) return;
                        void handleOpenDatasetDeleteModal(selectedDatasetForDelete);
                      }}
                      title={t("TOOLBAR_DELETE_SELECTED", "Delete selected")}
                    >
                      {t("DELETE", "Delete")}
                    </PrimaryButton>
                  ) : (
                    <SecondaryButton
                      type="button"
                      icon="delete"
                      disabled
                      title={t("TOOLBAR_SELECT_HINT", "Select a row first")}
                    >
                      {t("DELETE", "Delete")}
                    </SecondaryButton>
                  )
                ) : null}
              </>
            ) : null}
          </div>
          {isDataReview ? <div className="min-w-0 flex-1" /> : null}
        </div>
      </div>
    );
  }, [
    dataPointsExportLoading,
    dataPointsLoading,
    datasetId,
    datasetName,
    datasetStatus,
    datasetStatusLabel,
    datasetStatusLoaded,
    handleOpenDatasetDeleteModal,
    handleDatasetCommentClick,
    handleExportDataPoints,
    canDeleteDataset,
    canDwCreateDataEntryDataset,
    canDwDeleteDataEntryDataset,
    isDataEntry,
    isDataEntryDatasetReadOnly,
    isDataReview,
    isDatasetDetailsPage,
    openCreateDatasetDrawer,
    dataSetsLabel,
    selectedDatasetCount,
    selectedDatasetsForDelete,
    selectedDatasetForDelete,
    selectedWorkflow,
    showWorkflowDropdown,
    t,
    workflowId,
    workflowName,
    workflowOptions,
    loadDatasets,
    workflowsError,
    workflowsLoading,
    router,
    pathname,
    searchParams,
    isDataEntryOrReviewDatasetRoute,
    openDatasetDeleteBlockedModal,
  ]);

  useEffect(() => {
    if (!setToolbarExtra) return;
    setToolbarExtra(toolbarExtra);
    return () => {
      setToolbarExtra(null);
    };
  }, [setToolbarExtra, toolbarExtra]);

  const removeChip = useCallback((setter: React.Dispatch<React.SetStateAction<string[]>>, value: string) => {
    setter((prev) => prev.filter((v) => v !== value));
  }, []);

  const getOptionLabel = useCallback((options: MultiSelectOption[], value: string) => {
    return options.find((o) => o.value === value)?.label ?? value;
  }, []);

  const singleDatasetTimePeriodLabel = useMemo(() => {
    if (datasetTimePeriodNidsForDataPoints.length !== 1) return "";
    const timePeriodNid = datasetTimePeriodNidsForDataPoints[0];
    const parsedTimePeriodNid = parsePositiveInteger(timePeriodNid);
    const optionLabel = timePeriodOptions.find((option) => {
      if (option.value === timePeriodNid) return true;
      const parsedOptionValue = parsePositiveInteger(option.value);
      return (
        parsedTimePeriodNid != null &&
        parsedOptionValue != null &&
        parsedOptionValue === parsedTimePeriodNid
      );
    })?.label;
    const rowLabel = dataPointRows
      .map((row) =>
        String(firstNonBlank(row.tp_nid, row.timeperiod_nid, row.timeperiod_id, row.tp_gid)).trim() ===
          timePeriodNid
          ? firstNonBlank(row.tp_timeperiod, row.timeperiod)
          : ""
      )
      .find((label) => Boolean(label));
    return firstNonBlank(optionLabel, rowLabel, timePeriodNid);
  }, [dataPointRows, datasetTimePeriodNidsForDataPoints, timePeriodOptions]);

  const previousTimePeriodNid = useMemo(
    () => parsePositiveInteger(dataPointsMeta?.prev_timeperiod_nid),
    [dataPointsMeta?.prev_timeperiod_nid]
  );

  const previousTimePeriodOptionLabel = useMemo(() => {
    if (!previousTimePeriodNid) return "";
    return (
      timePeriodOptions.find((option) => {
        const parsedOptionValue = parsePositiveInteger(option.value);
        return parsedOptionValue != null && parsedOptionValue === previousTimePeriodNid;
      })?.label ?? ""
    );
  }, [previousTimePeriodNid, timePeriodOptions]);

  const shouldShowPreviousTimeValueColumn = useMemo(
    () =>
      // datasetTimePeriodNidsForDataPoints.length === 1 &&
      // dataEntryScope.timePeriod === "SINGLE" &&
      dataEntryShowPreviousTime &&
      previousTimePeriodNid != null,
    [
      // dataEntryScope.timePeriod,
      dataEntryShowPreviousTime,
      // datasetTimePeriodNidsForDataPoints.length,
      previousTimePeriodNid,
    ]
  );

  useEffect(() => {
    if (!shouldShowPreviousTimeValueColumn || !previousTimePeriodNid) {
      setResolvedPrevTimePeriodLabel("");
      return;
    }
    if (previousTimePeriodOptionLabel) {
      setResolvedPrevTimePeriodLabel(previousTimePeriodOptionLabel);
      return;
    }
    if (!timePeriodsListUrl) {
      setResolvedPrevTimePeriodLabel("");
      return;
    }

    let cancelled = false;
    void (async () => {
      try {
        const url = `${timePeriodsListUrl}/${encodeURIComponent(String(previousTimePeriodNid))}`;
        const json = (await getRequest(url, undefined, {
          suppressErrorMessage: true,
        })) as { success?: boolean; data?: Record<string, unknown> };
        if (cancelled) return;
        if (json.success !== true || !json.data || Array.isArray(json.data)) {
          setResolvedPrevTimePeriodLabel("");
          return;
        }
        const label = firstNonBlank(
          json.data.tp_timeperiod,
          json.data.timeperiod,
          json.data.timeperiod_name,
          json.data.label
        );
        setResolvedPrevTimePeriodLabel(label);
      } catch {
        if (!cancelled) setResolvedPrevTimePeriodLabel("");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    previousTimePeriodNid,
    previousTimePeriodOptionLabel,
    shouldShowPreviousTimeValueColumn,
    timePeriodsListUrl,
  ]);

  const previousDataPointTimePeriodLabel = useMemo(() => {
    if (!shouldShowPreviousTimeValueColumn) return "";
    return firstNonBlank(
      previousTimePeriodOptionLabel,
      resolvedPrevTimePeriodLabel,
      previousTimePeriodNid
    );
  }, [
    previousTimePeriodNid,
    previousTimePeriodOptionLabel,
    resolvedPrevTimePeriodLabel,
    shouldShowPreviousTimeValueColumn,
  ]);

  const splitVisibleSelections = useCallback((values: string[], maxVisible: number) => {
    const visible = values.slice(0, maxVisible);
    const hiddenCount = Math.max(0, values.length - visible.length);
    return { visible, hiddenCount };
  }, []);

  const hasReviewStatusTabs =
    isDataReview || (isDataEntry && dataEntryDatasetActionType === "submit_for_review");
  const datasetDetailsActionButtons = (
    <>
      {isDataReview && (!datasetStatusLoaded || getDatasetStatusToken(datasetStatus) === "PENDING_REVIEW") ? (
        <>
          <PrimaryButton
            type="button"
            variant="approve"
            icon="check_circle"
            disabled={dataPointSelectionCount === 0 || reviewLoading || dataPointsLoading}
            onClick={() => openReviewConfirmModal("approve")}
          >
            {t("APPROVE", "Approve")}
          </PrimaryButton>
          <PrimaryButton
            type="button"
            variant="reject"
            icon="cancel"
            disabled={dataPointSelectionCount === 0 || reviewLoading || dataPointsLoading}
            onClick={() => openReviewConfirmModal("reject")}
          >
            {t("REJECT", "Reject")}
          </PrimaryButton>
          <span
            className="inline-flex"
            title={
              isSendBackDisabledByPendingCount
                ? t(
                    "SEND_BACK_DISABLED_PENDING_TOOLTIP",
                    "Please Approve/Reject all the data-points"
                  )
                : undefined
            }
          >
            <PrimaryButton
              type="button"
              icon="check_circle"
              disabled={
                sendBackLoading ||
                reviewLoading ||
                dataPointsLoading ||
                isSendBackDisabledByPendingCount
              }
              onClick={() => openDatasetActionConfirm("send_back")}
            >
              {sendBackLoading ? t("SENDING_BACK", "Sending back...") : t("SUBMIT", "Submit")}
            </PrimaryButton>
          </span>
        </>
      ) : null}
      {isDataEntry && datasetStatusLoaded ? (
        <>
          {!isDataEntryDatasetReadOnly ? (
            <>
              <SecondaryButton
                type="button"
                icon="delete"
                disabled={dataPointSelectionCount === 0 || saveDraftLoading || dataPointsLoading || deleteDataPointsLoading}
                onClick={() => void handleDeleteSelectedDataPoints()}
                title={
                  dataPointSelectionCount === 0
                    ? t("TOOLBAR_SELECT_HINT", "Select a row first")
                    : t("DELETE", "Delete")
                }
              >
                {deleteDataPointsLoading ? t("DELETING", "Deleting...") : t("DELETE", "Delete")}
              </SecondaryButton>
              <SecondaryButton
                type="button"
                icon="save"
                disabled={saveDraftLoading || dataPointsLoading}
                onClick={() => void handleSaveDataPointsDraft()}
              >
                {saveDraftLoading ? t("SAVING", "Saving...") : t("SAVE_AS_DRAFT", "Save as draft")}
              </SecondaryButton>
              <PrimaryButton
                type="button"
                icon="task_alt"
                disabled={submitForReviewLoading || saveDraftLoading || dataPointsLoading}
                onClick={() => {
                  openDatasetActionConfirm(dataEntryDatasetActionType);
                }}
              >
                {submitForReviewLoading
                  ? t("SUBMITTING", "Submitting...")
                  : dataEntryDatasetActionType === "submit_for_review"
                    ? t("SUBMIT_FOR_REVIEW", "Submit for review")
                    : t("SUBMIT", "Submit")}
              </PrimaryButton>
            </>
          ) : null}
        </>
      ) : null}
    </>
  );

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-surface-muted">
      {!isDatasetDetailsPage ? (
        <DatasetListTable
          t={t}
          workflowSelected={Boolean(workflowId)}
          enableColumnVisibility
          reviewEnabled={isDataReview || datasetSupportsReviewFlow}
          isDataReview={isDataReview}
          showStatusFilter={true}
          datasets={datasets}
          datasetsLoading={datasetsLoading}
          datasetsError={datasetsError}
          statusFilter={datasetStatusFilter}
          onStatusFilterChange={setDatasetStatusFilter}
          onSelectionChange={({ count, selectedDataset, selectedDatasets }) => {
            setSelectedDatasetCount(count);
            setSelectedDatasetForDelete(selectedDataset);
            setSelectedDatasetsForDelete(selectedDatasets);
          }}
          onOpenDataset={handleOpenDataset}
          onEditDataset={openEditDatasetDrawer}
          editDrawerOpen={datasetDrawerOpen && datasetDrawerMode === "edit"}
          editDrawerDatasetId={datasetDrawerMode === "edit" ? datasetEditId : null}
          canOpenDataset={canOpenDataset}
          totalCount={datasetTotalCount}
          totalPages={datasetTotalPages}
          page={datasetPage}
          pageSize={datasetPageSize}
          onPageChange={setDatasetPage}
          onPageSizeChange={setDatasetPageSize}
          search={datasetSearch}
          onSearchChange={setDatasetSearch}
          listSort={datasetListSort}
          onSortChange={setDatasetListSort}
          scopeArea={dataEntryScope.area}
          scopeTimePeriod={dataEntryScope.timePeriod}
          areaNameMap={datasetInfoAreaMap}
          timePeriodNameMap={datasetInfoTimePeriodMap}
        />
      ) : (
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          {isDataEntry &&
          isDatasetDetailsPage &&
          String(datapointReadiness ?? "").toUpperCase() === "UPDATED" ? (
            <div className="flex shrink-0 items-center gap-2 border-b border-border bg-surface-muted px-4 py-2 text-xs text-text">
              <span
                className="material-icons !text-sm animate-spin text-warning"
                aria-hidden="true"
              >
                sync
              </span>
              <span className="min-w-0 flex-1">
                {t(
                  "DATASET_IMPORT_IN_PROGRESS",
                  "Import process is being carried out"
                )}
                <span className="ml-1 text-text-muted">
                  {t(
                    "DATASET_IMPORT_IN_PROGRESS_HINT",
                    "Data points will refresh when import completes."
                  )}
                </span>
              </span>
            </div>
          ) : null}
          {hasReviewStatusTabs ? (
            <div className="flex h-[44px] shrink-0 items-center gap-3 border-b border-border bg-surface overflow-hidden">
              <div className="min-w-0 flex-1 overflow-hidden">
                <MainTabsBar<DataPointsReviewFilter>
                  tabs={[
                    {
                      value: "ALL",
                      label: `${t("ALL", "All")} (${dataPointsTabCounts.all})`,
                      icon: "list",
                      tabClassName: "whitespace-nowrap",
                    },
                    {
                      value: "APPROVED",
                      label: `${t("APPROVED", "Approved")} (${dataPointsTabCounts.approved})`,
                      icon: "check_circle",
                      tabClassName: "whitespace-nowrap",
                    },
                    {
                      value: "REJECTED",
                      label: `${t("REJECTED", "Rejected")} (${dataPointsTabCounts.rejected})`,
                      icon: "cancel",
                      tabClassName: "whitespace-nowrap",
                    },
                    {
                      value: "PENDING_REVIEW",
                      label: `${t("PENDING", "Pending")} (${dataPointsTabCounts.pending})`,
                      icon: "pending",
                      tabClassName: "whitespace-nowrap",
                    },
                  ]}
                  activeValue={dataPointsReviewFilter}
                  onSelect={(value) => {
                    setDataPointsReviewFilter(value);
                    setDataPointsPage(1);
                  }}
                  tablistAccessibility={{ ariaLabel: t("STATUS", "Status") }}
                  removeBorder={true}
                />
              </div>
              <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 px-4">
                {datasetDetailsActionButtons}
              </div>
            </div>
          ) : (
            <div className="flex shrink-0 items-center justify-end gap-2 border-b border-border bg-surface px-4 py-1.5">
              {datasetDetailsActionButtons}
            </div>
          )}
          <DatasetDataPointsTable
            t={t}
            rows={dataPointRows}
            loading={dataPointsLoading}
            error={dataPointsError}
            pageType={section}
            datasetId={datasetId}
            dataPointsPage={dataPointsPage}
            timePeriodOptions={timePeriodOptions}
            sourceOptions={sourceOptions}
            editedValues={editedValues}
            dataFieldSaveErrorKeys={dataPointDataSaveErrorKeys}
            onEditRow={handleEditRow}
            onSelectionCountChange={setDataPointSelectionCount}
            onSelectionRowsChange={
              isDataReview ? setSelectedReviewRows : isDataEntry ? setSelectedDataEntryRows : undefined
            }
            onCommentClick={handleDataPointCommentClick}
            commentDrawerOpen={dpCommentDrawerOpen && dpCommentDataPointId != null}
            activeCommentDataPointId={dpCommentDataPointId}
            selectionResetToken={reviewSelectionResetToken}
            hideTimePeriodColumn={datasetTimePeriodNidsForDataPoints.length === 1}
            selectedTimePeriodLabel={singleDatasetTimePeriodLabel}
            showPreviousDataColumn={shouldShowPreviousTimeValueColumn}
            previousTimePeriodLabel={previousDataPointTimePeriodLabel}
            hideStatusColumn={isDataEntry && dataEntryDatasetActionType === "publish_data"}
            colSearchIndicator={dpColSearchIndicator}
            colSearchSubgroup={dpColSearchSubgroup}
            colSearchArea={dpColSearchArea}
            onColSearchIndicatorChange={setDpColSearchIndicator}
            onColSearchSubgroupChange={setDpColSearchSubgroup}
            onColSearchAreaChange={setDpColSearchArea}
            listSort={dpListSort}
            onSortChange={setDpListSort}
            onPageReset={() => setDataPointsPage(1)}
            readOnly={isDataEntryDatasetReadOnly}
            onUndoDeleteRow={isDataEntry ? handleUndoDeletedDataPoint : undefined}
            validationRulesMap={validationRulesMap}
            datasetSourceOptions={datasetSourceFilterOptions}
            selectedSourceNids={dpSourceFilterNids}
            onSourceNidsChange={(nids) => {
              setDpSourceFilterNids(nids);
              setDataPointsPage(1);
            }}
            enableColumnVisibility
          />
          {renderTablePaginationFooter({
            page: dataPointsPage,
            displayPage: dataPointsPage,
            totalPages: dataPointsTotalPages,
            totalCount: dataPointsTotalCount,
            pageSize: dataPointsPageSize,
            onPageChange: setDataPointsPage,
            onPageSizeChange: setDataPointsPageSize,
            countNoun: t("DATA_POINTS"),
            countSpanId: "footer-count-dp-dataset",
            labels: { t },
            renderCount: (tc) => (
              <span id="footer-count-dp-dataset">
                {`${t("FOOTER_OF_TOTAL_WORKFLOWS").split("{total}")[0]}${tc} ${t("DATA_POINTS")}`}
              </span>
            ),
          })}
        </div>
      )}

      <Drawer
        open={datasetDrawerOpen}
        onClose={closeDatasetDrawer}
        title={datasetDrawerTitle}
        width="38%"
        bodyClassName="flex flex-1 flex-col overflow-hidden p-0"
        closeOnOverlayClick={datasetDrawerMode !== "edit"}
        allowBackgroundInteraction={datasetDrawerOpen && datasetDrawerMode === "edit"}
      >
        <div className="flex flex-1 flex-col overflow-hidden">
          <MainTabsBar<"dataset" | "comment" | "import-logs">
            className="drawer-tabs shrink-0 px-4 pt-1"
            tabs={[
              {
                value: "dataset",
                icon: "table_chart",
                label: t("DATASET", "Dataset"),
                tabClassName: "gap-1.5",
              },
              {
                value: "comment",
                icon: "chat_bubble_outline",
                label: `${t("COMMENT", "Comment")} ${datasetEditCommentCount > 0 ? `(${datasetEditCommentCount})` : ""}`,
                tabClassName: "gap-1.5",
              },
              ...(isDataEntry && datasetDrawerMode === "edit" && datasetEditId
                ? [
                    {
                      value: "import-logs" as const,
                      icon: "history",
                      label:
                        String(datasetEditDatapointReadiness ?? "").toUpperCase() ===
                          "UPDATED" || hasRunningImports
                          ? `${t("IMPORT_LOGS", "Import logs")} ⟳`
                          : t("IMPORT_LOGS", "Import logs"),
                      tabClassName: "gap-1.5",
                    },
                  ]
                : []),
            ]}
            activeValue={drawerTab}
            onSelect={(value) => setDrawerTab(value)}
            tablistAccessibility={{
              ariaLabel: t("DATASET_DRAWER_TABS_LABEL", "Dataset editor tabs"),
            }}
          />

          {drawerTab === "dataset" ? (
            datasetHydrateLoading ? (
              <div className="flex flex-1 items-center justify-center px-5 py-6">
                <Loader loadingLabel={t("LOADING")} />
              </div>
            ) : (
            <div className="flex flex-1 flex-col overflow-y-auto px-5 pt-4 pb-3">
              <div className="flex flex-col gap-4">
                <label className="flex flex-col gap-1.5">
                  <span className="form-label">
                    {t("DATASET_NAME", "Dataset name")} <span className="text-error">*</span>
                  </span>
                  <input
                    type="text"
                    value={datasetDraftName}
                    className={textFieldClassName("md")}
                    placeholder={t("DATASET_NAME_PLACEHOLDER", "E.g. Q2 district bundle")}
                    onChange={(e) => setDatasetDraftName(e.target.value)}
                    disabled={datasetSaveLoading || !workflowId || isDatasetDrawerReadOnly}
                  />
                </label>

                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center justify-between">
                    <span className="form-label">
                      {t("INDICATOR_UNIT_SUBGROUP", "Indicator, Unit & Subgroup")} ({datasetIndicatorItems.length}){" "}
                      <span className="text-error">*</span>
                    </span>
                    {!hideDatasetDrawerEditActions ? (
                      <button
                        type="button"
                        className="btn-comp-primary gap-1"
                        onClick={() => setDatasetIndicatorModalOpen(true)}
                        disabled={!dwId || !workflowId || datasetSaveLoading || isDatasetDrawerReadOnly}
                      >
                        <Mi name="add" className="!text-sm" />
                        {t("SELECT", "Select")}
                      </button>
                    ) : null}
                  </div>
                  <p className="text-xs leading-snug text-text-muted">{dataEntryIndicatorScopeHint}</p>
                  <div className="rounded-md border border-border bg-surface-muted px-3 py-2 text-xs text-text-muted min-h-[72px] max-h-[130px] overflow-y-auto">
                    {datasetIndicatorItems.length > 0 ? (
                      <div className="flex flex-wrap items-center gap-1.5">
                        {datasetIndicatorItems.map((item) => {
                          const itemId = String(item.id);
                          return (
                            <span
                              key={itemId}
                              className="inline-flex items-center gap-1 rounded-full bg-surface border border-border px-2.5 py-1 text-xs text-text"
                            >
                              {item.label}
                              {!hideDatasetDrawerEditActions ? (
                                <button
                                  type="button"
                                  className="ml-0.5 text-text-muted hover:text-error"
                                  onClick={() => {
                                    if (isDatasetDrawerReadOnly) return;
                                    setDatasetIndicatorItems((prev) =>
                                      prev.filter((i) => String(i.id) !== itemId)
                                    );
                                    if (item.iusNid != null) {
                                      setDatasetIusNids((prev) =>
                                        prev.filter((n) => n !== item.iusNid)
                                      );
                                    }
                                  }}
                                  disabled={isDatasetDrawerReadOnly}
                                  aria-label={t("REMOVE")}
                                >
                                  <Mi name="close" className="!text-xs" />
                                </button>
                              ) : null}
                            </span>
                          );
                        })}
                      </div>
                    ) : (
                      t("SELECT_IUS_PLACEHOLDER", "Select IUS...")
                    )}
                  </div>
                </div>

                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center justify-between">
                    <span className="form-label">
                      {t("TIME_PERIOD")} ({datasetTimeperiodNids.length}) <span className="text-error">*</span>
                    </span>
                    {!hideDatasetDrawerEditActions ? (
                      <button
                        type="button"
                        className="btn-comp-primary gap-1"
                        onClick={() => setDatasetTimeperiodOpen(true)}
                        disabled={!dwId || !workflowId || datasetSaveLoading || isDatasetDrawerReadOnly}
                      >
                        <Mi name="add" className="!text-sm" />
                        {t("SELECT", "Select")}
                      </button>
                    ) : null}
                  </div>
                  <p className="text-xs leading-snug text-text-muted">{dataEntryTimePeriodScopeHint}</p>
                  <div className="rounded-md border border-border bg-surface-muted px-3 py-2 text-xs text-text-muted min-h-[40px] max-h-[70px] overflow-y-auto">
                    {datasetTimeperiodNids.length > 0 ? (
                      <div className="flex flex-wrap gap-1.5">
                        {datasetTimeperiodNids.map((nid) => {
                          const tpItem = datasetTimePeriodItems.find((i) => String(i.nid ?? i.id) === nid);
                          return (
                            <span
                              key={nid}
                              className="inline-flex items-center gap-1 rounded-full bg-surface border border-border px-2.5 py-1 text-xs text-text"
                            >
                              {tpItem?.label ?? getOptionLabel(timePeriodOptions, nid)}
                              {!hideDatasetDrawerEditActions ? (
                                <button
                                  type="button"
                                  className="ml-0.5 text-text-muted hover:text-error"
                                  onClick={() => {
                                    if (isDatasetDrawerReadOnly) return;
                                    removeChip(setDatasetTimeperiodNids, nid);
                                    setDatasetTimePeriodItems((prev) =>
                                      prev.filter((i) => String(i.nid ?? i.id) !== nid),
                                    );
                                  }}
                                  disabled={isDatasetDrawerReadOnly}
                                  aria-label={t("REMOVE")}
                                >
                                  <Mi name="close" className="!text-xs" />
                                </button>
                              ) : null}
                            </span>
                          );
                        })}
                      </div>
                    ) : (
                      t("SELECT_TIME_PERIODS_PLACEHOLDER", "Select time periods...")
                    )}
                  </div>
                </div>

                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center justify-between">
                    <span className="form-label">
                      {t("AREA")} ({datasetAreaNids.length}) <span className="text-error">*</span>
                    </span>
                    {!hideDatasetDrawerEditActions ? (
                      <button
                        type="button"
                        className="btn-comp-primary gap-1"
                        onClick={openDatasetAreaPicker}
                        disabled={!dwId || !workflowId || datasetSaveLoading || isDatasetDrawerReadOnly}
                      >
                        <Mi name="add" className="!text-sm" />
                        {t("SELECT", "Select")}
                      </button>
                    ) : null}
                  </div>
                  <p className="text-xs leading-snug text-text-muted">{dataEntryAreaScopeHint}</p>
                  <div className="rounded-md border border-border bg-surface-muted px-3 py-2 text-xs text-text-muted min-h-[40px] max-h-[70px] overflow-y-auto">
                    {datasetAreaNids.length > 0 ? (
                      <div className="flex flex-wrap gap-1.5">
                        {datasetAreaNids.map((nid) => {
                          const item = datasetAreaItems.find((i) => String(i.nid ?? i.id) === nid);
                          return (
                            <span
                              key={nid}
                              className="inline-flex items-center gap-1 rounded-full bg-surface border border-border px-2.5 py-1 text-xs text-text"
                            >
                              {item?.label ?? nid}
                              {!hideDatasetDrawerEditActions ? (
                                <button
                                  type="button"
                                  className="ml-0.5 text-text-muted hover:text-error"
                                  onClick={() => {
                                    if (isDatasetDrawerReadOnly) return;
                                    setDatasetAreaNids((prev) => prev.filter((v) => v !== nid));
                                    setDatasetAreaItems((prev) =>
                                      prev.filter((i) => String(i.nid ?? i.id) !== nid)
                                    );
                                  }}
                                  disabled={isDatasetDrawerReadOnly}
                                  aria-label={t("REMOVE")}
                                >
                                  <Mi name="close" className="!text-xs" />
                                </button>
                              ) : null}
                            </span>
                          );
                        })}
                      </div>
                    ) : (
                      t("SELECT_AREAS_PLACEHOLDER", "Select areas...")
                    )}
                  </div>
                </div>

                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center justify-between">
                    <span className="form-label">
                      {t("SOURCES")} ({datasetSourceNids.length}) <span className="text-error">*</span>
                    </span>
                    {!hideDatasetDrawerEditActions ? (
                      <button
                        type="button"
                        className="btn-comp-primary gap-1"
                        onClick={() => setDatasetSourceOpen(true)}
                        disabled={!dwId || !workflowId || datasetSaveLoading || isDatasetDrawerReadOnly}
                      >
                        <Mi name="add" className="!text-sm" />
                        {t("SELECT", "Select")}
                      </button>
                    ) : null}
                  </div>
                  <div className="rounded-md border border-border bg-surface-muted px-3 py-2 text-xs text-text-muted min-h-[40px] max-h-[70px] overflow-y-auto">
                    {datasetSourceNids.length > 0 ? (
                      <div className="flex flex-wrap gap-1.5">
                        {datasetSourceNids.map((nid) => (
                          <span
                            key={nid}
                            className="inline-flex items-center gap-1 rounded-full bg-surface border border-border px-2.5 py-1 text-xs text-text"
                          >
                            {getOptionLabel(sourceOptions, nid)}
                            {!hideDatasetDrawerEditActions ? (
                              <button
                                type="button"
                                className="ml-0.5 text-text-muted hover:text-error"
                                onClick={() => {
                                  if (isDatasetDrawerReadOnly) return;
                                  removeChip(setDatasetSourceNids, nid);
                                }}
                                disabled={isDatasetDrawerReadOnly}
                                aria-label={t("REMOVE")}
                              >
                                <Mi name="close" className="!text-xs" />
                              </button>
                            ) : null}
                          </span>
                        ))}
                      </div>
                    ) : (
                      t("SELECT_SOURCES_PLACEHOLDER", "Select sources...")
                    )}
                  </div>
                </div>

                <p className="text-xs text-error">
                  <span className="text-error">*</span> {t("REQUIRED_FIELDS", "Required fields")}
                </p>
              </div>
            </div>
            )
          ) : drawerTab === "comment" ? (
            <CommentPanel
              dwId={dwId}
              datasetId={datasetEditId}
              isCommentLocked={getDatasetStatusToken(datasetEditStatus) === "APPROVED"}
              onCommentsCountChange={handleDatasetDrawerCommentCountChange}
              t={t}
            />
          ) : drawerTab === "import-logs" && datasetEditId ? (
            <DatasetImportLogsDrawerContent
              dwId={dwId}
              datasetId={datasetEditId}
              datasetLabel={
                datasets.find((d) => String(d.dataset_id) === datasetEditId)?.dataset_gid ??
                `DS-${datasetEditId}`
              }
              datapointReadiness={datasetEditDatapointReadiness || datapointReadiness}
              expandRequestId={activeImportRequestId}
              pollToken={importLogsPollToken}
              t={t}
              onRunningChange={setHasRunningImports}
            />
          ) : null}

          {drawerTab === "dataset" ? (
            <div className="flex items-center justify-between border-t border-border px-5 py-3">
              {!hideDatasetDrawerEditActions ? (
                <SecondaryButton
                  type="button"
                  onClick={() => handleClearDatasetDrawer()}
                  disabled={datasetSaveLoading || datasetHydrateLoading || isDatasetDrawerReadOnly}
                >
                  {t("CLEAR", "Clear")}
                </SecondaryButton>
              ) : (
                <span />
              )}
              <div className="flex items-center gap-2">
                <SecondaryButton
                  type="button"
                  onClick={closeDatasetDrawer}
                  disabled={datasetSaveLoading || datasetHydrateLoading}
                >
                  {t("CANCEL")}
                </SecondaryButton>
                {!hideDatasetDrawerEditActions ? (
                  <PrimarySaveButton
                    disabled={
                      datasetSaveLoading ||
                      datasetHydrateLoading ||
                      !workflowId ||
                      isDatasetDrawerReadOnly
                    }
                    onClick={() => void handleSaveDataset()}
                  >
                    {datasetSaveLoading ? t("SAVING", "Saving...") : t("SAVE")}
                  </PrimarySaveButton>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>
      </Drawer>

      <TimePeriodSelectionModal
        isOpen={datasetTimeperiodOpen}
        onClose={() => setDatasetTimeperiodOpen(false)}
        baseUrl={referenceBaseUrl}
        locale={locale}
        preloadedData={preloadedTimePeriodItems}
        preloadedDataKey={`${workflowId}:${workflowTimePeriodFrequency}:${workflowCurrTimeperiodNid ?? ""}`}
        fetchOptions={getPreloadedTimePeriodItems}
        initialSelectedItems={datasetTimePeriodItems}
        selectionMode={dataEntryScope.timePeriod === "SINGLE" ? "SINGLE" : "MULTIPLE"}
        onApply={(items) => {
          const allowed = new Set(timePeriodOptions.map((option) => option.value));
          const filteredItems = items.filter((item) =>
            allowed.has(String(item.nid ?? item.id))
          );
          setDatasetTimePeriodItems(filteredItems);
          setDatasetTimeperiodNids(
            enforceScopeSelection(
              filteredItems.map((i) => String(i.nid ?? i.id)),
              dataEntryScope.timePeriod,
            ),
          );
          setDatasetTimeperiodOpen(false);
        }}
      />

      <ItemSelectionModal
        isOpen={datasetSourceOpen}
        onClose={() => setDatasetSourceOpen(false)}
        title={t("SELECT_SOURCE", "Select Source")}
        searchPlaceholder={t("SEARCH_SOURCE_PLACEHOLDER", "Search Source....")}
        options={sourceOptions}
        selectedValues={datasetSourceNids}
        onApply={(values) => {
          setDatasetSourceNids(values);
          setDatasetSourceOpen(false);
        }}
        clearLabel={t("CLEAR", "Clear")}
        cancelLabel={t("CANCEL")}
        applyLabel={t("APPLY", "Apply")}
        selectedCountLabel={(count) =>
          t("SOURCES_SELECTED_COUNT", `${count} Sources selected`).replace("{count}", String(count))
        }
      />

      <Modal
        open={datasetActionConfirmOpen}
        onClose={closeDatasetActionConfirm}
        title={
          datasetActionType === "send_back"
            ? (() => {
                const hasRejected = dataPointsTabCounts.rejected > 0;
                const allApproved = dataPointsTabCounts.approved > 0 && dataPointsTabCounts.rejected === 0 && dataPointsTabCounts.pending === 0;
                if (hasRejected) return t("CONFIRM_SUBMIT_TITLE", "Submit dataset?");
                if (allApproved) return t("CONFIRM_PUBLISH_DATA_TITLE", "Submit data?");
                return t("CONFIRM_SUBMIT_TITLE", "Submit dataset?");
              })()
            : datasetActionType === "submit_for_review"
              ? t("CONFIRM_SUBMIT_FOR_REVIEW_TITLE", "Submit for review?")
              : t("CONFIRM_SUBMIT_DATA_TITLE", "Submit data?")
        }
        titleId="dm-dataset-action-confirm-title"
        dismissDisabled={submitForReviewLoading || sendBackLoading}
        closeAriaLabel={t("CLOSE")}
        footer={
          <div className="flex justify-end gap-2">
            <SecondaryButton
              type="button"
              variant="modal"
              disabled={submitForReviewLoading || sendBackLoading}
              onClick={closeDatasetActionConfirm}
            >
              {t("CANCEL")}
            </SecondaryButton>
            <PrimaryButton
              type="button"
              disabled={submitForReviewLoading || sendBackLoading || !datasetActionType}
              onClick={() => void handleConfirmDatasetAction()}
            >
              {datasetActionType === "send_back"
                ? sendBackLoading
                  ? t("SUBMITTING", "Submitting...")
                  : t("SUBMIT", "Submit")
                : submitForReviewLoading
                  ? datasetActionType === "submit_for_review"
                    ? t("SUBMITTING", "Submitting...")
                    : t("SUBMITTING", "Submitting...")
                  : datasetActionType === "submit_for_review"
                    ? t("SUBMIT_FOR_REVIEW", "Submit for review")
                    : t("SUBMIT", "Submit")}
            </PrimaryButton>
          </div>
        }
      >
        <div className="space-y-3 text-xs text-text-muted">
          <p>
            {datasetActionType === "send_back"
              ? (() => {
                  const hasRejected = dataPointsTabCounts.rejected > 0;
                  if (hasRejected) {
                    const operatorName = datasetWorkflowName || t("DATA_ENTRY_OPERATOR", "Data Entry Operator");
                    return t(
                      "SEND_BACK_REJECTED_CONFIRM_MESSAGE",
                      "This dataset will be submitted to the Data Entry Operator ({name}) for further correction. Are you sure you want to submit the dataset?"
                    ).replace("{name}", operatorName);
                  }
                  const activeStage = datasetStages.find((s) => s.stage_status === "ACTIVE");
                  if (activeStage) {
                    const isLastStage = !datasetStages.some((s) => s.level_no > activeStage.level_no);
                    const levelLabel = t(
                      "REVIEWER_SUBMIT_APPROVED_AT_LEVEL",
                      "This dataset will be approved at Level {level}."
                    ).replace("{level}", String(activeStage.level_no));
                    const outcomeLabel = isLastStage
                      ? t(
                          "REVIEWER_SUBMIT_PUBLISH_FINAL",
                          "This dataset will be published and dataset status will be updated to Approved."
                        )
                      : t(
                          "REVIEWER_SUBMIT_MOVE_NEXT_STAGE",
                          "This dataset will be moved to next stage for review."
                        );
                    return `${levelLabel} ${outcomeLabel}`;
                  }
                  return t(
                    "SEND_BACK_CONFIRM_MESSAGE",
                    "This will submit the dataset for further processing. Are you sure you want to submit?"
                  );
                })()
              : datasetActionType === "submit_for_review"
                ? t(
                    "SUBMIT_FOR_REVIEW_CONFIRM_MESSAGE",
                    "This will submit the dataset for review. The dataset status will change to Pending Review. Are you sure?"
                  )
                : t(
                    "PUBLISH_DATA_SINGLE_LINE_MESSAGE",
                    "This will publish the dataset and move it to {status} status. Ensure all required draft changes are saved before publishing."
                  ).replace("{status}", t("APPROVED", "Approved"))}
          </p>
          {datasetActionType === "submit_for_review" ? (
            <p>
              {t(
                "SUBMIT_FOR_REVIEW_CONFIRM_NOTE",
                "Ensure all required draft changes are saved before submission."
              )}
            </p>
          ) : null}
        </div>
      </Modal>

      <Modal
        open={reviewConfirmOpen}
        onClose={closeReviewConfirmModal}
        title={
          reviewActionType === "approve"
            ? t("CONFIRM_APPROVE_TITLE", "Confirm Approval")
            : t("CONFIRM_REJECT_TITLE", "Confirm Rejection")
        }
        titleId="dm-dataset-review-confirm-title"
        dismissDisabled={reviewLoading}
        closeAriaLabel={t("CLOSE")}
        footer={
          <div className="flex justify-end gap-2">
            <SecondaryButton
              type="button"
              variant="modal"
              disabled={reviewLoading}
              onClick={closeReviewConfirmModal}
            >
              {t("CANCEL")}
            </SecondaryButton>
            <PrimaryButton
              type="button"
              variant={reviewActionType === "reject" ? "reject" : "default"}
              disabled={reviewLoading || isRejectCommentMissing}
              onClick={() => void handleSubmitReviewDecision()}
            >
              {reviewLoading
                ? reviewActionType === "approve"
                  ? t("APPROVING", "Approving...")
                  : t("REJECTING", "Rejecting...")
                : reviewActionType === "approve"
                  ? t("APPROVE_SELECTED", "Approve Selected")
                  : t("CONFIRM_SELECTED", "Reject Selected")}
            </PrimaryButton>
          </div>
        }
      >
        <div className="space-y-3 text-xs text-text-muted">
          <p>
            {reviewActionType === "approve"
              ? t(
                  "APPROVE_CONFIRM_MESSAGE",
                  "You are about to approve selected data points for this dataset."
                )
              : t(
                  "REJECT_CONFIRM_MESSAGE",
                  "You are about to reject selected data points and send dataset for revision."
                )}
          </p>
          <p>
            {t("ROWS_SELECTED_COUNT", "{count} rows selected").replace(
              "{count}",
              String(dataPointSelectionCount)
            )}
          </p>
          <label className="flex flex-col gap-1.5">
            <span className="form-label">
              {reviewActionType === "reject" ? (
                <>
                  {t("COMMENT", "Comment")} <span className="text-error">*</span>
                </>
              ) : (
                t("COMMENT", "Comment")
              )}
            </span>
            <TextAreaField
              fieldSize="md"
              className={
                reviewCommentTouched && isRejectCommentMissing
                  ? "!border-error focus:!border-error focus:!shadow-none"
                  : undefined
              }
              placeholder={
                reviewActionType === "reject"
                  ? t("REVIEW_COMMENT_PLACEHOLDER_REQUIRED", "Add review comment")
                  : t("REVIEW_COMMENT_PLACEHOLDER", "Add review comment (optional)")
              }
              value={reviewComment}
              onChange={(e) => setReviewComment(e.target.value)}
              onBlur={() => setReviewCommentTouched(true)}
              required={reviewActionType === "reject"}
              aria-invalid={reviewCommentTouched && isRejectCommentMissing}
              disabled={reviewLoading}
            />
            {reviewCommentTouched && isRejectCommentMissing ? (
              <span className="text-xs text-error">
                {t("DATA_REVIEW_REJECT_COMMENT_REQUIRED", "Comment is required to reject selected rows.")}
              </span>
            ) : null}
          </label>
        </div>
      </Modal>

      <Modal
        open={datasetDeleteConfirmOpen}
        onClose={closeDatasetDeleteModal}
        title={t("DELETE_DATASET", "Delete dataset")}
        titleId="dm-dataset-delete-title"
        titleClassName="capitalize"
        dismissDisabled={datasetDeleteLoading}
        closeAriaLabel={t("CLOSE")}
        footer={
          <div className="flex justify-end gap-2">
            <SecondaryButton
              type="button"
              variant="modal"
              disabled={datasetDeleteLoading}
              onClick={closeDatasetDeleteModal}
            >
              {t("CANCEL")}
            </SecondaryButton>
            {!datasetDeleteBlocked ? (
              <PrimaryButton
                type="button"
                variant="destructive"
                disabled={datasetDeleteLoading}
                onClick={() => void handleConfirmDeleteDataset()}
              >
                {datasetDeleteLoading
                  ? t("DELETING", "Deleting...")
                  : t("DELETE_PERMANENTLY", "Delete permanently")}
              </PrimaryButton>
            ) : null}
          </div>
        }
      >
        <div className="space-y-3 text-xs text-text-muted">
          {datasetDeleteBlocked ? (
            <p>
              {t(
                "DATASET_DELETE_ALLOWED_STATUS_ONLY",
                "Dataset deletion is allowed only in DRAFT status"
              )}
            </p>
          ) : (
            <>
              <p className="capitalize">
                {datasetDeleteTargets.length > 1
                  ? t(
                      "DATASET_DELETE_CONFIRM_MESSAGE_MULTI",
                      "You are about to permanently delete {count} datasets."
                    ).replace("{count}", String(datasetDeleteTargets.length))
                  : t(
                      "DATASET_DELETE_CONFIRM_MESSAGE",
                      `You are about to permanently delete "${datasetDeleteTargets[0]?.name || "this dataset"}".`
                    )}
              </p>
              <div className="rounded-md border border-border bg-surface-muted p-3">
                <p className="mb-2 font-medium text-text">
                  {t("DATASET_ASSOCIATION_COUNT_TITLE", "This delete will affect:")}
                </p>
                <div
                  className={
                    datasetSupportsReviewFlow
                      ? "grid grid-cols-1 gap-1 sm:grid-cols-2"
                      : "grid grid-cols-1 gap-1"
                  }
                >
                  <p>
                    {t("TABLE_COL_DATA", "Data")}:
                    <span className="ml-1 font-semibold text-text">
                      {datasetAssociationCounts?.dataPointCount ?? 0}
                    </span>
                  </p>
                  {datasetSupportsReviewFlow ? (
                    <>
                      <p>
                        {t("REVIEW_STAGE", "Review stage")}:
                        <span className="ml-1 font-semibold text-text">
                          {datasetAssociationCounts?.reviewStageCount ?? 0}
                        </span>
                      </p>
                      <p>
                        {t("REVIEW_SLICE", "Review slice")}:
                        <span className="ml-1 font-semibold text-text">
                          {datasetAssociationCounts?.reviewSliceCount ?? 0}
                        </span>
                      </p>
                      <p>
                        {t("ACTION_LOG", "Action log")}:
                        <span className="ml-1 font-semibold text-text">
                          {datasetAssociationCounts?.actionLogCount ?? 0}
                        </span>
                      </p>
                    </>
                  ) : null}
                </div>
              </div>
            </>
          )}
        </div>
      </Modal>

      <AreaSelectionModal
        key={`${dwId}:${workflowId || "no-wf"}`}
        isOpen={datasetAreaOpen}
        onClose={() => setDatasetAreaOpen(false)}
        baseUrl={referenceBaseUrl}
        locale={locale}
        allowedAreaNids={isSuperAdmin() ? undefined : allowedAreaContentIds}
        preloadedData={preloadedAreaItems.length > 0 ? preloadedAreaItems : undefined}
        allowSelectionAtLevel={isSuperAdmin() ? (workflowAreaLevel ?? undefined) : undefined}
        initialSelectedItems={datasetAreaItems}
        selectionMode={dataEntryScope.area}
        onApply={(items) => {
          setDatasetAreaItems(items);
          setDatasetAreaNids(
            enforceScopeSelection(
              items.map((item) => String(item.nid ?? item.id)),
              dataEntryScope.area
            )
          );
          setDatasetAreaOpen(false);
        }}
      />

      <IndicatorSelectionModal
        isOpen={datasetIndicatorModalOpen}
        onClose={() => setDatasetIndicatorModalOpen(false)}
        baseUrl={referenceBaseUrl}
        locale={locale}
        initialSelectedItems={datasetIndicatorItems}
        selectionMode={dataEntryScope.indicator}
        flatIusList
        onApply={(items) => {
          setDatasetIndicatorItems(items);
          const nids = items
            .map((item) => item.iusNid)
            .filter((n): n is number => n != null && n > 0);
          setDatasetIusNids(nids);
          setDatasetIndicatorModalOpen(false);
        }}
      />

      {isDatasetDetailsPage && isDataEntry ? (
        <FileImport
          open={dataPointsImportOpen}
          onClose={() => setDataPointsImportOpen(false)}
          title={
            datasetName.trim()
              ? `${t("DATA_POINTS", "Data points")} — ${datasetName.trim()}`
              : t("DATA_POINTS", "Data points")
          }
          onImport={handleDataPointsFileImport}
        />
      ) : null}

      <Drawer
        open={dpCommentDrawerOpen}
        onClose={closeDpCommentDrawer}
        closeOnOverlayClick={dpCommentDataPointId == null}
        allowBackgroundInteraction={dpCommentDrawerOpen && dpCommentDataPointId != null}
        title={
          dpCommentDrawerTitle ? (
            <span className="flex flex-col">
              <span className="truncate" title={dpCommentDrawerTitle.primary}>
                {dpCommentDrawerTitle.primary}
              </span>
              <span
                className="truncate text-xs font-normal leading-tight text-text-muted"
                title={dpCommentDrawerTitle.secondary}
              >
                {dpCommentDrawerTitle.secondary}
              </span>
            </span>
          ) : (
            t("COMMENT", "Comment")
          )
        }
        width="38%"
        bodyClassName="flex flex-1 flex-col overflow-hidden p-0"
      >
        {dpCommentDrawerOpen && datasetId && (
          <CommentPanel
            dwId={dwId}
            datasetId={datasetId}
            dataPointId={dpCommentDataPointId}
            isCommentLocked={dpCommentLocked || getDatasetStatusToken(datasetStatus) === "APPROVED"}
            onCommentsCountChange={handleDpDrawerCommentCountChange}
            t={t}
          />
        )}
      </Drawer>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Import logs drawer tab (inline — dataset configure >> Import logs)
// ---------------------------------------------------------------------------

function importLogStatusTone(status: string | null | undefined): string {
  const s = (status ?? "").trim().toLowerCase();
  if (s === "running" || s === "processing" || s === "pending") return "tone-pill--warning";
  if (s === "completed" || s === "done") return "tone-pill--success-subtle";
  if (s === "failed") return "tone-pill--error";
  return "tone-pill--neutral";
}

function importLogStatusLabel(
  status: string | null | undefined,
  t: (code: string, fallback?: string) => string
): string {
  const s = (status ?? "").trim().toLowerCase();
  if (s === "running" || s === "processing") return t("IMPORT_LOG_STATUS_RUNNING", "Running");
  if (s === "pending") return t("COMPUTE_STATUS_PENDING", "Pending");
  if (s === "completed" || s === "done") return t("IMPORT_LOG_STATUS_COMPLETED", "Completed");
  if (s === "failed") return t("IMPORT_LOG_STATUS_FAILED", "Failed");
  return status?.trim() || "—";
}

function formatImportLogDateTime(raw: string | null | undefined): string {
  if (!raw?.trim()) return "—";
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return raw;
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  });
}

function formatImportLogStarted(raw: string | null | undefined): string {
  if (!raw?.trim()) return "—";
  return `Started ${formatImportLogDateTime(raw)}`;
}

function formatDurationFromMs(totalMs: number): string {
  if (!Number.isFinite(totalMs) || totalMs < 0) return "—";
  const totalSec = Math.floor(totalMs / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  if (m >= 60) {
    const h = Math.floor(m / 60);
    const rm = m % 60;
    return `${h}h ${rm}m`;
  }
  return s > 0 ? `${m}m ${s}s` : `${m}m`;
}

function parseImportLogStartMs(raw: string | null | undefined): number | null {
  if (!raw?.trim()) return null;
  const ms = new Date(raw.trim()).getTime();
  return Number.isFinite(ms) ? ms : null;
}

/** Job completion timestamps from the API are UTC (naive ISO without offset). */
function parseImportLogEndMs(raw: string | null | undefined): number | null {
  if (!raw?.trim()) return null;
  const normalized = raw.trim().replace(" ", "T");
  const withZone = /[zZ]|[+-]\d{2}:?\d{2}$/.test(normalized) ? normalized : `${normalized}Z`;
  const ms = new Date(withZone).getTime();
  return Number.isFinite(ms) ? ms : null;
}

function importLogDurationMs(
  start: string | null | undefined,
  end: string | null | undefined
): number | null {
  const startMs = parseImportLogStartMs(start);
  const endMs = parseImportLogEndMs(end);
  if (startMs == null || endMs == null || endMs < startMs) return null;
  return endMs - startMs;
}

function formatImportLogDuration(
  start: string | null | undefined,
  end: string | null | undefined
): string {
  const ms = importLogDurationMs(start, end);
  return ms == null ? "—" : formatDurationFromMs(ms);
}

function resolveEarliestBatchStartMs(batches: ImportBatchJobLog[]): number | null {
  let earliestMs: number | null = null;
  for (const batch of batches) {
    const ms = parseImportLogStartMs(batch.created_at);
    if (ms == null) continue;
    if (earliestMs == null || ms < earliestMs) earliestMs = ms;
  }
  return earliestMs;
}

function resolveLatestBatchEndMs(batches: ImportBatchJobLog[]): number | null {
  let latestMs: number | null = null;
  for (const batch of batches) {
    const ms = parseImportLogEndMs(batch.completed_at);
    if (ms == null) continue;
    if (latestMs == null || ms > latestMs) latestMs = ms;
  }
  return latestMs;
}

function resolveImportRunDurationMs(
  run: DataPointsImportLogSummary,
  detail: DataPointsImportLogDetail | null
): number | null {
  const start =
    run.started_at?.trim() || detail?.started_at?.trim() || null;
  let end = run.finished_at?.trim() || detail?.finished_at?.trim() || null;
  const isRunning = run.overall_status?.toLowerCase() === "running";
  if (!end && isRunning) {
    return importLogDurationMs(start, new Date().toISOString());
  }

  const summaryMs = importLogDurationMs(start, end);
  if (summaryMs != null) return summaryMs;

  const batches = detail?.batches ?? [];
  if (batches.length > 0) {
    let totalMs = 0;
    let hasBatchDuration = false;
    for (const batch of batches) {
      const batchMs = importLogDurationMs(batch.created_at, batch.completed_at);
      if (batchMs == null) continue;
      totalMs += batchMs;
      hasBatchDuration = true;
    }
    if (hasBatchDuration) return totalMs;

    const batchStartMs = resolveEarliestBatchStartMs(batches);
    const batchEndMs = resolveLatestBatchEndMs(batches);
    if (batchStartMs != null && batchEndMs != null && batchEndMs >= batchStartMs) {
      return batchEndMs - batchStartMs;
    }
  }

  return null;
}

function formatImportRunDuration(
  run: DataPointsImportLogSummary,
  detail: DataPointsImportLogDetail | null
): string {
  const ms = resolveImportRunDurationMs(run, detail);
  return ms == null ? "—" : formatDurationFromMs(ms);
}

function renderImportLogStatusChip(
  status: string | null | undefined,
  t: (code: string, fallback?: string) => string,
  options?: { showIcon?: boolean; className?: string }
) {
  const token = String(status ?? "").toLowerCase();
  const showIcon = options?.showIcon !== false;
  return (
    <span
      className={`status-chip ${importLogStatusTone(status)} ${options?.className ?? ""}`.trim()}
    >
      {showIcon && token === "completed" ? (
        <span className="material-icons !text-sm" aria-hidden="true">
          check_circle
        </span>
      ) : showIcon && (token === "running" || token === "processing") ? (
        <span className="material-icons !text-sm animate-spin" aria-hidden="true">
          sync
        </span>
      ) : null}
      {importLogStatusLabel(status, t)}
    </span>
  );
}

function importBatchUpdated(batch: ImportBatchJobLog): number | null {
  const updated = batch.result?.updated;
  return typeof updated === "number" ? updated : null;
}

function importBatchSkipped(batch: ImportBatchJobLog): number | null {
  const skipped = batch.result?.skipped_locked;
  return typeof skipped === "number" ? skipped : null;
}

function importBatchLogMessage(
  batch: ImportBatchJobLog,
  t: (code: string, fallback?: string) => string
): string {
  if (batch.last_error?.trim()) return batch.last_error.trim();
  const result = batch.result;
  if (result && typeof result === "object") {
    const message = result.message;
    if (typeof message === "string" && message.trim()) return message.trim();
    const errors = result.errors;
    if (Array.isArray(errors) && errors.length > 0) {
      const first = errors[0];
      if (first && typeof first === "object" && first !== null) {
        const err = (first as { error?: string; detail?: string }).error;
        const detail = (first as { error?: string; detail?: string }).detail;
        const joined = [err, detail].filter(Boolean).join(": ");
        if (joined) return joined;
      }
    }
  }
  if (String(batch.job_status ?? "").toLowerCase() === "completed") {
    return t("IMPORT_LOG_BATCH_CLEAN", "Batch processed cleanly");
  }
  return "—";
}

function DatasetImportLogsDrawerContent({
  dwId,
  datasetId,
  datasetLabel,
  datapointReadiness,
  expandRequestId,
  pollToken = 0,
  t,
  onRunningChange,
}: {
  dwId: string;
  datasetId: string;
  datasetLabel: string;
  datapointReadiness?: string;
  expandRequestId?: string | null;
  pollToken?: number;
  t: (code: string, fallback?: string) => string;
  onRunningChange?: (running: boolean) => void;
}) {
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [imports, setImports] = useState<DataPointsImportLogSummary[]>([]);
  const [openLogIds, setOpenLogIds] = useState<Set<string>>(() => new Set());
  const [detailByRequest, setDetailByRequest] = useState<
    Record<string, DataPointsImportLogDetail | "loading" | "error">
  >({});
  const detailCacheRef = useRef<Record<string, DataPointsImportLogDetail>>({});
  const openLogIdsRef = useRef(openLogIds);
  openLogIdsRef.current = openLogIds;

  const isImporting = String(datapointReadiness ?? "").toUpperCase() === "UPDATED";

  const importLogsUrl = useMemo(
    () =>
      dwId && datasetId
        ? `${getDWAPIURL(dwId, REFERENCE_PATH_DATASET)}/${encodeURIComponent(datasetId)}${REFERENCE_PATH_DATA_POINTS_IMPORT_LOGS}`
        : "",
    [datasetId, dwId]
  );

  const loadImports = useCallback(
    async (options?: { silent?: boolean }) => {
      if (!importLogsUrl) return;
      const silent = options?.silent === true;
      if (!silent) {
        setListLoading(true);
        setListError(null);
      }
      try {
        const json = (await getRequest(importLogsUrl, undefined, {
          suppressErrorMessage: true,
        })) as {
          success?: boolean;
          data?: { imports?: DataPointsImportLogSummary[] };
          err_message?: string;
        };
        if (json.success !== true) {
          if (!silent) {
            setListError(json.err_message ?? t("IMPORT_LOG_ERROR", "Could not load import history."));
            setImports([]);
          }
          onRunningChange?.(false);
          return;
        }
        const list = Array.isArray(json.data?.imports) ? json.data.imports : [];
        setImports(list);
        const anyRunning = list.some((item) => item.overall_status?.toLowerCase() === "running");
        onRunningChange?.(anyRunning || isImporting);
      } catch {
        if (!silent) {
          setListError(t("IMPORT_LOG_ERROR", "Could not load import history."));
          setImports([]);
        }
        onRunningChange?.(false);
      } finally {
        if (!silent) setListLoading(false);
      }
    },
    [importLogsUrl, isImporting, onRunningChange, t]
  );

  const ensureDetail = useCallback(
    async (requestId: string) => {
      if (!importLogsUrl || !requestId) return;
      const cached = detailCacheRef.current[requestId];
      if (cached) {
        setDetailByRequest((prev) => ({ ...prev, [requestId]: cached }));
        return;
      }
      setDetailByRequest((prev) => ({ ...prev, [requestId]: "loading" }));
      try {
        const json = (await getRequest(
          `${importLogsUrl}/${encodeURIComponent(requestId)}`,
          undefined,
          { suppressErrorMessage: true }
        )) as { success?: boolean; data?: DataPointsImportLogDetail; err_message?: string };
        if (json.success !== true || !json.data) {
          setDetailByRequest((prev) => ({ ...prev, [requestId]: "error" }));
          return;
        }
        const detail = {
          ...json.data,
          batches: Array.isArray(json.data.batches) ? json.data.batches : [],
        };
        detailCacheRef.current[requestId] = detail;
        setDetailByRequest((prev) => ({ ...prev, [requestId]: detail }));
      } catch {
        setDetailByRequest((prev) => ({ ...prev, [requestId]: "error" }));
      }
    },
    [importLogsUrl]
  );

  const ensureDetailRef = useRef(ensureDetail);
  ensureDetailRef.current = ensureDetail;

  useEffect(() => {
    setOpenLogIds(new Set());
    detailCacheRef.current = {};
    setDetailByRequest({});
    void loadImports();
  }, [datasetId, dwId, loadImports]);

  useEffect(() => {
    if (pollToken <= 0) return;
    void loadImports({ silent: true });
    detailCacheRef.current = {};
    for (const requestId of openLogIdsRef.current) {
      void ensureDetailRef.current(requestId);
    }
  }, [pollToken, loadImports]);

  useEffect(() => {
    if (!expandRequestId) return;
    setOpenLogIds((prev) => new Set(prev).add(expandRequestId));
    void ensureDetailRef.current(expandRequestId);
  }, [expandRequestId]);

  const toggleLog = useCallback((requestId: string) => {
    setOpenLogIds((prev) => {
      const next = new Set(prev);
      if (next.has(requestId)) {
        next.delete(requestId);
      } else {
        next.add(requestId);
        void ensureDetailRef.current(requestId);
      }
      return next;
    });
  }, []);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      {listLoading ? (
        <div className="flex min-h-0 flex-1 items-center justify-center px-5 py-6">
          <Loader loadingLabel={t("LOADING")} />
        </div>
      ) : (
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-5 py-4">
          {listError ? (
            <p className="text-xs text-error">{listError}</p>
          ) : imports.length === 0 ? (
            <div className="flex flex-1 items-center justify-center">
              <p className="text-center text-xs text-text-muted">
                {t("IMPORT_LOG_EMPTY", "No import history for this dataset.")}
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
            {imports.map((run) => {
              const isOpen = openLogIds.has(run.request_id);
              const detailState = detailByRequest[run.request_id];
              const detail =
                detailState && detailState !== "loading" && detailState !== "error"
                  ? detailState
                  : null;
              const batches = detail?.batches ?? [];
              const completedCount =
                batches.length > 0
                  ? batches.filter((b) => String(b.job_status).toLowerCase() === "completed").length
                  : run.completed_batches;
              const failedCount =
                batches.length > 0
                  ? batches.filter((b) => String(b.job_status).toLowerCase() === "failed").length
                  : run.failed_batches;
              const pendingCount =
                batches.length > 0
                  ? batches.filter((b) => {
                      const s = String(b.job_status).toLowerCase();
                      return s === "pending" || s === "processing";
                    }).length
                  : run.pending_batches;

              return (
                <div key={run.request_id} className="card overflow-hidden">
                  <div className="flex items-center gap-2 px-3 py-3">
                    <ExpandChevronButton
                      expanded={isOpen}
                      expandAriaLabel={t("EXPAND", "Expand")}
                      collapseAriaLabel={t("COLLAPSE", "Collapse")}
                      iconClassName="!text-text-muted"
                      onClick={() => toggleLog(run.request_id)}
                    />
                    <div className="min-w-0 flex-1">
                      <p
                        className="truncate text-xs font-medium text-text"
                        title={run.request_id}
                      >
                        {formatImportLogStarted(run.started_at)}
                      </p>
                      <p className="mt-0.5 flex flex-wrap items-center gap-y-0.5 text-xs">
                        <span className="text-text-muted">{t("IMPORT_LOG_COL_UPDATED")}:</span>{" "}
                        <span className="font-semibold tabular-nums text-text">
                          {run.total_updated.toLocaleString()}
                        </span>
                        <span className="mx-2 text-text-muted" aria-hidden="true">
                          ·
                        </span>
                        <span className="text-text-muted">{t("IMPORT_LOG_COL_BATCHES")}:</span>{" "}
                        <span className="font-semibold tabular-nums text-text">
                          {run.completed_batches}/{run.total_batches}
                        </span>
                        <span className="mx-2 text-text-muted" aria-hidden="true">
                          ·
                        </span>
                        <span className="text-text-muted">{t("IMPORT_LOG_COL_DURATION")}:</span>{" "}
                        <span className="font-semibold tabular-nums text-text">
                          {formatImportRunDuration(run, detail)}
                        </span>
                      </p>
                    </div>
                    {renderImportLogStatusChip(run.overall_status, t, {
                      className: "shrink-0",
                    })}
                  </div>

                  {isOpen ? (
                    <div className="border-t border-border px-4 py-3">
                      {detailState === "loading" ? (
                        <div className="flex justify-center py-6">
                          <Loader loadingLabel={t("LOADING")} />
                        </div>
                      ) : detailState === "error" ? (
                        <p className="text-xs text-error">
                          {t("IMPORT_LOG_ERROR", "Could not load import history.")}
                        </p>
                      ) : (
                        <>
                          <div className="mb-3 rounded-md border border-border bg-surface-muted/60 px-3 py-2.5">
                            <p className="text-xs text-text">
                              <span className="text-text-muted">
                                {t("IMPORT_LOG_OVERALL_STATS", "Overall stats")}:
                              </span>{" "}
                              <span className="text-success">{t("SUCCESS", "Success")}</span>{" "}
                              <span className="font-semibold tabular-nums text-text">
                                {completedCount}
                              </span>
                              <span className="mx-2 text-text-muted" aria-hidden="true">
                                ·
                              </span>
                              <span className="text-error">{t("FAILED", "Failed")}</span>{" "}
                              <span className="font-semibold tabular-nums text-text">
                                {failedCount}
                              </span>
                              <span className="mx-2 text-text-muted" aria-hidden="true">
                                ·
                              </span>
                              <span className="text-warning">{t("PENDING", "Pending")}</span>{" "}
                              <span className="font-semibold tabular-nums text-text">
                                {pendingCount}
                              </span>
                            </p>
                          </div>

                          {batches.length === 0 ? (
                            <p className="text-xs text-text-muted">
                              {t("IMPORT_LOG_NO_BATCHES", "No batch details.")}
                            </p>
                          ) : (
                            <div className="tbl-wrap min-w-0">
                              <div className="tbl-scroll overflow-x-auto rounded border border-border bg-surface">
                                <table className="w-full min-w-[40rem] border-collapse text-left text-xs">
                                  <thead>
                                    <tr className="border-b border-border bg-surface-muted/80">
                                      <th className="min-w-[6.5rem] whitespace-nowrap px-3 py-2 font-medium text-text-muted">
                                        {t("IMPORT_LOG_BATCH_NO", "Batch No.")}
                                      </th>
                                      <th className="min-w-[5.5rem] whitespace-nowrap px-3 py-2 font-medium text-text-muted">
                                        {t("IMPORT_LOG_COL_STATUS", "Status")}
                                      </th>
                                      <th className="min-w-[4.5rem] whitespace-nowrap px-3 py-2 font-medium text-text-muted">
                                        {t("IMPORT_LOG_COL_UPDATED", "Updated")}
                                      </th>
                                      <th className="min-w-[4.5rem] whitespace-nowrap px-3 py-2 font-medium text-text-muted">
                                        {t("IMPORT_LOG_LOCK_SKIPS", "Lock Skips")}
                                      </th>
                                      <th className="min-w-[4.5rem] whitespace-nowrap px-3 py-2 font-medium text-text-muted">
                                        {t("IMPORT_LOG_COL_DURATION", "Duration")}
                                      </th>
                                      <th className="min-w-[8rem] whitespace-nowrap px-3 py-2 font-medium text-text-muted">
                                        {t("IMPORT_LOG_LOGS_ERRORS", "Logs & Errors")}
                                      </th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {batches.map((batch) => {
                                      const batchMsg = importBatchLogMessage(batch, t);
                                      const isClean =
                                        batchMsg ===
                                        t("IMPORT_LOG_BATCH_CLEAN", "Batch processed cleanly");
                                      return (
                                        <tr
                                          key={batch.job_id}
                                          className="border-b border-border/70 last:border-b-0"
                                        >
                                          <td className="whitespace-nowrap px-3 py-2 align-middle">
                                            <span className="font-medium text-text">
                                              {t("BATCH", "Batch")} {batch.batch_index + 1}
                                            </span>
                                            <span className="text-text-muted">
                                              {" "}
                                              ({batch.job_id})
                                            </span>
                                          </td>
                                          <td className="whitespace-nowrap px-3 py-2 align-middle">
                                            {renderImportLogStatusChip(batch.job_status, t, {
                                              showIcon: false,
                                            })}
                                          </td>
                                          <td className="whitespace-nowrap px-3 py-2 align-middle font-semibold tabular-nums text-text">
                                            {(importBatchUpdated(batch) ?? 0).toLocaleString()}
                                          </td>
                                          <td className="whitespace-nowrap px-3 py-2 align-middle tabular-nums text-text-muted">
                                            {importBatchSkipped(batch) != null &&
                                            importBatchSkipped(batch)! > 0
                                              ? importBatchSkipped(batch)!.toLocaleString()
                                              : "—"}
                                          </td>
                                          <td className="whitespace-nowrap px-3 py-2 align-middle tabular-nums text-text-muted">
                                            {formatImportLogDuration(
                                              batch.created_at,
                                              batch.completed_at
                                            )}
                                          </td>
                                          <td className="px-3 py-2 align-middle">
                                            {isClean ? (
                                              <span className="inline-flex items-center gap-1 text-text-muted">
                                                <span
                                                  className="material-icons !text-sm"
                                                  aria-hidden="true"
                                                >
                                                  check_circle
                                                </span>
                                                <span className="text-xs">{batchMsg}</span>
                                              </span>
                                            ) : (
                                              <span
                                                className="line-clamp-2 text-xs text-error"
                                                title={batchMsg}
                                              >
                                                {batchMsg}
                                              </span>
                                            )}
                                          </td>
                                        </tr>
                                      );
                                    })}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  ) : null}
                </div>
              );
            })}
            </div>
          )}
      </div>
      )}
    </div>
  );
}
