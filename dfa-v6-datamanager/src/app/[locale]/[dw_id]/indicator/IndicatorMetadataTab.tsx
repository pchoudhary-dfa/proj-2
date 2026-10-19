"use client";

import {
  forwardRef,
  memo,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { toast } from "sonner";
import { Loader } from "@/components/Loader";
import { SelectField } from "@/components/SelectField";
import { TextField } from "@/components/TextField";
import { useCore } from "@/contexts/CoreContext";
import {
  deleteRequest,
  getRequest,
  patchRequest,
  postRequest,
} from "@/lib/api/http";
import type {
  CreateMetadataCategoriesResult,
  DeleteMetadataCategoryResult,
  FetchMetadataCategoriesResult,
  GetIndicatorByIdOptions,
  GetIndicatorError,
  GetIndicatorResponse,
  GetIndicatorResult,
  IndicatorMetadataUpdateItem,
  MetadataCategoryRow,
  UpdateIndicatorMetadataResult,
  UpdateMetadataCategoryResult,
} from "@/lib/api/types";
import {
  API_KEY_FORMAT,
  getDWAPIURL,
  REFERENCE_PATH_INDICATORS,
  REFERENCE_PATH_METADATA_CATEGORIES,
} from "@/lib/constants";
import {
  SideNavItem,
  SideNavList,
  SideNavListColumn,
  SideNavTruncatingLabel,
} from "@/components/SideNavListColumn";
import { textFieldClassName } from "@/components/TextField";

const META_CAT_ADD_PROMPT_BTN =
  "flex w-full items-center gap-2 rounded border border-dashed border-[color:color-mix(in_srgb,var(--color-primary)_30%,var(--color-border))] bg-white px-2 py-1.5 text-left text-xs text-primary outline-none transition-colors hover:border-primary focus:outline-none focus-visible:border-primary disabled:cursor-not-allowed disabled:opacity-50";

async function fetchIndicatorMetadataCategories(
  dwId: string
): Promise<FetchMetadataCategoriesResult> {
  const params = new URLSearchParams();
  params.set("mt_catg_type", "I");
  params.set("sort_field", "mt_catg_order");
  params.set("sort_order", "asc");
  const url = `${getDWAPIURL(dwId, REFERENCE_PATH_METADATA_CATEGORIES)}?${params.toString()}`;
  const json = (await getRequest(url, undefined, {
    suppressErrorMessage: true,
  })) as {
    success?: boolean;
    data?: unknown[];
    err_message?: string;
  };
  if (json.success !== true || !Array.isArray(json.data)) {
    return {
      success: false,
      err_message: json.err_message ?? "Request failed",
    };
  }
  const rows: MetadataCategoryRow[] = [];
  for (const raw of json.data) {
    if (!raw || typeof raw !== "object") continue;
    const r = raw as Record<string, unknown>;
    const gidRaw = r.mt_catg_gid ?? r.categorygid;
    const gid = typeof gidRaw === "string" && gidRaw.trim() ? gidRaw.trim() : null;
    if (!gid) continue;
    const nidRaw = r.mt_catg_nid ?? r.categorynid;
    const nid =
      typeof nidRaw === "number"
        ? nidRaw
        : typeof nidRaw === "string"
          ? Number(nidRaw)
          : NaN;
    const nameRaw = r.mt_catg_name ?? r.categoryname;
    const name = typeof nameRaw === "string" ? nameRaw : "";
    const orderRaw = r.mt_catg_order ?? r.categoryorder;
    const order = typeof orderRaw === "number" ? orderRaw : 999999;
    rows.push({ gid, name, order, nid: Number.isFinite(nid) ? nid : 0 });
  }
  rows.sort((a, b) => a.order - b.order);
  return { success: true, data: rows };
}

function indicatorMetadataUpdateWireItems(
  items: IndicatorMetadataUpdateItem[]
): Record<string, string>[] {
  if (API_KEY_FORMAT === "external") {
    return items.map(({ mt_catg_gid, metadata_text }) => ({
      mt_catg_gid,
      mt_rpt_metadata: metadata_text,
    }));
  }
  return items.map(({ mt_catg_gid, metadata_text }) => ({
    mt_catg_gid,
    metadata_text,
  }));
}

async function updateIndicatorMetadata(
  dwId: string,
  indicatorIdentifier: string,
  items: IndicatorMetadataUpdateItem[]
): Promise<UpdateIndicatorMetadataResult> {
  const url = getDWAPIURL(
    dwId,
    `${REFERENCE_PATH_INDICATORS}/${encodeURIComponent(indicatorIdentifier)}/metadata`
  );
  const json = (await patchRequest(
    url,
    { update_items: indicatorMetadataUpdateWireItems(items) },
    undefined,
    undefined,
    { suppressErrorMessage: true }
  )) as {
    success?: boolean;
    data?: Record<string, unknown>;
    meta?: { errors?: unknown[] };
    err_message?: string;
    errors?: Record<string, unknown>;
  };
  if (json.success !== true) {
    return {
      success: false,
      err_message: json.err_message ?? "Request failed",
      errors: json.errors,
    };
  }
  return { success: true, data: json.data, meta: json.meta };
}

function metadataCategoryCreatePayload(
  name: string,
  order?: number
): Record<string, unknown> {
  if (API_KEY_FORMAT === "external") {
    return {
      mt_catg_type: "I",
      mt_catg_name: name,
      ...(order != null ? { mt_catg_order: order } : {}),
    };
  }
  return {
    categorytype: "I",
    categoryname: name,
    ...(order != null ? { categoryorder: order } : {}),
  };
}

function metadataCategoryRenamePayload(newName: string): Record<string, unknown> {
  if (API_KEY_FORMAT === "external") {
    return { mt_catg_name: newName };
  }
  return { categoryname: newName };
}

async function createMetadataCategories(
  dwId: string,
  namesWithOrder: { name: string; order?: number }[]
): Promise<CreateMetadataCategoriesResult> {
  if (namesWithOrder.length === 0) {
    return { success: true, data: [] };
  }
  const url = getDWAPIURL(dwId, REFERENCE_PATH_METADATA_CATEGORIES);
  const body = namesWithOrder.map(({ name, order }) =>
    metadataCategoryCreatePayload(name.trim(), order)
  );
  const json = (await postRequest(
    url,
    body,
    undefined,
    undefined,
    { suppressErrorMessage: true }
  )) as Record<string, unknown>;
  if (json.success !== true) {
    return {
      success: false,
      err_message: (json.err_message as string | undefined) ?? "Request failed",
      errors: json.errors as Record<string, unknown> | undefined,
    };
  }
  return {
    success: true,
    data: json.data,
    meta: json.meta as { errors?: unknown[] } | undefined,
  };
}

async function updateMetadataCategory(
  dwId: string,
  categoryIdentifier: string,
  newName: string
): Promise<UpdateMetadataCategoryResult> {
  const url = getDWAPIURL(
    dwId,
    `${REFERENCE_PATH_METADATA_CATEGORIES}/${encodeURIComponent(categoryIdentifier)}`
  );
  const json = (await patchRequest(
    url,
    metadataCategoryRenamePayload(newName.trim()),
    undefined,
    undefined,
    { suppressErrorMessage: true }
  )) as {
    success?: boolean;
    data?: Record<string, unknown>;
    err_message?: string;
    errors?: Record<string, unknown>;
  };
  if (json.success !== true) {
    return {
      success: false,
      err_message: json.err_message ?? "Request failed",
      errors: json.errors,
    };
  }
  return { success: true, data: json.data };
}

async function deleteMetadataCategory(
  dwId: string,
  categoryIdentifier: string
): Promise<DeleteMetadataCategoryResult> {
  const url = getDWAPIURL(
    dwId,
    `${REFERENCE_PATH_METADATA_CATEGORIES}/${encodeURIComponent(categoryIdentifier)}`
  );
  const json = (await deleteRequest(url, undefined, undefined, {
    suppressErrorMessage: true,
    suppress409Toast: true,
  })) as Record<string, unknown>;
  if (json.__httpStatus === 409) {
    return {
      success: false,
      err_message: (json.err_message as string | undefined) ?? "Request failed",
      status: 409,
      errors: json.errors as Record<string, unknown> | undefined,
    };
  }
  if (json.success === false) {
    return {
      success: false,
      err_message: json.err_message as string | undefined,
      status: json.status as number | undefined,
      errors: json.errors as Record<string, unknown> | undefined,
    };
  }
  return { success: true };
}

async function getIndicatorById(
  dwId: string,
  identifier: string,
  options?: GetIndicatorByIdOptions
): Promise<GetIndicatorResult> {
  const metadata =
    typeof options === "object" && options != null && options.metadata === true;
  const params = new URLSearchParams();
  if (metadata) params.set("metadata", "true");
  const q = params.toString();
  const url = `${getDWAPIURL(dwId, `${REFERENCE_PATH_INDICATORS}/${encodeURIComponent(identifier)}`)}${q ? `?${q}` : ""}`;
  const json = (await getRequest(url, undefined, {
    suppressErrorMessage: true,
  })) as GetIndicatorResponse | GetIndicatorError;
  if ((json as GetIndicatorResponse).success === true) {
    return json as GetIndicatorResponse;
  }
  if ((json as GetIndicatorError).success === false) {
    return json as GetIndicatorError;
  }
  const err = json as GetIndicatorError;
  return {
    success: false,
    err_message: err.err_message ?? "Request failed",
    errors: err.errors,
  };
}

function metaRecordText(rec: Record<string, unknown>): string {
  const v =
    rec.metadata ??
    rec.metadata_text ??
    rec.mt_rpt_metadata;
  if (typeof v === "string") return v;
  return "";
}

/** Normalize empty contenteditable markup; keep full HTML when non-empty. */
function readContentEditableHtml(el: HTMLDivElement | null): string {
  if (!el) return "";
  const html = el.innerHTML;
  return html.trim() === "<br>" ? "" : html;
}

/**
 * Isolated contenteditable: `initialHtml` is only from server / category switch (not live typing).
 * Avoids parent re-renders resetting the DOM and matches the v5 “bind on flush, not every key” idea.
 */
const MetadataRichEditor = memo(
  forwardRef<
    HTMLDivElement,
    {
      categoryGid: string;
      initialHtml: string;
      onBlurEditor?: () => void;
      readOnly?: boolean;
    }
  >(function MetadataRichEditor(
    { categoryGid, initialHtml, onBlurEditor, readOnly = false },
    ref
  ) {
    useLayoutEffect(() => {
      const el = typeof ref === "function" ? null : ref?.current;
      if (!el) return;
      el.innerHTML = initialHtml;
    }, [categoryGid, initialHtml, ref]);

    return (
      <div
        ref={ref}
        className="wysiwyg-editor"
        contentEditable={!readOnly}
        suppressContentEditableWarning
        onBlur={onBlurEditor}
      />
    );
  })
);
MetadataRichEditor.displayName = "MetadataRichEditor";

export type IndicatorMetadataTabHandle = {
  getUpdateItems: () => { mt_catg_gid: string; metadata_text: string }[] | null;
};

type Props = {
  dwId: string;
  indicatorIdentifier: string;
  /** Disables all editing controls (e.g. user lacks update permission). */
  readOnly?: boolean;
};

const META_PANEL_MIN = 160;
const META_PANEL_MAX = 420;
const META_PANEL_DEFAULT = 220;

const METADATA_IMAGE_MAX_BYTES = 2.5 * 1024 * 1024;
const METADATA_TABLE_MAX_DIM = 20;

function buildEmptyTableHtml(rows: number, cols: number): string {
  const safeR = Math.min(Math.max(rows, 1), METADATA_TABLE_MAX_DIM);
  const safeC = Math.min(Math.max(cols, 1), METADATA_TABLE_MAX_DIM);
  const cells = () =>
    Array.from({ length: safeC }, () => "<td>&nbsp;</td>").join("");
  const body = Array.from({ length: safeR }, () => `<tr>${cells()}</tr>`).join("");
  return `<table class="meta-wysiwyg-table"><tbody>${body}</tbody></table>`;
}

export const IndicatorMetadataTab = forwardRef<IndicatorMetadataTabHandle, Props>(
  function IndicatorMetadataTab({ dwId, indicatorIdentifier, readOnly = false }, ref) {
    const { t } = useCore();
    const [categories, setCategories] = useState<MetadataCategoryRow[]>([]);
    const categoriesRef = useRef(categories);
    categoriesRef.current = categories;

    const [textByGid, setTextByGid] = useState<Record<string, string>>({});
    const [selectedGid, setSelectedGid] = useState<string | null>(null);
    const [loadState, setLoadState] = useState<"idle" | "loading" | "error">("idle");
    const [loadError, setLoadError] = useState<string | null>(null);
    const [editingGid, setEditingGid] = useState<string | null>(null);
    const [editingDraftName, setEditingDraftName] = useState("");
    const [newCategoryName, setNewCategoryName] = useState("");
    const [addCategoryRowExpanded, setAddCategoryRowExpanded] = useState(false);
    const [catsPanelWidth, setCatsPanelWidth] = useState(META_PANEL_DEFAULT);
    const [creatingCategory, setCreatingCategory] = useState(false);
    const newCategoryInputRef = useRef<HTMLInputElement>(null);
    const [wysiwygFontSize, setWysiwygFontSize] = useState("3");

    const editorRef = useRef<HTMLDivElement>(null);
    const imageFileInputRef = useRef<HTMLInputElement>(null);
    const commitRenameLockRef = useRef(false);
    const dataReadyRef = useRef(false);
    const resizeRef = useRef<{ startX: number; startW: number } | null>(null);

    const mergeIndicatorMetaIntoTexts = useCallback(
      (
        cats: MetadataCategoryRow[],
        metaRoot: unknown
      ): Record<string, string> => {
        const byGid: Record<string, string> = {};
        if (metaRoot && typeof metaRoot === "object") {
          for (const [k, v] of Object.entries(metaRoot as Record<string, unknown>)) {
            if (!v || typeof v !== "object") continue;
            const text = metaRecordText(v as Record<string, unknown>);
            const rec = v as Record<string, unknown>;
            const g =
              (typeof rec.categorygid === "string" && rec.categorygid) ||
              (typeof rec.mt_catg_gid === "string" && rec.mt_catg_gid) ||
              k;
            if (g) byGid[g] = text;
          }
        }
        const next: Record<string, string> = {};
        for (const c of cats) {
          next[c.gid] = byGid[c.gid] ?? "";
        }
        return next;
      },
      []
    );

    const loadAll = useCallback(async () => {
      dataReadyRef.current = false;
      setLoadState("loading");
      setLoadError(null);

      const [catsRes, indRes] = await Promise.all([
        fetchIndicatorMetadataCategories(dwId),
        getIndicatorById(dwId, indicatorIdentifier, { metadata: true }),
      ]);

      if (!catsRes.success) {
        setLoadState("error");
        setLoadError(catsRes.err_message ?? "Failed to load metadata categories");
        setCategories([]);
        setTextByGid({});
        setSelectedGid(null);
        return;
      }

      if (!indRes.success) {
        setLoadState("error");
        setLoadError(indRes.err_message ?? "Failed to load indicator metadata");
        setCategories([]);
        setTextByGid({});
        setSelectedGid(null);
        return;
      }

      const texts = mergeIndicatorMetaIntoTexts(catsRes.data, indRes.meta?.metadata);
      setCategories(catsRes.data);
      setTextByGid(texts);
      setSelectedGid((prev) => {
        if (prev && catsRes.data.some((c) => c.gid === prev)) return prev;
        return catsRes.data[0]?.gid ?? null;
      });
      setLoadState("idle");
      dataReadyRef.current = true;
    }, [dwId, indicatorIdentifier, mergeIndicatorMetaIntoTexts]);

    useEffect(() => {
      let cancelled = false;
      (async () => {
        await loadAll();
        if (cancelled) return;
      })();
      return () => {
        cancelled = true;
      };
    }, [loadAll]);

    const flushEditorToTextMap = useCallback(() => {
      const el = editorRef.current;
      const gid = selectedGid;
      if (!gid || !el) return;
      const html = readContentEditableHtml(el);
      setTextByGid((m) => (m[gid] === html ? m : { ...m, [gid]: html }));
    }, [selectedGid]);

    const selectCategory = (gid: string) => {
      if (gid === selectedGid) return;
      flushEditorToTextMap();
      setSelectedGid(gid);
    };

    const startEditCategory = (c: MetadataCategoryRow) => {
      setEditingGid(c.gid);
      setEditingDraftName(c.name);
      queueMicrotask(() => {
        const input = document.querySelector<HTMLInputElement>(
          `.meta-cat-item.editing input`
        );
        input?.focus();
        input?.select();
      });
    };

    const commitRenameFromBlur = useCallback(
      async (gid: string, raw: string) => {
        if (commitRenameLockRef.current) return;
        commitRenameLockRef.current = true;
        try {
          setEditingGid((cur) => (cur === gid ? null : cur));
          const trimmed = raw.trim();
          const cat = categoriesRef.current.find((x) => x.gid === gid);
          if (!cat || !trimmed || trimmed === cat.name) return;

          const res = await updateMetadataCategory(dwId, gid, trimmed);
          if (!res.success) {
            toast.error(res.err_message ?? "Failed to rename category");
            return;
          }
          setCategories((prev) => prev.map((x) => (x.gid === gid ? { ...x, name: trimmed } : x)));
        } finally {
          commitRenameLockRef.current = false;
        }
      },
      [dwId]
    );

    const handleDeleteCategory = async (c: MetadataCategoryRow) => {
      if (
        !window.confirm(
          `Delete metadata category "${c.name || c.gid}"? This fails if any metadata reports still reference it.`
        )
      ) {
        return;
      }
      const res = await deleteMetadataCategory(dwId, c.gid);
      if (!res.success) {
        if (res.status === 409) {
          toast.error(
            res.err_message ??
              "This category cannot be deleted while indicators still have metadata in it."
          );
        } else {
          toast.error(res.err_message ?? "Failed to delete category");
        }
        return;
      }
      flushEditorToTextMap();
      const nextCats = categoriesRef.current.filter((x) => x.gid !== c.gid);
      setCategories(nextCats);
      setTextByGid((m) => {
        const next = { ...m };
        delete next[c.gid];
        return next;
      });
      setSelectedGid((cur) => (cur === c.gid ? nextCats[0]?.gid ?? null : cur));
      if (editingGid === c.gid) setEditingGid(null);
      toast.success("Category deleted");
    };

    const handleAddCategory = async () => {
      const name = newCategoryName.trim();
      if (!name || creatingCategory) return;
      setCreatingCategory(true);
      try {
        const list = categoriesRef.current;
        const order =
          list.length === 0 ? 1 : Math.max(...list.map((x) => x.order), 0) + 1;
        const res = await createMetadataCategories(dwId, [{ name, order }]);
        if (!res.success) {
          toast.error(res.err_message ?? "Failed to create category");
          return;
        }
        const errs = res.meta?.errors;
        if (Array.isArray(errs) && errs.length > 0) {
          toast.message(
            typeof errs[0] === "object" && errs[0] && "error" in errs[0]
              ? String((errs[0] as { error?: unknown }).error)
              : "Some categories failed to create"
          );
        }
        setNewCategoryName("");
        setAddCategoryRowExpanded(false);
        await loadAll();
        toast.success("Category created");
      } finally {
        setCreatingCategory(false);
      }
    };

    useImperativeHandle(
      ref,
      () => ({
        getUpdateItems: () => {
          if (!dataReadyRef.current || loadState === "loading") return null;
          const el = editorRef.current;
          const gid = selectedGid;
          const merged = { ...textByGid };
          if (gid && el) {
            merged[gid] = readContentEditableHtml(el);
          }
          return categories.map((c) => ({
            mt_catg_gid: c.gid,
            metadata_text: merged[c.gid] ?? "",
          }));
        },
      }),
      [categories, textByGid, selectedGid, loadState]
    );

    const exec = (command: string, value?: string) => {
      editorRef.current?.focus();
      try {
        document.execCommand(command, false, value);
      } catch {
        /* ignore */
      }
    };

    const insertImageFromFiles = (files: FileList | null) => {
      const file = files?.[0];
      if (!file) return;
      if (!file.type.startsWith("image/")) {
        toast.error(t("METADATA_IMAGE_TYPE", "Please choose an image file"));
        return;
      }
      if (file.size > METADATA_IMAGE_MAX_BYTES) {
        toast.error(
          t("METADATA_IMAGE_TOO_LARGE", "Image is too large (maximum 2.5 MB)")
        );
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = typeof reader.result === "string" ? reader.result : "";
        if (!dataUrl) return;
        editorRef.current?.focus();
        try {
          document.execCommand("insertImage", false, dataUrl);
        } catch {
          toast.error(t("METADATA_IMAGE_INSERT_FAILED", "Could not insert image"));
        }
      };
      reader.onerror = () => {
        toast.error(t("METADATA_IMAGE_READ_FAILED", "Could not read image"));
      };
      reader.readAsDataURL(file);
    };

    const insertOrEditLink = () => {
      const urlRaw = window.prompt(
        t("METADATA_LINK_URL_PROMPT", "Link URL (https://…)")
      );
      if (urlRaw == null) return;
      const url = urlRaw.trim();
      if (!url) return;
      editorRef.current?.focus();
      try {
        document.execCommand("createLink", false, url);
      } catch {
        toast.error(t("METADATA_LINK_FAILED", "Could not create link"));
      }
    };

    const insertTableFromPrompts = () => {
      const rowsRaw = window.prompt(
        t("METADATA_TABLE_ROWS_PROMPT", "Number of rows (1–20)"),
        "3"
      );
      if (rowsRaw == null) return;
      const colsRaw = window.prompt(
        t("METADATA_TABLE_COLS_PROMPT", "Number of columns (1–20)"),
        "3"
      );
      if (colsRaw == null) return;
      const rows = Number.parseInt(rowsRaw.trim(), 10);
      const cols = Number.parseInt(colsRaw.trim(), 10);
      if (!Number.isFinite(rows) || !Number.isFinite(cols)) {
        toast.error(t("METADATA_TABLE_INVALID", "Enter valid numbers for rows and columns"));
        return;
      }
      const html = buildEmptyTableHtml(rows, cols);
      editorRef.current?.focus();
      try {
        document.execCommand("insertHTML", false, html);
      } catch {
        toast.error(t("METADATA_TABLE_INSERT_FAILED", "Could not insert table"));
      }
    };

    const onResizeMouseDown = (e: React.MouseEvent) => {
      e.preventDefault();
      resizeRef.current = { startX: e.clientX, startW: catsPanelWidth };
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";

      const onMove = (e2: MouseEvent) => {
        const r = resizeRef.current;
        if (!r) return;
        const dx = e2.clientX - r.startX;
        const w = Math.max(META_PANEL_MIN, Math.min(META_PANEL_MAX, r.startW + dx));
        setCatsPanelWidth(w);
      };
      const onUp = () => {
        resizeRef.current = null;
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
      };
      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
    };

    if (loadState === "loading") {
      return (
        <div className="meta-tab-root relative">
          <div
            className="sp-panel-tab-loading-overlay"
            aria-live="polite"
            aria-busy="true"
          >
            <Loader loadingLabel={t("LOADING")} size={48} />
          </div>
        </div>
      );
    }

    if (loadState === "error") {
      return (
        <div className="meta-tab-root">
          <p className="cell-empty px-6 py-8 text-error">{loadError ?? "Failed to load metadata"}</p>
        </div>
      );
    }

    const activeCat = selectedGid
      ? categories.find((c) => c.gid === selectedGid) ?? null
      : null;

    return (
      <div className="meta-tab-root">
        <fieldset disabled={readOnly} className="meta-layout m-0 min-w-0 border-0 p-0">
          <SideNavListColumn
            width={catsPanelWidth}
            className="min-w-[160px] max-w-[420px] shrink-0"
          >
            <SideNavList>
              {categories.map((c) => {
                const isEditing = editingGid === c.gid;
                return (
                  <SideNavItem
                    key={c.gid}
                    active={selectedGid === c.gid}
                    data-meta-cat-gid={c.gid}
                    className={`meta-cat-item${isEditing ? " editing" : ""}`}
                    onClick={() => selectCategory(c.gid)}
                    onDoubleClick={(e) => {
                      const target = e.target as HTMLElement | null;
                      const fromAction = Boolean(
                        target?.closest(".meta-cat-actions, .btn-comp-ghost--meta")
                      );
                      const fromInput = Boolean(
                        target?.closest(".meta-cat-item input")
                      );
                      // Ignore action controls and the inline input itself.
                      if (fromAction || fromInput) return;
                      selectCategory(c.gid);
                      if (!isEditing && !readOnly) startEditCategory(c);
                    }}
                    onKeyDown={(e) => {
                      /* Only when focus is on the row itself — not on child input (Space/Enter would bubble and break typing). */
                      if (e.target !== e.currentTarget) return;
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        selectCategory(c.gid);
                      }
                    }}
                  >
                    {isEditing ? (
                      <TextField
                        variant="inlineRow"
                        value={editingDraftName}
                        placeholder="Category name"
                        aria-label="Category name"
                        onChange={(e) => setEditingDraftName(e.target.value)}
                        onClick={(e) => e.stopPropagation()}
                        onKeyDown={(e) => {
                          if (e.key === "Escape") {
                            e.stopPropagation();
                            setEditingGid(null);
                            setEditingDraftName(c.name);
                            return;
                          }
                          if (e.key === "Enter") {
                            e.preventDefault();
                            e.stopPropagation();
                            void commitRenameFromBlur(c.gid, e.currentTarget.value);
                          }
                        }}
                        onBlur={(e) => {
                          const row = e.currentTarget.closest("[data-meta-cat-gid]");
                          const next =
                            e.relatedTarget instanceof Node ? e.relatedTarget : null;
                          if (row && next && row.contains(next)) return;
                          void commitRenameFromBlur(c.gid, e.currentTarget.value);
                        }}
                      />
                    ) : (
                      <SideNavTruncatingLabel
                        text={c.name.trim() ? c.name : "Untitled"}
                      />
                    )}
                    <div className="meta-cat-actions">
                      <button
                        type="button"
                        className="btn-comp-ghost btn-comp-ghost--meta btn-comp-ghost--primary"
                        title="Edit name"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={(e) => {
                          e.stopPropagation();
                          startEditCategory(c);
                        }}
                      >
                        <span className="material-icons !text-xs leading-none" aria-hidden>
                          edit
                        </span>
                      </button>
                      <button
                        type="button"
                        className="btn-comp-ghost btn-comp-ghost--meta btn-comp-ghost--danger"
                        title="Delete category"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={(e) => {
                          e.stopPropagation();
                          void handleDeleteCategory(c);
                        }}
                      >
                        <span className="material-icons !text-xs leading-none" aria-hidden>
                          delete
                        </span>
                      </button>
                    </div>
                  </SideNavItem>
                );
              })}
              <div className="shrink-0">
                {addCategoryRowExpanded ? (
                  <input
                    ref={newCategoryInputRef}
                    type="text"
                    className={textFieldClassName("sm")}
                    placeholder="New category…"
                    value={newCategoryName}
                    disabled={creatingCategory}
                    aria-label="New category name"
                    onChange={(e) => setNewCategoryName(e.target.value)}
                    onBlur={() => {
                      if (!creatingCategory && !newCategoryName.trim()) {
                        setAddCategoryRowExpanded(false);
                      }
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && newCategoryName.trim()) {
                        e.preventDefault();
                        void handleAddCategory();
                      }
                      if (e.key === "Escape") {
                        e.preventDefault();
                        setNewCategoryName("");
                        setAddCategoryRowExpanded(false);
                        (e.target as HTMLInputElement).blur();
                      }
                    }}
                  />
                ) : (
                  <button
                    type="button"
                    className={META_CAT_ADD_PROMPT_BTN}
                    disabled={creatingCategory}
                    aria-label="New category name"
                    onClick={() => {
                      setAddCategoryRowExpanded(true);
                      queueMicrotask(() => newCategoryInputRef.current?.focus());
                    }}
                  >
                    <span className="material-icons !text-sm" aria-hidden>
                      add_circle_outline
                    </span>
                    <span>New category…</span>
                  </button>
                )}
              </div>
            </SideNavList>
          </SideNavListColumn>
          <div
            className="meta-resizer"
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize category column"
            onMouseDown={onResizeMouseDown}
          />
          <div className="meta-main">
            {activeCat ? (
              <div className="meta-wysiwyg-wrap">
                <div className="wysiwyg-wrap">
                  <div className="wysiwyg-bar">
                    <SelectField
                      menuPortal
                      className="shrink-0 min-w-[52px] max-w-[72px] [&_button]:!h-[26px] [&_button]:!min-h-[26px] [&_button]:!rounded-sm [&_button]:!px-1 [&_button]:!text-xs"
                      title="Font size"
                      aria-label="Font size"
                      value={wysiwygFontSize}
                      onChange={(e) => {
                        const v = e.target.value;
                        setWysiwygFontSize(v);
                        exec("fontSize", v);
                      }}
                      options={[
                        { value: "2", label: "12" },
                        { value: "3", label: "14" },
                        { value: "4", label: "16" },
                        { value: "5", label: "18" },
                      ]}
                    />
                    <span className="wy-sep" aria-hidden />
                    <button
                      type="button"
                      className="btn-comp-icon !shadow-none !rounded-sm"
                      title="Bold"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => exec("bold")}
                    >
                      <span className="material-icons !text-xs leading-none">format_bold</span>
                    </button>
                    <button
                      type="button"
                      className="btn-comp-icon !shadow-none !rounded-sm"
                      title="Italic"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => exec("italic")}
                    >
                      <span className="material-icons !text-xs leading-none">format_italic</span>
                    </button>
                    <button
                      type="button"
                      className="btn-comp-icon !shadow-none !rounded-sm"
                      title="Underline"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => exec("underline")}
                    >
                      <span className="material-icons !text-xs leading-none">format_underlined</span>
                    </button>
                    <span className="wy-sep" aria-hidden />
                    <button
                      type="button"
                      className="btn-comp-icon !shadow-none !rounded-sm"
                      title="Align left"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => exec("justifyLeft")}
                    >
                      <span className="material-icons !text-xs leading-none">format_align_left</span>
                    </button>
                    <button
                      type="button"
                      className="btn-comp-icon !shadow-none !rounded-sm"
                      title="Align center"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => exec("justifyCenter")}
                    >
                      <span className="material-icons !text-xs leading-none">format_align_center</span>
                    </button>
                    <span className="wy-sep" aria-hidden />
                    <button
                      type="button"
                      className="btn-comp-icon !shadow-none !rounded-sm"
                      title="Bullet list"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => exec("insertUnorderedList")}
                    >
                      <span className="material-icons !text-xs leading-none">format_list_bulleted</span>
                    </button>
                    <button
                      type="button"
                      className="btn-comp-icon !shadow-none !rounded-sm"
                      title="Numbered list"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => exec("insertOrderedList")}
                    >
                      <span className="material-icons !text-xs leading-none">format_list_numbered</span>
                    </button>
                    <span className="wy-sep" aria-hidden />
                    <input
                      ref={imageFileInputRef}
                      type="file"
                      accept="image/*"
                      className="sr-only"
                      tabIndex={-1}
                      aria-hidden
                      onChange={(e) => {
                        insertImageFromFiles(e.target.files);
                        e.target.value = "";
                      }}
                    />
                    <button
                      type="button"
                      className="btn-comp-icon !shadow-none !rounded-sm"
                      title={t("METADATA_INSERT_IMAGE", "Insert image")}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => imageFileInputRef.current?.click()}
                    >
                      <span className="material-icons !text-xs leading-none">image</span>
                    </button>
                    <button
                      type="button"
                      className="btn-comp-icon !shadow-none !rounded-sm"
                      title={t("METADATA_INSERT_LINK", "Link")}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={insertOrEditLink}
                    >
                      <span className="material-icons !text-xs leading-none">link</span>
                    </button>
                    <button
                      type="button"
                      className="btn-comp-icon !shadow-none !rounded-sm"
                      title={t("METADATA_REMOVE_LINK", "Remove link")}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => exec("unlink")}
                    >
                      <span className="material-icons !text-xs leading-none">link_off</span>
                    </button>
                    <button
                      type="button"
                      className="btn-comp-icon !shadow-none !rounded-sm"
                      title={t("METADATA_INSERT_TABLE", "Insert table")}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={insertTableFromPrompts}
                    >
                      <span className="material-icons !text-xs leading-none">table_chart</span>
                    </button>
                    <span className="wy-sep" aria-hidden />
                    <button
                      type="button"
                      className="btn-comp-icon !shadow-none !rounded-sm"
                      title="Undo"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => exec("undo")}
                    >
                      <span className="material-icons !text-xs leading-none">undo</span>
                    </button>
                    <button
                      type="button"
                      className="btn-comp-icon !shadow-none !rounded-sm"
                      title="Redo"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => exec("redo")}
                    >
                      <span className="material-icons !text-xs leading-none">redo</span>
                    </button>
                    <span className="wy-sep" aria-hidden />
                    <button
                      type="button"
                      className="btn-comp-icon !shadow-none !rounded-sm"
                      title="Remove formatting"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => exec("removeFormat")}
                    >
                      <span className="material-icons !text-xs leading-none">format_clear</span>
                    </button>
                  </div>
                  <MetadataRichEditor
                    ref={editorRef}
                    categoryGid={activeCat.gid}
                    initialHtml={textByGid[activeCat.gid] ?? ""}
                    onBlurEditor={flushEditorToTextMap}
                    readOnly={readOnly}
                  />
                </div>
              </div>
            ) : (
              <div className="meta-empty">
                Add a metadata category on the left, or type a name and press Enter.
              </div>
            )}
          </div>
        </fieldset>
      </div>
    );
  }
);
