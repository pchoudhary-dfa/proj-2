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
  patchRequest,
  postRequest,
} from "@/lib/api/http";
import type {
  CreateRolePayload,
  DeleteRoleResult,
  RoleRaw,
  RolesListMeta,
  RolesListResponse,
  RolesListResult,
  UpdateRolePayload,
} from "@/lib/api/types";
import {
  getIAMAPIURL,
  IAM_ROLES_PATH,
} from "@/lib/constants";
import { hasPermission, APP_ROUTE_PERMISSIONS } from "@/lib/auth/user";
import {
  EditableDataGridThead,
  ServerDrivenListTbody,
  ServerDrivenTable,
  TV_ROW_NEWLY_ADDED_CLASS,
  useServerListQuery,
  type ServerDrivenListAddRowField,
  type ServerListParseResult,
} from "@/components/TableView";
import { DeletePermanentConfirmModal } from "@/components/DeletePermanentConfirmModal";
import Drawer from "@/components/Drawer";
import { gridConfigPanelRowTrProps } from "@/components/gridConfigPanelRowClick";
import { PrimarySaveButton } from "@/components/PrimarySaveButton";
import { RolePermissionsForm, useRoleResourcePermissions } from "./rolePermissions";
import { gridTextFieldClassName } from "@/components/TextField";
import { DEFAULT_TABLE_PAGE_SIZES } from "@/components/TablePaginationFooter";
import { parseListMetaTotals } from "@/lib/gridListMeta";
import {
  roleRowId,
  useRolesGridColumns,
  type RoleInlineFocusField,
} from "@/components/administration/rolesGridColumns";
import {
  TV_COL_PRIMARY_STICKY_TD,
  TV_COL_SELECT_TD,
} from "@/components/editableGridColumnClasses";

const SORT_ROLE_CODE = "role_code";

const SEARCH_KEY_NAME = "name";
const SEARCH_KEY_ROLE_CODE = "role_code";

type RolesSortState = {
  columnId: string | null;
  direction: "asc" | "desc" | null;
};

function cycleRolesSort(columnId: string, prev: RolesSortState): RolesSortState {
  if (prev.columnId !== columnId) return { columnId, direction: "asc" };
  if (prev.direction === "asc") return { columnId, direction: "desc" };
  if (prev.direction === "desc") return { columnId: null, direction: null };
  return { columnId, direction: "asc" };
}

function rolesSortIcon(
  columnId: string,
  state: RolesSortState
): "arrow_upward" | "arrow_downward" | "unfold_more" {
  if (state.columnId === columnId && state.direction === "asc") return "arrow_upward";
  if (state.columnId === columnId && state.direction === "desc") return "arrow_downward";
  return "unfold_more";
}

