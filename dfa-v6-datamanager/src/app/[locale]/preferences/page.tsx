"use client";

import { useCore } from "@/contexts/CoreContext";
import { MainTabsBar } from "@/components/MainTabsBar";
import Breadcrumb from "@/components/Breadcrumb";
import { AppShellUtilityPageToolbar } from "@/components/AppShellUtilityPageToolbar";
import { getIAMAPIURL, IAM_ROLES_PATH } from "@/lib/constants";
import { getRequest, patchRequest } from "@/lib/api/http";
import { toast } from "sonner";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { IconBadge } from "@/components/IconBadge";

type PrefsTab = "account" | "password";

interface UserProfile {
  id: number;
  first_name: string;
  last_name: string;
  username: string;
  email: string;
  status: number;
  created: string;
  created_by: string;
  modified: string;
  modified_by: string;
  last_loggedin_on: string;
  organisation?: string | null;
  location?: string | null;
  phone?: string | null;
}

type CrudLetter = "C" | "R" | "U" | "D";

interface RoleMeta {
  id: number;
  role_code: string;
  name: string | null;
  is_super_admin: number;
  is_system_role: number;
  datawarehouses?: { dw_id: number; dw_name: string }[];
  /** Filled in after a separate permissions fetch */
  permissions?: Record<string, CrudLetter[]>;
  permissionsLoaded?: boolean;
}

interface FetchProfileResult {
  profile: UserProfile | null;
  roleMetas: RoleMeta[];
}

function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return "—";
    return d.toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    }) + ", " + d.toLocaleTimeString("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "—";
  }
}

async function fetchUserProfile(): Promise<FetchProfileResult> {
  const url = getIAMAPIURL("/iam/users/me");
  const json = (await getRequest(url, undefined, {
    suppressErrorMessage: true,
  })) as Record<string, unknown>;

  if (!json?.success || !json.data || typeof json.data !== "object") {
    return { profile: null, roleMetas: [] };
  }

  const profile = json.data as unknown as UserProfile;

  const roleMetas: RoleMeta[] = [];
  const metaRaw = json.meta as Record<string, unknown> | undefined;
  const rolesRaw = (metaRaw && typeof metaRaw === "object" && metaRaw.roles
    ? metaRaw.roles
    : metaRaw) as Record<string, unknown> | undefined;

  if (rolesRaw && typeof rolesRaw === "object") {
    for (const entry of Object.values(rolesRaw)) {
      if (!entry || typeof entry !== "object") continue;
      const r = entry as Record<string, unknown>;
      if (typeof r.id !== "number" || typeof r.role_code !== "string") continue;
      roleMetas.push({
        id: r.id as number,
        role_code: r.role_code as string,
        name: (r.name as string | null) ?? null,
        is_super_admin: (r.is_super_admin as number) ?? 0,
        is_system_role: (r.is_system_role as number) ?? 0,
        datawarehouses: Array.isArray(r.datawarehouses)
          ? (r.datawarehouses as { dw_id: number; dw_name: string }[])
          : undefined,
      });
    }
  }

  return { profile, roleMetas };
}

async function fetchRolePermissions(roleId: number): Promise<Record<string, CrudLetter[]>> {
  try {
    const url = `${getIAMAPIURL(IAM_ROLES_PATH)}/${roleId}/resource-permissions`;
    const json = (await getRequest(url, undefined, { suppressErrorMessage: true })) as Record<string, unknown>;
    if (!json?.success || !json.data || typeof json.data !== "object") return {};
    const data = json.data as Record<string, unknown>;
    const rawList = (Array.isArray(data.resources) ? data.resources : Array.isArray(json.data) ? json.data : []) as unknown[];
    const result: Record<string, CrudLetter[]> = {};
    for (const item of rawList) {
      if (!item || typeof item !== "object") continue;
      const it = item as Record<string, unknown>;
      const code = it.resource_code;
      if (typeof code !== "string") continue;
      const letters: CrudLetter[] = [];
      if (Array.isArray(it.permissions)) {
        for (const p of it.permissions) {
          if (p === "C" || p === "R" || p === "U" || p === "D") letters.push(p as CrudLetter);
        }
      }
      if (letters.length > 0) result[code] = letters;
    }
    return result;
  } catch {
    return {};
  }
}

