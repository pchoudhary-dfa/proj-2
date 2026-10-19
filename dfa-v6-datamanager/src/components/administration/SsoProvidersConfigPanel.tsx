"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { ExpandChevronButton } from "@/components/ExpandChevronButton";
import { SelectField } from "@/components/SelectField";
import { TextAreaField } from "@/components/TextAreaField";
import { TextField } from "@/components/TextField";
import { getRequest, patchRequest } from "@/lib/api/http";
import type { RoleRaw } from "@/lib/api/types";
import { BFF_API_PREFIX, getIAMAPIURL, IAM_ROLES_PATH } from "@/lib/constants";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SsoProvider {
  id: number;
  provider_code: string;
  name: string;
  client_id: string | null;
  well_known_uri: string | null;
  authorization_endpoint: string | null;
  token_endpoint: string | null;
  userinfo_endpoint: string | null;
  issuer: string | null;
  jwks_uri: string | null;
  redirect_uri: string | null;
  end_session_endpoint: string | null;
  logout_uri: string | null;
  idp_entity_id: string | null;
  idp_sso_url: string | null;
  idp_certificate: string | null;
  scopes: string | null;
  attribute_map: string | null;
  auto_provision_users: number;
  default_role_id: number | null;
  is_active: number;
}

interface SsoProviderDraft {
  name: string;
  client_id: string;
  client_secret: string;
  well_known_uri: string;
  authorization_endpoint: string;
  token_endpoint: string;
  userinfo_endpoint: string;
  issuer: string;
  jwks_uri: string;
  redirect_uri: string;
  end_session_endpoint: string;
  logout_uri: string;
  idp_entity_id: string;
  idp_sso_url: string;
  idp_certificate: string;
  scopes: string;
  attribute_map: string;
  auto_provision_users: boolean;
  default_role_id: string;
  is_active: boolean;
}

type DraftsMap = Record<number, SsoProviderDraft>;

const SSO_PROVIDERS_PATH = `${BFF_API_PREFIX}/sso-providers`;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function strVal(v: string | null | undefined): string {
  return (v ?? "").trim();
}

function providerToDraft(p: SsoProvider): SsoProviderDraft {
  return {
    name: p.name ?? "",
    client_id: p.client_id ?? "",
    client_secret: "",
    well_known_uri: p.well_known_uri ?? "",
    authorization_endpoint: p.authorization_endpoint ?? "",
    token_endpoint: p.token_endpoint ?? "",
    userinfo_endpoint: p.userinfo_endpoint ?? "",
    issuer: p.issuer ?? "",
    jwks_uri: p.jwks_uri ?? "",
    redirect_uri: p.redirect_uri ?? "",
    end_session_endpoint: p.end_session_endpoint ?? "",
    logout_uri: p.logout_uri ?? "",
    idp_entity_id: p.idp_entity_id ?? "",
    idp_sso_url: p.idp_sso_url ?? "",
    idp_certificate: p.idp_certificate ?? "",
    scopes: p.scopes ?? "",
    attribute_map: p.attribute_map ?? "",
    auto_provision_users: Number(p.auto_provision_users) === 1,
    default_role_id: p.default_role_id != null ? String(p.default_role_id) : "",
    is_active: Number(p.is_active) === 1,
  };
}

function buildDraftsMap(providers: SsoProvider[]): DraftsMap {
  return Object.fromEntries(providers.map((p) => [p.id, providerToDraft(p)]));
}

