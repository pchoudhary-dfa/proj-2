"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { toast } from "sonner";
import { useCore } from "@/contexts/CoreContext";
import {
  deleteRequest,
  getRequest,
  patchRequest,
  postRequest,
  putRequest,
} from "@/lib/api/http";
import type {
  CreateUserPayload,
  CreateUserResult,
  DatawarehousesListResponse,
  DeleteUserResult,
  RoleRaw,
  RolesListResponse,
  RolesListResult,
  SaveUserRolesPayload,
  UpdateUserPayload,
  UpdateUserResult,
  UserRaw,
  UserRoleMasterItem,
  UsersListMeta,
  UsersListResponse,
  UsersListResult,
} from "@/lib/api/types";
import {
  getAuthApiUrl,
  getDatawarehousesListUrl,
  getIAMAPIURL,
  IAM_ROLES_PATH,
  IAM_USER_PATH_SEGMENT,
} from "@/lib/constants";
import { hasPermission, APP_ROUTE_PERMISSIONS } from "@/lib/auth/user";
import {
  extractApiValidationMessages,
  isValidUserEmail,
  validateCreateUserClient,
} from "@/lib/validation/userFields";
import {
  EditableDataGridThead,
  InlineEditableTable,
  ServerDrivenListTbody,
  ServerDrivenTable,
  TV_ROW_NEWLY_ADDED_CLASS,
  useServerListQuery,
  type ServerDrivenListAddRowField,
  type ServerListParseResult,
} from "@/components/TableView";
import { Loader } from "@/components/Loader";
import { DeletePermanentConfirmModal } from "@/components/DeletePermanentConfirmModal";
import Drawer from "@/components/Drawer";
import { gridConfigPanelRowTrProps } from "@/components/gridConfigPanelRowClick";
import { MainTabsBar } from "@/components/MainTabsBar";
import { MultiSelectDropdown, type MultiSelectOption } from "@/components/MultiSelectDropdown";
import { PrimarySaveButton } from "@/components/PrimarySaveButton";
import { SelectField } from "@/components/SelectField";
import { gridTextFieldClassName } from "@/components/TextField";
import { TextAreaField } from "@/components/TextAreaField";
import { DEFAULT_TABLE_PAGE_SIZES } from "@/components/TablePaginationFooter";
import {
  userRowId,
  useUsersGridColumns,
  type UserInlineFocusField,
} from "@/components/administration/usersGridColumns";
import { parseListMetaTotals } from "@/lib/gridListMeta";
import {
  TV_COL_PRIMARY_STICKY_TD,
  TV_COL_SELECT_TD,
} from "@/components/editableGridColumnClasses";

const SORT_USERNAME = "username";
const SORT_FIRST_NAME = "first_name";
const SORT_LAST_NAME = "last_name";
const SORT_EMAIL = "email";
const SORT_STATUS = "status";
const SORT_PHONE = "phone";
const SORT_ORGANISATION = "organisation";
const SORT_LOCATION = "location";
const SORT_ROLE_CODE = "role_code";
const SORT_LAST_LOGIN = "last_loggedin_on";
const ROLE_DW_NONE = "__NONE__";

type UsersSortState = {
  columnId: string | null;
  direction: "asc" | "desc" | null;
};

function cycleSort(columnId: string, prev: UsersSortState): UsersSortState {
  if (prev.columnId !== columnId) return { columnId, direction: "asc" };
  if (prev.direction === "asc") return { columnId, direction: "desc" };
  if (prev.direction === "desc") return { columnId: null, direction: null };
  return { columnId, direction: "asc" };
}

function sortIcon(
  columnId: string,
  state: UsersSortState
): "arrow_upward" | "arrow_downward" | "unfold_more" {
  if (state.columnId === columnId && state.direction === "asc") return "arrow_upward";
  if (state.columnId === columnId && state.direction === "desc") return "arrow_downward";
  return "unfold_more";
}

const SORT_COLUMN_TO_FIELD: Record<string, string> = {
  username: SORT_USERNAME,
  first_name: SORT_FIRST_NAME,
  email: SORT_EMAIL,
  status: SORT_STATUS,
  last_loggedin_on: SORT_LAST_LOGIN,
};

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

function isUsersListResponse(r: UsersListResult): r is UsersListResponse {
  return r.success === true && Array.isArray((r as UsersListResponse).data);
}

async function resendRegistrationEmail(email: string): Promise<void> {
  const url = `${getAuthApiUrl()}/resend-registration`;
  await postRequest(url, { email }, undefined, undefined, { suppressErrorMessage: true });
}

async function createUser(
  payload: CreateUserPayload
): Promise<CreateUserResult> {
  const url = getIAMAPIURL("/iam/users");
  const json = await postRequest(
    url,
    [payload] as unknown as Record<string, unknown>,
    undefined,
    undefined,
    { suppressErrorMessage: true }
  );
  return json as CreateUserResult;
}

async function saveUserRoles(
  userId: number,
  payload: SaveUserRolesPayload
): Promise<
  | { success: true; message?: string }
  | { success: false; err_message?: string; errors?: Record<string, unknown> }
> {
  const url = `${getIAMAPIURL("/iam/users")}/${userId}/roles`;
  const json = await putRequest(
    url,
    payload as unknown as Record<string, unknown>,
    undefined,
    undefined,
    { suppressErrorMessage: true }
  );
  return json as
    | { success: true; message?: string }
    | { success: false; err_message?: string; errors?: Record<string, unknown> };
}

async function updateUser(
  userId: number,
  payload: UpdateUserPayload
): Promise<UpdateUserResult> {
  const url = `${getIAMAPIURL("/iam/users")}/${userId}`;
  const json = await patchRequest(
    url,
    payload as unknown as Record<string, unknown>,
    undefined,
    undefined,
    { suppressErrorMessage: true }
  );
  return json as UpdateUserResult;
}

async function deleteUser(userId: number): Promise<DeleteUserResult> {
  const url = `${getIAMAPIURL("/iam/users")}/${userId}`;
  const json = await deleteRequest(url, undefined, undefined, {
    suppressErrorMessage: true,
  });
  return json as DeleteUserResult;
}

async function fetchRolesList(opts?: {
  search?: string;
  page_size?: number;
}): Promise<RoleRaw[]> {
  const params = new URLSearchParams();
  params.set("page", "1");
  params.set("page_size", String(opts?.page_size ?? 500));
  const q = opts?.search?.trim();
  if (q) params.set("search", q);
  const url = `${getIAMAPIURL(IAM_ROLES_PATH)}?${params.toString()}`;
  const json = (await getRequest(url, undefined, {
    suppressErrorMessage: true,
  })) as RolesListResult;
  if (json.success && Array.isArray((json as RolesListResponse).data)) {
    return (json as RolesListResponse).data;
  }
  return [];
}

type DwSelectOption = { id: string; name: string };

async function fetchDwOptions(): Promise<DwSelectOption[]> {
  try {
    const params = new URLSearchParams();
    params.set("limit", "1000");
    params.set("active_only", "true");
    const url = `${getDatawarehousesListUrl()}?${params.toString()}`;
    const json = (await getRequest(url, undefined, {
      suppressErrorMessage: true,
    })) as DatawarehousesListResponse;
    if (json.success !== true || !Array.isArray(json.data)) return [];
    return json.data.map((dw) => ({
      id: String(dw.id),
      name: dw.dw_connection_name,
    }));
  } catch (err) {
    console.error("Failed to fetch DW options:", err);
  }
  return [];
}

/** Role codes for one user from GET /iam/user (with dw_id when a warehouse is selected, omit dw_id for global / “No selection”). */
async function fetchUserRoleCodesFromUserList(
  userId: number,
  dwId: string | null
): Promise<{
  codes: string[];
  roleMeta: Record<string, UserRoleMasterItem>;
}> {
  const params = new URLSearchParams();
  if (dwId) {
    params.set("dw_id", dwId);
  }
  params.set("page", "1");
  params.set("page_size", "500");
  const url = `${getIAMAPIURL(IAM_USER_PATH_SEGMENT)}?${params}`;
  const json = (await getRequest(url, undefined, {
    suppressErrorMessage: true,
  })) as UsersListResult;
  if (!isUsersListResponse(json)) return { codes: [], roleMeta: {} };
  const row = json.data.find((u) => u.id === userId);
  return {
    codes: row?.roles ?? [],
    roleMeta: json.meta?.roles ?? {},
  };
}

function roleCodesToCheckedIds(
  codes: string[],
  roleMeta: Record<string, UserRoleMasterItem>,
  allRolesList: RoleRaw[]
): Set<number> {
  const ids = new Set<number>();
  for (const code of codes) {
    const mid = roleMeta[code]?.id;
    if (mid != null) ids.add(mid);
  }
  for (const role of allRolesList) {
    if (codes.includes(role.role_code)) ids.add(role.id);
  }
  return ids;
}