interface UpdateProfilePayload {
  first_name?: string;
  last_name?: string;
  email?: string;
  organisation?: string;
  location?: string;
  phone?: string;
}

async function updateUserProfile(
  payload: UpdateProfilePayload
): Promise<{ success: boolean; message?: string }> {
  const url = getIAMAPIURL("/iam/users/me");
  const json = (await patchRequest(
    url,
    payload as unknown as Record<string, unknown>,
    undefined,
    undefined,
    { suppressErrorMessage: true }
  )) as Record<string, unknown>;

  if (json?.success) {
    return { success: true, message: (json.message as string) ?? undefined };
  }

  const errMsg =
    (json?.err_message as string) ??
    (json?.message as string) ??
    (json?.detail as string) ??
    undefined;

  return { success: false, message: errMsg };
}

async function changePassword(
  oldPassword: string,
  newPassword: string
): Promise<{ success: boolean; message?: string }> {
  const url = getIAMAPIURL("/iam/users/me/password");
  const json = (await patchRequest(
    url,
    { old_password: oldPassword, new_password: newPassword },
    undefined,
    undefined,
    { suppressErrorMessage: true }
  )) as Record<string, unknown>;

  if (json?.success) {
    return { success: true, message: (json.message as string) ?? undefined };
  }

  const errMsg =
    (json?.err_message as string) ??
    (json?.message as string) ??
    (json?.detail as string) ??
    undefined;

  return { success: false, message: errMsg };
}

/* ---------- Account tab content ---------- */

const CRUD_DISPLAY: { letter: CrudLetter; label: string; abbr: string }[] = [
  { letter: "C", label: "Create", abbr: "C" },
  { letter: "R", label: "Read",   abbr: "R" },
  { letter: "U", label: "Update", abbr: "U" },
  { letter: "D", label: "Delete", abbr: "D" },
];

function getInitials(firstName: string, lastName: string, username: string): string {
  const f = firstName?.trim();
  const l = lastName?.trim();
  if (f && l) return `${f[0]}${l[0]}`.toUpperCase();
  if (f) return f.slice(0, 2).toUpperCase();
  if (username) return username.slice(0, 2).toUpperCase();
  return "??";
}

function InfoCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5 border-b border-r border-border px-6 py-4">
      <span className="form-label">{label}:</span>
      <span className="text-xs text-text">{value || "—"}</span>
    </div>
  );
}

const DW_VISIBLE = 2;
const TIP_WIDTH = 200;
const TIP_GAP = 6;