const SORT_COLUMN_TO_FIELD: Record<string, string> = {
  role_code: SORT_ROLE_CODE,
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

function isRolesListResponse(r: RolesListResult): r is RolesListResponse {
  return r.success === true && Array.isArray((r as RolesListResponse).data);
}

async function createRole(
  data: CreateRolePayload[]
): Promise<
  | { success: true; data?: RoleRaw[]; message?: string }
  | { success: false; err_message?: string; errors?: Record<string, unknown> }
> {
  const url = getIAMAPIURL(IAM_ROLES_PATH);
  const json = await postRequest(url, data as unknown as unknown[], undefined, undefined, {
    suppressErrorMessage: true,
  });
  return json as
    | { success: true; data?: RoleRaw[]; message?: string }
    | { success: false; err_message?: string; errors?: Record<string, unknown> };
}

async function updateRole(
  roleId: number,
  payload: UpdateRolePayload
): Promise<
  | { success: true; data?: Record<string, unknown> }
  | { success: false; err_message?: string; errors?: Record<string, unknown> }
> {
  const url = `${getIAMAPIURL(IAM_ROLES_PATH)}/${roleId}`;
  const json = await patchRequest(url, payload as unknown as Record<string, unknown>, undefined, undefined, {
    suppressErrorMessage: true,
  });
  return json as
    | { success: true; data?: Record<string, unknown> }
    | { success: false; err_message?: string; errors?: Record<string, unknown> };
}

async function deleteRoleApi(roleId: number): Promise<DeleteRoleResult> {
  const url = `${getIAMAPIURL(IAM_ROLES_PATH)}/${roleId}`;
  const json = (await deleteRequest(url, undefined, undefined, {
    suppressErrorMessage: true,
  })) as Record<string, unknown>;
  if (json.success === false) return json as DeleteRoleResult;
  return { success: true } as DeleteRoleResult;
}

type RolesAdminTabProps = {
  onDeleteStateChange: (disabled: boolean, handler: () => void) => void;
};

export default function RolesAdminTab({ onDeleteStateChange }: RolesAdminTabProps) {
  const { t } = useCore();

  const canCreate = hasPermission(APP_ROUTE_PERMISSIONS.administration.roles.crud, "C");
  const canUpdate = hasPermission(APP_ROUTE_PERMISSIONS.administration.roles.crud, "U");
  const canDelete = hasPermission(APP_ROUTE_PERMISSIONS.administration.roles.crud, "D");
  const canManageResources = hasPermission(APP_ROUTE_PERMISSIONS.administration.roles.drawer, "R");

  const tblScrollRef = useRef<HTMLDivElement>(null);
  const addRowRef = useRef<HTMLTableRowElement>(null);
  const inlineNameInputRef = useRef<HTMLInputElement>(null);
  const inlineCodeInputRef = useRef<HTMLInputElement>(null);
  const inlineDescriptionInputRef = useRef<HTMLInputElement>(null);
  const pendingInlineFocusRef = useRef<RoleInlineFocusField | null>(null);
  const addRowNameInputRef = useRef<HTMLInputElement>(null);
  const addRowCodeInputRef = useRef<HTMLInputElement>(null);
  const addRowDescriptionInputRef = useRef<HTMLInputElement>(null);

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(DEFAULT_TABLE_PAGE_SIZES[0]);
  const [listSort, setListSort] = useState<RolesSortState>({
    columnId: null,
    direction: null,
  });

  const [colFilterName, setColFilterName] = useState("");
  const [colFilterCode, setColFilterCode] = useState("");

  const activeSearch = colFilterName || colFilterCode;
  const activeSearchBy = colFilterName
    ? SEARCH_KEY_NAME
    : colFilterCode
      ? SEARCH_KEY_ROLE_CODE
      : null;

  const debouncedSearch = useDebounce(activeSearch, 300);
  const debouncedSearchBy = useDebounce(activeSearchBy, 300);

  const handleColFilterName = useCallback((v: string) => {
    setColFilterName(v);
    setColFilterCode("");
  }, []);
  const handleColFilterCode = useCallback((v: string) => {
    setColFilterCode(v);
    setColFilterName("");
  }, []);

  const [selectedRowIds, setSelectedRowIds] = useState<Set<string>>(new Set());

  const [addRowExpanded, setAddRowExpanded] = useState(false);
  const [newName, setNewName] = useState("");
  const [newCode, setNewCode] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [addSaving, setAddSaving] = useState(false);

  const [editingRowId, setEditingRowId] = useState<string | null>(null);
  const [inlineName, setInlineName] = useState("");
  const [inlineCode, setInlineCode] = useState("");
  const [inlineDescription, setInlineDescription] = useState("");
  const [inlineSaveLoading, setInlineSaveLoading] = useState(false);
  const [inlineError, setInlineError] = useState<string | null>(null);
  const [activeRowId, setActiveRowId] = useState<string | null>(null);

  const [configPanelOpen, setConfigPanelOpen] = useState(false);
  const [configPanelRow, setConfigPanelRow] = useState<RoleRaw | null>(null);
  const rolePermState = useRoleResourcePermissions(configPanelRow, t);

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

  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [rowsToDelete, setRowsToDelete] = useState<RoleRaw[]>([]);
  const [deleteRunError, setDeleteRunError] = useState<string | null>(null);
  const [deleteRunning, setDeleteRunning] = useState(false);

  const searchParam = useMemo(() => {
    const s = debouncedSearch.trim();
    return s ? s : undefined;
  }, [debouncedSearch]);

  const searchByParam = useMemo(
    () => (searchParam ? debouncedSearchBy ?? undefined : undefined),
    [searchParam, debouncedSearchBy]
  );

  const listUrl = useMemo(() => getIAMAPIURL(IAM_ROLES_PATH), []);

  const parseListResponse = useCallback(
    (json: unknown): ServerListParseResult<RoleRaw, RolesListMeta> => {
      const r = json as RolesListResult;
      if (!isRolesListResponse(r)) {
        const msg =
          typeof (r as { err_message?: string })?.err_message === "string"
            ? (r as { err_message: string }).err_message
            : "Failed to load roles";
        return { ok: false, message: msg };
      }
      const totals = r.meta ? parseListMetaTotals(r.meta) : null;
      return {
        ok: true,
        rows: r.data,
        totalCount: totals?.totalCount ?? 0,
        totalPages: totals?.totalPages ?? 0,
        totalCountUnfiltered: totals?.totalCountUnfiltered,
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
      is_super: true,
      ...(sort_field != null && sort_order != null
        ? { sort_field, sort_order }
        : {}),
      ...(searchParam
        ? { search: searchParam, ...(searchByParam ? { search_by: searchByParam } : {}) }
        : {}),
    };
  }, [page, pageSize, listSort.columnId, listSort.direction, searchParam, searchByParam]);

  const listState = useServerListQuery({
    listUrl,
    query: listQuery,
    parseListResponse,
    enabled: Boolean(listUrl),
  });

  const { rows: serverRows, loading, meta } = listState;
  const [rows, setRows] = useState<RoleRaw[]>([]);
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

  const onSortRoleCode = useCallback(() => {
    setPage(1);
    setListSort((prev) => cycleRolesSort("role_code", prev));
  }, []);
  const sortIconRoleCode = useMemo(() => rolesSortIcon("role_code", listSort), [listSort]);

  const selectAll = useCallback(() => {
    setSelectedRowIds((prev) => {
      const ids = rows
        .filter((r) => !r.is_system_role)
        .map(roleRowId)
        .filter(Boolean);
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

  const openConfigPanel = useCallback((row: RoleRaw) => {
    setConfigPanelRow(row);
    setConfigPanelOpen(true);
  }, []);

  const closeConfigPanel = useCallback(() => {
    setConfigPanelOpen(false);
    setConfigPanelRow(null);
  }, []);

  const closeDeleteModal = useCallback(() => {
    setDeleteModalOpen(false);
    setRowsToDelete([]);
    setDeleteRunError(null);
  }, []);

  const openDeleteModal = useCallback(() => {
    const list: RoleRaw[] = [];
    for (const row of rows) {
      const id = roleRowId(row);
      if (id && selectedRowIds.has(id) && !row.is_system_role) list.push(row);
    }
    if (list.length === 0) return;
    setRowsToDelete(list);
    setDeleteRunError(null);
    setDeleteModalOpen(true);
  }, [rows, selectedRowIds]);

  // ── Expose delete state to parent ────────────────────────────────────────
  useEffect(() => {
    onDeleteStateChange(selectedRowIds.size === 0, openDeleteModal);
  }, [selectedRowIds, onDeleteStateChange, openDeleteModal]);

  const handleConfirmBulkDelete = useCallback(async () => {
    if (rowsToDelete.length === 0) return;
    setDeleteRunning(true);
    setDeleteRunError(null);

    let failCount = 0;
    const deletedIds = new Set<string>();
    for (const row of rowsToDelete) {
      const res = await deleteRoleApi(row.id);
      if (res.success) {
        deletedIds.add(roleRowId(row));
      } else {
        failCount++;
      }
    }
    setDeleteRunning(false);

    const successCount = rowsToDelete.length - failCount;
    if (deletedIds.size > 0) {
      setRows((prev) => prev.filter((row) => !deletedIds.has(roleRowId(row))));
      setSelectedRowIds((prev) => {
        const next = new Set(prev);
        for (const rid of deletedIds) next.delete(rid);
        return next;
      });
      setLocalTotalCount((c) => Math.max(0, c - successCount));
    }

    if (failCount === rowsToDelete.length) {
      setDeleteRunError(t("BULK_DELETE_FAILED"));
      return;
    }
    if (failCount > 0) {
      toast.warning(`Deleted ${successCount} role(s) with ${failCount} failure(s).`);
    } else {
      toast.success(
        `Deleted ${successCount} role${successCount === 1 ? "" : "s"} successfully`
      );
    }
    closeDeleteModal();
  }, [rowsToDelete, closeDeleteModal, t]);

  useEffect(() => {
    setSelectedRowIds(new Set());
  }, [page, pageSize, searchParam, listSort.columnId, listSort.direction]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch]);

  const applyInlineFocus = useCallback((field: RoleInlineFocusField) => {
    const run = () => {
      const el =
        field === "name"
          ? inlineNameInputRef.current
          : field === "role_code"
            ? inlineCodeInputRef.current
            : inlineDescriptionInputRef.current;
      el?.focus();
      el?.select();
    };
    requestAnimationFrame(run);
  }, []);

  const onStartInlineEdit = useCallback(
    (row: RoleRaw, focusField: RoleInlineFocusField = "name") => {
      const id = roleRowId(row);
      if (!id) return;
      pendingInlineFocusRef.current = focusField;
      setInlineError(null);
      setActiveRowId(id);
      setEditingRowId(id);
      setInlineName(row.name ?? "");
      setInlineCode(row.role_code ?? "");
      setInlineDescription(row.description ?? "");
    },
    []
  );

  const onInlineCancel = useCallback(() => {
    if (editingRowId) setActiveRowId(editingRowId);
    setInlineError(null);
    setEditingRowId(null);
  }, [editingRowId]);

  const onInlineSave = useCallback(async () => {
    if (!editingRowId || inlineSaveLoading) return;
    const savedRowId = editingRowId;
    const row = rows.find((r) => roleRowId(r) === editingRowId);
    if (!row) {
      setEditingRowId(null);
      return;
    }

    const name = inlineName.trim();
    if (!name) {
      toast.error(t("ROLE_REQUIRED"));
      return;
    }
    const code = inlineCode.trim();
    if (!code) {
      toast.error(t("ROLE_CODE_REQUIRED"));
      return;
    }

    const payload: UpdateRolePayload = {};
    if (name !== (row.name ?? "").trim()) payload.name = name;
    if (code !== (row.role_code ?? "").trim()) payload.role_code = code;
    const desc = inlineDescription.trim();
    if (desc !== (row.description ?? "").trim()) payload.description = desc;

    if (Object.keys(payload).length === 0) {
      setEditingRowId(null);
      setActiveRowId(savedRowId);
      return;
    }

    setInlineSaveLoading(true);
    try {
      const res = await updateRole(row.id, payload);
      if (!res.success) {
        const msg = res.err_message ?? t("UPDATE_FAILED_ROLE");
        setInlineError(msg);
        toast.error(msg);
        return;
      }
      setInlineError(null);
      const updatedRow: RoleRaw = {
        ...row,
        name: payload.name ?? row.name,
        role_code: payload.role_code ?? row.role_code,
        description: payload.description ?? row.description,
      };
      setRows((prev) =>
        prev.map((r) => (roleRowId(r) === savedRowId ? updatedRow : r))
      );
      setEditingRowId(null);
      setActiveRowId(savedRowId);
      toast.success(t("UPDATE_SUCCESS_ROLE"));
    } catch (err) {
      const msg = err instanceof Error ? err.message : t("UPDATE_FAILED_ROLE");
      setInlineError(msg);
      toast.error(msg);
    } finally {
      setInlineSaveLoading(false);
    }
  }, [
    editingRowId,
    inlineSaveLoading,
    rows,
    inlineName,
    inlineCode,
    inlineDescription,
    t,
  ]);

  useEffect(() => {
    if (!editingRowId) return;
    if (!rows.some((r) => roleRowId(r) === editingRowId)) {
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

  const handleAddSave = useCallback(async () => {
    const name = newName.trim();
    const code = newCode.trim();
    if (!name || !code || addSaving || editingRowId != null) return;
    setAddSaving(true);
    try {
      const payload: CreateRolePayload = {
        role_code: code,
        name,
        ...(newDescription.trim() ? { description: newDescription.trim() } : {}),
      };
      const res = await createRole([payload]);
      if (!res.success) {
        const msg = res.err_message ?? t("CREATE_FAILED_ROLE");
        toast.error(msg);
        return;
      }

      const createdList = Array.isArray(res.data) ? res.data : [];
      if (createdList.length === 0) {
        toast.error(t("CREATE_FAILED_ROLE"));
        return;
      }

      setNewName("");
      setNewCode("");
      setNewDescription("");
      setAddRowExpanded(false);

      const created = createdList[0];
      const newRowId = roleRowId(created);
      setRows((prev) => [created, ...prev]);
      setLocalTotalCount((c) => c + 1);
      if (newRowId) {
        setActiveRowId(newRowId);
        setRecentCreatedRowIds((prev) => [newRowId, ...prev]);
      }
      toast.success(t("CREATE_SUCCESS_ROLE"));
    } catch (err) {
      const msg = err instanceof Error ? err.message : t("CREATE_FAILED_ROLE");
      toast.error(msg);
    } finally {
      setAddSaving(false);
    }
  }, [newName, newCode, newDescription, addSaving, editingRowId, t]);

  const handleAddRowDiscard = useCallback(() => {
    setNewName("");
    setNewCode("");
    setNewDescription("");
    setAddRowExpanded(false);
  }, []);

  const allRowsSelected = useMemo(() => {
    const ids = rows
      .filter((r) => !r.is_system_role)
      .map(roleRowId)
      .filter(Boolean);
    return ids.length > 0 && ids.every((id) => selectedRowIds.has(id));
  }, [rows, selectedRowIds]);

  const addRowDisabledByInlineEdit = editingRowId != null;

  const columns = useRolesGridColumns({
    t,
    allRowsSelected,
    selectedRowIds,
    selectAll,
    toggleSelect,
    colFilterName,
    setColFilterName: handleColFilterName,
    colFilterCode,
    setColFilterCode: handleColFilterCode,
    onSortRoleCode,
    sortIconRoleCode,
    editingRowId,
    inlineName,
    setInlineName,
    inlineNameInputRef,
    inlineCode,
    setInlineCode,
    inlineCodeInputRef,
    inlineDescription,
    setInlineDescription,
    inlineDescriptionInputRef,
    inlineSaveLoading,
    onStartInlineEdit: canUpdate ? onStartInlineEdit : undefined,
    onInlineSave,
    onInlineCancel,
    openConfigPanel: canManageResources ? openConfigPanel : undefined,
  });

  const rolesListAddRowExpandedFields = useMemo((): ServerDrivenListAddRowField[] => {
    const addRowDisabled = addSaving || addRowDisabledByInlineEdit;
    return [
      {
        kind: "custom" as const,
        content: <span className="inline-block h-4 w-4" aria-hidden />,
      },
      {
        kind: "text" as const,
        value: newName,
        onChange: setNewName,
        placeholder: t("NAME"),
        inputClassName: gridTextFieldClassName("min-w-0"),
        inputRef: addRowNameInputRef,
        disabled: addRowDisabled,
        ariaLabel: t("NAME"),
        onEnter: () => addRowCodeInputRef.current?.focus(),
      },
      {
        kind: "text" as const,
        value: newCode,
        onChange: setNewCode,
        placeholder: t("ROLE_CODE"),
        inputClassName: gridTextFieldClassName("min-w-0"),
        inputRef: addRowCodeInputRef,
        disabled: addRowDisabled,
        ariaLabel: t("ROLE_CODE"),
        onEnter: () => addRowDescriptionInputRef.current?.focus(),
      },
      {
        kind: "text" as const,
        value: newDescription,
        onChange: setNewDescription,
        placeholder: t("DESCRIPTION"),
        inputClassName: gridTextFieldClassName("min-w-0"),
        inputRef: addRowDescriptionInputRef,
        disabled: addRowDisabled,
        ariaLabel: t("DESCRIPTION"),
        onEnter: () => void handleAddSave(),
      },
    ];
  }, [
    addRowDisabledByInlineEdit,
    newName,
    newCode,
    newDescription,
    addSaving,
    handleAddSave,
    t,
  ]);

  const handleRolePermSave = useCallback(async () => {
    const saved = await rolePermState.save();
    if (saved) closeConfigPanel();
  }, [closeConfigPanel, rolePermState]);

  return (
    <>
      <div className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden overflow-x-hidden rounded-b-md border-x border-b border-border bg-surface">
        {inlineError ? (
          <div className="inline-alert--error mx-4 mt-2 shrink-0">
            {inlineError}
          </div>
        ) : null}

        <ServerDrivenTable<RoleRaw, RolesListMeta>
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
            <ServerDrivenListTbody<RoleRaw>
              colSpan={5}
              rows={rows}
              columns={columns}
              getRowId={roleRowId}
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
                canManageResources
                  ? (row) =>
                      gridConfigPanelRowTrProps({
                        panelOpen: configPanelOpen,
                        isActiveRow: Boolean(
                          configPanelRow &&
                            roleRowId(row) === roleRowId(configPanelRow)
                        ),
                        onSwitchRow: () => openConfigPanel(row),
                      })
                  : undefined
              }
              getRowClassName={(row) =>
                [
                  configPanelRow && roleRowId(row) === roleRowId(configPanelRow)
                    ? "settings-active"
                    : "",
                  recentCreatedRowIdSet.has(roleRowId(row))
                    ? TV_ROW_NEWLY_ADDED_CLASS
                    : "",
                ]
                  .filter(Boolean)
                  .join(" ")
              }
              emptyMessage={t("EMPTY_ROLES")}
              showLoadingRow={false}
              showEmptyRow={!loading && rows.length === 0}
              showDataRows={!loading}
              addRow={canCreate ? {
                ref: addRowRef,
                promptLabel: t("ADD_ROLE_PROMPT"),
                expanded: addRowExpanded,
                onExpandedChange: setAddRowExpanded,
                primaryColumnId: "name",
                disabled: addRowDisabledByInlineEdit,
                disabledTitle: addRowDisabledByInlineEdit
                  ? t("CANCEL_EDIT")
                  : undefined,
                onExpand: () => {
                  queueMicrotask(() => addRowNameInputRef.current?.focus());
                },
                className: `add-row${addRowExpanded ? "" : " add-row-collapsed"}${addRowDisabledByInlineEdit ? " add-row-interaction-blocked" : ""}`,
                ariaDisabled: addRowDisabledByInlineEdit,
                title: addRowDisabledByInlineEdit
                  ? t("CANCEL_EDIT")
                  : undefined,
                onRowEnterAtEnd: () => {
                  if (addRowDisabledByInlineEdit) return;
                  if (!addRowExpanded) {
                    setAddRowExpanded(true);
                    queueMicrotask(() => addRowNameInputRef.current?.focus());
                    return;
                  }
                  void handleAddSave();
                },
                onRowEscape: () => {
                  if (addRowExpanded) {
                    handleAddRowDiscard();
                  }
                },
                onArrowIntoRow: addRowDisabledByInlineEdit
                  ? undefined
                  : () => { setAddRowExpanded(true); },
                onArrowLeaveRow: addRowDisabledByInlineEdit
                  ? undefined
                  : () => { setAddRowExpanded(false); },
                expandedFields: rolesListAddRowExpandedFields,
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
                  title: !newName.trim()
                    ? t("ROLE_REQUIRED")
                    : !newCode.trim()
                      ? t("ROLE_CODE_REQUIRED")
                      : t("SAVE"),
                  ariaLabel: !newName.trim()
                    ? t("ROLE_REQUIRED")
                    : !newCode.trim()
                      ? t("ROLE_CODE_REQUIRED")
                      : t("SAVE"),
                  disabled:
                    addSaving ||
                    !newName.trim() ||
                    !newCode.trim() ||
                    addRowDisabledByInlineEdit,
                  onClick: () => void handleAddSave(),
                },
                cancel: {
                  title: t("ADD_CLEAR_ROW"),
                  ariaLabel: t("ADD_CLEAR_ROW"),
                  disabled: addSaving || addRowDisabledByInlineEdit,
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
            countNoun: t("ROLES"),
            labels: { t, filteredOnly: "FOOTER_OF_TOTAL_ROLES" },
          }}
        />
      </div>

      <DeletePermanentConfirmModal
        open={deleteModalOpen}
        onClose={closeDeleteModal}
        title={t("DELETE_ROLES")}
        titleId="dm-roles-delete-title"
        dismissDisabled={deleteRunning}
        closeAriaLabel={t("CLOSE")}
        cancelLabel={t("CANCEL")}
        onCancel={closeDeleteModal}
        confirmLabel={t("DELETE_PERMANENTLY")}
        confirmLoadingLabel={t("DELETING")}
        confirmLoading={deleteRunning}
        onConfirm={handleConfirmBulkDelete}
      >
        <p className="modal-lead">
          {t("DELETE_ROLES_MODAL_LEAD").replace(
            "{count}",
            String(rowsToDelete.length)
          )}
        </p>
        <ul className="modal-list">
          {rowsToDelete.map((r, idx) => (
            <li key={roleRowId(r) || `role-del-${idx}`}>
              <span className="modal-list-name">
                {(r.name ?? "").trim() || r.role_code || `ID ${r.id}`}
              </span>
              <span className="modal-list-meta">{r.role_code}</span>
            </li>
          ))}
        </ul>
        {deleteRunError && (
          <p className="modal-error" style={{ marginTop: 12 }}>
            {deleteRunError}
          </p>
        )}
      </DeletePermanentConfirmModal>

      <Drawer
        open={configPanelOpen}
        onClose={closeConfigPanel}
        closeOnOverlayClick={false}
        allowBackgroundInteraction={configPanelOpen}
        title={
          configPanelRow
            ? `${t("ROLE")}: ${configPanelRow.name?.trim() || configPanelRow.role_code || `ID ${configPanelRow.id}`}`
            : t("ROLES")
        }
        width="50%"
        zIndexClassName="z-[500]"
        bodyClassName="sp-body-wrap p-0"
        headerActions={
          configPanelRow ? (
            <PrimarySaveButton
              disabled={
                !rolePermState.canSave ||
                rolePermState.saving ||
                rolePermState.loading ||
                rolePermState.resourcesError != null
              }
              onClick={() => void handleRolePermSave()}
              className="shrink-0"
            >
              {rolePermState.saving ? t("SAVING") : t("SAVE")}
            </PrimarySaveButton>
          ) : null
        }
      >
        {configPanelRow ? <RolePermissionsForm t={t} perm={rolePermState} /> : null}
      </Drawer>
    </>
  );
}
