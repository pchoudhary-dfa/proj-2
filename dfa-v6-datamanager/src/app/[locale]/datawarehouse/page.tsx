"use client";

import { getRequest, postRequest, patchRequest, deleteRequest, startBrowserFileDownload } from "@/lib/api/http";
import type {
  CreateDatawarehouseExistingOptions,
  CreateDatawarehouseExistingPayload,
  CreateDatawarehouseNewPayload,
  DatawarehouseConnectionTestData,
  DatawarehouseListItem,
  DatawarehouseLanguageItem,
  DatawarehouseMetadataData,
  DatawarehouseMetadataResult,
  DatawarehouseMutationError,
  DatawarehouseMutationResult,
  DatawarehouseMutationSuccess,
  DatawarehousesListError,
  DatawarehousesListResponse,
  DatawarehousesListSuccess,
  FetchDatawarehousesParams,
  UpdateDatawarehousePayload,
} from "@/lib/api/types";
import {
  DATAWAREHOUSE_DICTIONARY,
  DEFAULT_DATAWAREHOUSE,
  buildLocaleAppPath,
  getDatawarehousesListUrl,
  getDWAPIURL,
  REFERENCE_PATH_DB_METADATA,
  REFERENCE_PATH_SQL_DUMP,
} from "@/lib/constants";
import { useCore } from "@/contexts/CoreContext";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { hasPermission, APP_ROUTE_PERMISSIONS } from "@/lib/auth/user";
import { usePermissionGuard } from "@/hooks/usePermissionGuard";
import Breadcrumb from "@/components/Breadcrumb";
import Drawer from "@/components/Drawer";
import { gridConfigPanelRowTrProps } from "@/components/gridConfigPanelRowClick";
import { PrimarySaveButton } from "@/components/PrimarySaveButton";
import { SecondaryButton } from "@/components/SecondaryButton";
import { SelectField } from "@/components/SelectField";
import { TextField } from "@/components/TextField";
import { ToggleSwitch } from "@/components/ToggleSwitch";
import TableActionButton from "@/components/TableActionButton";
import { formatDateString } from "@/services/utils";
import { DeletePermanentConfirmModal } from "@/components/DeletePermanentConfirmModal";
import {
  dualActionColumnHeader,
  EditableDataGridThead,
  InlineEditableTable,
  ServerDrivenListTbody,
  type EditableGridColumnDef,
} from "@/components/TableView";
import { DEFAULT_TABLE_PAGE_SIZES } from "@/components/TablePaginationFooter";
import {
  DUAL_ACTION_COLUMN_LAYOUT,
  dualActionColumnThExtras,
} from "@/components/editableGridColumnClasses";

/** Dedupes concurrent dbmetadata calls (e.g. React Strict Mode double effects). */
const metadataRequestPromises = new Map<
  string,
  Promise<{ metadata: DatawarehouseMetadataData | null; languages: DatawarehouseLanguageItem[] }>
>();

async function fetchDatawarehousesListItems(
  params: FetchDatawarehousesParams = {}
): Promise<DatawarehouseListItem[]> {
  const searchParams = new URLSearchParams();
  if (params.skip != null) searchParams.set("skip", String(params.skip));
  if (params.limit != null) searchParams.set("limit", String(params.limit));
  if (params.active_only === true) searchParams.set("active_only", "true");
  const url = `${getDatawarehousesListUrl()}?${searchParams.toString()}`;
  const json = (await getRequest(url, undefined, {
    suppressErrorMessage: true,
  })) as DatawarehousesListResponse;
  if (
    (json as DatawarehousesListSuccess).success !== true ||
    !Array.isArray((json as DatawarehousesListSuccess).data)
  ) {
    throw new Error(
      (json as DatawarehousesListError).err_message ?? "Invalid response"
    );
  }
  return (json as DatawarehousesListSuccess).data;
}

function extractDatawarehouseConnectionTestData(
  result: DatawarehouseMutationResult
): DatawarehouseConnectionTestData | null {
  if (!result.success || !result.data || Array.isArray(result.data)) {
    return null;
  }
  const connected =
    typeof result.data.connected === "boolean" ? result.data.connected : undefined;
  const message =
    typeof result.data.message === "string" ? result.data.message : undefined;
  return { connected, message };
}

async function createDatawarehouseNew(
  payload: CreateDatawarehouseNewPayload
): Promise<DatawarehouseMutationResult> {
  const url = getDatawarehousesListUrl();
  const json = await postRequest(
    `${url}/`,
    payload as unknown as Record<string, unknown>,
    undefined,
    undefined,
    { suppressErrorMessage: true }
  );
  return json as DatawarehouseMutationResult;
}

async function createDatawarehouseExisting(
  payload: CreateDatawarehouseExistingPayload,
  options: CreateDatawarehouseExistingOptions = {}
): Promise<DatawarehouseMutationResult> {
  const url = getDatawarehousesListUrl();
  const searchParams = new URLSearchParams();
  if (options.test_connection_only === true) {
    searchParams.set("test_connection_only", "true");
  }
  const requestUrl =
    searchParams.size > 0 ? `${url}?${searchParams.toString()}` : url;
  const json = await postRequest(
    requestUrl,
    payload as unknown as Record<string, unknown>,
    undefined,
    undefined,
    { suppressErrorMessage: true }
  );
  return json as DatawarehouseMutationResult;
}

