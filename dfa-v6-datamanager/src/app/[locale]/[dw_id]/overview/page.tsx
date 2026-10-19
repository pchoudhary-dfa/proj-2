"use client";

import type {
  DatawarehouseLanguageItem,
  DatawarehouseLanguagesResult,
  DatawarehouseMetadataData,
  DatawarehouseMetadataResult,
  DatawarehouseUserListItem,
  DatawarehouseUsersMeta,
  DatawarehouseUsersResult,
  DatawarehouseUsersSuccess,
  FetchDatawarehouseUsersParams,
  UpdateDatawarehouseMetadataPayload,
  UpdateDatawarehouseMetadataResult,
} from "@/lib/api/types";
import { getRequest, patchRequest } from "@/lib/api/http";
import {
  API_BASE_URL,
  getDWAPIURL,
  REFERENCE_PATH_DB_METADATA,
  REFERENCE_PATH_LANGUAGES,
  REFERENCE_PATH_USERS,
} from "@/lib/constants";
import { useCore } from "@/contexts/CoreContext";
import { useSidebar } from "@/contexts/SidebarContext";
import {
  APP_ROUTE_PERMISSIONS,
  DW_ROUTE_PERMISSIONS,
  hasAnyDwPermission,
  hasDwPermission,
  hasPermission,
} from "@/lib/auth/user";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Drawer from "@/components/Drawer";
import { PrimaryButton } from "@/components/PrimaryButton";
import { PrimarySaveButton } from "@/components/PrimarySaveButton";
import { SecondaryButton } from "@/components/SecondaryButton";
import { TextAreaField } from "@/components/TextAreaField";
import { SelectField } from "@/components/SelectField";

type DwParams = {
  locale: string;
  dw_id: string;
};

const USER_AVATAR_BG_CLASSES = [
  "bg-primary",
  "bg-info",
  "bg-success",
  "bg-warning",
  "bg-error",
] as const;

