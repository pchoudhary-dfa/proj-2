"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { RefObject } from "react";
import { toast } from "sonner";
import { getRequest, putRequest } from "@/lib/api/http";
import type { RoleRaw } from "@/lib/api/types";
import { Loader } from "@/components/Loader";
import { MainTabsBar } from "@/components/MainTabsBar";
import { SearchInputBar } from "@/components/SearchInputBar";
import { ToggleSwitch } from "@/components/ToggleSwitch";
import { getIAMAPIURL, IAM_ROLES_PATH } from "@/lib/constants";

export type CrudLetter = "C" | "R" | "U" | "D";

const CRUD_ORDER: CrudLetter[] = ["C", "R", "U", "D"];

/**
 * Mirrors backend `CRUD_HTTP_METHOD_MAP` in dfa-toolkit-api `apps/shared/config/config.py`:
 * C→POST, R→GET, U→PUT+PATCH, D→DELETE
 */
export const CRUD_HTTP_METHOD_MAP_UI: readonly {
  letter: CrudLetter;
  titleKey: string;
  httpKey: string;
}[] = [
  { letter: "C", titleKey: "CREATE", httpKey: "ROLE_PERM_HTTP_POST" },
  { letter: "R", titleKey: "ROLE_PERM_CRUD_READ", httpKey: "ROLE_PERM_HTTP_GET" },
  { letter: "U", titleKey: "UPDATE", httpKey: "ROLE_PERM_HTTP_PUT_PATCH" },
  { letter: "D", titleKey: "DELETE", httpKey: "ROLE_PERM_HTTP_DELETE" },
] as const;