function isDraftDirty(original: SsoProvider, draft: SsoProviderDraft): boolean {
  if (draft.client_secret.trim()) return true;
  if (strVal(draft.name) !== strVal(original.name)) return true;
  if (strVal(draft.client_id) !== strVal(original.client_id)) return true;
  if (strVal(draft.well_known_uri) !== strVal(original.well_known_uri)) return true;
  if (strVal(draft.authorization_endpoint) !== strVal(original.authorization_endpoint)) return true;
  if (strVal(draft.token_endpoint) !== strVal(original.token_endpoint)) return true;
  if (strVal(draft.userinfo_endpoint) !== strVal(original.userinfo_endpoint)) return true;
  if (strVal(draft.issuer) !== strVal(original.issuer)) return true;
  if (strVal(draft.jwks_uri) !== strVal(original.jwks_uri)) return true;
  if (strVal(draft.redirect_uri) !== strVal(original.redirect_uri)) return true;
  if (strVal(draft.end_session_endpoint) !== strVal(original.end_session_endpoint)) return true;
  if (strVal(draft.logout_uri) !== strVal(original.logout_uri)) return true;
  if (strVal(draft.idp_entity_id) !== strVal(original.idp_entity_id)) return true;
  if (strVal(draft.idp_sso_url) !== strVal(original.idp_sso_url)) return true;
  if (strVal(draft.idp_certificate) !== strVal(original.idp_certificate)) return true;
  if (strVal(draft.scopes) !== strVal(original.scopes)) return true;
  if (strVal(draft.attribute_map) !== strVal(original.attribute_map)) return true;
  if (draft.auto_provision_users !== (Number(original.auto_provision_users) === 1)) return true;
  const origRole = original.default_role_id != null ? String(original.default_role_id) : "";
  if (draft.default_role_id !== origRole) return true;
  if (draft.is_active !== (Number(original.is_active) === 1)) return true;
  return false;
}

function nullableStr(v: string): string | null {
  const s = v.trim();
  return s.length > 0 ? s : null;
}

function buildPatchPayload(
  original: SsoProvider,
  draft: SsoProviderDraft
): Record<string, unknown> {
  const payload: Record<string, unknown> = {};

  if (strVal(draft.name) !== strVal(original.name)) {
    payload.name = draft.name.trim();
  }
  if (strVal(draft.client_id) !== strVal(original.client_id)) {
    payload.client_id = nullableStr(draft.client_id);
  }
  if (draft.client_secret.trim()) {
    payload.client_secret = draft.client_secret.trim();
  }

  const stringFields = [
    "well_known_uri",
    "authorization_endpoint",
    "token_endpoint",
    "userinfo_endpoint",
    "issuer",
    "jwks_uri",
    "redirect_uri",
    "end_session_endpoint",
    "logout_uri",
    "idp_entity_id",
    "idp_sso_url",
    "idp_certificate",
    "scopes",
    "attribute_map",
  ] as const;

  for (const key of stringFields) {
    const orig = strVal(original[key]);
    const next = strVal(draft[key]);
    if (next !== orig) {
      payload[key] = nullableStr(draft[key]);
    }
  }

  if (draft.auto_provision_users !== (Number(original.auto_provision_users) === 1)) {
    payload.auto_provision_users = draft.auto_provision_users ? 1 : 0;
  }

  const origRoleId = original.default_role_id;
  const nextRoleId = draft.default_role_id.trim() ? Number(draft.default_role_id) : null;
  if (nextRoleId !== origRoleId) {
    payload.default_role_id = nextRoleId;
  }

  if (draft.is_active !== (Number(original.is_active) === 1)) {
    payload.is_active = draft.is_active ? 1 : 0;
  }

  return payload;
}

function mergeProviderFromDraft(original: SsoProvider, draft: SsoProviderDraft): SsoProvider {
  const roleId = draft.default_role_id.trim() ? Number(draft.default_role_id) : null;
  return {
    ...original,
    name: draft.name.trim(),
    client_id: nullableStr(draft.client_id),
    well_known_uri: nullableStr(draft.well_known_uri),
    authorization_endpoint: nullableStr(draft.authorization_endpoint),
    token_endpoint: nullableStr(draft.token_endpoint),
    userinfo_endpoint: nullableStr(draft.userinfo_endpoint),
    issuer: nullableStr(draft.issuer),
    jwks_uri: nullableStr(draft.jwks_uri),
    redirect_uri: nullableStr(draft.redirect_uri),
    end_session_endpoint: nullableStr(draft.end_session_endpoint),
    logout_uri: nullableStr(draft.logout_uri),
    idp_entity_id: nullableStr(draft.idp_entity_id),
    idp_sso_url: nullableStr(draft.idp_sso_url),
    idp_certificate: nullableStr(draft.idp_certificate),
    scopes: nullableStr(draft.scopes),
    attribute_map: nullableStr(draft.attribute_map),
    auto_provision_users: draft.auto_provision_users ? 1 : 0,
    default_role_id: roleId,
    is_active: draft.is_active ? 1 : 0,
  };
}

