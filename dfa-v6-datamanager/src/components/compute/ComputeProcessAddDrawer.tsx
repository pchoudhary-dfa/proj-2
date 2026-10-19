"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { createComputeProcess } from "@/lib/api/computeProcess";
import type { DwSourceListItem } from "@/lib/api/sources";
import {
  ensureDwSourcePublisherTitle,
  sourceHasPublisherTitlePair,
} from "@/lib/api/sources";
import {
  fetchAreasForLevelCatalog,
  type AreaLevelCatalogRow,
} from "@/lib/datamanager/computeProcessFilterCatalog";
import Drawer from "@/components/Drawer";
import { MultiSelectDropdown } from "@/components/MultiSelectDropdown";
import {
  SearchableListCombobox,
  type SearchableListComboboxOption,
} from "@/components/SearchableListCombobox";
import { SecondaryButton } from "@/components/SecondaryButton";
import { SelectField } from "@/components/SelectField";
import { textFieldClassName } from "@/components/TextField";
export type ComputeProcessAddDraft = {
  iusGids: string[];
  srcPublisher: string;
  srcTitle: string;
  /** `"all"` or area-level `al_nid` as string */
  areaLevelKey: string;
  /** Area `ar_id` values when a specific level is chosen */
  selectedAreaIds: string[];
};

/** Sentinel in `selectedAreaIds` — saved as `areas: ["all"]` on the process filter. */
export const AREAS_UNDER_ALL_VALUE = "all";

export const DEFAULT_COMPUTE_ADD_DRAFT: ComputeProcessAddDraft = {
  iusGids: [],
  srcPublisher: "",
  srcTitle: "",
  areaLevelKey: "all",
  selectedAreaIds: [],
};