async function updateDatawarehouse(
  dwId: string,
  payload: UpdateDatawarehousePayload
): Promise<DatawarehouseMutationResult> {
  const url = getDWAPIURL(dwId, "");
  const json = await patchRequest(
    url,
    payload as unknown as Record<string, unknown>,
    undefined,
    undefined,
    { suppressErrorMessage: true }
  );
  return json as DatawarehouseMutationResult;
}

async function deleteDatawarehouse(
  dwId: string
): Promise<DatawarehouseMutationResult> {
  const url = getDWAPIURL(dwId, "");
  const json = (await deleteRequest(url, undefined, undefined, {
    suppressErrorMessage: true,
  })) as Record<string, unknown>;
  if (json.success === false) {
    return json as unknown as DatawarehouseMutationResult;
  }
  return { success: true, ...json } as unknown as DatawarehouseMutationResult;
}

async function generateSqlDump(
  dwId: string
): Promise<{ ok: true; message?: string } | { ok: false; message: string }> {
  const json = (await postRequest(
    getDWAPIURL(dwId, REFERENCE_PATH_SQL_DUMP),
    {},
    undefined,
    undefined,
    { suppressErrorMessage: true }
  )) as Record<string, unknown>;

  if (json?.success === true) {
    return {
      ok: true,
      message: typeof json.message === "string" ? json.message : undefined,
    };
  }

  const message =
    (typeof json?.err_message === "string" && json.err_message) ||
    (typeof json?.message === "string" && json.message) ||
    "";

  return { ok: false, message };
}

function downloadSqlDump(dwId: string): void {
  startBrowserFileDownload(getDWAPIURL(dwId, REFERENCE_PATH_SQL_DUMP));
}

async function fetchDatawarehouseMetadata(
  dwId: string,
  languageCode: string
): Promise<{ metadata: DatawarehouseMetadataData | null; languages: DatawarehouseLanguageItem[] }> {
  const cacheKey = `${dwId}:${languageCode}`;
  const inflight = metadataRequestPromises.get(cacheKey);
  if (inflight) return inflight;

  const promise = (async () => {
    const params = new URLSearchParams({
      language: languageCode,
      isLang: "true",
    });
    const url = `${getDWAPIURL(dwId, REFERENCE_PATH_DB_METADATA)}?${params.toString()}`;
    const json = (await getRequest(url, undefined, {
      suppressErrorMessage: true,
    })) as DatawarehouseMetadataResult;

    if (!json.success || !json.data || Array.isArray(json.data)) {
      return { metadata: null, languages: [] };
    }
    const languages = Array.isArray(json.data.languages) ? json.data.languages : [];
    return { metadata: json.data, languages };
  })();

  metadataRequestPromises.set(cacheKey, promise);
  void promise.finally(() => {
    if (metadataRequestPromises.get(cacheKey) === promise) {
      metadataRequestPromises.delete(cacheKey);
    }
  });
  return promise;
}

function formatDatawarehouseLanguageLabel(language: DatawarehouseLanguageItem): string {
  const name = (language.lang_name ?? "").trim();
  const code = (language.lang_code ?? "").trim();
  const lowerCode = code.toLowerCase();
  if (code && name && !name.toLowerCase().includes(`[${lowerCode}]`)) {
    return `${name} [${code}]`;
  }
  return name || code || "";
}

type DatawarehouseFormValues = {
  connectionName: string;
  datawarehouseType: string;
  port: string;
  hostAddress: string;
  datawarehouseName: string;
  username: string;
  password: string;
  standalone: boolean;
};

type DatawarehouseDrawerMode = "create" | "edit";

const EMPTY_VALUES: DatawarehouseFormValues = {
  connectionName: "",
  datawarehouseType: DEFAULT_DATAWAREHOUSE.uiType,
  port: DEFAULT_DATAWAREHOUSE.port,
  hostAddress: "",
  datawarehouseName: "",
  username: "",
  password: "",
  standalone: false,
};

function requiredLabel(label: string) {
  return (
    <span className="form-label flex items-center gap-1">
      <span className="text-error">*</span>
      {label}
    </span>
  );
}

type DatawarehouseTableRow = {
  id: string;
  name: string;
  updatedOn: string;
  updatedBy: string;
  datawarehouseType?: string;
  hostAddress?: string;
  username?: string;
  port?: string;
  databaseName?: string;
  defaultLanguage?: string;
  isActive?: boolean;
  dwMetadataDesc?: string;
  createdUserId?: number;
  modifiedUserId?: number;
  dwDataCount?: number;
  dwAreaCount?: number;
  dwIndCount?: number;
  dwIusCount?: number;
  dwTimeCount?: number;
  languages: DatawarehouseLanguageItem[];
  hasSqlDump?: boolean;
};

function normalizeMetadataCount(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  return undefined;
}

/** Dedupes concurrent list loads for the same locale (React Strict Mode). */
let listTableRowsInflight: Promise<DatawarehouseTableRow[]> | null = null;
let listTableRowsInflightLocale: string | null = null;

