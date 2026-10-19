"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { TextField } from "@/components/TextField";
import { TextAreaField } from "@/components/TextAreaField";
import { PrimarySaveButton } from "@/components/PrimarySaveButton";
import { SecondaryButton } from "@/components/SecondaryButton";
import { getRequest, patchRequest } from "@/lib/api/http";
import { Loader } from "@/components/Loader";
import { API_KEY, BFF_API_PREFIX } from "@/lib/constants";
import type { SystemApplication } from "@/lib/api/core";

type ApiClient = SystemApplication;

interface ClientDraft {
  app_name: string;
  origin_url: string;
  description: string;
  status: "ACTIVE" | "INACTIVE" | "SUSPENDED";
}

type DraftsMap = Record<number, ClientDraft>;

function clientToDraft(c: ApiClient): ClientDraft {
  return {
    app_name: c.app_name ?? "",
    origin_url: c.origin_url ?? "",
    description: c.description ?? "",
    status: (c.status as "ACTIVE" | "INACTIVE" | "SUSPENDED") ?? "INACTIVE",
  };
}

function buildDraftsMap(clients: ApiClient[]): DraftsMap {
  return Object.fromEntries(clients.map((c) => [c.id, clientToDraft(c)]));
}

function isDraftDirty(original: ApiClient, draft: ClientDraft): boolean {
  return (
    draft.app_name.trim() !== (original.app_name ?? "").trim() ||
    draft.origin_url.trim() !== (original.origin_url ?? "").trim() ||
    draft.description.trim() !== (original.description ?? "").trim() ||
    draft.status !== (original.status ?? "INACTIVE")
  );
}

/** Returns true if this client is the currently running application. */
function isSelfClient(client: ApiClient): boolean {
  return client.api_key === API_KEY;
}