function normalizeCrud(letters: CrudLetter[]): CrudLetter[] {
  const s = new Set(letters);
  return CRUD_ORDER.filter((x) => s.has(x));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export interface IAMResourceNode {
  id: number;
  parent_id: number;
  resource_code: string;
  name: string | null;
  display_order: number;
  description?: string | null;
  /** CRUD letters that exist on iam_resource_api for this resource; empty = no assignable APIs. */
  applicable_crud?: CrudLetter[];
  children: IAMResourceNode[];
}

/** Tree node that has children — resource group row only; never assign permissions (only on leaves). */
export function isResourceParentNode(node: IAMResourceNode): boolean {
  return (node.children?.length ?? 0) > 0;
}

/**
 * Letters the role-permissions UI may assign (leaf rows only).
 * - Parent folders: never assignable (empty).
 * - Missing `applicable_crud` (older API): all four for leaves.
 * - Empty array on leaf: no registered API methods.
 */
export function getApplicableCrudLetters(node: IAMResourceNode | undefined): CrudLetter[] {
  if (!node) return [...CRUD_ORDER];
  if (isResourceParentNode(node)) return [];
  if (node.applicable_crud === undefined) return [...CRUD_ORDER];
  return normalizeCrud(node.applicable_crud);
}

function flattenResourceTree(nodes: IAMResourceNode[]): IAMResourceNode[] {
  const out: IAMResourceNode[] = [];
  function walk(n: IAMResourceNode) {
    out.push(n);
    for (const c of n.children ?? []) walk(c);
  }
  for (const n of nodes) walk(n);
  return out;
}

function filterResourceTree(nodes: IAMResourceNode[], q: string): IAMResourceNode[] {
  const qq = q.trim().toLowerCase();
  if (!qq) return nodes;
  const filterNode = (n: IAMResourceNode): IAMResourceNode | null => {
    const kids = (n.children ?? []).map(filterNode).filter(Boolean) as IAMResourceNode[];
    const self =
      n.resource_code.toLowerCase().includes(qq) || (n.name?.toLowerCase().includes(qq) ?? false);
    if (self || kids.length > 0) {
      return { ...n, children: kids };
    }
    return null;
  };
  return nodes.map(filterNode).filter(Boolean) as IAMResourceNode[];
}

function parseGroupedResourceData(raw: unknown): IAMResourceNode[] | null {
  if (!Array.isArray(raw)) return null;
  const parseNode = (x: unknown): IAMResourceNode | null => {
    if (!isRecord(x)) return null;
    const id = x.id;
    const resource_code = x.resource_code;
    if (typeof id !== "number" || typeof resource_code !== "string") return null;
    const parent_id = typeof x.parent_id === "number" ? x.parent_id : 0;
    const name = typeof x.name === "string" ? x.name : null;
    const display_order = typeof x.display_order === "number" ? x.display_order : 0;
    const description = typeof x.description === "string" ? x.description : undefined;
    const rawChildren = x.children;
    const children: IAMResourceNode[] = Array.isArray(rawChildren)
      ? (rawChildren.map(parseNode).filter(Boolean) as IAMResourceNode[])
      : [];
    let applicable_crud: CrudLetter[] | undefined;
    if (Array.isArray(x.applicable_crud)) {
      applicable_crud = normalizeCrud(
        x.applicable_crud.filter((p) => p === "C" || p === "R" || p === "U" || p === "D") as CrudLetter[]
      );
    }
    return {
      id,
      parent_id,
      resource_code,
      name,
      display_order,
      description,
      applicable_crud,
      children,
    };
  };
  const roots = raw.map(parseNode).filter(Boolean) as IAMResourceNode[];
  return roots.length > 0 || raw.length === 0 ? roots : null;
}

function parseRolePermissionsGet(json: unknown): Map<string, CrudLetter[]> | null {
  if (!isRecord(json) || json.success !== true || json.data == null) return null;
  const data = json.data as Record<string, unknown>;
  const rawList = (data.resources ?? data) as unknown;
  if (!Array.isArray(rawList)) return null;
  const map = new Map<string, CrudLetter[]>();
  for (const item of rawList) {
    if (!isRecord(item)) continue;
    const code = item.resource_code;
    if (typeof code !== "string") continue;
    const perms = item.permissions;
    const letters: CrudLetter[] = [];
    if (Array.isArray(perms)) {
      for (const p of perms) {
        if (p === "C" || p === "R" || p === "U" || p === "D") letters.push(p);
      }
    }
    map.set(code, normalizeCrud(letters));
  }
  return map;
}

function roleIsSuperAdmin(r: RoleRaw): boolean {
  return r.is_super_admin === 1 || r.is_super_admin === true;
}

export type RolePermLoadSource = "api" | "super_admin_fallback" | "unsafe_empty";

/** Tab selection → GET /iam/resources `is_dw_spec` (backend filters `iam_resource.is_dw_spec`). */
export type RolePermResourceScope = "datawarehouse" | "application";

export function useRoleResourcePermissions(
  role: RoleRaw | null,
  t: (key: string) => string
) {
  const isSuperAdminRole = role ? roleIsSuperAdmin(role) : false;
  const [resourceScope, setResourceScope] = useState<RolePermResourceScope>("application");
  const [loading, setLoading] = useState(false);
  const [resourcesError, setResourcesError] = useState<string | null>(null);
  const [tree, setTree] = useState<IAMResourceNode[]>([]);
  const [flat, setFlat] = useState<IAMResourceNode[]>([]);
  /** Full resource list (unscoped) — used for save payload and toggle applicability. */
  const [saveFlat, setSaveFlat] = useState<IAMResourceNode[]>([]);
  const [crudByCode, setCrudByCode] = useState<Record<string, CrudLetter[]>>({});
  const [loadSource, setLoadSource] = useState<RolePermLoadSource | null>(null);
  const [saving, setSaving] = useState(false);
  const lastRoleIdRef = useRef<number | null>(null);

  const reset = useCallback(() => {
    setLoading(false);
    setResourcesError(null);
    setTree([]);
    setFlat([]);
    setSaveFlat([]);
    setCrudByCode({});
    setLoadSource(null);
    setSaving(false);
    setResourceScope("application");
    lastRoleIdRef.current = null;
  }, []);

  useEffect(() => {
    if (!role) {
      reset();
      return;
    }

    const currentRole = role;
    const roleChanged = lastRoleIdRef.current !== currentRole.id;
    if (roleChanged) {
      lastRoleIdRef.current = currentRole.id;
      setResourceScope("application");
    }

    const scopeForThisFetch: RolePermResourceScope = roleChanged ? "application" : resourceScope;

    let cancelled = false;

    async function run() {
      if (!roleChanged) {
        setTree([]);
        setFlat([]);
      }
      setLoading(true);
      setResourcesError(null);
      if (roleChanged) {
        setLoadSource(null);
      }

      try {
        if (roleChanged) {
          const fullUrl = `${getIAMAPIURL("/iam/resources")}?view=group_by`;
          let fullJson: unknown;
          try {
            fullJson = await getRequest(fullUrl, t("ROLE_PERM_LOAD_RESOURCES_FAILED"), {
              suppressErrorMessage: true,
            });
          } catch {
            if (!cancelled) {
              setResourcesError(t("ROLE_PERM_LOAD_RESOURCES_FAILED"));
              setLoading(false);
            }
            return;
          }

          if (cancelled) return;

          if (!isRecord(fullJson) || fullJson.success !== true) {
            let msg = t("ROLE_PERM_LOAD_RESOURCES_FAILED");
            if (isRecord(fullJson) && typeof fullJson.err_message === "string") {
              msg = fullJson.err_message;
            }
            setResourcesError(msg);
            setLoading(false);
            return;
          }

          const fullRoots = parseGroupedResourceData(fullJson.data);
          if (!fullRoots) {
            setResourcesError(t("ROLE_PERM_LOAD_RESOURCES_FAILED"));
            setLoading(false);
            return;
          }

          const allFlat = flattenResourceTree(fullRoots);
          if (cancelled) return;
          setSaveFlat(allFlat);

          const permUrl = `${getIAMAPIURL(IAM_ROLES_PATH)}/${currentRole.id}/resource-permissions`;
          let permJson: unknown;
          try {
            permJson = await getRequest(permUrl, undefined, { suppressErrorMessage: true });
          } catch {
            permJson = { success: false };
          }

          if (cancelled) return;

          const fromApi = parseRolePermissionsGet(permJson);
          const initial: Record<string, CrudLetter[]> = {};
          for (const node of allFlat) {
            initial[node.resource_code] = [];
          }

          if (fromApi != null) {
            for (const node of allFlat) {
              const appl = getApplicableCrudLetters(node);
              initial[node.resource_code] = normalizeCrud(
                (fromApi.get(node.resource_code) ?? []).filter((l) => appl.includes(l))
              );
            }
            setLoadSource("api");
          } else if (roleIsSuperAdmin(currentRole)) {
            for (const node of allFlat) {
              initial[node.resource_code] = [...getApplicableCrudLetters(node)];
            }
            setLoadSource("super_admin_fallback");
          } else {
            setLoadSource("unsafe_empty");
          }

          setCrudByCode(initial);
        }

        const isDwSpec =
          scopeForThisFetch === "datawarehouse" ? "true" : "false";
        const scopedUrl = `${getIAMAPIURL("/iam/resources")}?view=group_by&is_dw_spec=${isDwSpec}`;
        let scopedJson: unknown;
        try {
          scopedJson = await getRequest(scopedUrl, t("ROLE_PERM_LOAD_RESOURCES_FAILED"), {
            suppressErrorMessage: true,
          });
        } catch {
          if (!cancelled) {
            setResourcesError(t("ROLE_PERM_LOAD_RESOURCES_FAILED"));
            setLoading(false);
          }
          return;
        }

        if (cancelled) return;

        if (!isRecord(scopedJson) || scopedJson.success !== true) {
          let msg = t("ROLE_PERM_LOAD_RESOURCES_FAILED");
          if (isRecord(scopedJson) && typeof scopedJson.err_message === "string") {
            msg = scopedJson.err_message;
          }
          setResourcesError(msg);
          setLoading(false);
          return;
        }

        const scopedRoots = parseGroupedResourceData(scopedJson.data);
        if (!scopedRoots) {
          setResourcesError(t("ROLE_PERM_LOAD_RESOURCES_FAILED"));
          setLoading(false);
          return;
        }

        if (cancelled) return;
        setTree(scopedRoots);
        setFlat(flattenResourceTree(scopedRoots));
        setLoading(false);
      } catch {
        if (!cancelled) {
          setResourcesError(t("ROLE_PERM_LOAD_RESOURCES_FAILED"));
          setLoading(false);
        }
      }
    }

    void run();
    return () => {
      cancelled = true;
    };
  }, [role?.id, resourceScope, reset, t]);

  const canSave =
    !isSuperAdminRole &&
    (loadSource === "api" || loadSource === "super_admin_fallback");

  const toggleCrud = useCallback((resourceCode: string, letter: CrudLetter) => {
    if (isSuperAdminRole) return;
    const node = saveFlat.find((n) => n.resource_code === resourceCode);
    if (!getApplicableCrudLetters(node).includes(letter)) return;
    setCrudByCode((prev) => {
      const cur = prev[resourceCode] ?? [];
      const has = cur.includes(letter);
      const next = has ? cur.filter((x) => x !== letter) : [...cur, letter];
      return { ...prev, [resourceCode]: normalizeCrud(next) };
    });
  }, [isSuperAdminRole, saveFlat]);

  const save = useCallback(async () => {
    if (!role || !canSave) return false;
    setSaving(true);
    try {
      const resources = saveFlat.map((node) => {
        const appl = getApplicableCrudLetters(node);
        return {
          resource_code: node.resource_code,
          permissions: normalizeCrud(
            (crudByCode[node.resource_code] ?? []).filter((l) => appl.includes(l))
          ),
        };
      });

      const url = `${getIAMAPIURL(IAM_ROLES_PATH)}/${role.id}/resource-permissions`;
      const res = await putRequest(
        url,
        {
          data: {
            role: { role_id: role.id },
            resources,
          },
        },
        undefined,
        undefined,
        { suppressErrorMessage: true }
      );

      if (!isRecord(res) || res.success !== true) {
        const msg =
          typeof res?.err_message === "string" ? res.err_message : t("ROLE_PERM_SAVE_FAILED");
        toast.error(msg);
        return false;
      }

      toast.success(t("ROLE_PERM_SAVE_SUCCESS"));
      setLoadSource("api");
      return true;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("ROLE_PERM_SAVE_FAILED"));
      return false;
    } finally {
      setSaving(false);
    }
  }, [role, canSave, saveFlat, crudByCode, t]);

  return {
    loading,
    resourcesError,
    tree,
    flat,
    saveFlat,
    crudByCode,
    loadSource,
    saving,
    canSave,
    isReadOnlySuperAdmin: isSuperAdminRole,
    toggleCrud,
    save,
    effectiveRoleId: role?.id ?? null,
    resourceScope,
    setResourceScope,
  };
}