function toRoleLabel(roleCode: string): string {
  return roleCode
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

function getUserDisplayName(user: DatawarehouseUserListItem): string {
  const firstName = (user.first_name ?? "").trim();
  const lastName = (user.last_name ?? "").trim();
  const fullName = `${firstName} ${lastName}`.trim();
  if (fullName) return fullName;

  const username = (user.username ?? "").trim();
  if (username) return username;

  const email = (user.email ?? "").trim();
  if (email) return email;

  return "Unknown User";
}

function getUserInitials(user: DatawarehouseUserListItem): string {
  const name = getUserDisplayName(user);
  const parts = name.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0][0] ?? ""}${parts[1][0] ?? ""}`.toUpperCase();
  }
  return (parts[0]?.slice(0, 2) ?? "U").toUpperCase();
}

function getAvatarColorClass(index: number): string {
  const normalizedIndex = Math.abs(index);
  return USER_AVATAR_BG_CLASSES[normalizedIndex % USER_AVATAR_BG_CLASSES.length];
}

function formatCount(value: number | null | undefined): string {
  if (typeof value !== "number" || Number.isNaN(value)) return "-";
  return value.toLocaleString("en-US");
}

function formatPublicationDate(value: string | null | undefined): string {
  if (!value || !value.trim()) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

/** Dedupes concurrent overview API calls (React Strict Mode + effect re-runs). */
const metadataRequestPromises = new Map<string, Promise<DatawarehouseMetadataResult>>();
const languagesRequestPromises = new Map<string, Promise<DatawarehouseLanguagesResult>>();
const usersRequestPromises = new Map<string, Promise<DatawarehouseUsersResult>>();

type OverviewPageLoadResult = {
  metadata: DatawarehouseMetadataData | null;
  languages: DatawarehouseLanguageItem[];
  users: DatawarehouseUserListItem[];
  usersMeta: DatawarehouseUsersMeta | null;
  usersLoadFailed: boolean;
};

let overviewLoadInflight: Promise<OverviewPageLoadResult> | null = null;
let overviewLoadInflightKey: string | null = null;

async function fetchDatawarehouseMetadata(
  dwId: string,
): Promise<DatawarehouseMetadataResult> {
  const inflight = metadataRequestPromises.get(dwId);
  if (inflight) return inflight;

  const promise = (async () => {
    const json = await getRequest(
      getDWAPIURL(dwId, REFERENCE_PATH_DB_METADATA),
      undefined,
      { suppressErrorMessage: true }
    );
    return json as DatawarehouseMetadataResult;
  })();

  metadataRequestPromises.set(dwId, promise);
  void promise.finally(() => {
    if (metadataRequestPromises.get(dwId) === promise) {
      metadataRequestPromises.delete(dwId);
    }
  });
  return promise;
}

async function updateDatawarehouseMetadata(
  dwId: string,
  payload: UpdateDatawarehouseMetadataPayload,
): Promise<UpdateDatawarehouseMetadataResult> {
  const json = await patchRequest(
    getDWAPIURL(dwId, REFERENCE_PATH_DB_METADATA),
    payload as unknown as Record<string, unknown>,
    undefined,
    undefined,
    { suppressErrorMessage: true }
  );
  return json as UpdateDatawarehouseMetadataResult;
}

async function fetchDatawarehouseLanguages(
  dwId: string,
): Promise<DatawarehouseLanguagesResult> {
  const inflight = languagesRequestPromises.get(dwId);
  if (inflight) return inflight;

  const promise = (async () => {
    const json = await getRequest(
      getDWAPIURL(dwId, REFERENCE_PATH_LANGUAGES),
      undefined,
      { suppressErrorMessage: true }
    );
    return json as DatawarehouseLanguagesResult;
  })();

  languagesRequestPromises.set(dwId, promise);
  void promise.finally(() => {
    if (languagesRequestPromises.get(dwId) === promise) {
      languagesRequestPromises.delete(dwId);
    }
  });
  return promise;
}

async function fetchDatawarehouseUsers(
  dwId: string,
  params: FetchDatawarehouseUsersParams = {},
): Promise<DatawarehouseUsersResult> {
  const searchParams = new URLSearchParams();
  if (params.page != null) searchParams.set("page", String(params.page));
  if (params.page_size != null) searchParams.set("page_size", String(params.page_size));
  if (params.sort_field) searchParams.set("sort_field", params.sort_field);
  if (params.sort_order) searchParams.set("sort_order", params.sort_order);
  if (params.search != null && params.search !== "") searchParams.set("search", params.search);
  if (params.search_by) searchParams.set("search_by", params.search_by);
  if (params.role_code) searchParams.set("role_code", params.role_code);
  if (params.view) searchParams.set("view", params.view);
  const query = searchParams.toString();
  const cacheKey = `${dwId}:${query}`;
  const inflight = usersRequestPromises.get(cacheKey);
  if (inflight) return inflight;

  const promise = (async () => {
    const url = `${getDWAPIURL(dwId, REFERENCE_PATH_USERS)}${query ? `?${query}` : ""}`;
    const json = await getRequest(url, undefined, { suppressErrorMessage: true });
    return json as DatawarehouseUsersResult;
  })();

  usersRequestPromises.set(cacheKey, promise);
  void promise.finally(() => {
    if (usersRequestPromises.get(cacheKey) === promise) {
      usersRequestPromises.delete(cacheKey);
    }
  });
  return promise;
}

async function fetchOverviewPageData(
  dwId: string,
  opts: { canViewLanguages: boolean; canViewUsers: boolean }
): Promise<OverviewPageLoadResult> {
  const loadKey = `${dwId}:${opts.canViewLanguages}:${opts.canViewUsers}`;
  if (overviewLoadInflight && overviewLoadInflightKey === loadKey) {
    return overviewLoadInflight;
  }

  const promise = (async (): Promise<OverviewPageLoadResult> => {
    const metadataRes = await fetchDatawarehouseMetadata(dwId);
    const metadata = metadataRes.success ? metadataRes.data : null;

    let languages: DatawarehouseLanguageItem[] = [];
    if (opts.canViewLanguages) {
      const languagesRes = await fetchDatawarehouseLanguages(dwId);
      languages =
        languagesRes.success && Array.isArray(languagesRes.data)
          ? languagesRes.data
          : [];
    }

    let users: DatawarehouseUserListItem[] = [];
    let usersMeta: DatawarehouseUsersMeta | null = null;
    let usersLoadFailed = false;
    if (opts.canViewUsers) {
      const usersRes = await fetchDatawarehouseUsers(dwId, {
        sort_field: "id",
        sort_order: "asc",
        view: "flat",
      });
      if (usersRes.success) {
        users = Array.isArray(usersRes.data) ? usersRes.data : [];
        usersMeta = usersRes.meta ?? null;
      } else {
        usersLoadFailed = true;
      }
    }

    return { metadata, languages, users, usersMeta, usersLoadFailed };
  })();

  overviewLoadInflight = promise;
  overviewLoadInflightKey = loadKey;
  void promise.finally(() => {
    if (overviewLoadInflight === promise) {
      overviewLoadInflight = null;
      overviewLoadInflightKey = null;
    }
  });
  return promise;
}

export default function DatawarehouseOverviewPage() {
  const params = useParams<DwParams>();
  const router = useRouter();
  const locale = params?.locale ?? "en";
  const dwId = params?.dw_id ?? "";
  const { t } = useCore();
  const tRef = useRef(t);
  tRef.current = t;
  const { dwOptions } = useSidebar();
  const dwName = useMemo(
    () => dwOptions.find((d) => d.id === dwId)?.name ?? null,
    [dwOptions, dwId],
  );
  const [metadata, setMetadata] = useState<DatawarehouseMetadataData | null>(null);
  const [languages, setLanguages] = useState<DatawarehouseLanguageItem[]>([]);
  const [users, setUsers] = useState<DatawarehouseUserListItem[]>([]);
  const [usersMeta, setUsersMeta] = useState<DatawarehouseUsersMeta | null>(null);
  const [isUsersLoading, setIsUsersLoading] = useState(false);
  const [usersError, setUsersError] = useState<string | null>(null);
  const [activeRoleCode, setActiveRoleCode] = useState("");
  const [isUsersPanelOpen, setIsUsersPanelOpen] = useState(false);
  const [isEditingMetadata, setIsEditingMetadata] = useState(false);
  const [isSavingMetadata, setIsSavingMetadata] = useState(false);
  const [metadataUpdateError, setMetadataUpdateError] = useState<string | null>(null);
  const [metadataDraft, setMetadataDraft] = useState("");
  const apiDocsUrl = `${API_BASE_URL.replace(/\/+$/, "")}/docs`;
  const canEditMetadata = hasPermission(
    APP_ROUTE_PERMISSIONS.datawarehouse.crud,
    "U"
  );
  const canViewLanguages = hasAnyDwPermission(
    DW_ROUTE_PERMISSIONS.administration.languages
  );
  const canViewUsers = hasPermission(
    APP_ROUTE_PERMISSIONS.administration.users.view,
    "R"
  );
  const canViewOperationalDashboard =
    hasDwPermission(DW_ROUTE_PERMISSIONS.dataManagement.parent, "R") &&
    hasAnyDwPermission(DW_ROUTE_PERMISSIONS.dataManagement.dataReview);

  const loadOverviewData = useCallback(
    async (opts?: { isCancelled?: () => boolean }) => {
      const isCancelled = opts?.isCancelled ?? (() => false);
      if (!dwId) return;

      if (canViewUsers) {
        if (!isCancelled()) {
          setIsUsersLoading(true);
          setUsersError(null);
        }
      }

      try {
        const result = await fetchOverviewPageData(dwId, {
          canViewLanguages,
          canViewUsers,
        });
        if (isCancelled()) return;

        setMetadata(result.metadata);
        setLanguages(result.languages);
        setUsers(result.users);
        setUsersMeta(result.usersMeta);
        setUsersError(
          result.usersLoadFailed ? tRef.current("USERS_LOAD_ERROR") : null
        );
      } catch {
        if (isCancelled()) return;
        setMetadata(null);
        setLanguages([]);
        setUsers([]);
        setUsersMeta(null);
        if (canViewUsers) {
          setUsersError(tRef.current("USERS_LOAD_ERROR"));
        }
      } finally {
        if (!isCancelled()) setIsUsersLoading(false);
      }
    },
    [canViewLanguages, canViewUsers, dwId]
  );

  useEffect(() => {
    let cancelled = false;
    void loadOverviewData({ isCancelled: () => cancelled });
    return () => {
      cancelled = true;
    };
  }, [loadOverviewData]);

  useEffect(() => {
    if (isEditingMetadata) return;
    const currentDescription = metadata?.description?.trim() || "";
    setMetadataDraft(currentDescription);
  }, [metadata, isEditingMetadata]);

  const statCards = useMemo(
    () => [
      { label: t("DATA_POINTS"), value: formatCount(metadata?.dbmtd_datacnt), icon: "storage" },
      { label: t("INDICATORS"), value: formatCount(metadata?.dbmtd_indcnt), icon: "analytics" },
      { label: t("AREAS"), value: formatCount(metadata?.dbmtd_areacnt), icon: "public" },
      {
        label: t("LAST_UPDATED"),
        value: formatPublicationDate(metadata?.publication_date),
        subtitle: metadata?.published_by ? `by ${metadata.published_by}` : undefined,
        icon: "calendar_today",
      },
    ],
    [metadata, t]
  );

  const reportTiles = useMemo(
    () =>
      [
        {
          key: "data-report",
          label: t("DATA_REPORT"),
          icon: "summarize",
          href: `/${locale}/${dwId}/reports/data-report`,
          show: true,
        },
        {
          key: "operational-dashboard",
          label: t("OPERATIONAL_DASHBOARD"),
          icon: "dashboard",
          href: `/${locale}/${dwId}/reports/operational-dashboard`,
          show: canViewOperationalDashboard,
        },
        {
          key: "operational-reports",
          label: t("OPERATIONAL_REPORTS"),
          icon: "assessment",
          href: `/${locale}/${dwId}/reports/operational-reports`,
          show: true,
        },
      ].filter((tile) => tile.show),
    [canViewOperationalDashboard, dwId, locale, t]
  );

  const usersWithUiMeta = useMemo(
    () =>
      users.map((user, index) => {
        const displayName = getUserDisplayName(user);
        return {
          ...user,
          displayName,
          initials: getUserInitials(user),
          bgClassName: getAvatarColorClass(index),
          roleCodes: Array.isArray(user.roles) ? user.roles.filter(Boolean) : [],
        };
      }),
    [users]
  );

  const drawerRoleTabs = useMemo(() => {
    const roleEntriesFromMeta = Object.entries(usersMeta?.roles ?? {}).map(([roleCode, role]) => ({
      roleCode,
      label: role.name?.trim() || toRoleLabel(roleCode),
    }));

    if (roleEntriesFromMeta.length > 0) {
      return roleEntriesFromMeta;
    }

    const uniqueRoleCodes = Array.from(
      new Set(usersWithUiMeta.flatMap((user) => user.roleCodes))
    ).sort();

    return uniqueRoleCodes.map((roleCode) => ({
      roleCode,
      label: toRoleLabel(roleCode),
    }));
  }, [usersMeta, usersWithUiMeta]);

  useEffect(() => {
    if (drawerRoleTabs.length === 0) {
      if (activeRoleCode !== "") setActiveRoleCode("");
    }
  }, [activeRoleCode, drawerRoleTabs]);

  const filteredDrawerUsers = useMemo(() => {
    if (!activeRoleCode) return usersWithUiMeta;
    return usersWithUiMeta.filter((user) => user.roleCodes.includes(activeRoleCode));
  }, [activeRoleCode, usersWithUiMeta]);

  const previewUsers = usersWithUiMeta.slice(0, 5);
  const totalUsersCount = usersMeta?.total_count ?? usersWithUiMeta.length;
  const remainingUsersCount = Math.max(totalUsersCount - previewUsers.length, 0);
  const drawerFooterCount = filteredDrawerUsers.length;

  return (
    <main className="relative min-h-0 flex-1 overflow-auto bg-surface-muted px-5 py-4">
      <div className="flex w-full flex-col gap-4">
        <section className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-4">
          {statCards.map((card) => (
            <article
              key={card.label}
              className="relative overflow-hidden rounded-xl border border-border bg-surface px-5 py-4 shadow-sm"
            >
              <div className="absolute inset-x-0 top-0 h-1 bg-primary" />
              <span className="page-chrome-icon mt-1 h-9 w-9 shadow-sm">
                <span className="material-icons text-sm leading-none text-primary">
                  {card.icon}
                </span>
              </span>
              <p className="mt-3 text-sm text-text-muted">{card.label}</p>
              <p className="mt-0.5 text-lg font-semibold leading-tight tracking-tight text-primary">
                {card.value}
              </p>
              {card.subtitle ? (
                <p className="text-sm text-text-muted">{card.subtitle}</p>
              ) : null}
            </article>
          ))}
        </section>

        <section className="rounded-md border border-border bg-surface">
          <div className="grid grid-cols-1 border-b border-border md:grid-cols-12">
            <div className="px-4 py-3 text-sm tracking-tight text-text-muted md:col-span-2">
              {t("LABEL_METADATA")}
            </div>
            <div className="px-4 py-3 md:col-span-10">
              {isEditingMetadata && canEditMetadata ? (
                <div className="w-full">
                  <TextAreaField
                    fieldSize="md"
                    className="resize-none px-3 py-2"
                    value={metadataDraft}
                    onChange={(e) => setMetadataDraft(e.target.value)}
                    rows={3}
                  />
                  <div className="mt-3 flex items-center gap-2">
                    <PrimarySaveButton
                      onClick={async () => {
                        const nextDescription =
                          metadataDraft.trim() || "";
                        if (!dwId) return;

                        setMetadataUpdateError(null);
                        setIsSavingMetadata(true);
                        try {
                          const result = await updateDatawarehouseMetadata(
                            dwId,
                            { description: nextDescription }
                          );

                          if (!result.success) {
                            setMetadataUpdateError(
                              result.err_message ?? t("METADATA_UPDATE_ERROR")
                            );
                            return;
                          }

                          setMetadata((prev) => ({
                            ...(prev ?? {}),
                            description: nextDescription,
                            publication_date:
                              result.data?.publication_date ?? prev?.publication_date ?? null,
                          }));
                          setMetadataDraft(nextDescription);
                          setIsEditingMetadata(false);
                        } catch {
                          setMetadataUpdateError(t("METADATA_UPDATE_ERROR"));
                        } finally {
                          setIsSavingMetadata(false);
                        }
                      }}
                      disabled={isSavingMetadata}
                    >
                      {isSavingMetadata ? t("SAVING") : t("SAVE")}
                    </PrimarySaveButton>
                    <SecondaryButton
                      type="button"
                      onClick={() => {
                        setMetadataUpdateError(null);
                        setMetadataDraft(
                          metadata?.description?.trim() || ""
                        );
                        setIsEditingMetadata(false);
                      }}
                    >
                      {t("CANCEL")}
                    </SecondaryButton>
                  </div>
                  {metadataUpdateError ? (
                    <p className="mt-2 text-xs text-error">{metadataUpdateError}</p>
                  ) : null}
                </div>
              ) : (
                <div className="flex items-start justify-between gap-3">
                  <p className="flex-1 text-xs text-text">
                    {metadata?.description?.trim() || ""}
                  </p>
                  {canEditMetadata ? (
                    <SecondaryButton
                      type="button"
                      icon="edit"
                      onClick={() => {
                        setMetadataUpdateError(null);
                        setIsEditingMetadata(true);
                      }}
                    >
                      {t("EDIT")}
                    </SecondaryButton>
                  ) : null}
                </div>
              )}
            </div>
          </div>
          {canViewLanguages ? (
            <div className="grid grid-cols-1 border-b border-border bg-surface-muted/40 md:grid-cols-12">
              <div className="px-4 py-3 text-sm tracking-tight text-text-muted md:col-span-2">
                {t("LANGUAGES")}
              </div>
              <div className="flex flex-wrap gap-2 px-4 py-3 md:col-span-10">
                {languages.length === 0 ? (
                  <span className="text-xs text-text-muted">{t("NO_LANGUAGES")}</span>
                ) : (
                  languages.map((language) => {
                    const name = (language.lang_name ?? "").trim();
                    const code = (language.lang_code ?? "").trim();
                    const lowerCode = code.toLowerCase();
                    const label =
                      code && name && !name.toLowerCase().includes(`[${lowerCode}]`)
                        ? `${name} [${code}]`
                        : name || code || "Unknown language";

                    const isDefault = language.lang_is_default === true;
                    return (
                      <span
                        key={`${language.lang_nid ?? label}-${code}`}
                        className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs ${
                          isDefault
                            ? "border-[color:color-mix(in_srgb,var(--color-primary)_25%,var(--color-border))] bg-[color:color-mix(in_srgb,var(--color-primary)_8%,var(--color-surface))] text-primary"
                            : "border-border text-text-muted"
                        }`}
                      >
                        {isDefault ? (
                          <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                        ) : null}
                        {label}
                      </span>
                    );
                  })
                )}
              </div>
            </div>
          ) : null}
          {canViewUsers ? (
          <div className="grid grid-cols-1 border-b border-border bg-surface-muted/40 md:grid-cols-12">
            <div className="px-4 py-3 text-sm tracking-tight text-text-muted md:col-span-2">
              {t("USERS")}
            </div>
            <div className="flex items-center justify-between gap-2 px-4 py-3 md:col-span-10">
              <div className="flex items-center">
                {isUsersLoading ? (
                  <span className="text-xs text-text-muted">{t("LOADING")}</span>
                ) : usersError ? (
                  <span className="text-xs text-error">{usersError}</span>
                ) : previewUsers.length === 0 ? (
                  <span className="text-xs text-text-muted">{t("NO_USERS")}</span>
                ) : (
                  <div className="flex items-center -space-x-2">
                    {previewUsers.map((user, idx) => (
                      <span
                        key={`${user.id}-${user.email ?? user.username ?? idx}`}
                        className={`relative inline-flex h-8 w-8 items-center justify-center rounded-full border-2 border-surface text-xs font-semibold text-on-primary transition-transform duration-150 ease-out hover:z-10 hover:scale-125 ${user.bgClassName}`}
                        title={user.displayName}
                      >
                        {user.initials}
                      </span>
                    ))}
                    {remainingUsersCount > 0 ? (
                      <span className="ml-2 rounded-full border border-border bg-surface-muted px-2 py-1 text-xs font-medium text-text-muted">
                        +{remainingUsersCount}
                      </span>
                    ) : null}
                  </div>
                )}
              </div>
              <SecondaryButton
                type="button"
                onClick={() => setIsUsersPanelOpen(true)}
                disabled={isUsersLoading || !!usersError}
              >
                {t("VIEW_ALL_USERS")}
              </SecondaryButton>
            </div>
          </div>
          ) : null}
          {reportTiles.map((tile) => (
          <div key={tile.key} className="grid grid-cols-1 border-b border-border bg-surface-muted/40 md:grid-cols-12">
            <div className="px-4 py-3 text-sm tracking-tight text-text-muted md:col-span-2">{tile.label}</div>
            <div className="px-4 py-3 flex items-center md:col-span-10">
              <button
                onClick={() => router.push(tile.href)}
                className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
              >
                {tile.label}
                <span aria-hidden className="text-sm leading-none">
                  →
                </span>
              </button>
            </div>
          </div>
        ))}
          <div className="grid grid-cols-1 border-b border-border bg-surface-muted/40 md:grid-cols-12">
            <div className="px-4 py-3 text-sm tracking-tight text-text-muted md:col-span-2">
              {t("DW_VERSION")}
            </div>
            <div className="flex items-center px-4 py-3 md:col-span-10">
              <span className="inline-flex items-center gap-1 text-xs font-semibold text-primary">
                {metadata?.db_version ?? ""}
              </span>
            </div>
          </div>
        </section>
        <div className="grid grid-cols-1 px-4 md:grid-cols-12">
          <div className="py-3 text-sm uppercase tracking-tight text-text-muted md:col-span-2">{t("API")}</div>
          <div className="flex items-center py-3 px-2 md:col-span-10">
            <a
              href={apiDocsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
            >
              {t("API_GUIDE")}
              <span aria-hidden className="text-sm leading-none">
                →
              </span>
            </a>

          </div>
        </div>
      </div>
      {canViewUsers ? (
      <Drawer
        open={isUsersPanelOpen}
        onClose={() => { setIsUsersPanelOpen(false); setActiveRoleCode(""); }}
        title={
          dwName ? (
            <span className="flex items-center gap-1.5 truncate">
              <span className="truncate text-text-muted">{dwName}</span>
              <span className="shrink-0 text-text-muted">›</span>
              <span className="truncate">{t("USERS")}</span>
            </span>
          ) : (
            t("USERS")
          )
        }
        width="30%"
        footer={<div className="text-xs text-text-muted">{t("N_USERS").replace("{count}", String(drawerFooterCount))}</div>}
      >
        {drawerRoleTabs.length > 0 && (
          <div className="-mx-4 -mt-2 border-b border-border px-4 pb-3">
            <SelectField
              value={activeRoleCode}
              onChange={(e) => setActiveRoleCode(e.target.value)}
              menuPortal
              options={[
                { value: "", label: t("SELECT_ROLE") },
                ...drawerRoleTabs.map((tab) => ({
                  value: tab.roleCode,
                  label: tab.label,
                })),
              ]}
            />
          </div>
        )}
        <div className="-mx-4">
          {isUsersLoading ? (
            <div className="px-4 py-6 text-sm text-text-muted">{t("LOADING")}</div>
          ) : usersError ? (
            <div className="px-4 py-6 text-sm text-error">{usersError}</div>
          ) : filteredDrawerUsers.length === 0 ? (
            <div className="px-4 py-6 text-sm text-text-muted">{t("NO_USERS_FOR_ROLE")}</div>
          ) : (
            filteredDrawerUsers.map((user) => {
              const phone = user.phone?.trim() ?? "";
              const org = user.organisation?.trim() ?? "";
              const location = user.location?.trim() ?? "";
              const email = (user.email ?? user.username ?? "").trim();
              const hasPhoneOrOrg = phone || org;
              const roleCode = activeRoleCode || user.roleCodes[0] || "";
              const roleLabel = roleCode
                ? (usersMeta?.roles?.[roleCode]?.name?.trim() || toRoleLabel(roleCode))
                : null;
              return (
                <div
                  key={`${user.id}-${user.email ?? user.username ?? "user"}`}
                  className="flex items-start gap-4 border-b border-border/70 px-4 py-4"
                >
                  <span
                    className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-on-primary ${user.bgClassName}`}
                  >
                    {user.initials}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-text">{user.displayName}</p>
                    {email && (
                      <p className="mt-1 flex items-center gap-1 text-xs text-text-muted">
                        <span className="material-icons text-xs leading-none">mail</span>
                        <span className="truncate">{email}</span>
                      </p>
                    )}
                    {hasPhoneOrOrg && (
                      <p className="mt-1 flex items-center gap-1 text-xs text-text-muted">
                        {phone && (
                          <>
                            <span className="material-icons text-xs leading-none">phone</span>
                            <span className="truncate">{phone}</span>
                          </>
                        )}
                        {phone && org && <span className="mx-0.5 select-none text-border">|</span>}
                        {org && (
                          <>
                            <span className="material-icons text-xs leading-none">business</span>
                            <span className="truncate">{org}</span>
                          </>
                        )}
                      </p>
                    )}
                    {location && (
                      <p className="mt-1 flex items-center gap-1 text-xs text-text-muted">
                        <span className="material-icons text-xs leading-none">location_on</span>
                        <span className="truncate">{location}</span>
                      </p>
                    )}
                  </div>
                  {roleLabel && (
                    <span className="label-tag tone-pill--muted-subtle mt-0.5 self-center">
                      {roleLabel}
                    </span>
                  )}
                </div>
              );
            })
          )}
        </div>
      </Drawer>
      ) : null}
    </main>
  );
}