function DwNamesDisplay({
  datawarehouses,
  label,
}: {
  datawarehouses: { dw_id: number; dw_name: string }[];
  label: string;
}) {
  const badgeRef = useRef<HTMLSpanElement>(null);
  const tipRef = useRef<HTMLDivElement>(null);
  const [hovered, setHovered] = useState(false);
  const [style, setStyle] = useState<React.CSSProperties>({ visibility: "hidden", top: 0, left: 0 });

  const visible = datawarehouses.slice(0, DW_VISIBLE);
  const overflow = datawarehouses.slice(DW_VISIBLE);

  // After tooltip mounts (hovered=true), measure and position it correctly
  useLayoutEffect(() => {
    if (!hovered || !badgeRef.current || !tipRef.current) return;
    const anchor = badgeRef.current.getBoundingClientRect();
    const tipH = tipRef.current.offsetHeight;
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    // Horizontal: align right edge of tooltip to right edge of badge, clamped inside viewport
    const left = Math.max(8, Math.min(vw - TIP_WIDTH - 8, anchor.right - TIP_WIDTH));

    // Vertical: prefer below, flip above if not enough space
    const belowTop = anchor.bottom + TIP_GAP;
    const aboveTop = anchor.top - TIP_GAP - tipH;
    const top = belowTop + tipH <= vh - 8 ? belowTop : aboveTop;

    setStyle({ visibility: "visible", top, left });
  }, [hovered]);

  if (overflow.length === 0) {
    return (
      <span className="flex items-center gap-1 shrink-0 text-xs text-text-muted">
        {label}:{" "}
        <span className="font-semibold text-primary">
          {visible.map((d) => d.dw_name).join(", ")}
        </span>
      </span>
    );
  }

  return (
    <span className="flex items-center gap-1 shrink-0 text-xs text-text-muted">
      {label}:{" "}
      <span className="font-semibold text-primary">
        {visible.map((d) => d.dw_name).join(", ")}
      </span>
      <span
        ref={badgeRef}
        onPointerEnter={() => { setStyle((s) => ({ ...s, visibility: "hidden" })); setHovered(true); }}
        onPointerLeave={() => setHovered(false)}
        className="inline-flex cursor-default items-center rounded-full bg-primary/10 px-1.5 text-[10px] font-semibold text-primary leading-4 hover:bg-primary/20 transition-colors"
      >
        +{overflow.length}
      </span>
      {hovered && typeof document !== "undefined" &&
        createPortal(
          <div
            ref={tipRef}
            aria-hidden
            className="pointer-events-none fixed z-tooltip rounded-md border border-border bg-surface px-3 py-2 text-xs leading-snug text-text shadow-md"
            style={{ width: TIP_WIDTH, ...style }}
          >
            <ul className="space-y-1">
              {overflow.map((d) => (
                <li key={d.dw_id} className="font-medium text-primary">
                  {d.dw_name}
                </li>
              ))}
            </ul>
          </div>,
          document.body
        )
      }
    </span>
  );
}