export type RoleResourcePermissionsController = ReturnType<typeof useRoleResourcePermissions>;

/**
 * Two-column layout: resource | permissions block.
 * Second column must NOT be `auto` — empty parent rows would shrink it and break header/checkbox alignment.
 * Use fractional tracks so every row shares the same split; inner grid aligns CRUD cells under headers.
 * Resource column is intentionally narrower — labels truncate; CRUD headers/toggles need more room.
 */
const PERM_ROW_OUTER =
  "grid grid-cols-[minmax(11rem,0.68fr)_minmax(0,1.32fr)] gap-x-0 border-b border-border px-3";

/** Right padding only — vertical rule is one full-height element (see RolePermissionsForm). */
const RESOURCE_COL_PAD = "min-w-0 pr-2 sm:pr-3";

/** Four tracks with a minimum width so toggles stay aligned under Create / Read / … headers. */
const PERM_INNER_GRID =
  "grid w-full min-w-0 grid-cols-[repeat(4,minmax(4.75rem,1fr))] items-center justify-items-center gap-x-2 pl-2 sm:gap-x-3 sm:pl-3";

function CrudColumnHeaders({
  t,
  resourceMeasureRef,
  search,
  setSearch,
}: {
  t: (key: string) => string;
  resourceMeasureRef: RefObject<HTMLDivElement | null>;
  search: string;
  setSearch: (value: string) => void;
}) {
  return (
    <div
      className={`${PERM_ROW_OUTER} shrink-0 bg-surface-muted/60 py-2.5 text-text`}
      role="row"
    >
      <div
        ref={resourceMeasureRef}
        className={`flex flex-col gap-2 ${RESOURCE_COL_PAD}`}
      >
        <div className="text-xs font-semibold uppercase tracking-wide text-text-muted">
          {t("ROLE_PERM_GRID_MODULES")}
        </div>
        <SearchInputBar
          embedded
          id="role-perm-search"
          size="sm"
          wrapperClassName="w-full"
          fieldClassName="w-full"
          placeholder={t("ROLE_PERM_SEARCH_PLACEHOLDER")}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label={t("ROLE_PERM_SEARCH_LABEL")}
          type="search"
          autoComplete="off"
        />
      </div>
      <div className={PERM_INNER_GRID}>
        {CRUD_HTTP_METHOD_MAP_UI.map(({ letter, titleKey, httpKey }) => (
          <div
            key={letter}
            className="w-full min-w-0 text-center text-xs font-semibold leading-tight sm:text-xs"
          >
            <span className="block text-text">{t(titleKey)}</span>
            <span className="mt-0.5 block font-normal text-xs text-text-muted sm:text-xs">
              {t(httpKey)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ResourceParentRow({
  node,
  depth,
  t,
}: {
  node: IAMResourceNode;
  depth: number;
  t: (key: string) => string;
}) {
  const label = (node.name?.trim() || node.resource_code) ?? node.resource_code;
  return (
    <div
      className={`${PERM_ROW_OUTER} items-center bg-[color:color-mix(in_srgb,var(--color-surface-muted)_65%,var(--color-surface))] py-2`}
      role="row"
    >
      <div
        className={`min-w-0 py-0.5 ${RESOURCE_COL_PAD}`}
        style={{ paddingLeft: depth * 16 }}
      >
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="shrink-0 rounded-md border border-border bg-surface px-1.5 py-0.5 text-xs font-semibold text-text-muted" style={{display: "none"}}>
            {t("ROLE_PERM_PARENT_GROUP")}
          </span>
          <span className="font-semibold text-text">{label}</span>
          <span className="text-text-muted" style={{display: "none"}}>{node.resource_code}</span>
        </div>
      </div>
      <div className="min-h-[1.75rem] w-full min-w-0" aria-hidden />
    </div>
  );
}

function ResourceLeafCheckboxRow({
  node,
  depth,
  crud,
  readOnly,
  onToggle,
  t,
}: {
  node: IAMResourceNode;
  depth: number;
  crud: CrudLetter[];
  readOnly: boolean;
  onToggle: (code: string, letter: CrudLetter) => void;
  t: (key: string) => string;
}) {
  const label = (node.name?.trim() || node.resource_code) ?? node.resource_code;
  const applicable = getApplicableCrudLetters(node);

  return (
    <div
      className={`${PERM_ROW_OUTER} items-center py-2.5 text-xs hover:bg-surface-muted/25`}
      role="row"
    >
      <div
        className={`min-w-0 ${RESOURCE_COL_PAD}`}
        style={{ paddingLeft: depth * 16 }}
      >
        <div className="truncate font-medium text-text" title={label}>
          {label}
        </div>
        <div className="truncate text-xs text-text-muted" style={{display: "none"}} title={node.resource_code}>
          {node.resource_code}
        </div>
      </div>
      <div className={PERM_INNER_GRID}>
        {CRUD_HTTP_METHOD_MAP_UI.map(({ letter, titleKey, httpKey }) => {
          const enabled = applicable.includes(letter);
          const checked = crud.includes(letter);
          const verb = t(titleKey);
          const http = t(httpKey);
          const title = enabled
            ? `${verb} (${http})`
            : `${verb} (${http}) — ${t("ROLE_PERM_CRUD_NOT_AVAILABLE")}`;
          return (
            <div key={letter} className="flex w-full justify-center">
              <ToggleSwitch
                checked={checked}
                disabled={!enabled || readOnly}
                title={title}
                aria-label={`${node.resource_code}: ${verb} (${http})`}
                onCheckedChange={() => onToggle(node.resource_code, letter)}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ResourceTreeRows({
  nodes,
  depth,
  crudByCode,
  readOnly,
  onToggle,
  t,
}: {
  nodes: IAMResourceNode[];
  depth: number;
  crudByCode: Record<string, CrudLetter[]>;
  readOnly: boolean;
  onToggle: (code: string, letter: CrudLetter) => void;
  t: (key: string) => string;
}) {
  return (
    <>
      {nodes.map((node) => (
        <div key={node.id}>
          {isResourceParentNode(node) ? (
            <ResourceParentRow node={node} depth={depth} t={t} />
          ) : (
            <ResourceLeafCheckboxRow
              node={node}
              depth={depth}
              crud={crudByCode[node.resource_code] ?? []}
              readOnly={readOnly}
              onToggle={onToggle}
              t={t}
            />
          )}
          {node.children?.length ? (
            <ResourceTreeRows
              nodes={node.children}
              depth={depth + 1}
              crudByCode={crudByCode}
              readOnly={readOnly}
              onToggle={onToggle}
              t={t}
            />
          ) : null}
        </div>
      ))}
    </>
  );
}

export function RolePermissionsForm({
  t,
  perm,
}: {
  t: (key: string) => string;
  perm: RoleResourcePermissionsController;
}) {
  const {
    loading,
    resourcesError,
    tree,
    crudByCode,
    loadSource,
    isReadOnlySuperAdmin,
    toggleCrud,
    effectiveRoleId,
    resourceScope,
    setResourceScope,
    saveFlat,
  } = perm;

  const [search, setSearch] = useState("");
  const permTableRef = useRef<HTMLDivElement>(null);
  const resourceColumnMeasureRef = useRef<HTMLDivElement>(null);
  const [resourceDividerPx, setResourceDividerPx] = useState<number | null>(null);

  const filteredTree = useMemo(() => filterResourceTree(tree, search), [tree, search]);
  const initialLoading = loading && saveFlat.length === 0;
  const scopeReloading = loading && saveFlat.length > 0;

  useEffect(() => {
    setSearch("");
  }, [effectiveRoleId, resourceScope]);

  useLayoutEffect(() => {
    const container = permTableRef.current;
    const resourceCell = resourceColumnMeasureRef.current;
    if (!container || !resourceCell) {
      setResourceDividerPx(null);
      return;
    }

    const syncDivider = () => {
      const cr = container.getBoundingClientRect();
      const rr = resourceCell.getBoundingClientRect();
      const left = Math.round(rr.right - cr.left);
      setResourceDividerPx(left > 0 ? left : null);
    };

    syncDivider();
    const ro = new ResizeObserver(() => syncDivider());
    ro.observe(container);
    ro.observe(resourceCell);
    window.addEventListener("resize", syncDivider);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", syncDivider);
    };
  }, [filteredTree, effectiveRoleId, tree]);

  if (initialLoading) {
    return (
      <div className="sp-body flex min-h-[200px] flex-1 items-center justify-center">
        <Loader loadingLabel={t("ROLE_PERM_LOADING")} />
      </div>
    );
  }

  if (resourcesError) {
    return (
      <div className="sp-body">
        <p className="rounded-md border border-error/30 bg-error/10 px-3 py-2 text-xs text-error">
          {resourcesError}
        </p>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <MainTabsBar
        tablistAccessibility={{ ariaLabel: t("ROLE_PERM_SCOPE_TABS_ARIA") }}
        tabs={[
          {
            value: "application",
            label: t("ROLE_PERM_TAB_APPLICATION_MODULE"),
            icon: "apps",
            disabled: scopeReloading,
          },
          {
            value: "datawarehouse",
            label: t("ROLE_PERM_TAB_DATAWAREHOUSE_MODULE"),
            icon: "storage",
            disabled: scopeReloading,
          },
        ]}
        activeValue={resourceScope}
        onSelect={(v) => setResourceScope(v)}
        removeBorder={true}
      />

      <div className="flex min-h-0 flex-1 flex-col">
        <div
          ref={permTableRef}
          className="relative flex min-h-0 flex-1 flex-col overflow-hidden border border-border bg-surface"
        >
          <CrudColumnHeaders 
            t={t} 
            resourceMeasureRef={resourceColumnMeasureRef}
            search={search}
            setSearch={setSearch}
          />
          <div
            className="relative min-h-0 flex-1 overflow-y-auto"
            aria-label={t("ROLE_RESOURCE_PERMISSIONS_HEADING")}
          >
            {scopeReloading ? (
              <div className="absolute inset-0 z-[6] flex items-center justify-center bg-[color:color-mix(in_srgb,var(--color-surface)_76%,transparent)] backdrop-blur-[1px]">
                <Loader loadingLabel={t("ROLE_PERM_SCOPE_LOADING")} />
              </div>
            ) : null}
            <ResourceTreeRows
              nodes={filteredTree}
              depth={0}
              crudByCode={crudByCode}
              readOnly={isReadOnlySuperAdmin}
              onToggle={toggleCrud}
              t={t}
            />
          </div>
          {resourceDividerPx != null && resourceDividerPx > 0 ? (
            <div
              aria-hidden
              className="pointer-events-none absolute inset-y-0 z-[8] w-px bg-border"
              style={{ left: resourceDividerPx }}
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}