function validateOriginUrl(val: string): boolean {
  if (!val.trim()) return true;
  try {
    const u = new URL(val.trim());
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Status toggle
// ---------------------------------------------------------------------------
function StatusToggle({
  status,
  onChange,
  id,
  disabled,
  t,
}: {
  status: "ACTIVE" | "INACTIVE" | "SUSPENDED";
  onChange: (v: "ACTIVE" | "INACTIVE") => void;
  id: string;
  disabled?: boolean;
  t: (code: string, fb?: string) => string;
}) {
  const isActive = status === "ACTIVE";
  return (
    <div className="inline-flex items-center gap-2.5">
      <label
        htmlFor={id}
        className={`inline-flex items-center gap-2.5 select-none ${disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer"}`}
        title={undefined}
      >
        <button
          type="button"
          id={id}
          role="switch"
          aria-checked={isActive}
          disabled={disabled}
          onClick={() => !disabled && onChange(isActive ? "INACTIVE" : "ACTIVE")}
          className={[
            "relative inline-flex h-[18px] w-8 shrink-0 items-center rounded-full",
            "transition-colors duration-200 ease-in-out outline-none border border-transparent",
            "focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1 focus-visible:ring-offset-surface",
            disabled ? "cursor-not-allowed" : "cursor-pointer",
            isActive ? "bg-primary border-primary" : "bg-surface-muted border-border",
          ].join(" ")}
        >
          <span
            className={[
              "pointer-events-none inline-block h-3 w-3 rounded-full shadow-sm",
              "transform transition-transform duration-200 ease-in-out",
              isActive ? "translate-x-[18px] bg-white" : "translate-x-[2px] bg-text-muted",
            ].join(" ")}
          />
        </button>
        <span className={`text-xs font-medium ${isActive ? "text-success" : "text-text-muted"}`}>
          {isActive ? t("ACTIVE", "Active") : t("INACTIVE", "Inactive")}
        </span>
      </label>
      {disabled && (
        <span className="material-icons !text-sm text-text-muted" aria-hidden>
          lock
        </span>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// ProductCard — pure field display, all state owned by parent
// ---------------------------------------------------------------------------
function ProductCard({
  client,
  draft,
  submitAttempted,
  onDraftChange,
  t,
}: {
  client: ApiClient;
  draft: ClientDraft;
  submitAttempted: boolean;
  onDraftChange: (id: number, patch: Partial<ClientDraft>) => void;
  t: (code: string, fb?: string) => string;
}) {
  const isSelf = isSelfClient(client);
  const appNameError =
    submitAttempted && !draft.app_name.trim()
      ? t("PRODUCTS_APP_NAME_REQUIRED", "App name is required.")
      : null;

  const originUrlError =
    submitAttempted && !validateOriginUrl(draft.origin_url)
      ? t("PRODUCTS_ORIGIN_URL_INVALID", "Must be a valid http:// or https:// URL.")
      : null;

  const statusIsActive = draft.status === "ACTIVE";

  return (
    <div className="card">
      {/* Header: app_name · api_key chip · current-status badge */}
      <div className="card__header">
        <span className="material-icons shrink-0 !text-base text-primary" aria-hidden>
          apps
        </span>
        <h3 className="min-w-0 flex-1 truncate text-sm font-semibold text-text">{draft.app_name || client.app_name}</h3>
        <code className="shrink-0 rounded bg-surface px-1.5 py-0.5 text-[10px] text-text-muted border border-border truncate max-w-[160px]">{client.api_key}</code>
        <span className={`label-tag gap-1 ${statusIsActive ? "tone-pill--success" : "tone-pill--neutral"}`}>
          <span className={`inline-block h-1.5 w-1.5 rounded-full ${statusIsActive ? "bg-success" : "bg-text-muted"}`} aria-hidden />
          {statusIsActive ? t("ACTIVE", "Active") : t("INACTIVE", "Inactive")}
        </span>
      </div>

      <div className="px-4 py-3">
        {/* App Name */}
        <div className="sys-config__label-fields">
          <div className="sys-config__label-field">
            <label htmlFor={`prod-app-name-${client.id}`} className="text-xs font-medium text-text">
              <span className="text-error">*</span>{" "}
              {t("PRODUCTS_APP_NAME", "App Name")}
            </label>
          </div>
          <div className="sys-config__input-field">
            <TextField
              id={`prod-app-name-${client.id}`}
              fieldSize="sm"
              value={draft.app_name}
              onChange={(e) => onDraftChange(client.id, { app_name: e.target.value })}
              placeholder={t("PRODUCTS_APP_NAME_PLACEHOLDER", "Enter application name")}
              aria-required="true"
              aria-invalid={!!appNameError}
            />
            {appNameError && (
              <span className="sys-config__error" role="alert">{appNameError}</span>
            )}
          </div>
        </div>

        {/* Origin URL */}
        <div className="sys-config__label-fields">
          <div className="sys-config__label-field">
            <label htmlFor={`prod-origin-url-${client.id}`} className="text-xs font-medium text-text">
              {t("PRODUCTS_ORIGIN_URL", "Origin URL")}
            </label>
          </div>
          <div className="sys-config__input-field">
            <TextField
              id={`prod-origin-url-${client.id}`}
              fieldSize="sm"
              value={draft.origin_url}
              onChange={(e) => onDraftChange(client.id, { origin_url: e.target.value })}
              placeholder={t("PRODUCTS_ORIGIN_URL_PLACEHOLDER", "e.g. http://localhost:3000")}
              type="url"
              aria-invalid={!!originUrlError}
            />
            {originUrlError && (
              <span className="sys-config__error" role="alert">{originUrlError}</span>
            )}
          </div>
        </div>

        {/* Description */}
        <div className="sys-config__label-fields">
          <div className="sys-config__label-field">
            <label htmlFor={`prod-desc-${client.id}`} className="text-xs font-medium text-text">
              {t("PRODUCTS_DESCRIPTION", "Description")}
            </label>
          </div>
          <div className="sys-config__input-field">
            <TextAreaField
              id={`prod-desc-${client.id}`}
              fieldSize="sm"
              value={draft.description}
              onChange={(e) => onDraftChange(client.id, { description: e.target.value })}
              placeholder={t("PRODUCTS_DESCRIPTION_PLACEHOLDER", "Enter a short description...")}
              className="min-h-[72px] resize-y"
            />
          </div>
        </div>

        {/* Status toggle */}
        <div className="sys-config__label-fields">
          <div className="sys-config__label-field">
            <span className="text-xs font-medium text-text">
              {t("PRODUCTS_STATUS", "Status")}
            </span>
          </div>
          <div className="sys-config__input-field pt-0.5">
            <StatusToggle
              id={`prod-status-${client.id}`}
              status={draft.status}
              onChange={(v) => onDraftChange(client.id, { status: v })}
              disabled={isSelf}
              t={t}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ProductsConfigPanel — owns all state, exposes save/reset via props
// ---------------------------------------------------------------------------
export interface ProductsPanelHandle {
  dirty: boolean;
  saving: boolean;
  onSave: () => Promise<void>;
  onReset: () => void;
}

export function ProductsConfigPanel({
  t,
  onHandleReady,
}: {
  t: (code: string, fb?: string) => string;
  onHandleReady: (handle: ProductsPanelHandle | null) => void;
}) {
  const [clients, setClients] = useState<ApiClient[]>([]);
  const [baseline, setBaseline] = useState<DraftsMap>({});
  const [drafts, setDrafts] = useState<DraftsMap>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [submitAttempted, setSubmitAttempted] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = (await getRequest(
        `${BFF_API_PREFIX}/system-api-clients?status=ALL&app_type=FED`,
        undefined,
        { suppressErrorMessage: true }
      )) as { success?: boolean; data?: ApiClient[]; err_message?: string };

      if (res?.success && Array.isArray(res.data)) {
        const fetched = res.data;
        const map = buildDraftsMap(fetched);
        setClients(fetched);
        setBaseline(map);
        setDrafts(map);
        setSubmitAttempted(false);
      } else {
        toast.error(res?.err_message ?? t("PRODUCTS_LOAD_FAILED", "Failed to load products"));
      }
    } catch {
      toast.error(t("PRODUCTS_LOAD_FAILED", "Failed to load products"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => { void load(); }, [load]);

  const dirty = useMemo(
    () => clients.some((c) => drafts[c.id] && isDraftDirty(c, drafts[c.id]!)),
    [clients, drafts]
  );

  const handleDraftChange = useCallback((id: number, patch: Partial<ClientDraft>) => {
    setDrafts((prev) => ({ ...prev, [id]: { ...prev[id]!, ...patch } }));
  }, []);

  const handleReset = useCallback(() => {
    setDrafts({ ...baseline });
    setSubmitAttempted(false);
    toast.message(t("APP_CONFIG_RESET_DONE", "Changes reverted"));
  }, [baseline, t]);

  const handleSave = useCallback(async () => {
    setSubmitAttempted(true);

    // Validate all cards
    for (const c of clients) {
      const d = drafts[c.id];
      if (!d) continue;
      if (!d.app_name.trim()) return;
      if (!validateOriginUrl(d.origin_url)) return;
    }

    // Build payload array for changed clients only
    const updateItems = clients
      .filter((c) => drafts[c.id] && isDraftDirty(c, drafts[c.id]!))
      .map((c) => {
        const d = drafts[c.id]!;
        return {
          app_client_id: c.id,
          app_name: d.app_name.trim(),
          origin_url: d.origin_url.trim() || null,
          description: d.description.trim() || null,
          status: d.status,
        };
      });

    if (updateItems.length === 0) {
      toast.message(t("APP_CONFIG_NOTHING_TO_SAVE", "No changes to save"));
      return;
    }

    setSaving(true);
    try {
      const res = (await patchRequest(
        `${BFF_API_PREFIX}/system-api-clients`,
        updateItems,
        undefined,
        undefined,
        { suppressErrorMessage: true }
      )) as { success?: boolean; err_message?: string };

      if (res?.success) {
        toast.success(t("PRODUCTS_SAVE_SUCCESS", "Products saved successfully"));
        // Promote drafts to baseline so dirty tracking resets — no refetch needed
        setBaseline({ ...drafts });
        setSubmitAttempted(false);
      } else {
        toast.error(res?.err_message ?? t("PRODUCTS_SAVE_FAILED", "Failed to save products"));
      }
    } catch {
      toast.error(t("PRODUCTS_SAVE_FAILED", "Failed to save products"));
    } finally {
      setSaving(false);
    }
  }, [clients, drafts, t]);

  // Expose handle to parent (AppConfigurationAdminTab) for the shared footer
  useEffect(() => {
    if (loading) {
      onHandleReady(null);
      return;
    }
    onHandleReady({ dirty, saving, onSave: handleSave, onReset: handleReset });
  }, [loading, dirty, saving, handleSave, handleReset, onHandleReady]);

  // Cleanup on unmount
  useEffect(() => () => { onHandleReady(null); }, [onHandleReady]);

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Loader loadingLabel={t("LOADING")} />
      </div>
    );
  }

  if (clients.length === 0) {
    return (
      <div className="sys-config__panel">
        <p className="text-sm text-text-muted">
          {t("PRODUCTS_EMPTY", "No registered products found.")}
        </p>
      </div>
    );
  }

  return (
    <div className="sys-config__panel">
      <div className="space-y-4">
        {clients.map((client) => (
          <ProductCard
            key={client.id}
            client={client}
            draft={drafts[client.id] ?? clientToDraft(client)}
            submitAttempted={submitAttempted}
            onDraftChange={handleDraftChange}
            t={t}
          />
        ))}
      </div>
    </div>
  );
}