async function fetchDatawarehouseListTableRows(
  locale: string
): Promise<DatawarehouseTableRow[]> {
  if (listTableRowsInflight && listTableRowsInflightLocale === locale) {
    return listTableRowsInflight;
  }

  const promise = (async (): Promise<DatawarehouseTableRow[]> => {
    const items = await fetchDatawarehousesListItems({ limit: 1000, active_only: true });
    const metadataByDwId = new Map<string, DatawarehouseMetadataData | null>();
    const languagesByDwId = new Map<string, DatawarehouseLanguageItem[]>();

    await Promise.all(
      items.map(async (item) => {
        const dwId = String(item.id);
        try {
          const { metadata, languages } = await fetchDatawarehouseMetadata(dwId, locale);
          metadataByDwId.set(dwId, metadata);
          languagesByDwId.set(dwId, languages);
        } catch {
          metadataByDwId.set(dwId, null);
          languagesByDwId.set(dwId, []);
        }
      })
    );

    return items.map((item) => {
      const dwId = String(item.id);
      const metadata = metadataByDwId.get(dwId) ?? null;
      const dataCount = normalizeMetadataCount(metadata?.dbmtd_datacnt);

      return {
        id: dwId,
        name: item.dw_connection_name,
        updatedOn: formatDateString(item.modified ?? item.created),
        updatedBy:
          item.modified_by_username && item.modified_by_username.trim().length > 0
            ? item.modified_by_username
            : "-",
        datawarehouseType: item.db_source_type,
        hostAddress: item.db_host_address,
        username: item.db_user,
        port:
          item.db_port == null
            ? undefined
            : typeof item.db_port === "number"
              ? String(item.db_port)
              : item.db_port,
        databaseName: item.db_database,
        defaultLanguage: item.dw_default_language,
        isActive: item.is_active,
        createdUserId: item.created_user_id ?? undefined,
        modifiedUserId: item.modified_user_id ?? undefined,
        dwDataCount: dataCount,
        languages: languagesByDwId.get(dwId) ?? [],
        hasSqlDump: item.has_sql_dump === true,
      };
    });
  })();

  listTableRowsInflight = promise;
  listTableRowsInflightLocale = locale;
  void promise.finally(() => {
    if (listTableRowsInflight === promise) {
      listTableRowsInflight = null;
      listTableRowsInflightLocale = null;
    }
  });
  return promise;
}

function formatMetadataCount(value: number | undefined): string {
  if (typeof value !== "number") return "-";
  return value.toLocaleString("en-US");
}

type DatawarehouseListSortState = {
  columnId: string | null;
  direction: "asc" | "desc" | null;
};

function cycleDatawarehouseSort(
  columnId: string,
  prev: DatawarehouseListSortState
): DatawarehouseListSortState {
  if (prev.columnId !== columnId) {
    return { columnId, direction: "asc" };
  }
  if (prev.direction === "asc") {
    return { columnId, direction: "desc" };
  }
  if (prev.direction === "desc") {
    return { columnId: null, direction: null };
  }
  return { columnId, direction: "asc" };
}

function getDatawarehouseSortIcon(
  columnId: string,
  sortState: DatawarehouseListSortState
): "arrow_upward" | "arrow_downward" | "unfold_more" {
  if (sortState.columnId !== columnId) return "unfold_more";
  if (sortState.direction === "asc") return "arrow_upward";
  if (sortState.direction === "desc") return "arrow_downward";
  return "unfold_more";
}

function mapDbSourceTypeToUiType(sourceType?: string): string {
  const normalized = (sourceType ?? "").trim().toLowerCase();
  const match = DATAWAREHOUSE_DICTIONARY.find((entry) => entry.dbSourceType === normalized);
  return match?.uiType ?? DEFAULT_DATAWAREHOUSE.uiType;
}

function mapUiTypeToDbSourceType(uiType: string): string {
  const normalized = uiType.trim().toLowerCase();
  const match = DATAWAREHOUSE_DICTIONARY.find(
    (entry) => entry.uiType.toLowerCase() === normalized
  );
  return match?.dbSourceType ?? DEFAULT_DATAWAREHOUSE.dbSourceType;
}

function getPortByUiType(uiType: string): string {
  const normalized = uiType.trim().toLowerCase();
  const match = DATAWAREHOUSE_DICTIONARY.find(
    (entry) => entry.uiType.toLowerCase() === normalized
  );
  return match?.port ?? DEFAULT_DATAWAREHOUSE.port;
}

function buildCreateExistingPayload(values: DatawarehouseFormValues) {
  return {
    dw_connection_name: values.connectionName.trim(),
    db_source_type: mapUiTypeToDbSourceType(values.datawarehouseType),
    db_host_address: values.hostAddress.trim(),
    db_user: values.username.trim(),
    db_password: values.password,
    db_port: values.port.trim(),
    db_database: values.datawarehouseName.trim(),
    dw_default_language: "en",
    is_active: true,
    dw_metadata_desc: "",
    created_user_id: 0,
    modified_user_id: 0,
  };
}

function getMissingRequiredFields(values: DatawarehouseFormValues): string[] {
  const requiredFields: Array<{ label: string; value: string }> = [
    { label: "Connection name", value: values.connectionName },
    { label: "Datawarehouse type", value: values.datawarehouseType },
    { label: "Port", value: values.port },
    { label: "Host address", value: values.hostAddress },
    { label: "Datawarehouse name", value: values.datawarehouseName },
    { label: "Username", value: values.username },
    { label: "Password", value: values.password },
  ];

  return requiredFields
    .filter((field) => field.value.trim().length === 0)
    .map((field) => field.label);
}