function RolePermissionsPanel({
  role,
  t,
}: {
  role: RoleMeta;
  t: (code: string, fallback?: string) => string;
}) {
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [permissions, setPermissions] = useState<Record<string, CrudLetter[]> | null>(null);

  const handleToggle = useCallback(async () => {
    const next = !expanded;
    setExpanded(next);
    if (next && permissions === null && !loading) {
      setLoading(true);
      const perms = await fetchRolePermissions(role.id);
      setPermissions(perms);
      setLoading(false);
    }
  }, [expanded, permissions, loading, role.id]);

  const isSuperAdmin = role.is_super_admin === 1;
  const permEntries = permissions ? Object.entries(permissions).filter(([, v]) => v.length > 0) : [];

  const roleName = role.name || role.role_code;
  const dwList = role.datawarehouses ?? [];

  return (
    <div className="rounded-sm border border-border bg-surface">
      {/* Role header row — div so DwNamesDisplay (which has hover spans) doesn't nest inside a button */}
      <div
        role="button"
        tabIndex={0}
        onClick={handleToggle}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && handleToggle()}
        className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-surface-muted transition-colors rounded-sm cursor-pointer"
      >
        <span className="min-w-0 flex-1 truncate text-xs font-semibold text-text">
          {roleName}
        </span>
        {dwList.length > 0 && (
          <DwNamesDisplay datawarehouses={dwList} label={t("LABEL_DATAWAREHOUSE")} />
        )}
        <span className="material-icons mt-0.5 shrink-0 text-sm text-text-muted transition-transform" style={{ transform: expanded ? "rotate(180deg)" : "rotate(0deg)" }}>
          expand_more
        </span>
      </div>

      {/* Expanded permission matrix */}
      {expanded && (
        <div className="border-t border-border px-4 pb-4 pt-3">
          {loading ? (
            <p className="text-xs text-text-muted">{t("LOADING")}</p>
          ) : isSuperAdmin ? (
            <p className="text-xs text-text-muted italic">
              {t("SUPER_ADMIN_ALL_PERMS")}
            </p>
          ) : permEntries.length === 0 ? (
            <p className="text-xs text-text-muted">{t("NO_PERMISSIONS_ASSIGNED")}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border">
                    <th className="pb-2 pr-4 text-left text-xs font-semibold text-text-muted">
                      {t("ROLE_PERM_GRID_RESOURCE")}
                    </th>
                    {CRUD_DISPLAY.map(({ letter, label }) => (
                      <th key={letter} className="pb-2 px-3 text-center text-xs font-semibold text-text-muted w-14">
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {permEntries.map(([code, letters], idx) => (
                    <tr
                      key={code}
                      className={idx < permEntries.length - 1 ? "border-b border-border/50" : ""}
                    >
                      <td className="py-2 pr-4 text-xs text-text font-medium">{code}</td>
                      {CRUD_DISPLAY.map(({ letter }) => {
                        const has = letters.includes(letter);
                        return (
                          <td key={letter} className="py-2 px-3 text-center">
                            <IconBadge
                              symbol={has ? "tick" : "cross"}
                              tone={has ? "success" : "muted"}
                              shape="square"
                            />
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

interface ProfileDraft {
  first_name: string;
  last_name: string;
  email: string;
  organisation: string;
  location: string;
  phone: string;
}

function EditCell({
  label,
  value,
  onChange,
  readOnly,
  error,
}: {
  label: string;
  value: string;
  onChange?: (v: string) => void;
  readOnly?: boolean;
  error?: string;
}) {
  return (
    <div className="flex flex-col gap-1 border-b border-r border-border px-4 py-3">
      <span className="form-label">{label}:</span>
      {readOnly ? (
        <span className="text-xs text-text-muted">{value || "—"}</span>
      ) : (
        <>
          <input
            type="text"
            value={value}
            onChange={(e) => onChange?.(e.target.value)}
            className={`field-comp--sm ${error ? "!border-error" : ""}`}
          />
          {error && <span className="text-xs text-error">{error}</span>}
        </>
      )}
    </div>
  );
}

function AccountTab({
  profile,
  roleMetas,
  loading,
  onProfileUpdate,
  t,
}: {
  profile: UserProfile | null;
  roleMetas: RoleMeta[];
  loading: boolean;
  onProfileUpdate: (updated: UserProfile) => void;
  t: (code: string, fallback?: string) => string;
}) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState<ProfileDraft>({
    first_name: "",
    last_name: "",
    email: "",
    organisation: "",
    location: "",
    phone: "",
  });
  const [draftErrors, setDraftErrors] = useState<Partial<Record<keyof ProfileDraft, string>>>({});

  const validateDraft = useCallback((d: ProfileDraft): Partial<Record<keyof ProfileDraft, string>> => {
    const errors: Partial<Record<keyof ProfileDraft, string>> = {};
    if (d.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.email)) {
      errors.email = t("EMAIL_INVALID");
    }
    if (d.phone && !/^\d{10}$/.test(d.phone)) {
      errors.phone = t("PHONE_NUMBER_10_DIGITS");
    }
    return errors;
  }, []);

  const startEdit = useCallback(() => {
    if (!profile) return;
    const initial: ProfileDraft = {
      first_name: profile.first_name ?? "",
      last_name: profile.last_name ?? "",
      email: profile.email ?? "",
      organisation: profile.organisation ?? "",
      location: profile.location ?? "",
      phone: profile.phone ?? "",
    };
    setDraft(initial);
    setDraftErrors({});
    setEditing(true);
  }, [profile]);

  const cancelEdit = useCallback(() => {
    setEditing(false);
    setDraftErrors({});
  }, []);

  const saveEdit = useCallback(async () => {
    if (!profile) return;
    const errors = validateDraft(draft);
    if (Object.keys(errors).length > 0) {
      setDraftErrors(errors);
      return;
    }
    setDraftErrors({});
    setSaving(true);
    try {
      const result = await updateUserProfile({
        first_name: draft.first_name || undefined,
        last_name: draft.last_name || undefined,
        email: draft.email || undefined,
        organisation: draft.organisation || undefined,
        location: draft.location || undefined,
        phone: draft.phone || undefined,
      });
      if (result.success) {
        onProfileUpdate({
          ...profile,
          first_name: draft.first_name,
          last_name: draft.last_name,
          email: draft.email,
          organisation: draft.organisation || null,
          location: draft.location || null,
          phone: draft.phone || null,
        });
        setEditing(false);
        toast.success(t("PROFILE_UPDATED_SUCCESS"));
      } else {
        toast.error(result.message ?? t("PROFILE_UPDATE_FAILED"));
      }
    } catch {
      toast.error(t("PROFILE_UPDATE_FAILED"));
    } finally {
      setSaving(false);
    }
  }, [profile, draft, onProfileUpdate, t]);

  const setField = useCallback(
    (field: keyof ProfileDraft) => (value: string) => {
      setDraft((prev) => ({ ...prev, [field]: value }));
      setDraftErrors((prev) => {
        if (!prev[field]) return prev;
        const next = { ...prev };
        delete next[field];
        return next;
      });
    },
    []
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-xs text-text-muted">
        {t("LOADING")}
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="flex items-center justify-center py-16 text-xs text-text-muted">
        {t("USER_NOT_FOUND")}
      </div>
    );
  }

  const fullName = [profile.first_name, profile.last_name].filter(Boolean).join(" ") || "—";
  const initials = getInitials(profile.first_name, profile.last_name, profile.username);
  const isActive = profile.status === 1;

  return (
    <div className="w-full space-y-4">
      {/* Profile hero card */}
      <div className="flex items-center gap-4 rounded-sm border border-border bg-surface px-5 py-4 shadow-sm">
        <div
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-xs font-bold text-on-primary"
          style={{ background: "var(--color-primary)" }}
        >
          {initials}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-text">{fullName}</p>
        </div>
        <span
          className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold ${
            isActive
              ? "bg-[color:color-mix(in_srgb,var(--color-success)_12%,var(--color-surface))] text-success"
              : "bg-[color:var(--color-error-subtle)] text-error"
          }`}
        >
          {isActive ? t("ACTIVE") : t("INACTIVE")}
        </span>
      </div>

      {/* Account + Audit card */}
      <div className="rounded-sm border border-border bg-surface shadow-sm">
        {/* Account info section heading */}
        <div className="flex items-center justify-between border-b border-border px-6 py-3">
          <p className="flex items-center gap-1.5 text-sm font-bold text-text">
            <span className="material-icons text-sm text-primary">person</span>
            {t("ACCOUNT")}
          </p>
          {editing ? (
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={cancelEdit}
                disabled={saving}
                className="btn-comp-secondary"
              >
                {t("CANCEL")}
              </button>
              <button
                type="button"
                onClick={saveEdit}
                disabled={saving || Object.keys(draftErrors).length > 0}
                className="btn-comp-primary"
              >
                {saving ? t("SAVING") : t("SAVE")}
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={startEdit}
              className="btn-comp-icon"
              title={t("EDIT")}
            >
              <span className="material-icons text-md">edit</span>
            </button>
          )}
        </div>

        {/* Account fields */}
        {editing ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 [&>*:nth-child(1n)]:border-r-0 sm:[&>*:nth-child(1n)]:border-r sm:[&>*:nth-child(2n)]:border-r-0 lg:[&>*:nth-child(2n)]:border-r lg:[&>*:nth-child(3n)]:border-r-0">
            <EditCell label={t("FIRST_NAME")} value={draft.first_name} onChange={setField("first_name")} />
            <EditCell label={t("LAST_NAME")} value={draft.last_name} onChange={setField("last_name")} />
            <EditCell label={t("USERNAME")} value={profile.username} readOnly />
            <EditCell label={t("EMAIL")} value={draft.email} onChange={setField("email")} error={draftErrors.email} />
            <EditCell label={t("ORGANIZATION")} value={draft.organisation} onChange={setField("organisation")} />
            <EditCell label={t("LOCATION")} value={draft.location} onChange={setField("location")} />
            <EditCell label={t("PHONE_NUMBER", "Phone")} value={draft.phone} onChange={setField("phone")} error={draftErrors.phone} />
          </div>
        ) : (
          /* 1-col → 2-col → 3-col grid; suppress border-r on last column per breakpoint */
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 [&>*:nth-child(1n)]:border-r-0 sm:[&>*:nth-child(1n)]:border-r sm:[&>*:nth-child(2n)]:border-r-0 lg:[&>*:nth-child(2n)]:border-r lg:[&>*:nth-child(3n)]:border-r-0">
            <InfoCell label={t("FIRST_NAME")} value={profile.first_name} />
            <InfoCell label={t("LAST_NAME")} value={profile.last_name ?? ""} />
            <InfoCell label={t("USERNAME")} value={profile.username} />
            <InfoCell label={t("EMAIL")} value={profile.email} />
            <InfoCell label={t("ORGANIZATION")} value={profile.organisation ?? ""} />
            <InfoCell label={t("LOCATION")} value={profile.location ?? ""} />
            <InfoCell label={t("PHONE_NUMBER", "Phone")} value={profile.phone ?? ""} />
          </div>
        )}

      </div>

      {/* Audit Info card */}
      <div className="rounded-sm border border-border bg-surface shadow-sm">
        <div className="border-b border-border px-6 py-3">
          <p className="flex items-center gap-1.5 text-sm font-bold text-text">
            <span className="material-icons text-sm text-primary">history</span>
            {t("AUDIT_INFO")}
          </p>
        </div>
        {/* 1-col → 2-col → 3-col grid; suppress border-r on last column per breakpoint */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 [&>*:nth-child(1n)]:border-r-0 sm:[&>*:nth-child(1n)]:border-r sm:[&>*:nth-child(2n)]:border-r-0 lg:[&>*:nth-child(2n)]:border-r lg:[&>*:nth-child(3n)]:border-r-0">
          <InfoCell label={t("CREATED_BY")} value={profile.created_by ?? ""} />
          <InfoCell label={t("CREATED_DATE")} value={formatDateTime(profile.created)} />
          <InfoCell label={t("MODIFIED_BY")} value={profile.modified_by ?? ""} />
          <InfoCell label={t("MODIFIED_DATE")} value={formatDateTime(profile.modified)} />
          <InfoCell label={t("LAST_LOGIN")} value={formatDateTime(profile.last_loggedin_on)} />
        </div>
      </div>

      {/* Roles & Permissions section */}
      <div className="rounded-sm border border-border bg-surface shadow-sm">
        <div className="border-b border-border px-6 py-3">
          <p className="flex items-center gap-1.5 text-sm font-bold text-text">
            <span className="material-icons text-sm text-primary">shield</span>
            {t("ROLES_AND_PERMISSIONS")}
          </p>
        </div>
        {roleMetas.length === 0 ? (
          <p className="px-6 py-5 text-xs text-text-muted">{t("NO_ROLES_ASSIGNED")}</p>
        ) : (
          <div className="space-y-2 p-4">
            {roleMetas.map((role) => (
              <RolePermissionsPanel key={role.role_code} role={role} t={t} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------- Password tab content ---------- */

const INPUT_CLS = "field-comp--md w-full";

interface PasswordRule {
  key: string;
  labelKey: string;
  test: (pw: string) => boolean;
}

const PASSWORD_RULES: PasswordRule[] = [
  { key: "min_length", labelKey: "PWD_RULE_MIN_LENGTH", test: (pw) => pw.length >= 8 },
  { key: "uppercase",  labelKey: "PWD_RULE_UPPERCASE",  test: (pw) => /[A-Z]/.test(pw) },
  { key: "lowercase",  labelKey: "PWD_RULE_LOWERCASE",  test: (pw) => /[a-z]/.test(pw) },
  { key: "number",     labelKey: "PWD_RULE_NUMBER",     test: (pw) => /[0-9]/.test(pw) },
  { key: "special",    labelKey: "PWD_RULE_SPECIAL",    test: (pw) => /[^A-Za-z0-9]/.test(pw) },
];

function EyeIcon({ visible }: { visible: boolean }) {
  return visible ? (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  ) : (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
      <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
      <line x1="1" y1="1" x2="23" y2="23" />
    </svg>
  );
}

const STRENGTH_LEVELS = [
  { min: 0, max: 0, labelKey: "",            color: "" },
  { min: 1, max: 1, labelKey: "WEAK",      color: "var(--color-error)" },
  { min: 2, max: 2, labelKey: "FAIR",      color: "var(--color-warning)" },
  { min: 3, max: 3, labelKey: "GOOD",      color: "var(--color-warning)" },
  { min: 4, max: 4, labelKey: "STRONG",    color: "var(--color-success)" },
  { min: 5, max: 5, labelKey: "EXCELLENT", color: "var(--color-success)" },
] as const;

function PasswordStrengthBar({
  password,
  touched,
  t,
}: {
  password: string;
  touched: boolean;
  t: (code: string, fallback?: string) => string;
}) {
  if (!touched || password.length === 0) return null;

  const score = PASSWORD_RULES.filter((r) => r.test(password)).length;
  const level = STRENGTH_LEVELS[score];
  const filledSegments = score;

  return (
    <div className="mt-2 space-y-1">
      <div className="flex gap-1">
        {[1, 2, 3, 4, 5].map((seg) => (
          <div
            key={seg}
            className="h-1.5 flex-1 rounded-full transition-all duration-300"
            style={{
              backgroundColor: seg <= filledSegments ? level.color : "var(--color-border)",
            }}
          />
        ))}
      </div>
      {level.labelKey && (
        <p className="text-right text-xs font-medium" style={{ color: level.color }}>
          {t(level.labelKey)}
        </p>
      )}
    </div>
  );
}

function PasswordRuleChecklist({
  password,
  touched,
  t,
}: {
  password: string;
  touched: boolean;
  t: (code: string, fallback?: string) => string;
}) {
  if (!touched) return null;

  return (
    <ul className="mt-1 space-y-1">
      {PASSWORD_RULES.map((rule) => {
        const passed = rule.test(password);
        return (
          <li key={rule.key} className={`flex items-center gap-1.5 text-xs ${passed ? "text-success" : "text-error"}`}>
            <IconBadge
              symbol={passed ? "tick" : "cross"}
              tone={passed ? "success" : "error"}
              variant="inline"
            />
            {t(rule.labelKey)}
          </li>
        );
      })}
    </ul>
  );
}

function PasswordTab({
  username,
  t,
}: {
  username: string;
  t: (code: string, fallback?: string) => string;
}) {
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [newTouched, setNewTouched] = useState(false);

  const ruleResults = useMemo(
    () => PASSWORD_RULES.map((rule) => ({ ...rule, passed: rule.test(newPassword) })),
    [newPassword]
  );
  const allRulesPass = ruleResults.every((r) => r.passed);

  const mismatch = confirmPassword.length > 0 && newPassword !== confirmPassword;
  const sameAsOld = newPassword.length > 0 && oldPassword.length > 0 && newPassword === oldPassword;
  const canSubmit =
    oldPassword.length > 0 &&
    newPassword.length > 0 &&
    confirmPassword.length > 0 &&
    !mismatch &&
    !sameAsOld &&
    allRulesPass &&
    !submitting;

  const onSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!canSubmit) return;

      setSubmitting(true);
      try {
        const result = await changePassword(oldPassword, newPassword);
        if (result.success) {
          toast.success(t("PASSWORD_CHANGED_SUCCESS"));
          setOldPassword("");
          setNewPassword("");
          setConfirmPassword("");
          setNewTouched(false);
        } else {
          toast.error(result.message ?? t("PASSWORD_CHANGE_FAILED"));
        }
      } catch {
        toast.error(t("PASSWORD_CHANGE_FAILED"));
      } finally {
        setSubmitting(false);
      }
    },
    [canSubmit, oldPassword, newPassword, t]
  );

  return (
    <form
      onSubmit={onSubmit}
      className="mx-auto w-full max-w-md space-y-4 rounded-sm border border-border bg-surface p-6 shadow-sm"
    >
      <label className="flex flex-col gap-1.5">
        <span className="form-label">{t("USERNAME")}</span>
        <input
          type="text"
          value={username}
          readOnly
          className={`${INPUT_CLS} cursor-not-allowed opacity-60`}
        />
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="form-label">{t("OLD_PASSWORD")}</span>
        <input
          type="password"
          value={oldPassword}
          onChange={(e) => setOldPassword(e.target.value)}
          placeholder={t("OLD_PASSWORD_PLACEHOLDER")}
          className={INPUT_CLS}
          autoComplete="current-password"
        />
      </label>

      <div className="flex flex-col gap-1.5">
        <span className="form-label">{t("NEW_PASSWORD")}</span>
        <div className="relative">
          <input
            type={showNew ? "text" : "password"}
            value={newPassword}
            onChange={(e) => {
              setNewPassword(e.target.value);
              if (!newTouched) setNewTouched(true);
            }}
            placeholder={t("NEW_PASSWORD_PLACEHOLDER")}
            className={`${INPUT_CLS} pr-10`}
            autoComplete="new-password"
          />
          <button
            type="button"
            onClick={() => setShowNew((v) => !v)}
            className="absolute inset-y-0 right-0 flex items-center px-3 text-text-muted hover:text-text"
            tabIndex={-1}
            aria-label={showNew ? "Hide password" : "Show password"}
          >
            <EyeIcon visible={showNew} />
          </button>
        </div>
        <PasswordStrengthBar password={newPassword} touched={newTouched} t={t} />
        {sameAsOld && (
          <span className="text-xs text-error">{t("PASSWORD_SAME_AS_OLD")}</span>
        )}
        <PasswordRuleChecklist password={newPassword} touched={newTouched} t={t} />
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="form-label">{t("CONFIRM_PASSWORD")}</span>
        <div className="relative">
          <input
            type={showConfirm ? "text" : "password"}
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder={t("CONFIRM_PASSWORD_PLACEHOLDER")}
            className={`${INPUT_CLS} pr-10`}
            autoComplete="new-password"
          />
          <button
            type="button"
            onClick={() => setShowConfirm((v) => !v)}
            className="absolute inset-y-0 right-0 flex items-center px-3 text-text-muted hover:text-text"
            tabIndex={-1}
            aria-label={showConfirm ? "Hide password" : "Show password"}
          >
            <EyeIcon visible={showConfirm} />
          </button>
        </div>
        {mismatch && (
          <span className="text-xs text-error">{t("PASSWORDS_DO_NOT_MATCH")}</span>
        )}
      </div>

      <button
        type="submit"
        disabled={!canSubmit}
        className="btn-comp-primary btn-comp--comfortable mt-2 w-full"
      >
        {submitting ? t("SAVING") : t("CHANGE_PASSWORD")}
      </button>
    </form>
  );
}

/* ---------- Main page ---------- */

export default function PreferencesPage() {
  const { t } = useCore();
  const [activeTab, setActiveTab] = useState<PrefsTab>("account");
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [roleMetas, setRoleMetas] = useState<RoleMeta[]>([]);
  const [loading, setLoading] = useState(true);


  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchUserProfile()
      .then((result) => {
        if (!cancelled) {
          setProfile(result.profile);
          setRoleMetas(result.roleMetas);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setProfile(null);
          setRoleMetas([]);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const tabLabels: Record<PrefsTab, string> = useMemo(
    () => ({
      account: t("ACCOUNT"),
      password: t("CHANGE_PASSWORD"),
    }),
    [t]
  );

  return (
    <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-surface-muted">
      <Breadcrumb />
      <AppShellUtilityPageToolbar />

      {/* Tab bar */}
      <div className="page-subtabs-row">
        <MainTabsBar
          tabs={(["account", "password"] as PrefsTab[]).map((tab) => ({
            value: tab,
            label: tabLabels[tab],
            icon: tab === "account" ? "person" : "lock",
          }))}
          activeValue={activeTab}
          onSelect={setActiveTab}
        />
      </div>

      {/* Tab content */}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-auto overflow-x-hidden px-5 py-6">
        {activeTab === "account" && (
          <AccountTab
            profile={profile}
            roleMetas={roleMetas}
            loading={loading}
            onProfileUpdate={setProfile}
            t={t}
          />
        )}
        {activeTab === "password" && (
          <PasswordTab username={profile?.username ?? ""} t={t} />
        )}
      </div>
    </main>
  );
}
