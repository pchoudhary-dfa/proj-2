"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { X, Map, ChevronDown, ChevronRight, Plus, Trash2 } from "lucide-react";
import { useCore } from "@/contexts/CoreContext";
import { Loader } from "@/components/Loader";
import { patchAppConfig, fetchAppConfig } from "@/lib/api/core";
import { isApiError } from "@/lib/api/types";
import { fetchGeoJSON } from "@/lib/visualizer/mapUtils";
import {
  type MapConfigFormState,
  type LevelFormEntry,
  type ScopedOverrideRow,
  formStateFromConfig,
  formStateToDwMapsJson,
  syncFormFromJsonString,
  validateMapConfigForm,
  validateDwMapsJson,
  nextLevelKey,
  emptyLevel,
  newRowId,
} from "@/lib/visualizer/mapConfigEditor";

const INPUT_CLASS =
  "w-full px-3 py-2 text-sm border border-border rounded-md bg-surface text-text focus:outline-none focus:ring-1 focus:ring-primary";
const MONO_INPUT_CLASS = `${INPUT_CLASS} font-mono text-xs`;

function unwrapConfigValue(raw: unknown): string {
  if (raw == null) return "";
  if (typeof raw === "string") return raw;
  if (typeof raw === "object" && raw !== null && "value" in raw) {
    const v = (raw as { value?: unknown }).value;
    return v != null ? String(v) : "";
  }
  return String(raw);
}

export interface MapConfigurationPanelProps {
  open: boolean;
  onClose: () => void;
}