export default function DatawarehousePage() {
  const router = useRouter();
  const params = useParams<{ locale: string }>();
  const locale = params?.locale ?? "en";
  const { t } = useCore();
  const tRef = useRef(t);
  tRef.current = t;

  const { allowed } = usePermissionGuard(APP_ROUTE_PERMISSIONS.datawarehouse.view);
  const canCreate = allowed && hasPermission(APP_ROUTE_PERMISSIONS.datawarehouse.crud, "C");
  const canUpdate = allowed && hasPermission(APP_ROUTE_PERMISSIONS.datawarehouse.crud, "U");
  const canDelete = allowed && hasPermission(APP_ROUTE_PERMISSIONS.datawarehouse.crud, "D");
  const canDownloadSqlDump = allowed && hasPermission(APP_ROUTE_PERMISSIONS.datawarehouse.crud, "R");

  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<DatawarehouseTableRow[]>([]);
  const [activeActionRowId, setActiveActionRowId] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerMode, setDrawerMode] = useState<DatawarehouseDrawerMode>("create");
  const [drawerInitialValues, setDrawerInitialValues] =
    useState<DatawarehouseFormValues>(EMPTY_VALUES);
  const [drawerValues, setDrawerValues] = useState<DatawarehouseFormValues>(EMPTY_VALUES);
  const [editingRowId, setEditingRowId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(DEFAULT_TABLE_PAGE_SIZES[0]);
  const [listSort, setListSort] = useState<DatawarehouseListSortState>({
    columnId: null,
    direction: null,
  });
  const [isSaving, setIsSaving] = useState(false);
  const [isTestingConnection, setIsTestingConnection] = useState(false);
  const [deleteConfirmRowId, setDeleteConfirmRowId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [generatingSqlDumpRowId, setGeneratingSqlDumpRowId] = useState<string | null>(null);

  useEffect(() => {
    if (!drawerOpen) return;
    setDrawerValues(drawerInitialValues);
  }, [drawerOpen, drawerInitialValues]);

  const loadDatawarehouses = useCallback(
    async (opts?: { isCancelled?: () => boolean }) => {
      const isCancelled = opts?.isCancelled ?? (() => false);
      setLoading(true);
      try {
        const mapped = await fetchDatawarehouseListTableRows(locale);
        if (isCancelled()) return;
        setRows(mapped);
      } catch {
        if (isCancelled()) return;
        setRows([]);
        toast.error(tRef.current("LOAD_ERROR_DATAWAREHOUSES"));
      } finally {
        if (!isCancelled()) setLoading(false);
      }
    },
    [locale]
  );

  useEffect(() => {
    let cancelled = false;
    void loadDatawarehouses({ isCancelled: () => cancelled });
    return () => {
      cancelled = true;
    };
  }, [loadDatawarehouses]);

  const filteredRows = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((row) => {
      const languageHaystack = row.languages
        .map((language) => formatDatawarehouseLanguageLabel(language))
        .join(" ");
      const haystack = `${row.id} ${row.name} ${row.updatedBy} ${languageHaystack}`.toLowerCase();
      return haystack.includes(q);
    });
  }, [rows, searchQuery]);

  const sortedRows = useMemo(() => {
    if (!listSort.columnId || !listSort.direction) return filteredRows;
    const getValue = (row: DatawarehouseTableRow): string | number => {
      switch (listSort.columnId) {
        case "id":
          return Number(row.id) || row.id;
        case "name":
          return row.name;
        case "dwDataCount":
          return row.dwDataCount ?? -1;
        case "updatedOn":
          return Date.parse(row.updatedOn) || row.updatedOn;
        case "updatedBy":
          return row.updatedBy;
        default:
          return "";
      }
    };

    const sorted = [...filteredRows].sort((left, right) => {
      const leftValue = getValue(left);
      const rightValue = getValue(right);
      const base =
        typeof leftValue === "number" && typeof rightValue === "number"
          ? leftValue - rightValue
          : String(leftValue).localeCompare(String(rightValue), undefined, {
              numeric: true,
              sensitivity: "base",
            });
      return listSort.direction === "asc" ? base : -base;
    });

    return sorted;
  }, [filteredRows, listSort.columnId, listSort.direction]);

  const totalCount = sortedRows.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

  useEffect(() => {
    setPage((prev) => Math.min(Math.max(1, prev), totalPages));
  }, [totalPages]);

  useEffect(() => {
    setPage(1);
  }, [searchQuery, pageSize]);

  const paginatedRows = useMemo(() => {
    const start = (page - 1) * pageSize;
    return sortedRows.slice(start, start + pageSize);
  }, [sortedRows, page, pageSize]);

  const onSortColumn = useCallback((columnId: string) => {
    setPage(1);
    setListSort((prev) => cycleDatawarehouseSort(columnId, prev));
  }, []);

  const columns = useMemo<EditableGridColumnDef<DatawarehouseTableRow>[]>(
    () => [
      {
        id: "id",
        layout: { width: 6, unit: "%" },
        header: {
          kind: "sort",
          text: t("DW_ID"),
          onSort: () => onSortColumn("id"),
          sortIcon: getDatawarehouseSortIcon("id", listSort),
          sortAriaLabel: t("SORT_BY_LABEL").replace("{label}", t("DW_ID")),
        },
        filterCell: null,
        cell: ({ row }) => <span className="text-xs">{row.id}</span>,
      },
      {
        id: "name",
        layout: { width: 44, unit: "%", main: true },
        header: {
          kind: "sort",
          text: t("NAME"),
          onSort: () => onSortColumn("name"),
          sortIcon: getDatawarehouseSortIcon("name", listSort),
          sortAriaLabel: t("SORT_BY_LABEL").replace("{label}", t("NAME")),
        },
        filterCell: null,
        cell: ({ row }) => (
          <div className="min-w-0">
            <div className="truncate text-xs font-bold text-text">{row.name}</div>
            {row.languages.length > 0 ? (
              <p className="mt-0.5 text-[11px] leading-snug">
                {row.languages.map((language, index) => {
                  const label = formatDatawarehouseLanguageLabel(language);
                  if (!label) return null;
                  const isDefault = language.lang_is_default === true;
                  const key = `${language.lang_nid ?? label}-${language.lang_code ?? index}`;
                  return (
                    <span key={key}>
                      {index > 0 ? ", " : null}
                      <span className={isDefault ? "text-primary" : "text-text-muted"}>
                        {label}
                      </span>
                    </span>
                  );
                })}
              </p>
            ) : null}
          </div>
        ),
      },
      {
        id: "dwDataCount",
        layout: { width: 13 ,unit: "%"},
        header: {
          kind: "sort",
          text: t("DATA"),
          onSort: () => onSortColumn("dwDataCount"),
          sortIcon: getDatawarehouseSortIcon("dwDataCount", listSort),
          sortAriaLabel: t("SORT_BY_LABEL").replace("{label}", t("DATA")),
        },
        filterCell: null,
        cell: ({ row }) => <span className="text-xs">{formatMetadataCount(row.dwDataCount)}</span>,
      },
      {
        id: "updatedOn",
        layout: { width: 12, unit: "%" },
        header: {
          kind: "sort",
          text: t("UPDATED_ON"),
          onSort: () => onSortColumn("updatedOn"),
          sortIcon: getDatawarehouseSortIcon("updatedOn", listSort),
          sortAriaLabel: t("SORT_BY_LABEL").replace("{label}", t("UPDATED_ON")),
        },
        filterCell: null,
        cell: ({ row }) => <span className="text-xs">{row.updatedOn}</span>,
      },
      {
        id: "updatedBy",
        layout: { width: 14, unit: "%"},
        header: {
          kind: "sort",
          text: t("UPDATED_BY"),
          onSort: () => onSortColumn("updatedBy"),
          sortIcon: getDatawarehouseSortIcon("updatedBy", listSort),
          sortAriaLabel: t("SORT_BY_LABEL").replace("{label}", t("UPDATED_BY")),
        },
        filterCell: null,
        cell: ({ row }) => <span className="text-xs">{row.updatedBy}</span>,
      },
      {
        id: "actions",
        layout: DUAL_ACTION_COLUMN_LAYOUT,
        header: dualActionColumnHeader(t("ACTION", "Action")),
        ...dualActionColumnThExtras(),
        filterCell: null,
        cell: ({ row }) => (
          <TableActionButton
            rowId={row.id}
            isMenuOpen={activeActionRowId === row.id}
            onToggleMenu={(rowId) =>
              setActiveActionRowId((prev) => (prev === rowId ? null : rowId))
            }
            onCloseMenu={() => setActiveActionRowId(null)}
            onOpen={handleOpenOverview}
            onEdit={canUpdate ? openEditDrawer : undefined}
            onDelete={canDelete ? handleDelete : undefined}
            onGenerateSqlDump={canUpdate ? handleGenerateSqlDump : undefined}
            onDownloadSqlDump={
              canDownloadSqlDump && row.hasSqlDump ? handleDownloadSqlDump : undefined
            }
          />
        ),
      },
    ],
    [t, listSort, activeActionRowId, canUpdate, canDelete, canDownloadSqlDump, locale, router, rows, onSortColumn]
  );

  const openCreateDrawer = () => {
    setDrawerMode("create");
    setEditingRowId(null);
    setDrawerInitialValues(EMPTY_VALUES);
    setDrawerOpen(true);
  };

  function openEditDrawer(rowId: string) {
    const row = rows.find((entry) => entry.id === rowId);
    if (!row) return;
    setDrawerMode("edit");
    setEditingRowId(rowId);
    const mappedType = mapDbSourceTypeToUiType(row.datawarehouseType);
    setDrawerInitialValues({
      connectionName: row.name,
      datawarehouseType: mappedType,
      port: getPortByUiType(mappedType),
      hostAddress: row.hostAddress || "",
      datawarehouseName: row.databaseName || row.name.replace(/\s+/g, ""),
      username: row.username || (row.updatedBy === "-" ? "" : row.updatedBy),
      password: "",
      standalone: false,
    });
    setDrawerOpen(true);
    setActiveActionRowId(null);
  }

  function handleOpenOverview(rowId: string) {
    router.push(buildLocaleAppPath(locale, "overview", rowId));
  }

  function handleDelete(rowId: string) {
    setActiveActionRowId(null);
    setDeleteConfirmRowId(rowId);
  }

  const handleGenerateSqlDump = async (rowId: string) => {
    if (generatingSqlDumpRowId) return;
    setActiveActionRowId(null);
    setGeneratingSqlDumpRowId(rowId);
    try {
      const result = await generateSqlDump(rowId);
      if (result.ok) {
        toast.success(result.message ?? t("EXPORT_SUCCESS"));
        await loadDatawarehouses();
      } else {
        toast.error(result.message || t("REQUEST_FAILED"));
      }
    } catch {
      toast.error(t("REQUEST_FAILED"));
    } finally {
      setGeneratingSqlDumpRowId(null);
    }
  };

  const handleDownloadSqlDump = (rowId: string) => {
    setActiveActionRowId(null);
    downloadSqlDump(rowId);
  };

  const handleDeleteConfirm = async () => {
    if (!deleteConfirmRowId) return;
    setIsDeleting(true);
    try {
      const result = await deleteDatawarehouse(deleteConfirmRowId);
      if (!result.success) {
        toast.error(result.err_message ?? t("DELETE_FAILED_DATAWAREHOUSE"));
        return;
      }
      setDeleteConfirmRowId(null);
      toast.success(t("DELETE_SUCCESS_DATAWAREHOUSE"));
      await loadDatawarehouses();
    } finally {
      setIsDeleting(false);
    }
  };

  const handleSaveDrawer = async (values: DatawarehouseFormValues) => {
    if (isSaving || isTestingConnection) return;

    const missingFields = getMissingRequiredFields(values);
    if (missingFields.length > 0) {
      toast.error(
        t("FILL_REQUIRED_FIELDS_DATAWAREHOUSE").replace("{fields}", missingFields.join(", "))
      );
      return;
    }

    setIsSaving(true);
    try {
      if (drawerMode === "create") {
        if (values.standalone) {
          const createPayload = {
            db_connection_name: values.connectionName.trim(),
            db_database: values.datawarehouseName.trim(),
            db_host: values.hostAddress.trim(),
            db_login: values.username.trim(),
            db_password: values.password,
            db_port: Number(values.port),
            db_source: mapUiTypeToDbSourceType(values.datawarehouseType),
          };
          const result = await createDatawarehouseNew(createPayload);
          if (!result.success) {
            toast.error(result.err_message ?? t("CREATE_FAILED_DATAWAREHOUSE"));
            return;
          }
          setDrawerOpen(false);
          setActiveActionRowId(null);
          toast.success(t("CREATE_SUCCESS_DATAWAREHOUSE"));
          await loadDatawarehouses();
          return;
        }

        const createPayload = buildCreateExistingPayload(values);
        const result = await createDatawarehouseExisting(createPayload);
        if (!result.success) {
          toast.error(result.err_message ?? t("CREATE_FAILED_DATAWAREHOUSE"));
          return;
        }
        setDrawerOpen(false);
        setActiveActionRowId(null);
        toast.success(
          t("CREATE_CONNECT_SUCCESS_DATAWAREHOUSE")
        );
        await loadDatawarehouses();
        return;
      }

      if (!editingRowId) {
        toast.error(t("UPDATE_RESOLVE_ERROR_DATAWAREHOUSE"));
        return;
      }

      const existing = rows.find((row) => row.id === editingRowId);
      const updatePayload: UpdateDatawarehousePayload = {
        dw_connection_name: values.connectionName.trim() || existing?.name || "",
        db_source_type:
          mapUiTypeToDbSourceType(values.datawarehouseType) ||
          existing?.datawarehouseType ||
          DEFAULT_DATAWAREHOUSE.dbSourceType,
        db_host_address: values.hostAddress.trim() || existing?.hostAddress || "",
        db_user: values.username.trim() || existing?.username || "",
        db_password: values.password,
        db_port: values.port.trim() || existing?.port || "",
        db_database: values.datawarehouseName.trim() || existing?.databaseName || "",
        dw_default_language: existing?.defaultLanguage || "en",
        is_active: existing?.isActive ?? true,
        dw_metadata_desc: existing?.dwMetadataDesc || "",
        modified_user_id: existing?.modifiedUserId ?? 0,
        dw_data_count: existing?.dwDataCount ?? 0,
        dw_area_count: existing?.dwAreaCount ?? 0,
        dw_ind_count: existing?.dwIndCount ?? 0,
        dw_ius_count: existing?.dwIusCount ?? 0,
        dw_time_count: existing?.dwTimeCount ?? 0,
      };
      const result = await updateDatawarehouse(editingRowId, updatePayload);
      if (!result.success) {
        toast.error(result.err_message ?? t("UPDATE_FAILED_DATAWAREHOUSE"));
        return;
      }
      setDrawerOpen(false);
      setActiveActionRowId(null);
      setEditingRowId(null);
      toast.success(t("UPDATE_SUCCESS_DATAWAREHOUSE"));
      await loadDatawarehouses();
    } finally {
      setIsSaving(false);
    }
  };

  const handleTestConnection = async (values: DatawarehouseFormValues) => {
    if (isSaving || isTestingConnection) return;

    if (values.standalone) {
      return;
    }

    const missingFields = getMissingRequiredFields(values);
    if (missingFields.length > 0) {
      toast.error(
        t("FILL_REQUIRED_FIELDS_DATAWAREHOUSE").replace("{fields}", missingFields.join(", "))
      );
      return;
    }

    setIsTestingConnection(true);
    try {
      const payload = buildCreateExistingPayload(values);
      const result = await createDatawarehouseExisting(payload, {
        test_connection_only: true,
      });

      if (!result.success) {
        toast.error(result.err_message ?? t("TEST_FAILED"));
        return;
      }

      const testData = extractDatawarehouseConnectionTestData(result);
      if (testData?.connected === false) {
        toast.error(testData.message ?? t("TEST_FAILED"));
        return;
      }

      if (testData?.connected === true) {
        toast.success(testData.message ?? result.message ?? t("TEST_SUCCESS"));
        return;
      }

      toast.success(result.message ?? t("TEST_COMPLETED"));
    } finally {
      setIsTestingConnection(false);
    }
  };

  const showTestConnectionButton = (drawerMode === "create" || drawerMode === "edit") && !drawerValues.standalone;

  return (
    <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-surface-muted">
      <Breadcrumb
        onAddClick={canCreate ? openCreateDrawer : undefined}
        searchValue={searchQuery}
        onSearchChange={setSearchQuery}
      />

      <div className="flex min-h-0 flex-1 min-w-0 flex-col">
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-md">
          <div className="h-full min-h-0 flex-1">
            <InlineEditableTable
              wrapClassName="tbl-wrap tbl-wrap--compact-th h-full min-h-0"
              tableClassName="w-full tv-grid-table"
              gridColumns={columns as EditableGridColumnDef<unknown>[]}
              disableGlobalArrowNavigation
              loading={loading}
              thead={
                <thead>
                  <EditableDataGridThead columns={columns} showFilterRow={false} />
                </thead>
              }
              tbody={
                <ServerDrivenListTbody<DatawarehouseTableRow>
                  colSpan={columns.length}
                  rows={paginatedRows}
                  columns={columns}
                  getRowId={(row) => row.id}
                  editingRowId={null}
                  emptyMessage="No records available."
                  showLoadingRow={false}
                  showEmptyRow={!loading && paginatedRows.length === 0}
                  showDataRows={!loading}
                  getRowClassName={(row) =>
                    [
                      drawerOpen && drawerMode === "edit" && editingRowId === row.id
                        ? "settings-active"
                        : "",
                      activeActionRowId === row.id ? "selected relative z-40" : "",
                    ]
                      .filter(Boolean)
                      .join(" ")
                  }
                  trProps={
                    canUpdate
                      ? (row) =>
                          gridConfigPanelRowTrProps({
                            panelOpen: drawerOpen && drawerMode === "edit",
                            isActiveRow: editingRowId === row.id,
                            onSwitchRow: () => openEditDrawer(row.id),
                          })
                      : undefined
                  }
                />
              }
              pagination={{
                page,
                pageSize,
                totalPages,
                totalCount,
                onPageChange: setPage,
                onPageSizeChange: setPageSize,
                countNoun: t("LABEL_DATAWAREHOUSE"),
                pageSummaryClassName: "mx-1 min-w-[90px] text-center",
              }}
            />
          </div>
        </div>
      </div>

      <Drawer
        open={drawerOpen}
        width="30%"
        title={drawerMode === "edit" ? t("EDIT_TITLE_DATAWAREHOUSE") : t("ADD_TITLE_DATAWAREHOUSE")}
        closeOnOverlayClick={drawerMode !== "edit"}
        allowBackgroundInteraction={drawerOpen && drawerMode === "edit"}
        onClose={() => {
          setDrawerOpen(false);
          setActiveActionRowId(null);
          setEditingRowId(null);
        }}
        footer={
          <div className="space-y-3">
            {!editingRowId && (
              <div className="add-row-prompt-shell bg-[color:color-mix(in_srgb,var(--color-primary)_6%,var(--color-surface))] px-3 py-2.5">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold text-text">{t("STANDALONE_TITLE")}</p>
                    <p className="text-xs text-text-muted">{t("STANDALONE_DESC")}</p>
                  </div>
                  <ToggleSwitch
                    size="md"
                    appearance="rounded"
                    checked={drawerValues.standalone}
                    onCheckedChange={(next) =>
                      setDrawerValues((prev) => ({ ...prev, standalone: next }))
                    }
                    aria-label={t("DW_STANDALONE_TOGGLE_ARIA")}
                  />
                </div>
              </div>
            )}

            <div
              className={`flex flex-wrap items-center gap-2 ${showTestConnectionButton ? "justify-between" : "justify-end"}`}
            >
              {showTestConnectionButton && (
                <button
                  type="button"
                  onClick={() => void handleTestConnection(drawerValues)}
                  disabled={isTestingConnection || isSaving}
                  className="btn-comp-secondary btn-comp--comfortable shrink-0 gap-1.5 !text-xs font-medium text-primary disabled:opacity-70"
                >
                  {isTestingConnection ? (
                    <>
                      <span
                        className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent"
                        aria-hidden
                      />
                      {t("TESTING")}
                    </>
                  ) : (
                    <>
                      <span className="material-icons !text-xs leading-none" aria-hidden>
                        science
                      </span>
                      {t("TEST_CONNECTION")}
                    </>
                  )}
                </button>
              )}
              <div className="flex flex-wrap items-center justify-end gap-2">
                <SecondaryButton
                  type="button"
                  variant="modal"
                  onClick={() => {
                    setDrawerOpen(false);
                    setActiveActionRowId(null);
                    setEditingRowId(null);
                  }}
                >
                  {t("CANCEL")}
                </SecondaryButton>
                {isSaving ? (
                  <button
                    type="button"
                    className="btn-comp-primary btn-comp--comfortable gap-1.5 !text-xs font-semibold"
                    disabled
                  >
                    <span
                      className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent"
                      aria-hidden
                    />
                    {drawerMode === "edit" ? t("UPDATING") : t("SAVING")}
                  </button>
                ) : (
                  <PrimarySaveButton
                    className="btn-comp--comfortable !text-xs font-semibold"
                    disabled={isTestingConnection}
                    onClick={() => void handleSaveDrawer(drawerValues)}
                  >
                    {drawerMode === "edit" ? t("UPDATE") : t("SAVE")}
                  </PrimarySaveButton>
                )}
              </div>
            </div>
          </div>
        }
      >
        <div className="grid grid-cols-2 gap-x-4 gap-y-3">
          <label className="col-span-2 flex min-w-0 flex-col gap-1.5">
            {requiredLabel(t("FIELD_CONNECTION_NAME_DATAWAREHOUSE"))}
            <TextField
              fieldSize="md"
              value={drawerValues.connectionName}
              onChange={(e) =>
                setDrawerValues((prev) => ({ ...prev, connectionName: e.target.value }))
              }
              placeholder={t("DW_PLACEHOLDER_CONNECTION_NAME")}
              autoComplete="off"
            />
          </label>

          <label className="flex min-w-0 flex-col gap-1.5">
            {requiredLabel(t("DW_FIELD_TYPE"))}
            <SelectField
              className="w-full min-w-0"
              menuPortal
              value={drawerValues.datawarehouseType}
              onChange={(e) => {
                const selectedType = e.target.value;
                setDrawerValues((prev) => ({
                  ...prev,
                  datawarehouseType: selectedType,
                  port: getPortByUiType(selectedType),
                }));
              }}
              options={DATAWAREHOUSE_DICTIONARY.map((entry) => ({
                value: entry.uiType,
                label: entry.uiType,
              }))}
            />
          </label>

          <label className="flex min-w-0 flex-col gap-1.5">
            {requiredLabel(t("PORT"))}
            <TextField
              fieldSize="md"
              value={drawerValues.port}
              onChange={(e) =>
                setDrawerValues((prev) => ({ ...prev, port: e.target.value }))
              }
              inputMode="numeric"
              autoComplete="off"
            />
          </label>

          <label className="flex min-w-0 flex-col gap-1.5">
            {requiredLabel(t("HOST_ADDRESS"))}
            <TextField
              fieldSize="md"
              value={drawerValues.hostAddress}
              onChange={(e) =>
                setDrawerValues((prev) => ({ ...prev, hostAddress: e.target.value }))
              }
              placeholder={t("DW_PLACEHOLDER_HOST")}
              autoComplete="off"
            />
          </label>

          <label className="flex min-w-0 flex-col gap-1.5">
            {requiredLabel(t("DATAWAREHOUSE_NAME"))}
            <TextField
              fieldSize="md"
              value={drawerValues.datawarehouseName}
              onChange={(e) =>
                setDrawerValues((prev) => ({ ...prev, datawarehouseName: e.target.value }))
              }
              placeholder={t("DW_PLACEHOLDER_DATABASE")}
              autoComplete="off"
            />
          </label>

          <label className="flex min-w-0 flex-col gap-1.5">
            {requiredLabel(t("USERNAME"))}
            <TextField
              fieldSize="md"
              value={drawerValues.username}
              onChange={(e) =>
                setDrawerValues((prev) => ({ ...prev, username: e.target.value }))
              }
              placeholder={t("USERNAME_PLACEHOLDER")}
              autoComplete="username"
            />
          </label>

          <label className="flex min-w-0 flex-col gap-1.5">
            {requiredLabel(t("PASSWORD"))}
            <TextField
              fieldSize="md"
              type="password"
              value={drawerValues.password}
              onChange={(e) =>
                setDrawerValues((prev) => ({ ...prev, password: e.target.value }))
              }
              placeholder={t("PASSWORD_PLACEHOLDER")}
              autoComplete="new-password"
            />
          </label>
        </div>
      </Drawer>

      <DeletePermanentConfirmModal
        open={deleteConfirmRowId != null}
        onClose={() => {
          if (isDeleting) return;
          setDeleteConfirmRowId(null);
        }}
        title={t("DELETE_PERMANENTLY")}
        titleId="dm-datawarehouse-delete-confirm-title"
        closeAriaLabel={t("CLOSE")}
        dismissDisabled={isDeleting}
        cancelLabel={t("CANCEL")}
        onCancel={() => setDeleteConfirmRowId(null)}
        confirmLabel={t("DELETE_PERMANENTLY")}
        confirmLoadingLabel={t("DELETING")}
        confirmLoading={isDeleting}
        onConfirm={handleDeleteConfirm}
      >
        <p className="modal-lead text-xs leading-relaxed text-text-muted">
          {t("DELETE_CONFIRM_MESSAGE_DATAWAREHOUSE")}
        </p>
      </DeletePermanentConfirmModal>

    </main>
  );
}