function sortAssignedRoleIds(ids: Set<number>, allRolesList: RoleRaw[]): number[] {
  const order = new Map(allRolesList.map((r) => [r.id, r.display_order]));
  return [...ids].sort(
    (a, b) =>
      (order.get(a) ?? 999_999) - (order.get(b) ?? 999_999) || a - b
  );
}

function buildRoleGroupsByDw(
  roleIds: number[],
  roleDwSelections: Record<number, string[]>
): Record<string, number[]> {
  const grouped = new Map<string, Set<number>>();
  for (const roleId of roleIds) {
    const dwSelections = roleDwSelections[roleId] ?? [];
    const uniqueSelections = [...new Set(dwSelections)];
    const concreteSelections = uniqueSelections.filter((id) => id !== ROLE_DW_NONE);
    const normalizedSelections = concreteSelections.length > 0
      ? concreteSelections
      : [ROLE_DW_NONE];
    for (const dwSelection of normalizedSelections) {
      const key = dwSelection === ROLE_DW_NONE ? ROLE_DW_NONE : dwSelection;
      const existing = grouped.get(key) ?? new Set<number>();
      existing.add(roleId);
      grouped.set(key, existing);
    }
  }
  const out: Record<string, number[]> = {};
  for (const [key, values] of grouped.entries()) {
    out[key] = [...values];
  }
  return out;
}

type UsersAdminTabProps = {
  onDeleteStateChange: (disabled: boolean, handler: () => void) => void;
};