function AddSourceAcField({
  value,
  onChange,
  options,
  gridSuggestions,
  placeholder,
  ariaLabel,
  disabled,
  disabledExtra,
  createLabelTemplate,
  onCommitAfterSelect,
}: {
  value: string;
  onChange: (v: string) => void;
  options: SearchableListComboboxOption[];
  gridSuggestions: string[];
  placeholder: string;
  ariaLabel: string;
  disabled: boolean;
  disabledExtra?: boolean;
  createLabelTemplate: string;
  onCommitAfterSelect?: (committedValue: string) => void | Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [highlightIndex, setHighlightIndex] = useState(-1);

  const filteredOptions = useMemo(() => {
    const q = value.trim().toLowerCase();
    if (!q) return options;
    return options.filter(
      (o) =>
        o.label.toLowerCase().includes(q) || o.id.toLowerCase().includes(q)
    );
  }, [options, value]);

  const trimmed = value.trim();
  const hasExactMatch = useMemo(() => {
    if (!trimmed) return false;
    const lower = trimmed.toLowerCase();
    return options.some(
      (o) =>
        o.label.trim().toLowerCase() === lower ||
        o.id.trim().toLowerCase() === lower
    );
  }, [options, trimmed]);

  const showCreate = trimmed.length > 0 && !hasExactMatch;
  const createHighlightIndex = filteredOptions.length;
  const navigableCount = filteredOptions.length + (showCreate ? 1 : 0);

  const createSlot =
    showCreate && createLabelTemplate.trim()
      ? {
          show: true as const,
          loading: false,
          label: createLabelTemplate.replace(/\{name\}/g, trimmed),
          highlightIndex: createHighlightIndex,
          onCreate: () => {
            onChange(trimmed);
            setOpen(false);
            setHighlightIndex(-1);
            if (onCommitAfterSelect) void onCommitAfterSelect(trimmed);
          },
        }
      : undefined;

  return (
    <SearchableListCombobox
      className="relative w-full min-w-0"
      inputClassName="field-comp--sm"
      placeholder={placeholder}
      disabled={disabled || Boolean(disabledExtra)}
      ariaLabel={ariaLabel}
      gridSuggestions={gridSuggestions}
      inputValue={value}
      onInputChange={(v) => {
        onChange(v);
        setOpen(true);
        setHighlightIndex(-1);
      }}
      open={open}
      onOpenChange={setOpen}
      highlightIndex={highlightIndex}
      onHighlightChange={setHighlightIndex}
      navigableCount={navigableCount}
      selectedId={null}
      onSelect={(id) => {
        onChange(id);
        setOpen(false);
        setHighlightIndex(-1);
        if (onCommitAfterSelect) void onCommitAfterSelect(id);
      }}
      options={filteredOptions}
      emptyMessage="—"
      createSlot={createSlot}
      menuPortal
    />
  );
}

export type ComputeProcessAddDrawerProps = {
  open: boolean;
  onClose: () => void;
  processType: string;
  /** Localized label for the active execution type tab. */
  processTypeLabel: string;
  dwId: string;
  locale: string;
  t: (code: string, fallback?: string) => string;
  areaLevels: AreaLevelCatalogRow[];
  draft: ComputeProcessAddDraft;
  setDraft: (
    next:
      | ComputeProcessAddDraft
      | ((prev: ComputeProcessAddDraft) => ComputeProcessAddDraft)
  ) => void;
  onOpenIusPicker: () => void;
  onCreated: () => void;
  disabled?: boolean;
  publisherTextOptions: SearchableListComboboxOption[];
  publisherGridSuggestions: string[];
  titleTextOptions: SearchableListComboboxOption[];
  titleGridSuggestions: string[];
  sourceRows: DwSourceListItem[];
  sourcesLoading?: boolean;
  onRefreshSources?: () => void | Promise<void>;
};

export function ComputeProcessAddDrawer({
  open,
  onClose,
  processType,
  processTypeLabel,
  dwId,
  locale,
  t,
  areaLevels,
  draft,
  setDraft,
  onOpenIusPicker,
  onCreated,
  disabled = false,
  publisherTextOptions,
  publisherGridSuggestions,
  titleTextOptions,
  titleGridSuggestions,
  sourceRows,
  sourcesLoading = false,
  onRefreshSources,
}: ComputeProcessAddDrawerProps) {
  const [saving, setSaving] = useState(false);
  const [areasAtLevel, setAreasAtLevel] = useState<Array<{ id: string; name: string }>>(
    []
  );
  const [areasLoading, setAreasLoading] = useState(false);
  const [areasOpen, setAreasOpen] = useState(false);
  const [areaSearchQuery, setAreaSearchQuery] = useState("");
  const prevPublisherRef = useRef<string | null>(null);

  const resetDraft = useCallback(() => {
    setDraft({ ...DEFAULT_COMPUTE_ADD_DRAFT });
  }, [setDraft]);

  const handleClose = useCallback(() => {
    if (saving) return;
    resetDraft();
    onClose();
  }, [saving, resetDraft, onClose]);

  useEffect(() => {
    if (!open || !dwId.trim() || draft.areaLevelKey === "all") {
      setAreasAtLevel([]);
      setAreasLoading(false);
      setAreaSearchQuery("");
      setAreasOpen(false);
      return;
    }
    const nid = Number(draft.areaLevelKey);
    if (!Number.isFinite(nid)) return;
    let cancelled = false;
    setAreasOpen(false);
    setAreaSearchQuery("");
    setAreasLoading(true);
    void fetchAreasForLevelCatalog(dwId, nid).then((list) => {
      if (cancelled) return;
      setAreasAtLevel(list);
      setAreasLoading(false);
      setDraft((prev) => ({
        ...prev,
        selectedAreaIds: [AREAS_UNDER_ALL_VALUE],
      }));
    });
    return () => {
      cancelled = true;
    };
  }, [open, dwId, draft.areaLevelKey, setDraft]);

  useEffect(() => {
    const cur = draft.srcPublisher;
    if (prevPublisherRef.current === null) {
      prevPublisherRef.current = cur;
      return;
    }
    if (prevPublisherRef.current !== cur) {
      prevPublisherRef.current = cur;
      setDraft((prev) => ({ ...prev, srcTitle: "" }));
    }
  }, [draft.srcPublisher, setDraft]);

  const levelSelectOptions = useMemo(
    () => [
      {
        value: "all",
        label: t("ALL", "All"),
      },
      ...areaLevels.map((l) => ({
        value: String(l.al_nid),
        label: l.al_name,
      })),
    ],
    [areaLevels, t]
  );

  const areaMultiOptions = useMemo(
    () => areasAtLevel.map((a) => ({ value: a.id, label: a.name })),
    [areasAtLevel]
  );

  const onTitleCommittedFromPicker = useCallback(
    async (titleValue: string) => {
      const tit = titleValue.trim();
      const pub = draft.srcPublisher.trim();
      if (!pub || !tit) return;
      if (sourceHasPublisherTitlePair(sourceRows, pub, tit)) return;
      const ensured = await ensureDwSourcePublisherTitle(dwId, pub, tit, locale);
      if (!ensured.ok) {
        toast.error(
          `${t(
            "COMPUTE_SOURCE_CREATE_FAILED",
            "Could not register source."
          )} ${ensured.message}`
        );
        return;
      }
      await onRefreshSources?.();
    },
    [draft.srcPublisher, sourceRows, dwId, locale, t, onRefreshSources]
  );

  const onSave = useCallback(async () => {
    if (!dwId.trim() || disabled || saving) return;
    const pub = draft.srcPublisher.trim();
    const tit = draft.srcTitle.trim();
    if (!pub || !tit) {
      toast.error(t("FILL_REQUIRED_FIELDS"));
      return;
    }
    if (draft.iusGids.length === 0) {
      toast.error(t("FILL_REQUIRED_FIELDS"));
      return;
    }
    let areasPayload: string[];
    if (processType === "AREA") {
      areasPayload = ["all"];
    } else if (draft.areaLevelKey === "all") {
      areasPayload = ["all"];
    } else if (draft.selectedAreaIds.includes(AREAS_UNDER_ALL_VALUE)) {
      areasPayload = [AREAS_UNDER_ALL_VALUE];
    } else {
      if (areasLoading || draft.selectedAreaIds.length === 0) {
        toast.error(t("FILL_REQUIRED_FIELDS"));
        return;
      }
      areasPayload = draft.selectedAreaIds;
    }

    const areaLevelNid =
      processType !== "AREA" && draft.areaLevelKey !== "all"
        ? Number(draft.areaLevelKey)
        : null;

    setSaving(true);
    const res = await createComputeProcess(
      dwId,
      {
        process_type: processType,
        filter_object: {
          areas: areasPayload,
          ius_selection: { target_ius: draft.iusGids },
          src_publisher: pub,
          src_title: tit,
          ...(areaLevelNid != null && Number.isFinite(areaLevelNid)
            ? { area_level_nid: areaLevelNid }
            : {}),
        },
      },
      locale
    );
    setSaving(false);
    if (!res.ok) {
      toast.error(`${t("PROCESS_CREATE_FAILED")} ${res.message}`);
      return;
    }
    toast.success(t("PROCESS_CREATED"));
    resetDraft();
    onClose();
    onCreated();
  }, [
    dwId,
    disabled,
    saving,
    draft,
    processType,
    locale,
    t,
    onCreated,
    resetDraft,
    onClose,
    areasLoading,
  ]);

  const iusSummary =
    draft.iusGids.length === 0
      ? ""
      : draft.iusGids.length <= 2
        ? draft.iusGids.join(", ")
        : t("INDICATORS_SELECTED_COUNT").replace(
            "{count}",
            String(draft.iusGids.length)
          );

  const areasOk =
    processType === "AREA" ||
    draft.areaLevelKey === "all" ||
    (!areasLoading &&
      (draft.selectedAreaIds.includes(AREAS_UNDER_ALL_VALUE) ||
        draft.selectedAreaIds.length > 0));

  const saveOk =
    draft.srcPublisher.trim().length > 0 &&
    draft.srcTitle.trim().length > 0 &&
    draft.iusGids.length > 0 &&
    areasOk;

  const isAreaProcess = processType === "AREA";

  return (
    <Drawer
      open={open}
      onClose={handleClose}
      width="min(420px, 92vw)"
      closeOnOverlayClick={!saving}
      title={
        <span className="min-w-0 truncate">
          {t("ADD_COMPUTE_PROCESS")}{" "}
          <span className="font-normal text-text-muted">({processTypeLabel})</span>
        </span>
      }
      footer={
        <div className="flex flex-wrap items-center justify-end gap-2">
          <SecondaryButton
            type="button"
            variant="modal"
            disabled={saving}
            onClick={handleClose}
          >
            {t("CANCEL", "Cancel")}
          </SecondaryButton>
          <button
            type="button"
            className="btn-comp-primary shrink-0 gap-1.5 text-xs font-medium"
            disabled={!saveOk || disabled || saving}
            onClick={() => void onSave()}
          >
            {saving ? t("CREATING", "Creating…") : t("SAVE_PROCESS", "Save")}
          </button>
        </div>
      }
    >
      <div className="sp-grid" data-dm-compute-add-body>
        {isAreaProcess ? (
          <p className="col-span-full rounded border border-border bg-surface-muted/60 px-3 py-2 text-xs leading-snug text-text-muted">
            {t(
              "COMPUTE_PROCESS_AREA_FILTER_IGNORED",
              "For Area processes, area filters here are not used — jobs run for every area at each formula’s target level."
            )}
          </p>
        ) : (
          <>
            <div className="sp-field sp-full">
              <label className="form-label">{t("SELECT_AREA_LEVEL")}</label>
              <SelectField
                className="w-full min-w-0"
                value={draft.areaLevelKey}
                options={levelSelectOptions}
                onChange={(e) => {
                  const v = e.target.value;
                  setAreasOpen(false);
                  setAreaSearchQuery("");
                  setDraft((prev) => ({
                    ...prev,
                    areaLevelKey: v,
                    selectedAreaIds: [],
                  }));
                }}
                disabled={disabled || saving}
                menuPortal
              />
            </div>
            <div className="sp-field sp-full">
              <label className="form-label">{t("AREAS_UNDER")}</label>
              <MultiSelectDropdown
                className="w-full min-w-0"
                open={areasOpen}
                onOpenChange={setAreasOpen}
                options={areaMultiOptions}
                selectedValues={draft.selectedAreaIds}
                exclusiveTopOption={{
                  value: AREAS_UNDER_ALL_VALUE,
                  label: t("ALL", "All"),
                }}
                onToggleValue={(id) => {
                  setDraft((prev) => {
                    if (id === AREAS_UNDER_ALL_VALUE) {
                      const isAll = prev.selectedAreaIds.includes(
                        AREAS_UNDER_ALL_VALUE
                      );
                      return {
                        ...prev,
                        selectedAreaIds: isAll ? [] : [AREAS_UNDER_ALL_VALUE],
                      };
                    }
                    const withoutAll = prev.selectedAreaIds.filter(
                      (x) => x !== AREAS_UNDER_ALL_VALUE
                    );
                    if (withoutAll.includes(id)) {
                      return {
                        ...prev,
                        selectedAreaIds: withoutAll.filter((x) => x !== id),
                      };
                    }
                    return {
                      ...prev,
                      selectedAreaIds: [...withoutAll, id],
                    };
                  });
                }}
                searchQuery={areaSearchQuery}
                onSearchChange={setAreaSearchQuery}
                emptyLabel={t("SELECT_AREAS", "Select areas…")}
                searchPlaceholder={t("SEARCH", "Search")}
                menuPortal
                disabled={
                  disabled ||
                  saving ||
                  draft.areaLevelKey === "all" ||
                  areasLoading
                }
                renderTriggerSummary={
                  draft.areaLevelKey === "all"
                    ? () => (
                        <span className="text-text-muted">
                          {t("ALL", "All")}
                        </span>
                      )
                    : areasLoading
                      ? () => (
                          <span className="text-text-muted">
                            {t("LOADING_AREAS")}
                          </span>
                        )
                      : areaMultiOptions.length === 0
                        ? () => (
                            <span className="text-text-muted">
                              {t(
                                "COMPUTE_PROCESS_AREAS_NONE",
                                "No areas at this level."
                              )}
                            </span>
                          )
                        : undefined
                }
              />
            </div>
          </>
        )}
        <div className="sp-field sp-full">
          <label className="form-label">{t("SELECT_TARGET_INDICATORS")}</label>
          <input
            type="text"
            readOnly
            value={iusSummary}
            placeholder={t("SELECT_IUS")}
            disabled={disabled || saving}
            onClick={() => {
              if (!disabled && !saving) onOpenIusPicker();
            }}
            onKeyDown={(e) => {
              if (disabled || saving) return;
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onOpenIusPicker();
              }
            }}
            className={`${textFieldClassName()} cursor-pointer bg-surface-muted text-xs`}
            aria-readonly
            aria-label={t("SELECT_TARGET_INDICATORS")}
          />
        </div>
        <div className="sp-field sp-full">
          <label className="form-label">{t("SOURCE_PUBLISHER")}</label>
          <AddSourceAcField
            value={draft.srcPublisher}
            onChange={(v) => setDraft((prev) => ({ ...prev, srcPublisher: v }))}
            disabledExtra={sourcesLoading && sourceRows.length === 0}
            options={publisherTextOptions}
            gridSuggestions={publisherGridSuggestions}
            placeholder={t(
              "SEARCH_OR_TYPE_PUBLISHER",
              "Search or type publisher…"
            )}
            ariaLabel={t("SOURCE_PUBLISHER")}
            disabled={disabled || saving}
            createLabelTemplate={t(
              "COMPUTE_PROCESS_CREATE_SOURCE_PUBLISHER",
              'Create publisher "{name}"'
            )}
          />
        </div>
        <div className="sp-field sp-full">
          <label className="form-label">{t("SOURCE_TITLE")}</label>
          <AddSourceAcField
            value={draft.srcTitle}
            onChange={(v) => setDraft((prev) => ({ ...prev, srcTitle: v }))}
            options={titleTextOptions}
            gridSuggestions={titleGridSuggestions}
            placeholder={t("SEARCH_OR_TYPE_TITLE", "Search or type title…")}
            ariaLabel={t("SOURCE_TITLE")}
            disabled={disabled || saving}
            createLabelTemplate={t(
              "COMPUTE_PROCESS_CREATE_SOURCE_TITLE",
              'Create title "{name}"'
            )}
            onCommitAfterSelect={onTitleCommittedFromPicker}
          />
        </div>
      </div>
    </Drawer>
  );
}