export function MapConfigurationPanel({ open, onClose }: MapConfigurationPanelProps) {
  const { t, refreshConfig, dataWarehouseId } = useCore();

  const [form, setForm] = useState<MapConfigFormState>({ dmlUrl: "", levels: [] });
  const [initial, setInitial] = useState<MapConfigFormState>({ dmlUrl: "", levels: [] });
  const [activeLevelKey, setActiveLevelKey] = useState<string>("L1");
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [advancedJson, setAdvancedJson] = useState("{}");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [dmlTestMsg, setDmlTestMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [mapTestMsg, setMapTestMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [testingDml, setTestingDml] = useState(false);
  const [testingMap, setTestingMap] = useState(false);

  const loadConfig = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const dwId = dataWarehouseId?.trim();
      const res = await fetchAppConfig(undefined, undefined, dwId || null);
      if (isApiError(res)) {
        setError(res.message || "Failed to load configuration");
        return;
      }
      const data = res.data ?? {};
      const dmlUrl = unwrapConfigValue(data.DFA_DML_URL);
      const dwMaps =
        unwrapConfigValue(data.DW_MAPS) ||
        unwrapConfigValue(data.DFA_MAPS) ||
        "{}";
      const state = formStateFromConfig(dmlUrl, dwMaps);
      setForm(state);
      setInitial(state);
      setAdvancedJson(formStateToDwMapsJson(state));
      const firstLevel = state.levels[0]?.levelKey ?? "L1";
      setActiveLevelKey(firstLevel);
    } catch {
      setError("Failed to load configuration");
    } finally {
      setLoading(false);
    }
  }, [dataWarehouseId]);

  useEffect(() => {
    if (open) {
      void loadConfig();
      setSuccessMsg(null);
      setDmlTestMsg(null);
      setMapTestMsg(null);
    }
  }, [open, loadConfig]);

  useEffect(() => {
    if (!open) return;
    function handleEsc(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleEsc);
    return () => document.removeEventListener("keydown", handleEsc);
  }, [open, onClose]);

  const mapsEnabled = Boolean(form.dmlUrl.trim());
  const dirty = useMemo(() => {
    return (
      form.dmlUrl !== initial.dmlUrl ||
      formStateToDwMapsJson(form) !== formStateToDwMapsJson(initial)
    );
  }, [form, initial]);

  const activeLevel = useMemo(
    () => form.levels.find((l) => l.levelKey === activeLevelKey) ?? form.levels[0],
    [form.levels, activeLevelKey],
  );

  const updateForm = useCallback((patch: Partial<MapConfigFormState>) => {
    setForm((prev) => {
      const next = { ...prev, ...patch };
      if (patch.levels !== undefined) {
        setAdvancedJson(formStateToDwMapsJson({ ...next, levels: patch.levels }));
      }
      return next;
    });
    setSuccessMsg(null);
  }, []);

  const updateLevel = useCallback(
    (levelKey: string, patch: Partial<LevelFormEntry>) => {
      setForm((prev) => {
        const levels = prev.levels.map((l) =>
          l.levelKey === levelKey ? { ...l, ...patch } : l,
        );
        const next = { ...prev, levels };
        setAdvancedJson(formStateToDwMapsJson(next));
        return next;
      });
      setSuccessMsg(null);
    },
    [],
  );

  const handleAdvancedJsonChange = useCallback((json: string) => {
    setAdvancedJson(json);
    setForm((prev) => syncFormFromJsonString(prev, json));
    setSuccessMsg(null);
  }, []);

  const handleAddLevel = useCallback(() => {
    const key = nextLevelKey(form.levels);
    const entry = emptyLevel(key);
    setForm((prev) => {
      const next = { ...prev, levels: [...prev.levels, entry] };
      setAdvancedJson(formStateToDwMapsJson(next));
      return next;
    });
    setActiveLevelKey(key);
    setSuccessMsg(null);
  }, [form.levels]);

  const handleRemoveLevel = useCallback(
    (levelKey: string) => {
      setForm((prev) => {
        const levels = prev.levels.filter((l) => l.levelKey !== levelKey);
        const next = { ...prev, levels };
        setAdvancedJson(formStateToDwMapsJson(next));
        return next;
      });
      setActiveLevelKey((current) => {
        if (current !== levelKey) return current;
        const remaining = form.levels.filter((l) => l.levelKey !== levelKey);
        return remaining[0]?.levelKey ?? "L1";
      });
      setSuccessMsg(null);
    },
    [form.levels],
  );

  const handleTestDml = useCallback(async () => {
    const url = form.dmlUrl.trim().replace(/\/+$/, "");
    if (!url) {
      setDmlTestMsg({ ok: false, text: "Enter a map service URL first." });
      return;
    }
    setTestingDml(true);
    setDmlTestMsg(null);
    try {
      const res = await fetch(url, { method: "HEAD", mode: "cors" });
      if (res.ok || res.status === 405) {
        setDmlTestMsg({ ok: true, text: "Connection OK." });
      } else {
        setDmlTestMsg({ ok: false, text: `HTTP ${res.status}` });
      }
    } catch {
      try {
        await fetch(url, { method: "GET", mode: "cors" });
        setDmlTestMsg({ ok: true, text: "Connection OK." });
      } catch {
        setDmlTestMsg({
          ok: false,
          text: "Could not reach the map service (network or browser restriction).",
        });
      }
    } finally {
      setTestingDml(false);
    }
  }, [form.dmlUrl]);

  const handleTestMap = useCallback(async () => {
    const dml = form.dmlUrl.trim();
    const path = activeLevel?.defaultPath.trim();
    if (!dml || !path) {
      setMapTestMsg({ ok: false, text: "Map service URL and default map path are required." });
      return;
    }
    setTestingMap(true);
    setMapTestMsg(null);
    const result = await fetchGeoJSON(dml, path);
    setMapTestMsg(
      result.ok
        ? { ok: true, text: "Map loaded successfully." }
        : { ok: false, text: result.error },
    );
    setTestingMap(false);
  }, [form.dmlUrl, activeLevel?.defaultPath]);

  const handleSave = useCallback(async () => {
    if (!dirty) return;

    if (advancedOpen) {
      const jsonCheck = validateDwMapsJson(advancedJson);
      if (!jsonCheck.ok) {
        setError(jsonCheck.errors.join(" "));
        return;
      }
    }

    const validation = validateMapConfigForm(form, {
      mapsEnabled: mapsEnabled,
    });
    if (!validation.ok) {
      setError(validation.errors.join(" "));
      return;
    }

    const dwId = dataWarehouseId?.trim();
    if (!dwId || dwId === "0") {
      setError(
        t(
          "MAP_CONFIG_DW_REQUIRED",
          "Set a default DW ID (DWS_DEFAULT) before saving map paths.",
        ),
      );
      return;
    }

    setSaving(true);
    setError(null);
    setSuccessMsg(null);

    try {
      const patches: Array<ReturnType<typeof patchAppConfig>> = [];

      if (form.dmlUrl !== initial.dmlUrl) {
        patches.push(
          patchAppConfig({
            DFA_DML_URL: { value: form.dmlUrl.trim() },
          }),
        );
      }

      const dwMapsJson = formStateToDwMapsJson(form);
      const initialDwMapsJson = formStateToDwMapsJson(initial);
      if (dwMapsJson !== initialDwMapsJson) {
        patches.push(
          patchAppConfig(
            { DW_MAPS: { value: dwMapsJson } },
            { dwId },
          ),
        );
      }

      const results = await Promise.all(patches);
      const failed = results.find((r) => isApiError(r));
      if (failed && isApiError(failed)) {
        setError(failed.message || "Failed to save map configuration");
        return;
      }

      setSuccessMsg(
        t("MAP_CONFIG_SAVED", "Map configuration saved successfully."),
      );
      await refreshConfig();
      setInitial(form);
    } catch {
      setError("Failed to save map configuration");
    } finally {
      setSaving(false);
    }
  }, [
    dirty,
    advancedOpen,
    advancedJson,
    form,
    initial,
    mapsEnabled,
    dataWarehouseId,
    refreshConfig,
    t,
  ]);

  if (!open) return null;

  const panelUi = (
    <>
      <div
        className="fixed inset-0 top-[var(--height-header)] z-[200] bg-black/40"
        onClick={onClose}
        aria-hidden
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-label={t("MAP_CONFIGURATION", "Map configuration")}
        className="fixed top-[var(--height-header)] bottom-0 right-0 rtl:right-auto rtl:left-0 z-[210] flex w-[min(90vw,40rem)] min-h-0 flex-col border-l rtl:border-l-0 rtl:border-r border-border bg-surface shadow-xl"
      >
        <div className="px-4 py-3 bg-surface-muted border-b border-border shrink-0">
          <div className="flex items-center justify-between">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-text">
              <Map className="w-4 h-4 text-primary" aria-hidden />
              {t("MAP_CONFIGURATION", "Map configuration")}
            </h3>
            <button
              type="button"
              onClick={onClose}
              className="p-1 text-text-muted hover:text-text hover:bg-surface rounded transition-colors"
              aria-label={t("CLOSE", "Close")}
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-5">
          {loading ? (
            <div className="flex flex-1 items-center justify-center h-full min-h-[200px]">
              <Loader loadingLabel={t("COMMON_LOADING", "Loading...")} size={40} />
            </div>
          ) : (
            <>
              {!mapsEnabled && (
                <p className="text-sm text-text-muted rounded-md border border-border bg-surface-muted px-3 py-2">
                  {t(
                    "MAP_CONFIG_DISABLED_HINT",
                    "Map charts are disabled until you set the map service URL.",
                  )}
                </p>
              )}

              <div className="space-y-1.5">
                <label className="text-sm font-semibold text-text">
                  {t("MAP_CONFIG_DML_URL", "Map service URL")}
                </label>
                <div className="flex gap-2">
                  <input
                    type="url"
                    value={form.dmlUrl}
                    onChange={(e) => updateForm({ dmlUrl: e.target.value })}
                    placeholder="https://dml.example.com"
                    className={INPUT_CLASS}
                  />
                  <button
                    type="button"
                    onClick={() => void handleTestDml()}
                    disabled={testingDml}
                    className="btn-comp-secondary text-xs px-3 py-2 shrink-0 whitespace-nowrap"
                  >
                    {testingDml
                      ? t("COMMON_LOADING", "Loading...")
                      : t("MAP_CONFIG_TEST_CONNECTION", "Test")}
                  </button>
                </div>
                {dmlTestMsg && (
                  <p
                    className={`text-xs ${dmlTestMsg.ok ? "text-green-600" : "text-red-600"}`}
                  >
                    {dmlTestMsg.text}
                  </p>
                )}
                <p className="text-xs text-text-muted">
                  {t(
                    "MAP_CONFIG_DML_HELP",
                    "Web address where map files are hosted. A trailing slash is optional.",
                  )}
                </p>
              </div>

              <div className="text-xs text-text-muted">
                {t("MAP_CONFIG_DW_ID", "DW ID")}:{" "}
                <span className="font-medium text-text">
                  {dataWarehouseId?.trim() || t("MAP_CONFIG_NONE", "Not configured")}
                </span>
              </div>

              {mapsEnabled && (
                <>
                  <div className="flex flex-wrap items-center gap-1 border-b border-border pb-2">
                    {form.levels.map((level) => (
                      <div key={level.levelKey} className="flex items-center gap-0.5">
                        <button
                          type="button"
                          onClick={() => setActiveLevelKey(level.levelKey)}
                          className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                            activeLevelKey === level.levelKey
                              ? "bg-primary text-on-primary"
                              : "text-text-muted hover:bg-surface-muted"
                          }`}
                        >
                          {level.levelKey}
                        </button>
                        {form.levels.length > 1 && (
                          <button
                            type="button"
                            onClick={() => handleRemoveLevel(level.levelKey)}
                            className="p-1 text-text-muted hover:text-red-600 rounded"
                            aria-label={t("MAP_CONFIG_REMOVE_LEVEL", "Remove area level")}
                          >
                            <X className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={handleAddLevel}
                      className="inline-flex items-center gap-1 px-2 py-1.5 text-xs text-text-muted hover:text-text hover:bg-surface-muted rounded-md"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      {t("MAP_CONFIG_ADD_LEVEL", "Add area level")}
                    </button>
                  </div>

                  {activeLevel && (
                    <LevelEditor
                      level={activeLevel}
                      dmlUrl={form.dmlUrl}
                      onUpdate={(patch) => updateLevel(activeLevel.levelKey, patch)}
                      onTestMap={() => void handleTestMap()}
                      testingMap={testingMap}
                      mapTestMsg={mapTestMsg}
                      t={t}
                    />
                  )}

                  <AdvancedJsonSection
                    open={advancedOpen}
                    onToggle={() => setAdvancedOpen((v) => !v)}
                    json={advancedJson}
                    onJsonChange={handleAdvancedJsonChange}
                    t={t}
                  />
                </>
              )}
            </>
          )}

          {error && <p className="text-sm text-red-600">{error}</p>}
          {successMsg && <p className="text-sm text-green-600">{successMsg}</p>}
        </div>

        <div className="flex items-center justify-end gap-3 px-4 py-3 border-t border-border shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-text-muted hover:text-text hover:bg-surface-muted rounded-md transition-colors"
          >
            {t("CANCEL", "Cancel")}
          </button>
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={!dirty || saving || loading}
            className="px-4 py-2 text-sm font-medium text-white bg-primary hover:bg-primary-hover rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? t("SAVING", "Saving...") : t("SAVE", "Save")}
          </button>
        </div>
      </div>
    </>
  );

  if (typeof document === "undefined") return null;
  return createPortal(panelUi, document.body);
}

function LevelEditor({
  level,
  dmlUrl,
  onUpdate,
  onTestMap,
  testingMap,
  mapTestMsg,
  t,
}: {
  level: LevelFormEntry;
  dmlUrl: string;
  onUpdate: (patch: Partial<LevelFormEntry>) => void;
  onTestMap: () => void;
  testingMap: boolean;
  mapTestMsg: { ok: boolean; text: string } | null;
  t: (code: string, fallback?: string) => string;
}) {
  const addScope = () => {
    const row: ScopedOverrideRow = { id: newRowId(), scopeId: "", path: "" };
    onUpdate({ scopes: [...level.scopes, row] });
  };

  const updateScope = (id: string, patch: Partial<ScopedOverrideRow>) => {
    onUpdate({
      scopes: level.scopes.map((s) => (s.id === id ? { ...s, ...patch } : s)),
    });
  };

  const removeScope = (id: string) => {
    onUpdate({ scopes: level.scopes.filter((s) => s.id !== id) });
  };

  return (
    <div className="space-y-4 rounded-md border border-border p-3 bg-surface-muted/30">
      <div className="space-y-1.5">
        <label className="text-sm font-semibold text-text">
          {t("MAP_CONFIG_DEFAULT_MAP", "Default map")} ({level.levelKey})
        </label>
        <div className="flex gap-2">
          <input
            type="text"
            value={level.defaultPath}
            onChange={(e) => onUpdate({ defaultPath: e.target.value })}
            placeholder="/getmap//1SPDML%20Standard%20Maps/..."
            className={MONO_INPUT_CLASS}
          />
          <button
            type="button"
            onClick={onTestMap}
            disabled={testingMap || !dmlUrl.trim() || !level.defaultPath.trim()}
            className="btn-comp-secondary text-xs px-3 py-2 shrink-0 whitespace-nowrap"
          >
            {testingMap
              ? t("COMMON_LOADING", "Loading...")
              : t("MAP_CONFIG_TEST_MAP", "Test map")}
          </button>
        </div>
        {mapTestMsg && (
          <p className={`text-xs ${mapTestMsg.ok ? "text-green-600" : "text-red-600"}`}>
            {mapTestMsg.text}
          </p>
        )}
        <p className="text-xs text-text-muted">
          {t(
            "MAP_CONFIG_DEFAULT_HELP",
            "Map file path used at this level when no region-specific map applies.",
          )}
        </p>
      </div>

      <div className="space-y-2">
        <p className="text-sm font-semibold text-text">
          {t("MAP_CONFIG_REGION_MAPS", "Region-specific maps")}
        </p>
        <p className="text-xs text-text-muted">
          {t(
            "MAP_CONFIG_REGION_MAPS_HELP",
            "Optional maps for when viewers select areas under one parent region — for example, districts in Andhra Pradesh (IND028).",
          )}
        </p>

        {level.scopes.length > 0 && (
          <div className="space-y-2">
            <div className="grid grid-cols-[minmax(5rem,7rem)_1fr_auto] gap-2 text-xs font-medium text-text-muted">
              <span>{t("MAP_CONFIG_PARENT_REGION_ID", "Parent region ID")}</span>
              <span>{t("MAP_CONFIG_MAP_FILE_PATH", "Map file path")}</span>
              <span className="sr-only">{t("COMMON_ACTIONS", "Actions")}</span>
            </div>
            {level.scopes.map((scope) => (
              <div
                key={scope.id}
                className="grid grid-cols-[minmax(5rem,7rem)_1fr_auto] gap-2 items-start"
              >
                <input
                  type="text"
                  value={scope.scopeId}
                  onChange={(e) => updateScope(scope.id, { scopeId: e.target.value })}
                  placeholder="IND028"
                  className={INPUT_CLASS}
                  aria-label={t("MAP_CONFIG_PARENT_REGION_ID", "Parent region ID")}
                />
                <input
                  type="text"
                  value={scope.path}
                  onChange={(e) => updateScope(scope.id, { path: e.target.value })}
                  placeholder="/getmap/..."
                  className={MONO_INPUT_CLASS}
                  aria-label={t("MAP_CONFIG_MAP_FILE_PATH", "Map file path")}
                />
                <button
                  type="button"
                  onClick={() => removeScope(scope.id)}
                  className="p-2 text-text-muted hover:text-red-600 rounded-md hover:bg-surface-muted"
                  aria-label={t("MAP_CONFIG_REMOVE_REGION_MAP", "Remove region map")}
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )}

        <button
          type="button"
          onClick={addScope}
          className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
        >
          <Plus className="w-3.5 h-3.5" />
          {t("MAP_CONFIG_ADD_REGION_MAP", "Add region-specific map")}
        </button>
      </div>
    </div>
  );
}

function AdvancedJsonSection({
  open,
  onToggle,
  json,
  onJsonChange,
  t,
}: {
  open: boolean;
  onToggle: () => void;
  json: string;
  onJsonChange: (v: string) => void;
  t: (code: string, fallback?: string) => string;
}) {
  return (
    <div className="border border-border rounded-md overflow-hidden">
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center gap-2 px-3 py-2 text-sm font-medium text-text bg-surface-muted hover:bg-surface-muted/80"
      >
        {open ? (
          <ChevronDown className="w-4 h-4 shrink-0" />
        ) : (
          <ChevronRight className="w-4 h-4 shrink-0" />
        )}
        {t("MAP_CONFIG_ADVANCED_JSON", "Advanced: edit map paths (JSON)")}
      </button>
      {open && (
        <div className="p-3 border-t border-border">
          <textarea
            value={json}
            onChange={(e) => onJsonChange(e.target.value)}
            rows={12}
            spellCheck={false}
            className="w-full font-mono text-xs px-3 py-2 border border-border rounded-md bg-surface text-text focus:outline-none focus:ring-1 focus:ring-primary"
            aria-label={t("MAP_CONFIG_MAP_PATHS_JSON", "Map paths (JSON)")}
          />
        </div>
      )}
    </div>
  );
}