export default function UsersAdminTab({ onDeleteStateChange }: UsersAdminTabProps) {
  const { t } = useCore();

  const canCreate = hasPermission(APP_ROUTE_PERMISSIONS.administration.users.crud, "C");
  const canUpdate = hasPermission(APP_ROUTE_PERMISSIONS.administration.users.crud, "U");
  const canDelete = hasPermission(APP_ROUTE_PERMISSIONS.administration.users.crud, "D");
  const canManageRoles = hasPermission(APP_ROUTE_PERMISSIONS.administration.users.drawer, "R");
  const tblScrollRef = useRef<HTMLDivElement>(null);
  const addRowRef = useRef<HTMLTableRowElement>(null);
  const inlineUsernameInputRef = useRef<HTMLInputElement>(null);
  const inlineFirstNameInputRef = useRef<HTMLInputElement>(null);
  const inlinePhoneInputRef = useRef<HTMLInputElement>(null);
  const inlineOrganisationInputRef = useRef<HTMLInputElement>(null);
  const inlineLocationInputRef = useRef<HTMLInputElement>(null);
  const pendingInlineFocusRef = useRef<UserInlineFocusField | null>(null);

  // ── Pagination, sort, filter ─────────────────────────────────────────────
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(DEFAULT_TABLE_PAGE_SIZES[0]);
  const [listSort, setListSort] = useState<UsersSortState>({
    columnId: null,
    direction: null,
  });

  const [colFilterUsername, setColFilterUsername] = useState("");
  const [colFilterFirstName, setColFilterFirstName] = useState("");
  const [colFilterLastName, setColFilterLastName] = useState("");
  const [colFilterEmail, setColFilterEmail] = useState("");
  const [colFilterStatus, setColFilterStatus] = useState("");
  const [colFilterPhone, setColFilterPhone] = useState("");
  const [colFilterOrganisation, setColFilterOrganisation] = useState("");
  const [colFilterLocation, setColFilterLocation] = useState("");
  const [colFilterRoles, setColFilterRoles] = useState("");

  const clearOtherColFilters = useCallback(
    (except?: keyof {
      username: true;
      firstName: true;
      lastName: true;
      email: true;
      status: true;
      phone: true;
      organisation: true;
      location: true;
      roles: true;
    }) => {
      if (except !== "username") setColFilterUsername("");
      if (except !== "firstName") setColFilterFirstName("");
      if (except !== "lastName") setColFilterLastName("");
      if (except !== "email") setColFilterEmail("");
      if (except !== "status") setColFilterStatus("");
      if (except !== "phone") setColFilterPhone("");
      if (except !== "organisation") setColFilterOrganisation("");
      if (except !== "location") setColFilterLocation("");
      if (except !== "roles") setColFilterRoles("");
    },
    []
  );

  const activeSearch =
    colFilterUsername ||
    colFilterFirstName ||
    colFilterLastName ||
    colFilterEmail ||
    colFilterStatus ||
    colFilterPhone ||
    colFilterOrganisation ||
    colFilterLocation ||
    colFilterRoles;

  const activeSearchBy = colFilterUsername
    ? SORT_USERNAME
    : colFilterFirstName
      ? SORT_FIRST_NAME
      : colFilterLastName
        ? SORT_LAST_NAME
        : colFilterEmail
          ? SORT_EMAIL
          : colFilterStatus
            ? SORT_STATUS
            : colFilterPhone
              ? SORT_PHONE
              : colFilterOrganisation
                ? SORT_ORGANISATION
                : colFilterLocation
                  ? SORT_LOCATION
                  : colFilterRoles
                    ? SORT_ROLE_CODE
                    : null;

  const debouncedSearch = useDebounce(activeSearch, 300);
  const debouncedSearchBy = useDebounce(activeSearchBy, 300);

  const handleColFilterUsername = useCallback(
    (v: string) => {
      setColFilterUsername(v);
      clearOtherColFilters("username");
    },
    [clearOtherColFilters]
  );
  const handleColFilterFirstName = useCallback(
    (v: string) => {
      setColFilterFirstName(v);
      clearOtherColFilters("firstName");
    },
    [clearOtherColFilters]
  );
  const handleColFilterLastName = useCallback(
    (v: string) => {
      setColFilterLastName(v);
      clearOtherColFilters("lastName");
    },
    [clearOtherColFilters]
  );
  const handleColFilterEmail = useCallback(
    (v: string) => {
      setColFilterEmail(v);
      clearOtherColFilters("email");
    },
    [clearOtherColFilters]
  );
  const handleColFilterStatus = useCallback(
    (v: string) => {
      setColFilterStatus(v);
      clearOtherColFilters("status");
    },
    [clearOtherColFilters]
  );
  const handleColFilterPhone = useCallback(
    (v: string) => {
      setColFilterPhone(v);
      clearOtherColFilters("phone");
    },
    [clearOtherColFilters]
  );
  const handleColFilterOrganisation = useCallback(
    (v: string) => {
      setColFilterOrganisation(v);
      clearOtherColFilters("organisation");
    },
    [clearOtherColFilters]
  );
  const handleColFilterLocation = useCallback(
    (v: string) => {
      setColFilterLocation(v);
      clearOtherColFilters("location");
    },
    [clearOtherColFilters]
  );
  const handleColFilterRoles = useCallback(
    (v: string) => {
      setColFilterRoles(v);
      clearOtherColFilters("roles");
    },
    [clearOtherColFilters]
  );

  // ── Selection ────────────────────────────────────────────────────────────
  const [selectedRowIds, setSelectedRowIds] = useState<Set<string>>(new Set());

  // ── Create user form fields ─────────────────────────────────────────────
  const [newFirstName, setNewFirstName] = useState("");
  const [newLastName, setNewLastName] = useState("");
  const [newUsername, setNewUsername] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [addSaving, setAddSaving] = useState(false);
  const [addRowExpanded, setAddRowExpanded] = useState(false);
  const addRowUsernameInputRef = useRef<HTMLInputElement>(null);
  const addRowFirstNameInputRef = useRef<HTMLInputElement>(null);
  const addRowLastNameInputRef = useRef<HTMLInputElement>(null);
  const addRowEmailInputRef = useRef<HTMLInputElement>(null);

  // ── Config panel (user details + role assignment) ────────────────────────
  const [configPanelOpen, setConfigPanelOpen] = useState(false);
  const configPanelOpenRef = useRef(false);
  useEffect(() => {
    configPanelOpenRef.current = configPanelOpen;
  }, [configPanelOpen]);
  const [configPanelUser, setConfigPanelUser] = useState<UserRaw | null>(null);
  const [allRoles, setAllRoles] = useState<RoleRaw[]>([]);
  const [rolesLoading, setRolesLoading] = useState(false);
  /** Role ids selected in the Roles tab. */
  const [stagedRoleIds, setStagedRoleIds] = useState<number[]>([]);
  const [rolesSaving, setRolesSaving] = useState(false);
  const [panelRolesLoading, setPanelRolesLoading] = useState(false);
  const [dwOptions, setDwOptions] = useState<DwSelectOption[]>([]);

  // ── Drawer tab + General-tab edit state ──────────────────────────────────
  const [drawerTab, setDrawerTab] = useState<"general" | "roles">("general");
  const [panelFirstName, setPanelFirstName] = useState("");
  const [panelLastName, setPanelLastName] = useState("");
  const [panelUsername, setPanelUsername] = useState("");
  const [panelEmail, setPanelEmail] = useState("");
  const [panelPhone, setPanelPhone] = useState("");
  const [panelOrganization, setPanelOrganization] = useState("");
  const [panelLocation, setPanelLocation] = useState("");
  const [panelStatus, setPanelStatus] = useState<number>(1);
  const [panelGeneralSaving, setPanelGeneralSaving] = useState(false);

  // ── Roles tab: per-role DW multiselect mapping + popup state ────────────
  const [rolesDwMap, setRolesDwMap] = useState<Record<number, string[]>>({});
  const [initialRoleGroupsByDw, setInitialRoleGroupsByDw] = useState<Record<string, number[]>>({});
  const [openDwRoleId, setOpenDwRoleId] = useState<number | null>(null);
  const [roleDwSearchMap, setRoleDwSearchMap] = useState<Record<number, string>>({});

  // ── Inline grid edit state ───────────────────────────────────────────────
  const [editingRowId, setEditingRowId] = useState<string | null>(null);
  const [inlineUsername, setInlineUsername] = useState("");
  const [inlineFirstName, setInlineFirstName] = useState("");
  const [inlineLastName, setInlineLastName] = useState("");
  const [inlineEmail, setInlineEmail] = useState("");
  const [inlineStatus, setInlineStatus] = useState<number>(1);
  const [inlinePhone, setInlinePhone] = useState("");
  const [inlineOrganisation, setInlineOrganisation] = useState("");
  const [inlineLocation, setInlineLocation] = useState("");
  const [inlineSaveLoading, setInlineSaveLoading] = useState(false);

  // ── Delete modal ─────────────────────────────────────────────────────────
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [rowsToDelete, setRowsToDelete] = useState<UserRaw[]>([]);
  const [deletingUsers, setDeletingUsers] = useState(false);

  // ── Recently created row highlight ───────────────────────────────────────
  const RECENT_CREATED_ROW_HIGHLIGHT_MS = 4500;
  const [recentCreatedRowIds, setRecentCreatedRowIds] = useState<string[]>([]);
  useEffect(() => {
    if (recentCreatedRowIds.length === 0) return;
    const snapshot = [...recentCreatedRowIds];
    const id = window.setTimeout(() => {
      setRecentCreatedRowIds((prev) =>
        prev.filter((k) => !snapshot.includes(k))
      );
    }, RECENT_CREATED_ROW_HIGHLIGHT_MS);
    return () => window.clearTimeout(id);
  }, [recentCreatedRowIds]);
  const recentCreatedRowIdSet = useMemo(
    () => new Set(recentCreatedRowIds),
    [recentCreatedRowIds]
  );

  const [activeRowId, setActiveRowId] = useState<string | null>(null);

  useEffect(() => {
    const onArrowNavigation = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
      if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
      if (event.target instanceof HTMLElement) {
        const isInputTarget =
          event.target.closest(
            "input, textarea, select, button, [contenteditable='true'], [role='textbox'], [role='combobox']"
          ) != null;
        if (isInputTarget) return;
      }
      setActiveRowId(null);
    };
    document.addEventListener("keydown", onArrowNavigation);
    return () => {
      document.removeEventListener("keydown", onArrowNavigation);
    };
  }, []);

  // ── Server-driven list ───────────────────────────────────────────────────

  const searchParam = useMemo(() => {
    const s = debouncedSearch.trim();
    return s || undefined;
  }, [debouncedSearch]);

  const searchByParam = useMemo(
    () => (searchParam ? debouncedSearchBy ?? undefined : undefined),
    [searchParam, debouncedSearchBy]
  );

  const listUrl = useMemo(
    () => getIAMAPIURL(IAM_USER_PATH_SEGMENT),
    []
  );

  const parseListResponse = useCallback(
    (json: unknown): ServerListParseResult<UserRaw, UsersListMeta> => {
      const r = json as UsersListResult;
      if (!isUsersListResponse(r)) {
        const msg =
          typeof (r as { err_message?: string })?.err_message === "string"
            ? (r as { err_message: string }).err_message
            : "Failed to load users";
        return { ok: false, message: msg };
      }
      const totals = parseListMetaTotals(r.meta);
      return {
        ok: true,
        rows: r.data,
        ...totals,
        meta: r.meta,
      };
    },
    []
  );

  const listQuery = useMemo(() => {
    const sort_field =
      listSort.direction != null && listSort.columnId != null
        ? SORT_COLUMN_TO_FIELD[listSort.columnId]
        : undefined;
    const sort_order =
      listSort.direction != null && sort_field != null
        ? listSort.direction
        : undefined;
    return {
      page,
      page_size: pageSize,
      ...(sort_field != null && sort_order != null
        ? { sort_field, sort_order }
        : {}),
      ...(searchParam
        ? { search: searchParam, ...(searchByParam ? { search_by: searchByParam } : {}) }
        : {}),
    };
  }, [
    page,
    pageSize,
    listSort.columnId,
    listSort.direction,
    searchParam,
    searchByParam,
  ]);

  const listState = useServerListQuery({
    listUrl,
    query: listQuery,
    parseListResponse,
    enabled: Boolean(listUrl),
  });

  const { rows: serverRows, loading, meta } = listState;
  const [rows, setRows] = useState<UserRaw[]>([]);
  useEffect(() => { setRows(serverRows); }, [serverRows]);

  const [localTotalCount, setLocalTotalCount] = useState<number>(0);
  const [localTotalCountUnfiltered, setLocalTotalCountUnfiltered] = useState<
    number | undefined
  >(undefined);
  useEffect(() => {
    if (typeof listState.totalCount === "number") {
      setLocalTotalCount(listState.totalCount);
    }
    setLocalTotalCountUnfiltered(listState.totalCountUnfiltered);
  }, [listState.totalCount, listState.totalCountUnfiltered]);
  const localTotalPages =
    pageSize > 0 ? Math.max(0, Math.ceil(localTotalCount / pageSize)) : 0;

  // ── Sort handlers ────────────────────────────────────────────────────────
  const onSortUsername = useCallback(() => {
    setPage(1);
    setListSort((prev) => cycleSort("username", prev));
  }, []);
  const onSortFirstName = useCallback(() => {
    setPage(1);
    setListSort((prev) => cycleSort("first_name", prev));
  }, []);
  const onSortEmail = useCallback(() => {
    setPage(1);
    setListSort((prev) => cycleSort("email", prev));
  }, []);
  const onSortStatus = useCallback(() => {
    setPage(1);
    setListSort((prev) => cycleSort("status", prev));
  }, []);
  const onSortLastLogin = useCallback(() => {
    setPage(1);
    setListSort((prev) => cycleSort("last_loggedin_on", prev));
  }, []);

  const sortIconUsername = useMemo(() => sortIcon("username", listSort), [listSort]);
  const sortIconFirstName = useMemo(() => sortIcon("first_name", listSort), [listSort]);
  const sortIconEmail = useMemo(() => sortIcon("email", listSort), [listSort]);
  const sortIconStatus = useMemo(() => sortIcon("status", listSort), [listSort]);
  const sortIconLastLogin = useMemo(() => sortIcon("last_loggedin_on", listSort), [listSort]);

  // ── Selection helpers ────────────────────────────────────────────────────
  const selectAll = useCallback(() => {
    setSelectedRowIds((prev) => {
      const ids = rows.map(userRowId).filter(Boolean);
      if (ids.length > 0 && ids.every((id) => prev.has(id))) {
        return new Set();
      }
      return new Set(ids);
    });
  }, [rows]);

  const toggleSelect = useCallback((id: string) => {
    setSelectedRowIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const clearSelection = useCallback(() => setSelectedRowIds(new Set()), []);

  // ── Config panel helpers ──────────────────────────────────────────────────

  const ensureRolesLoaded = useCallback(() => {
    if (allRoles.length > 0) return;
    setRolesLoading(true);
    fetchRolesList({ page_size: 500 })
      .then((roles) => setAllRoles(roles))
      .catch(() => {})
      .finally(() => setRolesLoading(false));
  }, [allRoles.length]);

  const dwOptionsLoadedRef = useRef(false);
  const ensureDwOptionsLoaded = useCallback(() => {
    if (dwOptionsLoadedRef.current) return;
    dwOptionsLoadedRef.current = true;
    fetchDwOptions()
      .then((opts) => setDwOptions(opts))
      .catch(() => { dwOptionsLoadedRef.current = false; });
  }, []);

  const openConfigPanel = useCallback(
    (row: UserRaw) => {
      const wasAlreadyOpen = configPanelOpenRef.current;
      setConfigPanelUser(row);
      setConfigPanelOpen(true);
      if (!wasAlreadyOpen) {
        setDrawerTab("general");
      }
      setPanelFirstName(row.first_name ?? "");
      setPanelLastName(row.last_name ?? "");
      setPanelUsername(row.username ?? "");
      setPanelEmail(row.email ?? "");
      setPanelPhone(row.phone ?? "");
      setPanelOrganization(row.organisation ?? "");
      setPanelLocation(row.location ?? "");
      setPanelStatus(row.status ?? 1);
      setRolesDwMap({});
      setInitialRoleGroupsByDw({});
      setRoleDwSearchMap({});
      ensureRolesLoaded();
      ensureDwOptionsLoaded();
    },
    [ensureRolesLoaded, ensureDwOptionsLoaded]
  );

  const handleResendRegistrationEmail = useCallback(
    async (user: UserRaw) => {
      try {
        await resendRegistrationEmail(user.email);
        toast.success(t("RESEND_REGISTRATION_EMAIL_SUCCESS", "Registration email resent successfully"));
      } catch {
        toast.error(t("RESEND_REGISTRATION_EMAIL_ERROR", "Failed to resend registration email"));
      }
    },
    [t]
  );

  const closeConfigPanel = useCallback(() => {
    setConfigPanelOpen(false);
    setConfigPanelUser(null);
    setPanelRolesLoading(false);
    setStagedRoleIds([]);
    setOpenDwRoleId(null);
    setDrawerTab("general");
    setPanelGeneralSaving(false);
    setRolesDwMap({});
    setInitialRoleGroupsByDw({});
    setRoleDwSearchMap({});
  }, []);

  const allRolesSortedPreview = useMemo(
    () =>
      [...allRoles].sort(
        (a, b) => a.display_order - b.display_order || a.id - b.id
      ),
    [allRoles]
  );

  const dwRoleOptions = useMemo<MultiSelectOption[]>(
    () => dwOptions.map((opt) => ({ value: opt.id, label: opt.name })),
    [dwOptions]
  );

  const addRolesToStaged = useCallback(
    (ids: number[]) => {
      if (ids.length === 0) return;
      setStagedRoleIds((prev) => {
        const seen = new Set(prev);
        const append: number[] = [];
        for (const id of ids) {
          if (seen.has(id)) continue;
          seen.add(id);
          append.push(id);
        }
        if (append.length === 0) return prev;
        return [...prev, ...append];
      });
    },
    [allRoles]
  );

  const removeStagedRole = useCallback((roleId: number) => {
    setStagedRoleIds((prev) => prev.filter((x) => x !== roleId));
    setRolesDwMap((prev) => {
      if (!(roleId in prev)) return prev;
      const next = { ...prev };
      delete next[roleId];
      return next;
    });
  }, []);

  const toggleRoleDwSelection = useCallback((roleId: number, dwId: string) => {
    setRolesDwMap((prev) => {
      const current = prev[roleId] ?? [];
      const has = current.includes(dwId);
      const nextList = has
        ? current.filter((id) => id !== dwId)
        : [...current.filter((id) => id !== ROLE_DW_NONE), dwId];
      return { ...prev, [roleId]: nextList };
    });
  }, []);

  const handleSavePanel = useCallback(async () => {
    if (!configPanelUser || panelGeneralSaving || rolesSaving) return;

    const firstName = panelFirstName.trim();
    const lastName = panelLastName.trim();
    const username = panelUsername.trim();
    const email = panelEmail.trim();
    const phone = panelPhone.trim();
    const org = panelOrganization.trim();
    const loc = panelLocation.trim();

    if (!username) {
      toast.error(t("USERNAME_REQUIRED"));
      return;
    }
    if (!firstName) {
      toast.error(t("FIRST_NAME_REQUIRED"));
      return;
    }
    if (!email) {
      toast.error(t("EMAIL_REQUIRED"));
      return;
    }
    if (!isValidUserEmail(email)) {
      toast.error(t("EMAIL_INVALID"));
      return;
    }
    if (phone && !/^\d*$/.test(phone)) {
      toast.error(t("PHONE_NUMBER_INVALID"));
      return;
    }
    if (org.length > 100) {
      toast.error(t("ORGANIZATION_TOO_LONG"));
      return;
    }
    if (loc.length > 200) {
      toast.error(t("LOCATION_TOO_LONG"));
      return;
    }

    const generalPayload: UpdateUserPayload = {};
    if (username !== (configPanelUser.username ?? "").trim()) {
      generalPayload.username = username;
    }
    if (firstName !== (configPanelUser.first_name ?? "").trim()) {
      generalPayload.first_name = firstName;
    }
    if (lastName !== (configPanelUser.last_name ?? "").trim()) {
      generalPayload.last_name = lastName || null;
    }
    if (email !== (configPanelUser.email ?? "").trim()) {
      generalPayload.email = email;
    }
    if (phone !== (configPanelUser.phone ?? "").trim()) {
      generalPayload.phone = phone || null;
    }
    if (org !== (configPanelUser.organisation ?? "").trim()) {
      generalPayload.organisation = org || null;
    }
    if (loc !== (configPanelUser.location ?? "").trim()) {
      generalPayload.location = loc || null;
    }
    if (panelStatus !== configPanelUser.status) {
      generalPayload.status = panelStatus;
    }

    const hasGeneralChanges = Object.keys(generalPayload).length > 0;

    setPanelGeneralSaving(true);
    setRolesSaving(true);
    try {
      if (hasGeneralChanges) {
        const res = await updateUser(configPanelUser.id, generalPayload);
        if (!res.success) {
          const detail = extractApiValidationMessages(res.errors);
          toast.error(detail ?? res.err_message ?? t("UPDATE_USER_FAILED"));
          return;
        }
        const updatedRow: UserRaw = {
          ...configPanelUser,
          username: generalPayload.username ?? configPanelUser.username,
          first_name: generalPayload.first_name ?? configPanelUser.first_name,
          last_name:
            "last_name" in generalPayload
              ? generalPayload.last_name ?? null
              : configPanelUser.last_name,
          email: generalPayload.email ?? configPanelUser.email,
          phone:
            "phone" in generalPayload
              ? generalPayload.phone ?? null
              : configPanelUser.phone,
          organisation:
            "organisation" in generalPayload
              ? generalPayload.organisation ?? null
              : configPanelUser.organisation,
          location:
            "location" in generalPayload
              ? generalPayload.location ?? null
              : configPanelUser.location,
          status: generalPayload.status ?? configPanelUser.status,
        };
        setConfigPanelUser(updatedRow);
        setRows((prev) =>
          prev.map((r) => (r.id === configPanelUser.id ? updatedRow : r))
        );
      }

      const nextRoleGroupsByDw = buildRoleGroupsByDw(stagedRoleIds, rolesDwMap);
      const dwContextKeys = new Set<string>([
        ...Object.keys(initialRoleGroupsByDw),
        ...Object.keys(nextRoleGroupsByDw),
      ]);
      if (dwContextKeys.size === 0) dwContextKeys.add(ROLE_DW_NONE);

      const saveResults = await Promise.all(
        [...dwContextKeys].map(async (dwKey) => {
          const roleIds = nextRoleGroupsByDw[dwKey] ?? [];
          const payload: SaveUserRolesPayload = {
            data: {
              dw_id: dwKey === ROLE_DW_NONE ? null : Number(dwKey),
              user_id: configPanelUser.id,
              roles: roleIds.map((role_id) => ({ role_id })),
            },
          };
          return saveUserRoles(configPanelUser.id, payload);
        })
      );
      const failed = saveResults.find((res) => !res.success);
      if (failed && !failed.success) {
        toast.error(failed.err_message ?? t("ROLES_SAVE_FAILED"));
        return;
      }

      await listState.refetch();
      closeConfigPanel();
      toast.success(
        hasGeneralChanges
          ? t("UPDATE_USER_SUCCESS")
          : t("ROLES_SAVED_SUCCESSFULLY")
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : t("UPDATE_USER_FAILED");
      toast.error(msg);
    } finally {
      setPanelGeneralSaving(false);
      setRolesSaving(false);
    }
  }, [
    configPanelUser,
    panelGeneralSaving,
    rolesSaving,
    panelFirstName,
    panelLastName,
    panelUsername,
    panelEmail,
    panelPhone,
    panelOrganization,
    panelLocation,
    panelStatus,
    initialRoleGroupsByDw,
    rolesDwMap,
    stagedRoleIds,
    t,
    closeConfigPanel,
    listState,
  ]);

  // Sync staged roles + per-role DW selections from server when panel opens.
  useEffect(() => {
    if (!configPanelOpen || !configPanelUser || allRoles.length === 0) return;
    let cancelled = false;
    const run = async () => {
      setPanelRolesLoading(true);
      try {
        const contexts: Array<string | null> = [
          null,
          ...dwOptions.map((opt) => opt.id),
        ];
        const uniqueContexts = [...new Set(contexts)];
        const responses = await Promise.all(
          uniqueContexts.map(async (ctxDwId) => {
            const res = await fetchUserRoleCodesFromUserList(
              configPanelUser.id,
              ctxDwId
            );
            return { ctxDwId, ...res };
          })
        );
        if (cancelled) return;
        const assignedAll = new Set<number>();
        const nextRoleDwMap: Record<number, string[]> = {};
        const initialGroupsByDw: Record<string, number[]> = {};
        for (const item of responses) {
          const assigned = roleCodesToCheckedIds(item.codes, item.roleMeta, allRoles);
          const dwKey = item.ctxDwId == null ? ROLE_DW_NONE : item.ctxDwId;
          if (assigned.size > 0) {
            initialGroupsByDw[dwKey] = [...assigned];
          }
          for (const roleId of assigned) {
            assignedAll.add(roleId);
            if (dwKey === ROLE_DW_NONE) {
              if (!(roleId in nextRoleDwMap)) {
                nextRoleDwMap[roleId] = [];
              }
              continue;
            }
            const existing = nextRoleDwMap[roleId] ?? [];
            if (!existing.includes(dwKey)) {
              nextRoleDwMap[roleId] = [...existing, dwKey];
            }
          }
        }
        setStagedRoleIds(sortAssignedRoleIds(assignedAll, allRoles));
        setRolesDwMap(nextRoleDwMap);
        setInitialRoleGroupsByDw(initialGroupsByDw);
      } finally {
        if (!cancelled) setPanelRolesLoading(false);
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [configPanelOpen, configPanelUser, allRoles, dwOptions]);

  // ── Inline grid edit callbacks ────────────────────────────────────────────
  const applyInlineFocus = useCallback((field: UserInlineFocusField) => {
    const run = () => {
      const el =
        field === "username"
          ? inlineUsernameInputRef.current
          : field === "first_name"
            ? inlineFirstNameInputRef.current
            : field === "phone"
              ? inlinePhoneInputRef.current
              : field === "organisation"
                ? inlineOrganisationInputRef.current
                : field === "location"
                  ? inlineLocationInputRef.current
                  : null;
      el?.focus();
      el?.select();
    };
    requestAnimationFrame(run);
  }, []);

  const onStartInlineEdit = useCallback(
    (row: UserRaw, focusField: UserInlineFocusField = "username") => {
      const id = userRowId(row);
      if (!id) return;
      pendingInlineFocusRef.current = focusField;
      setActiveRowId(id);
      setEditingRowId(id);
      setInlineUsername(row.username ?? "");
      setInlineFirstName(row.first_name ?? "");
      setInlineLastName(row.last_name ?? "");
      setInlineEmail(row.email ?? "");
      setInlineStatus(row.status ?? 1);
      setInlinePhone(row.phone ?? "");
      setInlineOrganisation(row.organisation ?? "");
      setInlineLocation(row.location ?? "");
    },
    []
  );

  const onInlineCancel = useCallback(() => {
    if (editingRowId) setActiveRowId(editingRowId);
    setEditingRowId(null);
  }, [editingRowId]);

  const onInlineSave = useCallback(async () => {
    if (!editingRowId || inlineSaveLoading) return;
    const savedRowId = editingRowId;
    const row = rows.find((r) => userRowId(r) === editingRowId);
    if (!row) {
      setEditingRowId(null);
      return;
    }

    const username = inlineUsername.trim();
    if (!username) {
      toast.error(t("USERNAME_REQUIRED"));
      return;
    }
    const firstName = inlineFirstName.trim();
    if (!firstName) {
      toast.error(t("FIRST_NAME_REQUIRED"));
      return;
    }
    const email = inlineEmail.trim();
    if (!email) {
      toast.error(t("EMAIL_REQUIRED"));
      return;
    }
    if (!isValidUserEmail(email)) {
      toast.error(t("EMAIL_INVALID"));
      return;
    }

    const phone = inlinePhone.trim();
    const org = inlineOrganisation.trim();
    const loc = inlineLocation.trim();

    if (phone && !/^\d*$/.test(phone)) {
      toast.error(t("PHONE_NUMBER_INVALID"));
      return;
    }
    if (org.length > 100) {
      toast.error(t("ORGANIZATION_TOO_LONG"));
      return;
    }
    if (loc.length > 200) {
      toast.error(t("LOCATION_TOO_LONG"));
      return;
    }

    const payload: UpdateUserPayload = {};
    if (username !== (row.username ?? "").trim()) payload.username = username;
    if (firstName !== (row.first_name ?? "").trim()) payload.first_name = firstName;
    const lastName = inlineLastName.trim();
    if (lastName !== (row.last_name ?? "").trim()) payload.last_name = lastName || null;
    if (email !== (row.email ?? "").trim()) payload.email = email;
    if (inlineStatus !== row.status) payload.status = inlineStatus;
    if (phone !== (row.phone ?? "").trim()) payload.phone = phone || null;
    if (org !== (row.organisation ?? "").trim()) payload.organisation = org || null;
    if (loc !== (row.location ?? "").trim()) payload.location = loc || null;

    if (Object.keys(payload).length === 0) {
      setEditingRowId(null);
      setActiveRowId(savedRowId);
      return;
    }

    setInlineSaveLoading(true);
    try {
      const res = await updateUser(row.id, payload);
      if (!res.success) {
        const detail = extractApiValidationMessages(res.errors);
        const msg =
          detail ?? res.err_message ?? t("UPDATE_USER_FAILED");
        toast.error(msg);
        return;
      }
      const updatedRow: UserRaw = {
        ...row,
        username: payload.username ?? row.username,
        first_name: payload.first_name ?? row.first_name,
        last_name: "last_name" in payload ? payload.last_name ?? null : row.last_name,
        email: payload.email ?? row.email,
        phone: "phone" in payload ? payload.phone ?? null : row.phone,
        organisation: "organisation" in payload ? payload.organisation ?? null : row.organisation,
        location: "location" in payload ? payload.location ?? null : row.location,
        status: payload.status ?? row.status,
      };
      setRows((prev) =>
        prev.map((r) => (userRowId(r) === savedRowId ? updatedRow : r))
      );
      setEditingRowId(null);
      setActiveRowId(savedRowId);
      toast.success(t("UPDATE_USER_SUCCESS"));
    } catch (err) {
      const msg = err instanceof Error ? err.message : t("UPDATE_USER_FAILED");
      toast.error(msg);
    } finally {
      setInlineSaveLoading(false);
    }
  }, [
    editingRowId,
    inlineSaveLoading,
    rows,
    inlineUsername,
    inlineFirstName,
    inlineLastName,
    inlineEmail,
    inlineStatus,
    inlinePhone,
    inlineOrganisation,
    inlineLocation,
    t,
  ]);

  useEffect(() => {
    if (!editingRowId) return;
    if (!rows.some((r) => userRowId(r) === editingRowId)) {
      setEditingRowId(null);
    }
  }, [rows, editingRowId]);

  useLayoutEffect(() => {
    if (!editingRowId) {
      pendingInlineFocusRef.current = null;
      return;
    }
    const field = pendingInlineFocusRef.current;
    pendingInlineFocusRef.current = null;
    if (field != null) applyInlineFocus(field);
  }, [editingRowId, applyInlineFocus]);

  // ── Delete modal ─────────────────────────────────────────────────────────
  const closeDeleteModal = useCallback(() => {
    setDeleteModalOpen(false);
    setRowsToDelete([]);
    setDeletingUsers(false);
  }, []);

  const openDeleteModal = useCallback(() => {
    const list: UserRaw[] = [];
    for (const row of rows) {
      const id = userRowId(row);
      if (id && selectedRowIds.has(id)) list.push(row);
    }
    if (list.length === 0) return;
    setRowsToDelete(list);
    setDeleteModalOpen(true);
  }, [rows, selectedRowIds]);

  const handleDeleteUsers = useCallback(async () => {
    if (deletingUsers || rowsToDelete.length === 0) return;
    setDeletingUsers(true);
    try {
      const results = await Promise.allSettled(
        rowsToDelete.map((r) => deleteUser(r.id))
      );
      const succeeded = rowsToDelete.filter((_, i) => {
        const res = results[i];
        return res.status === "fulfilled" && res.value.success;
      });
      const failedCount = rowsToDelete.length - succeeded.length;

      if (succeeded.length > 0) {
        const deletedIds = new Set(succeeded.map((r) => r.id));
        setRows((prev) => prev.filter((r) => !deletedIds.has(r.id)));
        setLocalTotalCount((c) => Math.max(0, c - succeeded.length));
        setSelectedRowIds((prev) => {
          const next = new Set(prev);
          for (const r of succeeded) next.delete(userRowId(r));
          return next;
        });
        toast.success(t("USER_DELETED_SUCCESSFULLY"));
      }
      if (failedCount > 0) {
        toast.error(t("DELETE_USER_FAILED"));
      }
      closeDeleteModal();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("DELETE_USER_FAILED"));
      setDeletingUsers(false);
    }
  }, [deletingUsers, rowsToDelete, t, closeDeleteModal]);

  // ── Clear selection on query change ──────────────────────────────────────
  useEffect(() => {
    setSelectedRowIds(new Set());
  }, [page, pageSize, searchParam, listSort.columnId, listSort.direction]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch]);

  // ── Expose delete state to parent ────────────────────────────────────────
  useEffect(() => {
    onDeleteStateChange(selectedRowIds.size === 0, openDeleteModal);
  }, [selectedRowIds, onDeleteStateChange, openDeleteModal]);

  // ── Create user (inline add row) ────────────────────────────────────────
  const handleAddSave = useCallback(async () => {
    const username = newUsername.trim();
    const firstName = newFirstName.trim();
    const email = newEmail.trim();
    if (!username || !firstName || !email || addSaving || editingRowId != null) return;

    const clientErr = validateCreateUserClient({
      username,
      first_name: firstName,
      last_name: newLastName,
      email,
    });
    if (clientErr) {
      toast.error(t(clientErr));
      return;
    }

    setAddSaving(true);
    try {
      const payload: CreateUserPayload = {
        first_name: firstName,
        username,
        email,
        ...(newLastName.trim() ? { last_name: newLastName.trim() } : {}),
      };
      const res = await createUser(payload);
      if (!res.success) {
        const detail = extractApiValidationMessages(res.errors);
        const msg = detail ?? res.err_message ?? t("CREATE_FAILED_USER");
        toast.error(msg);
        return;
      }

      const created = res.data?.[0];
      const newRow: UserRaw = {
        id: created?.user_id ?? 0,
        first_name: firstName,
        last_name: newLastName.trim() || null,
        username: created?.username ?? username,
        email: created?.email ?? email,
        phone: null,
        organisation: null,
        location: null,
        status: 1,
        created: created?.created_at ?? new Date().toISOString(),
        last_loggedin_on: null,
        roles: [],
      };

      const newRowIdStr = userRowId(newRow);
      setRows((prev) => [newRow, ...prev]);
      setLocalTotalCount((c) => c + 1);
      setActiveRowId(newRowIdStr);
      setRecentCreatedRowIds((prev) => [newRowIdStr, ...prev]);

      toast.success(t("USER_CREATED_SUCCESSFULLY"));

      setNewFirstName("");
      setNewLastName("");
      setNewUsername("");
      setNewEmail("");
      setAddRowExpanded(false);

      setConfigPanelUser(newRow);
      setConfigPanelOpen(true);
      setDrawerTab("general");
      setStagedRoleIds([]);
      setOpenDwRoleId(null);
      setPanelFirstName(newRow.first_name);
      setPanelLastName(newRow.last_name ?? "");
      setPanelUsername(newRow.username);
      setPanelEmail(newRow.email);
      setPanelPhone("");
      setPanelOrganization("");
      setPanelLocation("");
      setPanelStatus(1);
      setRolesDwMap({});
      setRoleDwSearchMap({});
      ensureRolesLoaded();
      ensureDwOptionsLoaded();
    } catch (err) {
      const msg = err instanceof Error ? err.message : t("CREATE_FAILED_USER");
      toast.error(msg);
    } finally {
      setAddSaving(false);
    }
  }, [
    newFirstName,
    newLastName,
    newUsername,
    newEmail,
    addSaving,
    editingRowId,
    t,
    ensureRolesLoaded,
  ]);

  const handleAddRowDiscard = useCallback(() => {
    setNewFirstName("");
    setNewLastName("");
    setNewUsername("");
    setNewEmail("");
    setAddRowExpanded(false);
  }, []);

  // ── Column definitions ───────────────────────────────────────────────────
  const allRowsSelected = useMemo(() => {
    const ids = rows.map(userRowId).filter(Boolean);
    return ids.length > 0 && ids.every((id) => selectedRowIds.has(id));
  }, [rows, selectedRowIds]);

  const addRowDisabledByInlineEdit = editingRowId != null;

  const columns = useUsersGridColumns({
    t,
    allRowsSelected,
    selectedRowIds,
    selectAll,
    toggleSelect,
    colFilterUsername,
    setColFilterUsername: handleColFilterUsername,
    colFilterFirstName,
    setColFilterFirstName: handleColFilterFirstName,
    colFilterEmail,
    setColFilterEmail: handleColFilterEmail,
    colFilterLastName,
    setColFilterLastName: handleColFilterLastName,
    colFilterStatus,
    setColFilterStatus: handleColFilterStatus,
    colFilterPhone,
    setColFilterPhone: handleColFilterPhone,
    colFilterOrganisation,
    setColFilterOrganisation: handleColFilterOrganisation,
    colFilterLocation,
    setColFilterLocation: handleColFilterLocation,
    colFilterRoles,
    setColFilterRoles: handleColFilterRoles,
    rolesMeta: meta?.roles,
    onSortUsername,
    onSortFirstName,
    onSortEmail,
    onSortStatus,
    onSortLastLogin,
    sortIconUsername,
    sortIconFirstName,
    sortIconEmail,
    sortIconStatus,
    sortIconLastLogin,
    editingRowId,
    inlineUsername,
    setInlineUsername,
    inlineUsernameInputRef,
    inlineFirstName,
    setInlineFirstName,
    inlineFirstNameInputRef,
    inlineLastName,
    setInlineLastName,
    inlineEmail,
    setInlineEmail,
    inlineStatus,
    setInlineStatus,
    inlinePhone,
    setInlinePhone,
    inlinePhoneInputRef,
    inlineOrganisation,
    setInlineOrganisation,
    inlineOrganisationInputRef,
    inlineLocation,
    setInlineLocation,
    inlineLocationInputRef,
    inlineSaveLoading,
    onStartInlineEdit: canUpdate ? onStartInlineEdit : undefined,
    onInlineSave,
    onInlineCancel,
    openConfigPanel: canManageRoles ? openConfigPanel : undefined,
    onResendRegistrationEmail: canUpdate ? handleResendRegistrationEmail : undefined,
  });

  // ── Add row (expandable inline input) ───────────────────────────────────
  const usersListAddRowExpandedFields = useMemo((): ServerDrivenListAddRowField[] => {
    return [
      {
        kind: "custom" as const,
        content: <span className="inline-block h-4 w-4" aria-hidden />,
      },
      {
        kind: "text" as const,
        value: newUsername,
        onChange: setNewUsername,
        placeholder: t("USERNAME"),
        inputClassName: gridTextFieldClassName("min-w-0"),
        inputRef: addRowUsernameInputRef,
        disabled: addSaving,
        ariaLabel: t("USERNAME"),
        onEnter: () => addRowFirstNameInputRef.current?.focus(),
      },
      {
        kind: "text" as const,
        value: newFirstName,
        onChange: setNewFirstName,
        placeholder: t("FIRST_NAME"),
        inputClassName: gridTextFieldClassName("min-w-0"),
        inputRef: addRowFirstNameInputRef,
        disabled: addSaving,
        ariaLabel: t("FIRST_NAME"),
        onEnter: () => addRowLastNameInputRef.current?.focus(),
      },
      {
        kind: "text" as const,
        value: newLastName,
        onChange: setNewLastName,
        placeholder: `${t("LAST_NAME")} (${t("OPTIONAL")})`,
        inputClassName: gridTextFieldClassName("min-w-0"),
        inputRef: addRowLastNameInputRef,
        disabled: addSaving,
        ariaLabel: t("LAST_NAME"),
        onEnter: () => addRowEmailInputRef.current?.focus(),
      },
      {
        kind: "text" as const,
        value: newEmail,
        onChange: setNewEmail,
        placeholder: t("EMAIL"),
        inputClassName: gridTextFieldClassName("min-w-0"),
        inputRef: addRowEmailInputRef,
        disabled: addSaving,
        ariaLabel: t("EMAIL"),
        onEnter: () => void handleAddSave(),
      },
      {
        kind: "custom" as const,
        content: <span className="text-text-muted">-</span>,
      },
      {
        kind: "custom" as const,
        content: <span className="text-text-muted">-</span>,
      },
      {
        kind: "custom" as const,
        content: <span className="text-text-muted">-</span>,
      },
      {
        kind: "custom" as const,
        content: <span className="text-text-muted">-</span>,
      },
      {
        kind: "custom" as const,
        content: <span className="text-text-muted">-</span>,
      },
      {
        kind: "custom" as const,
        content: <span className="text-text-muted">-</span>,
      },
    ];
  }, [
    newUsername,
    newFirstName,
    newLastName,
    newEmail,
    addSaving,
    handleAddSave,
    t,
  ]);

  const userTrim = newUsername.trim();
  const fnTrim = newFirstName.trim();
  const lnTrim = newLastName.trim();
  const emailTrim = newEmail.trim();
  const usersAddRowSchemaErr =
    userTrim && fnTrim && emailTrim
      ? validateCreateUserClient({
          username: userTrim,
          first_name: fnTrim,
          last_name: lnTrim,
          email: emailTrim,
        })
      : null;
  const usersAddRowSaveDisabled =
    addSaving ||
    !userTrim ||
    !fnTrim ||
    !emailTrim ||
    usersAddRowSchemaErr != null;
  const usersAddRowSaveHint = (() => {
    if (!userTrim) return t("USERNAME_REQUIRED");
    if (userTrim.length < 3) return t("USERNAME_TOO_SHORT");
    if (userTrim.length > 50) return t("USERNAME_TOO_LONG");
    if (!fnTrim) return t("FIRST_NAME_REQUIRED");
    if (fnTrim.length > 100) return t("FIRST_NAME_TOO_LONG");
    if (!emailTrim) return t("EMAIL_REQUIRED");
    if (!isValidUserEmail(emailTrim)) return t("EMAIL_INVALID");
    if (lnTrim.length > 100) return t("LAST_NAME_TOO_LONG");
    return t("SAVE");
  })();

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <>
      <div className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden overflow-x-hidden rounded-b-md border-x border-b border-border bg-surface">
        <ServerDrivenTable<UserRaw, UsersListMeta>
          listState={listState}
          columns={columns}
          selection={{
            count: selectedRowIds.size,
            onClear: clearSelection,
          }}
          scrollRef={tblScrollRef}
          renderThead={() => (
            <thead>
              <EditableDataGridThead columns={columns} />
            </thead>
          )}
          tbody={
            <ServerDrivenListTbody<UserRaw>
              colSpan={12}
              rows={rows}
              columns={columns}
              getRowId={userRowId}
              activeRowId={activeRowId}
              editingRowId={editingRowId}
              onDataRowEnterAtEnd={({ mode }) => {
                if (mode === "edit") void onInlineSave();
              }}
              onDataRowEscape={({ mode }) => {
                if (mode === "edit") onInlineCancel();
              }}
              onDeleteKeyToggleRowSelection={toggleSelect}
              trProps={
                canManageRoles
                  ? (row) =>
                      gridConfigPanelRowTrProps({
                        panelOpen: configPanelOpen,
                        isActiveRow: Boolean(
                          configPanelUser &&
                            userRowId(row) === userRowId(configPanelUser)
                        ),
                        onSwitchRow: () => openConfigPanel(row),
                      })
                  : undefined
              }
              getRowClassName={(row) =>
                [
                  configPanelUser &&
                  userRowId(row) === userRowId(configPanelUser)
                    ? "settings-active"
                    : "",
                  recentCreatedRowIdSet.has(userRowId(row))
                    ? TV_ROW_NEWLY_ADDED_CLASS
                    : "",
                ]
                  .filter(Boolean)
                  .join(" ")
              }
              emptyMessage={t("NO_USERS")}
              showLoadingRow={false}
              showEmptyRow={!loading && rows.length === 0}
              showDataRows={!loading}
              addRow={canCreate ? {
                ref: addRowRef,
                promptLabel: t("ADD_USER_PROMPT"),
                expanded: addRowExpanded,
                onExpandedChange: setAddRowExpanded,
                primaryColumnId: "username",
                disabled: addRowDisabledByInlineEdit,
                disabledTitle: addRowDisabledByInlineEdit
                  ? t("CANCEL_INLINE_EDIT")
                  : undefined,
                onExpand: () => {
                  queueMicrotask(() => addRowUsernameInputRef.current?.focus());
                },
                className: `add-row${addRowExpanded ? "" : " add-row-collapsed"}${addRowDisabledByInlineEdit ? " add-row-interaction-blocked" : ""}`,
                ariaDisabled: addRowDisabledByInlineEdit,
                title: addRowDisabledByInlineEdit
                  ? t("CANCEL_INLINE_EDIT")
                  : undefined,
                onRowEnterAtEnd: () => {
                  if (addRowDisabledByInlineEdit) return;
                  if (!addRowExpanded) {
                    setAddRowExpanded(true);
                    queueMicrotask(() => addRowUsernameInputRef.current?.focus());
                    return;
                  }
                  void handleAddSave();
                },
                onRowEscape: () => {
                  if (addRowExpanded) handleAddRowDiscard();
                },
                onArrowIntoRow: addRowDisabledByInlineEdit
                  ? undefined
                  : () => {
                      setAddRowExpanded(true);
                    },
                onArrowLeaveRow: addRowDisabledByInlineEdit
                  ? undefined
                  : () => {
                      setAddRowExpanded(false);
                    },
                expandedFields: usersListAddRowExpandedFields,
                collapsedSave: {
                  title: "save",
                  ariaLabel: "save-placeholder",
                },
                collapsedCancel: {
                  title: "cancel",
                  ariaLabel: "cancel-placeholder",
                },
                showActionsColumn: true,
                actionsWidth: "icon",
                save: {
                  title: usersAddRowSaveHint,
                  ariaLabel: usersAddRowSaveHint,
                  disabled: usersAddRowSaveDisabled,
                  onClick: () => void handleAddSave(),
                },
                cancel: {
                  title: t("ADD_CLEAR_ROW"),
                  ariaLabel: t("ADD_CLEAR_ROW"),
                  disabled: addSaving,
                  onClick: handleAddRowDiscard,
                },
              } : undefined}
            />
          }
          pagination={{
            page,
            displayPage: meta?.page ?? page,
            totalPages: localTotalPages,
            totalCount: localTotalCount,
            totalCountUnfiltered: localTotalCountUnfiltered,
            pageSize,
            onPageChange: setPage,
            onPageSizeChange: setPageSize,
            countNoun: t("USER_MANAGEMENT"),
            labels: { t, filteredOnly: "FOOTER_OF_TOTAL_USERS" },
          }}
        />
      </div>

      <DeletePermanentConfirmModal
        open={deleteModalOpen}
        onClose={closeDeleteModal}
        title={t("DELETE_USERS")}
        titleId="dm-users-delete-title"
        dismissDisabled={deletingUsers}
        closeAriaLabel={t("CLOSE")}
        cancelLabel={t("CANCEL")}
        onCancel={closeDeleteModal}
        confirmLabel={t("DELETE_PERMANENTLY")}
        confirmLoadingLabel={t("DELETING")}
        confirmLoading={deletingUsers}
        onConfirm={handleDeleteUsers}
      >
        <p className="modal-lead">
          {t("DELETE_USERS_MODAL_LEAD").replace(
            "{count}",
            String(rowsToDelete.length)
          )}
        </p>
        <ul className="modal-list">
          {rowsToDelete.map((r, idx) => (
            <li key={userRowId(r) || `user-del-${idx}`}>
              <span className="modal-list-name">
                {[r.first_name, r.last_name].filter(Boolean).join(" ").trim() ||
                  r.username ||
                  `ID ${r.id}`}
              </span>
              <span className="modal-list-meta">{r.email}</span>
            </li>
          ))}
        </ul>
      </DeletePermanentConfirmModal>

      {/* ── Config panel: user details + role assignment ─────────────── */}
      <Drawer
        open={configPanelOpen}
        onClose={closeConfigPanel}
        closeOnOverlayClick={false}
        allowBackgroundInteraction={configPanelOpen}
        title={
          configPanelUser
            ? t("USER_LABEL").replace(
                "{name}",
                [configPanelUser.first_name, configPanelUser.last_name]
                  .filter(Boolean)
                  .join(" ")
                  .trim() || configPanelUser.username
              )
            : t("USER_MANAGEMENT")
        }
        width="50%"
        zIndexClassName="z-[500]"
        bodyClassName="sp-panel-main relative flex min-h-0 flex-1 flex-col p-0"
        headerActions={
          <PrimarySaveButton
            className="shrink-0"
            disabled={
              !configPanelUser ||
              panelGeneralSaving ||
              rolesSaving ||
              rolesLoading ||
              panelRolesLoading
            }
            onClick={() => void handleSavePanel()}
          >
            {panelGeneralSaving || rolesSaving ? t("SAVING") : t("SAVE")}
          </PrimarySaveButton>
        }
      >
        <div className="sp-panel-main relative flex min-h-0 flex-1 flex-col">
          <MainTabsBar
            className="shrink-0"
            tabRole
            tabs={[
              { value: "general", label: t("GENERAL"), icon: "person" },
              { value: "roles", label: t("ROLES"), icon: "admin_panel_settings" },
            ]}
            activeValue={drawerTab}
            onSelect={(v) => setDrawerTab(v)}
          />

          {/* ── General tab ── */}
          {drawerTab === "general" && configPanelUser ? (
            <div className="sp-body-wrap">
              <div className="sp-body overflow-y-auto flex-1 px-4 py-4">
                <div className="user-drawer-form">
                  <label className="user-drawer-field">
                    <span className="form-label">{t("USERNAME")}</span>
                    <input
                      type="text"
                      className="field-comp--sm w-full"
                      value={panelUsername}
                      onChange={(e) => setPanelUsername(e.target.value)}
                      disabled={panelGeneralSaving}
                    />
                  </label>
                  <label className="user-drawer-field">
                    <span className="form-label">{t("FIRST_NAME")}</span>
                    <input
                      type="text"
                      className="field-comp--sm w-full"
                      value={panelFirstName}
                      onChange={(e) => setPanelFirstName(e.target.value)}
                      disabled={panelGeneralSaving}
                    />
                  </label>
                  <label className="user-drawer-field">
                    <span className="form-label">{t("LAST_NAME")}</span>
                    <input
                      type="text"
                      className="field-comp--sm w-full"
                      value={panelLastName}
                      onChange={(e) => setPanelLastName(e.target.value)}
                      disabled={panelGeneralSaving}
                    />
                  </label>
                  <label className="user-drawer-field">
                    <span className="form-label">{t("EMAIL")}</span>
                    <input
                      type="email"
                      className="field-comp--sm w-full"
                      value={panelEmail}
                      onChange={(e) => setPanelEmail(e.target.value)}
                      disabled={panelGeneralSaving}
                    />
                  </label>
                  <label className="user-drawer-field">
                    <span className="form-label">{t("PHONE_NUMBER")}</span>
                    <input
                      type="text"
                      className="field-comp--sm w-full"
                      value={panelPhone}
                      onChange={(e) => setPanelPhone(e.target.value)}
                      disabled={panelGeneralSaving}
                      inputMode="numeric"
                    />
                  </label>
                  <label className="user-drawer-field">
                    <span className="form-label">{t("ORGANIZATION")}</span>
                    <input
                      type="text"
                      className="field-comp--sm w-full"
                      maxLength={100}
                      value={panelOrganization}
                      onChange={(e) => setPanelOrganization(e.target.value)}
                      disabled={panelGeneralSaving}
                    />
                  </label>
                  <label className="user-drawer-field">
                    <span className="form-label">{t("LOCATION")}</span>
                    <TextAreaField
                      fieldSize="sm"
                      maxLength={200}
                      value={panelLocation}
                      onChange={(e) => {
                        const nextValue = e.target.value
                          .replace(/\r\n/g, "\n")
                          .split("\n")
                          .slice(0, 2)
                          .join("\n");
                        setPanelLocation(nextValue);
                      }}
                      onKeyDown={(e) => {
                        if (e.key !== "Enter") return;
                        const lineCount = panelLocation.split("\n").length;
                        if (lineCount >= 2) e.preventDefault();
                      }}
                      disabled={panelGeneralSaving}
                      rows={2}
                    />
                  </label>
                  <div className="user-drawer-field">
                    <span className="form-label">{t("STATUS")}</span>
                    <SelectField
                      menuPortal
                      className="w-full min-w-0 [&_button]:!h-9 [&_button]:!min-h-[36px]"
                      value={String(panelStatus)}
                      onChange={(e) => setPanelStatus(Number(e.target.value))}
                      disabled={panelGeneralSaving}
                      options={[
                        { value: "1", label: t("ACTIVE") },
                        { value: "0", label: t("INACTIVE") },
                      ]}
                    />
                  </div>
                </div>
              </div>
            </div>
          ) : null}

          {/* ── Roles tab ── */}
          {drawerTab === "roles" ? (
            <div className="sp-body-wrap">
              <div className="sp-body overflow-y-auto flex-1 px-4 py-4">
                {!rolesLoading && !panelRolesLoading && allRoles.length === 0 ? (
                  <p className="text-xs text-text-muted py-4">
                    {t("NO_ROLES_AVAILABLE")}
                  </p>
                ) : !rolesLoading && !panelRolesLoading ? (
                  <InlineEditableTable
                    disableGlobalArrowNavigation
                    wrapClassName="tbl-wrap user-drawer-roles-tbl border border-border rounded-md overflow-hidden"
                    scrollClassName="overflow-visible"
                    tableClassName="w-full min-w-0"
                    thead={
                      <thead>
                        <tr>
                          <th className="w-[42%]">
                            <span className="min-w-0 shrink font-semibold text-xs text-text">
                              {t("ROLE")}
                            </span>
                          </th>
                          <th className="w-[58%]">
                            <span className="min-w-0 shrink font-semibold text-xs text-text">
                              {t("LABEL_DATAWAREHOUSE")}
                            </span>
                          </th>
                        </tr>
                      </thead>
                    }
                    tbody={
                      <tbody className="text-xs">
                        {allRolesSortedPreview.map((role) => {
                          const checked = stagedRoleIds.includes(role.id);
                          const label = role.name ?? role.role_code ?? `ID ${role.id}`;
                          const selectedDwIds = rolesDwMap[role.id] ?? [];
                          const selectedDwLabel = selectedDwIds
                            .map((id) => dwOptions.find((opt) => opt.id === id)?.name ?? id)
                            .join(", ");
                          return (
                            <tr key={role.id}>
                              <td className="!text-xs align-middle">
                                <label className="flex items-center gap-2.5 min-w-0 cursor-pointer">
                                  <input
                                    type="checkbox"
                                    className="checkbox-comp"
                                    checked={checked}
                                    onChange={() => {
                                      if (checked) {
                                        removeStagedRole(role.id);
                                      } else {
                                        addRolesToStaged([role.id]);
                                        setRolesDwMap((prev) => ({
                                          ...prev,
                                          [role.id]: prev[role.id] ?? [],
                                        }));
                                      }
                                    }}
                                  />
                                  <span className="flex min-w-0 items-center gap-2 text-xs font-medium leading-snug">
                                    <span className="min-w-0 truncate">{label}</span>
                                    {Boolean(role.is_system_role) && (
                                      <span className="label-tag tone-pill--muted-subtle">
                                        {t("SYSTEM_ROLE_BADGE")}
                                      </span>
                                    )}
                                  </span>
                                </label>
                              </td>
                              <td className="!text-xs align-middle">
                                <MultiSelectDropdown
                                  menuPortal
                                  open={openDwRoleId === role.id}
                                  onOpenChange={(open) =>
                                    setOpenDwRoleId(open ? role.id : null)
                                  }
                                  options={dwRoleOptions}
                                  selectedValues={checked ? selectedDwIds : []}
                                  onToggleValue={(value) =>
                                    toggleRoleDwSelection(role.id, value)
                                  }
                                  searchQuery={roleDwSearchMap[role.id] ?? ""}
                                  onSearchChange={(query) =>
                                    setRoleDwSearchMap((prev) => ({
                                      ...prev,
                                      [role.id]: query,
                                    }))
                                  }
                                  searchEnabled={dwRoleOptions.length > 10}
                                  searchPlaceholder={t("SEARCH_PLACEHOLDER")}
                                  emptyLabel={t("SELECT_DATAWAREHOUSE")}
                                  disabled={!checked}
                                  className="w-full"
                                  renderTriggerSummary={() => (
                                    selectedDwLabel
                                      ? <span className="truncate">{selectedDwLabel}</span>
                                      : <span className="truncate text-text-muted">{t("SELECT_DATAWAREHOUSE")}</span>
                                  )}
                                />
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    }
                  />
                ) : null}
              </div>
            </div>
          ) : null}

          {rolesLoading || panelRolesLoading ? (
            <div
              className="sp-panel-tab-loading-overlay"
              aria-live="polite"
              aria-busy="true"
            >
              <Loader loadingLabel={t("LOADING")} />
            </div>
          ) : null}
        </div>
      </Drawer>
    </>
  );
}