async function fetchRolesList(): Promise<RoleRaw[]> {
  const params = new URLSearchParams();
  params.set("page", "1");
  params.set("page_size", "500");
  params.set("sort_field", "display_order");
  params.set("sort_order", "asc");
  const url = `${getIAMAPIURL(IAM_ROLES_PATH)}?${params.toString()}`;
  const json = (await getRequest(url, undefined, {
    suppressErrorMessage: true,
  })) as { success?: boolean; data?: RoleRaw[] };
  if (json.success && Array.isArray(json.data)) {
    return json.data;
  }
  return [];
}

// ---------------------------------------------------------------------------
// Toggle
// ---------------------------------------------------------------------------

function BoolToggle({
  checked,
  onChange,
  id,
  enabledLabel,
  disabledLabel,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  id: string;
  enabledLabel: string;
  disabledLabel: string;
}) {
  return (
    <div className="inline-flex items-center gap-2.5">
      <label
        htmlFor={id}
        className="inline-flex cursor-pointer select-none items-center gap-2.5"
      >
        <button
          type="button"
          id={id}
          role="switch"
          aria-checked={checked}
          onClick={() => onChange(!checked)}
          className={[
            "relative inline-flex h-[18px] w-8 shrink-0 items-center rounded-full",
            "border border-transparent transition-colors duration-200 ease-in-out outline-none",
            "focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1 focus-visible:ring-offset-surface",
            checked ? "border-primary bg-primary" : "border-border bg-surface-muted",
          ].join(" ")}
        >
          <span
            className={[
              "pointer-events-none inline-block h-3 w-3 rounded-full shadow-sm",
              "transform transition-transform duration-200 ease-in-out",
              checked ? "translate-x-[18px] bg-white" : "translate-x-[2px] bg-text-muted",
            ].join(" ")}
          />
        </button>
        <span className={`text-xs font-medium ${checked ? "text-success" : "text-text-muted"}`}>
          {checked ? enabledLabel : disabledLabel}
        </span>
      </label>
    </div>
  );
}

function SectionHeading({ children }: { children: ReactNode }) {
  return (
    <div className="my-4 border-t border-border pt-3">
      <h4 className="text-[10px] font-semibold uppercase tracking-wide text-text-muted">
        {children}
      </h4>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Provider card
// ---------------------------------------------------------------------------

function SsoProviderCard({
  provider,
  draft,
  expanded,
  roleOptions,
  onToggleExpand,
  onDraftChange,
  t,
}: {
  provider: SsoProvider;
  draft: SsoProviderDraft;
  expanded: boolean;
  roleOptions: { value: string; label: string; searchText: string }[];
  onToggleExpand: () => void;
  onDraftChange: (id: number, patch: Partial<SsoProviderDraft>) => void;
  t: (code: string, fb?: string) => string;
}) {
  const [showSecret, setShowSecret] = useState(false);
  const isActive = draft.is_active;

  const update = (patch: Partial<SsoProviderDraft>) => onDraftChange(provider.id, patch);

  const labelField = (
    id: string,
    label: string,
    children: ReactNode,
    required = false,
    hint?: string,
    error?: string | null
  ) => (
    <div className="sys-config__label-fields">
      <div className="sys-config__label-field">
        <label htmlFor={id} className="text-xs font-medium text-text">
          {required ? (
            <>
              <span className="text-error">*</span> {label}
            </>
          ) : (
            label
          )}
        </label>
      </div>
      <div className="sys-config__input-field">
        {children}
        {error ? (
          <span className="sys-config__error" role="alert">
            {error}
          </span>
        ) : null}
        {hint ? <span className="sys-config__hint">{hint}</span> : null}
      </div>
    </div>
  );

  return (
    <div className="card">
      <div
        className="card__header cursor-pointer"
        role="button"
        tabIndex={0}
        aria-expanded={expanded}
        onClick={onToggleExpand}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onToggleExpand();
          }
        }}
      >
        <span className="material-icons shrink-0 !text-base text-primary" aria-hidden>
          apps
        </span>
        <h3 className="min-w-0 flex-1 truncate text-sm font-semibold text-text">
          {draft.name.trim() || provider.name}
        </h3>
        <span
          className={`label-tag gap-1 ${isActive ? "tone-pill--success" : "tone-pill--neutral"}`}
        >
          <span
            className={`inline-block h-1.5 w-1.5 rounded-full ${isActive ? "bg-success" : "bg-text-muted"}`}
            aria-hidden
          />
          {isActive ? t("ACTIVE") : t("INACTIVE")}
        </span>
        <ExpandChevronButton
          expanded={expanded}
          onClick={(e) => {
            e.stopPropagation();
            onToggleExpand();
          }}
          iconClassName="text-text-muted"
        />
      </div>

      {expanded ? (
        <div className="px-4 py-3">
          <div className="grid grid-cols-1 gap-0 md:grid-cols-2 md:gap-x-6">
            {labelField(
              `sso-name-${provider.id}`,
              t("NAME"),
              <TextField
                id={`sso-name-${provider.id}`}
                fieldSize="sm"
                value={draft.name}
                onChange={(e) => update({ name: e.target.value })}
              />
            )}
            {labelField(
              `sso-scopes-${provider.id}`,
              t("SSO_PROVIDERS_SCOPES"),
              <TextField
                id={`sso-scopes-${provider.id}`}
                fieldSize="sm"
                value={draft.scopes}
                onChange={(e) => update({ scopes: e.target.value })}
                placeholder="openid profile email"
              />
            )}
          </div>

          <div className="grid grid-cols-1 gap-0 md:grid-cols-2 md:gap-x-6">
            {labelField(
              `sso-client-id-${provider.id}`,
              t("SSO_PROVIDERS_CLIENT_ID"),
              <TextField
                id={`sso-client-id-${provider.id}`}
                fieldSize="sm"
                value={draft.client_id}
                onChange={(e) => update({ client_id: e.target.value })}
                placeholder={t("SSO_PROVIDERS_CLIENT_ID_PLACEHOLDER")}
              />
            )}
            {labelField(
              `sso-client-secret-${provider.id}`,
              t("SSO_PROVIDERS_CLIENT_SECRET"),
              <div className="relative">
                <TextField
                  id={`sso-client-secret-${provider.id}`}
                  fieldSize="sm"
                  type={showSecret ? "text" : "password"}
                  value={draft.client_secret}
                  onChange={(e) => update({ client_secret: e.target.value })}
                  placeholder={t("SSO_PROVIDERS_CLIENT_SECRET_PLACEHOLDER")}
                  autoComplete="off"
                  className="pr-9"
                />
                <button
                  type="button"
                  className="btn-comp-ghost btn-comp-ghost--xs absolute right-1 top-1/2 -translate-y-1/2"
      
                  onClick={() => setShowSecret((v) => !v)}
                >
                  <span className="material-icons !text-sm leading-none" aria-hidden>
                    {showSecret ? "visibility_off" : "visibility"}
                  </span>
                </button>
              </div>,
              false,
            )}
          </div>

          <SectionHeading>{t("SSO_PROVIDERS_SECTION_OAUTH")}</SectionHeading>

          {labelField(
            `sso-well-known-${provider.id}`,
            t("SSO_PROVIDERS_WELL_KNOWN_URI"),
            <TextField
              id={`sso-well-known-${provider.id}`}
              fieldSize="sm"
              value={draft.well_known_uri}
              onChange={(e) => update({ well_known_uri: e.target.value })}
              placeholder="https://accounts.example.com/.well-known/openid-configuration"
            />
          )}

          <div className="grid grid-cols-1 gap-0 md:grid-cols-2 md:gap-x-6">
            {labelField(
              `sso-auth-endpoint-${provider.id}`,
              t("SSO_PROVIDERS_AUTH_ENDPOINT"),
              <TextField
                id={`sso-auth-endpoint-${provider.id}`}
                fieldSize="sm"
                value={draft.authorization_endpoint}
                onChange={(e) => update({ authorization_endpoint: e.target.value })}
                placeholder="http://localhost/oauth2/authorize"
              />
            )}
            {labelField(
              `sso-token-endpoint-${provider.id}`,
              t("SSO_PROVIDERS_TOKEN_ENDPOINT"),
              <TextField
                id={`sso-token-endpoint-${provider.id}`}
                fieldSize="sm"
                value={draft.token_endpoint}
                onChange={(e) => update({ token_endpoint: e.target.value })}
                placeholder="http://localhost/oauth2/token"
              />
            )}
          </div>

          <div className="grid grid-cols-1 gap-0 md:grid-cols-2 md:gap-x-6">
            {labelField(
              `sso-userinfo-endpoint-${provider.id}`,
              t("SSO_PROVIDERS_USERINFO_ENDPOINT"),
              <TextField
                id={`sso-userinfo-endpoint-${provider.id}`}
                fieldSize="sm"
                value={draft.userinfo_endpoint}
                onChange={(e) => update({ userinfo_endpoint: e.target.value })}
                placeholder="http://localhost/oauth2/UserInfo"
              />
            )}
            {labelField(
              `sso-jwks-uri-${provider.id}`,
              t("SSO_PROVIDERS_JWKS_URI"),
              <TextField
                id={`sso-jwks-uri-${provider.id}`}
                fieldSize="sm"
                value={draft.jwks_uri}
                onChange={(e) => update({ jwks_uri: e.target.value })}
                placeholder="http://localhost/oauth2/jwks"
              />
            )}
          </div>

          <div className="grid grid-cols-1 gap-0 md:grid-cols-2 md:gap-x-6">
            {labelField(
              `sso-issuer-${provider.id}`,
              t("SSO_PROVIDERS_ISSUER"),
              <TextField
                id={`sso-issuer-${provider.id}`}
                fieldSize="sm"
                value={draft.issuer}
                onChange={(e) => update({ issuer: e.target.value })}
                placeholder="http://localhost"
              />
            )}
            {labelField(
              `sso-redirect-uri-${provider.id}`,
              t("SSO_PROVIDERS_REDIRECT_URI"),
              <TextField
                id={`sso-redirect-uri-${provider.id}`}
                fieldSize="sm"
                value={draft.redirect_uri}
                onChange={(e) => update({ redirect_uri: e.target.value })}
                placeholder="https://yourapp.com/auth/callback"
              />
            )}
          </div>

          <div className="grid grid-cols-1 gap-0 md:grid-cols-2 md:gap-x-6">
            {labelField(
              `sso-end-session-${provider.id}`,
              t("SSO_PROVIDERS_END_SESSION_ENDPOINT"),
              <TextField
                id={`sso-end-session-${provider.id}`}
                fieldSize="sm"
                value={draft.end_session_endpoint}
                onChange={(e) => update({ end_session_endpoint: e.target.value })}
                placeholder="https://.../oauth2/logout"
              />
            )}
            {labelField(
              `sso-logout-uri-${provider.id}`,
              t("SSO_PROVIDERS_LOGOUT_URI"),
              <TextField
                id={`sso-logout-uri-${provider.id}`}
                fieldSize="sm"
                value={draft.logout_uri}
                onChange={(e) => update({ logout_uri: e.target.value })}
                placeholder="https://yourapp.com/logged-out"
              />
            )}
          </div>

          <SectionHeading>{t("SSO_PROVIDERS_SECTION_SAML")}</SectionHeading>

          <div className="grid grid-cols-1 gap-0 md:grid-cols-2 md:gap-x-6">
            {labelField(
              `sso-idp-entity-${provider.id}`,
              t("SSO_PROVIDERS_IDP_ENTITY_ID"),
              <TextField
                id={`sso-idp-entity-${provider.id}`}
                fieldSize="sm"
                value={draft.idp_entity_id}
                onChange={(e) => update({ idp_entity_id: e.target.value })}
                placeholder="https://idp.example.com/entity"
              />
            )}
            {labelField(
              `sso-idp-sso-url-${provider.id}`,
              t("SSO_PROVIDERS_IDP_SSO_URL"),
              <TextField
                id={`sso-idp-sso-url-${provider.id}`}
                fieldSize="sm"
                value={draft.idp_sso_url}
                onChange={(e) => update({ idp_sso_url: e.target.value })}
                placeholder="https://idp.example.com/sso"
              />
            )}
          </div>

          {labelField(
            `sso-idp-cert-${provider.id}`,
            t("SSO_PROVIDERS_IDP_CERTIFICATE"),
            <TextAreaField
              id={`sso-idp-cert-${provider.id}`}
              fieldSize="sm"
              value={draft.idp_certificate}
              onChange={(e) => update({ idp_certificate: e.target.value })}
              placeholder="-----BEGIN CERTIFICATE-----"
              className="min-h-[96px] resize-y font-mono text-xs"
              spellCheck={false}
            />,
            false,
          )}

          {labelField(
            `sso-attribute-map-${provider.id}`,
            t("SSO_PROVIDERS_ATTRIBUTE_MAP"),
            <TextAreaField
              id={`sso-attribute-map-${provider.id}`}
              fieldSize="sm"
              value={draft.attribute_map}
              onChange={(e) => update({ attribute_map: e.target.value })}
              placeholder='{"email": "email", "name": "displayName"}'
              className="min-h-[72px] resize-y font-mono text-xs"
              spellCheck={false}
            />,
            false,
          )}

          <SectionHeading>{t("SSO_PROVIDERS_SECTION_PROVISIONING")}</SectionHeading>

          <div className="grid grid-cols-1 gap-0 md:grid-cols-2 md:gap-x-6">
            <div className="sys-config__label-fields">
              <div className="sys-config__label-field">
                <span className="text-xs font-medium text-text">
                  {t("SSO_PROVIDERS_AUTO_PROVISION")}
                </span>
              </div>
              <div className="sys-config__input-field pt-0.5">
                <BoolToggle
                  id={`sso-auto-provision-${provider.id}`}
                  checked={draft.auto_provision_users}
                  onChange={(v) => update({ auto_provision_users: v })}
                  enabledLabel={t("ENABLED")}
                  disabledLabel={t("DISABLED")}
                />
              </div>
            </div>
            {labelField(
              `sso-default-role-${provider.id}`,
              t("SSO_PROVIDERS_DEFAULT_ROLE"),
              <SelectField
                id={`sso-default-role-${provider.id}`}
                className="w-full min-w-0"
                menuPortal
                searchEnabled
                disabled={!draft.auto_provision_users}
                value={draft.default_role_id}
                onChange={(e) => update({ default_role_id: e.target.value })}
                options={roleOptions}
                aria-label={t("SSO_PROVIDERS_DEFAULT_ROLE")}
              />,
              false,
            )}
          </div>

          <div className="sys-config__label-fields">
            <div className="sys-config__label-field">
              <span className="text-xs font-medium text-text">{t("STATUS")}</span>
            </div>
            <div className="sys-config__input-field pt-0.5">
              <BoolToggle
                id={`sso-status-${provider.id}`}
                checked={draft.is_active}
                onChange={(v) => update({ is_active: v })}
                enabledLabel={t("ACTIVE")}
                disabledLabel={t("INACTIVE")}
              />
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Panel
// ---------------------------------------------------------------------------

export interface SsoProvidersPanelHandle {
  dirty: boolean;
  saving: boolean;
  onSave: () => Promise<void>;
  onReset: () => void;
}

export function SsoProvidersConfigPanel({
  t,
  onHandleReady,
}: {
  t: (code: string, fb?: string) => string;
  onHandleReady: (handle: SsoProvidersPanelHandle | null) => void;
}) {
  const [providers, setProviders] = useState<SsoProvider[]>([]);
  const [baseline, setBaseline] = useState<DraftsMap>({});
  const [drafts, setDrafts] = useState<DraftsMap>({});
  const [roles, setRoles] = useState<RoleRaw[]>([]);
  const [expandedIds, setExpandedIds] = useState<Record<number, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [providersRes, rolesList] = await Promise.all([
        getRequest(SSO_PROVIDERS_PATH, undefined, { suppressErrorMessage: true }) as Promise<{
          success?: boolean;
          data?: SsoProvider[];
          err_message?: string;
        }>,
        fetchRolesList(),
      ]);

      if (providersRes?.success && Array.isArray(providersRes.data)) {
        const fetched = providersRes.data;
        const map = buildDraftsMap(fetched);
        setProviders(fetched);
        setBaseline(map);
        setDrafts(map);
      } else {
        toast.error(providersRes?.err_message ?? t("SSO_PROVIDERS_LOAD_FAILED"));
      }
      setRoles(rolesList);
    } catch {
      toast.error(t("SSO_PROVIDERS_LOAD_FAILED"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  const roleOptions = useMemo(() => {
    const head = [
      {
        value: "",
        label: t("NONE"),
        searchText: "none",
      },
    ];
    return [
      ...head,
      ...roles.map((r) => ({
        value: String(r.id),
        label: (r.name ?? r.role_code).trim() || r.role_code,
        searchText: `${r.name ?? ""} ${r.role_code} ${r.id}`.toLowerCase(),
      })),
    ];
  }, [roles, t]);

  const dirty = useMemo(
    () => providers.some((p) => drafts[p.id] && isDraftDirty(p, drafts[p.id]!)),
    [providers, drafts]
  );

  const handleDraftChange = useCallback((id: number, patch: Partial<SsoProviderDraft>) => {
    setDrafts((prev) => ({ ...prev, [id]: { ...prev[id]!, ...patch } }));
  }, []);

  const handleToggleExpand = useCallback((id: number) => {
    setExpandedIds((prev) => ({ ...prev, [id]: !prev[id] }));
  }, []);

  const handleReset = useCallback(() => {
    setDrafts({ ...baseline });
    setExpandedIds({});
    toast.message(t("APP_CONFIG_RESET_DONE"));
  }, [baseline, t]);

  const handleSave = useCallback(async () => {
    const dirtyProviders = providers.filter(
      (p) => drafts[p.id] && isDraftDirty(p, drafts[p.id]!)
    );

    if (dirtyProviders.length === 0) {
      toast.message(t("APP_CONFIG_NOTHING_TO_SAVE"));
      return;
    }

    setSaving(true);
    try {
      const results = await Promise.allSettled(
        dirtyProviders.map(async (p) => {
          const draft = drafts[p.id]!;
          const payload = buildPatchPayload(p, draft);
          if (Object.keys(payload).length === 0) {
            return { id: p.id, provider: p };
          }
          const res = (await patchRequest(
            `${SSO_PROVIDERS_PATH}/${p.id}`,
            payload,
            undefined,
            undefined,
            { suppressErrorMessage: true }
          )) as { success?: boolean; data?: SsoProvider; err_message?: string };

          if (!res?.success) {
            throw new Error(res?.err_message ?? t("SSO_PROVIDERS_SAVE_FAILED"));
          }
          const updated = res.data ?? mergeProviderFromDraft(p, draft);
          return { id: p.id, provider: updated };
        })
      );

      const succeeded: { id: number; provider: SsoProvider }[] = [];
      const failures: string[] = [];

      for (let i = 0; i < results.length; i++) {
        const result = results[i]!;
        const providerName = dirtyProviders[i]!.name;
        if (result.status === "fulfilled") {
          succeeded.push(result.value);
        } else {
          const msg =
            result.reason instanceof Error
              ? result.reason.message
              : t("SSO_PROVIDERS_SAVE_FAILED");
          failures.push(`${providerName}: ${msg}`);
        }
      }

      if (succeeded.length > 0) {
        const nextProviders = [...providers];
        const nextBaseline = { ...baseline };
        const nextDrafts = { ...drafts };

        for (const { id, provider } of succeeded) {
          const idx = nextProviders.findIndex((p) => p.id === id);
          if (idx >= 0) nextProviders[idx] = provider;
          const clearedDraft = providerToDraft(provider);
          nextBaseline[id] = clearedDraft;
          nextDrafts[id] = clearedDraft;
        }

        setProviders(nextProviders);
        setBaseline(nextBaseline);
        setDrafts(nextDrafts);
      }

      if (failures.length === 0) {
        toast.success(t("SSO_PROVIDERS_SAVE_SUCCESS"));
      } else if (succeeded.length > 0) {
        toast.warning(`${t("SSO_PROVIDERS_SAVE_PARTIAL")}: ${failures.join("; ")}`);
      } else {
        toast.error(failures.join("; "));
      }
    } catch {
      toast.error(t("SSO_PROVIDERS_SAVE_FAILED"));
    } finally {
      setSaving(false);
    }
  }, [providers, drafts, baseline, t]);

  useEffect(() => {
    if (loading) {
      onHandleReady(null);
      return;
    }
    onHandleReady({ dirty, saving, onSave: handleSave, onReset: handleReset });
  }, [loading, dirty, saving, handleSave, handleReset, onHandleReady]);

  useEffect(() => () => onHandleReady(null), [onHandleReady]);

  if (loading) {
    return (
      <div className="sys-config__panel">
        <p className="text-sm text-text-muted">{t("LOADING")}</p>
      </div>
    );
  }

  if (providers.length === 0) {
    return (
      <div className="sys-config__panel">
        <p className="text-sm text-text-muted">{t("SSO_PROVIDERS_EMPTY")}</p>
      </div>
    );
  }

  return (
    <div className="sys-config__panel">
      <div className="space-y-4">
        {providers.map((provider) => (
          <SsoProviderCard
            key={provider.id}
            provider={provider}
            draft={drafts[provider.id] ?? providerToDraft(provider)}
            expanded={Boolean(expandedIds[provider.id])}
            roleOptions={roleOptions}
            onToggleExpand={() => handleToggleExpand(provider.id)}
            onDraftChange={handleDraftChange}
            t={t}
          />
        ))}
      </div>
    </div>
  );
}
