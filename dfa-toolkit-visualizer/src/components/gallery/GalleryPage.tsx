"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import {
  Search,
  BarChart3,
  Table2,
  ExternalLink,
  Download,
  Share2,
  Trash2,
} from "lucide-react";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import type { ChartData, ChartConfig } from "dfa-v6-comp-visualization";
import { ShareModal } from "@/components/visualizer/ShareModal";
import { SignInRequiredModal } from "@/components/SignInRequiredModal";
import { useCore } from "@/contexts/CoreContext";
import { useAuth } from "@/contexts/AuthContext";
import { buildVisualizerUrl } from "@/components/gallery/galleryUrl";
import { getGalleryRepository } from "@/lib/gallery/galleryRepository";
import { exportGalleryItemAs } from "@/lib/gallery/exportFromItem";
import { fetchPreviewDataForItem } from "@/lib/gallery/fetchPreviewData";
import type { GalleryItem } from "@/lib/gallery/types";
import { mapVizConfigToChartConfig } from "@/lib/visualizer/chartTransform";
import type { FilterValues, SelectedComponents } from "@/lib/visualizer/types";
import { Loader } from "@/components/Loader";
import { SESSION_STORAGE_KEYS } from "@/lib/constants";

export type { GalleryItem };

function LoaderChartPlaceholder() {
  const { t } = useCore();
  return (
    <div className="flex h-full w-full min-h-[128px] items-center justify-center rounded">
      <Loader
        size={30}
        showStatusText={true}
        loadingLabel={t("COMMON_LOADING")}
        ariaLabel={t("COMMON_LOADING_CHART")}
      />
    </div>
  );
}

const ChartRendererWrapper = dynamic(
  () =>
    import("dfa-v6-comp-visualization").then((m) => ({
      default: m.ChartRendererWrapper,
    })),
  {
    ssr: false,
    loading: () => <LoaderChartPlaceholder />,
  }
);

export interface GalleryPageProps {
  /** Locale for share URLs and Open navigation (e.g. "en"). */
  locale: string;
  /** Optional override when user clicks Open; defaults to opening the visualizer in a new tab. */
  onOpenItem?: (item: GalleryItem) => void;
}

function buildSelectedComponentsFromItem(
  item: GalleryItem
): SelectedComponents {
  const ind = item.indicator;
  const f = item.filters;
  const selected: SelectedComponents = {};

  if (ind?.id) {
    selected.indicator = [
      { id: ind.id, label: ind.name ?? ind.code ?? ind.id },
    ];
  }
  if (item.selectedComponents?.area?.length) {
    selected.area = item.selectedComponents.area;
  } else if (f?.area?.length) {
    selected.area = f.area.map((id) => ({ id, label: id }));
  }
  if (f?.subgroup?.length) {
    selected.subgroup = f.subgroup.map((id) => ({ id, label: id }));
  }
  const startRaw = f?.timeStart;
  const endRaw = f?.timeEnd;
  const startNum = startRaw != null ? Number(startRaw) : null;
  const endNum = endRaw != null ? Number(endRaw) : null;
  if (startNum != null && endNum != null && !Number.isNaN(startNum) && !Number.isNaN(endNum)) {
    const years: number[] = [];
    for (let y = startNum; y <= endNum; y++) years.push(y);
    selected.timePeriod = years.map((y) => ({ id: String(y), label: String(y) }));
  } else if (startRaw != null && endRaw != null) {
    const startStr = String(startRaw);
    const endStr = String(endRaw);
    if (startStr === endStr) {
      selected.timePeriod = [{ id: startStr, label: startStr }];
    } else {
      selected.timePeriod = [
        { id: startStr, label: startStr },
        { id: endStr, label: endStr },
      ];
    }
  }

  return selected;
}

function itemFiltersToFilterValues(item: GalleryItem): FilterValues {
  const f = item.filters;
  const start = f?.timeStart != null ? Number(f.timeStart) : null;
  const end = f?.timeEnd != null ? Number(f.timeEnd) : null;
  return {
    dimension: null,
    dimensionValue: null,
    indicator: item.indicator?.id ? [item.indicator.id] : [],
    timeStart: start ?? null,
    timeEnd: end ?? null,
    area: Array.isArray(f?.area) ? f.area : [],
    subgroup: Array.isArray(f?.subgroup) ? f.subgroup : [],
  };
}

function withLocale(locale: string, path: string) {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return `/${locale}${normalized === "/" ? "" : normalized}`;
}

const GALLERY_FROM_VISUALIZER_KEY = "galleryFromVisualizer";

export function GalleryPage({ locale, onOpenItem }: GalleryPageProps) {
  const router = useRouter();
  const { dataWarehouseId, t, getConfig } = useCore();
  const { user, loading: authLoading } = useAuth();
  const [signInRequiredOpen, setSignInRequiredOpen] = useState(true);
  const [fromVisualizer, setFromVisualizer] = useState(false);
  const galleryReturnUrl = withLocale(locale, "/gallery");

  useEffect(() => {
    if (typeof window === "undefined") return;
    const value = sessionStorage.getItem(GALLERY_FROM_VISUALIZER_KEY) === "true";
    setFromVisualizer(value);
  }, []);

  const primaryHex =
    (typeof document !== "undefined"
      ? getComputedStyle(document.documentElement).getPropertyValue("--color-primary").trim()
      : "");
  const [filter, setFilter] = useState<"all" | "visualization" | "table">("all");
  /** Cache of fetched preview data for items that don't have previewData saved. */
  const [previewFetchCache, setPreviewFetchCache] = useState<
    Record<string, ChartData | null | "loading">
  >({});
  const fetchedIdsRef = useRef<Set<string>>(new Set());
  const fetchInProgressRef = useRef<Set<string>>(new Set());

  const handleOpenItem = (item: GalleryItem) => {
    if (onOpenItem) {
      onOpenItem(item);
    } else {
      window.open(buildVisualizerUrl(item, locale), "_blank", "noopener,noreferrer");
    }
  };
  const [searchQuery, setSearchQuery] = useState("");
  const [items, setItems] = useState<GalleryItem[]>([]);
  const [shareItem, setShareItem] = useState<GalleryItem | null>(null);
  const [exportMenuOpen, setExportMenuOpen] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    getGalleryRepository()
      .list()
      .then((list) => {
        if (!cancelled) setItems(list);
      });
    return () => {
      cancelled = true;
    };
  }, [user]);

  const loadGalleryItems = () => {
    getGalleryRepository()
      .list()
      .then(setItems);
  };

  const filteredItems = useMemo(
    () =>
      items.filter((item) => {
        const matchesFilter = filter === "all" || item.type === filter;
        const name = item.indicator?.name ?? "";
        const code = item.indicator?.code ?? "";
        const matchesSearch =
          !searchQuery ||
          name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          code.toLowerCase().includes(searchQuery.toLowerCase());
        return matchesFilter && matchesSearch;
      }),
    [items, filter, searchQuery]
  );

  const handleDelete = (itemId: string) => {
    getGalleryRepository()
      .remove(itemId)
      .then(loadGalleryItems);
  };

  const handleDataExport = async (
    item: GalleryItem,
    format: "csv" | "xlsx" | "json"
  ) => {
    const ok = await exportGalleryItemAs(item, format, { locale });
    if (!ok) {
      alert(t("GALLERY_EXPORT_NO_DATA"));
    }
  };

  /** Preview uses saved chart data when available, or background fetch for legacy items without previewData. */
  const getPreviewChartData = (item: GalleryItem): ChartData | null => {
    if (item.type !== "visualization") return null;
    if (item.previewData) return item.previewData;
    const cached = previewFetchCache[item.id];
    if (cached && cached !== "loading") return cached;
    return null;
  };

  const isPreviewLoading = (item: GalleryItem) =>
    item.type === "visualization" &&
    !item.previewData &&
    previewFetchCache[item.id] === "loading";

  const idsToFetch = useMemo(
    () =>
      filteredItems
        .filter(
          (i) =>
            i.type === "visualization" &&
            !i.previewData
        )
        .map((i) => i.id),
    [filteredItems]
  );

  useEffect(() => {
    idsToFetch.forEach((id) => {
      if (fetchedIdsRef.current.has(id)) return;
      if (fetchInProgressRef.current.has(id)) return;
      fetchInProgressRef.current.add(id);
      setPreviewFetchCache((prev) => ({ ...prev, [id]: "loading" }));
      const item = filteredItems.find((i) => i.id === id)!;
      fetchPreviewDataForItem(item, {
        locale,
        dwId: dataWarehouseId,
      }).then((data) => {
        setPreviewFetchCache((prev) => ({ ...prev, [id]: data ?? null }));
        fetchInProgressRef.current.delete(id);
        if (data != null) fetchedIdsRef.current.add(id);
      });
    });
  }, [idsToFetch, filteredItems, locale, dataWarehouseId]);

  /** Default fonts so axis/legend rendering never reads undefined (e.g. config.labelFont.size). */
  const defaultFont = {
    size: 10,
    family: "Inter",
    bold: false as const,
    italic: false as const,
    underline: false as const,
  };

  /** Chart config for gallery preview: same as saved vizSettings, with preview overrides. */
  const getPreviewChartConfig = (item: GalleryItem): ChartConfig => {
    const base =
      item.vizSettings && typeof mapVizConfigToChartConfig === "function"
        ? mapVizConfigToChartConfig(item.vizSettings)
        : ({
            type: "line" as const,
            showXAxis: true,
            showYAxis: true,
            showGrid: true,
            showLabels: false,
            showLegend: false,
            legendPosition: "bottom" as const,
            labelOrientation: "horizontal" as const,
            primaryColor: primaryHex,
            palette: [primaryHex],
            labelFont: defaultFont,
            legendFont: defaultFont,
            lineThickness: 2,
          } satisfies ChartConfig);
    const showAxesAndGrid = true;
    return {
      ...base,
      showXAxis: showAxesAndGrid,
      showYAxis: showAxesAndGrid,
      showLabels: false,
      showLegend: false,
      showGrid: showAxesAndGrid,
      labelFont: base.labelFont && typeof base.labelFont.size === "number" ? base.labelFont : defaultFont,
      legendFont: base.legendFont && typeof base.legendFont.size === "number" ? base.legendFont : defaultFont,
      // When axes/grid are off, omit grid override so the engine uses default margins (24px) and layout stays correct.
      grid: showAxesAndGrid ? { left: 8, right: 8, top: 8, bottom: 8 } : undefined,
    };
  };

  const filterButtonClass = (active: boolean) =>
    `btn-comp-secondary px-2 sm:px-md ${
      active
        ? "bg-primary text-on-primary hover:bg-primary-hover"
        : "bg-surface border border-border text-text hover:bg-surface-muted"
    }`;

  if (authLoading) {
    return (
      <div className="mx-auto max-w-6xl px-6 py-10 flex items-center justify-center min-h-[200px]">
        <p className="text-text-muted">{t("COMMON_LOADING")}</p>
      </div>
    );
  }

  if (!user) {
    return (
      <>
        <div className="mx-auto max-w-6xl px-6 py-10 text-center text-text-muted">
          <p>{t("SIGN_ACCESS_GALLERY")}</p>
        </div>
        <SignInRequiredModal
          open={signInRequiredOpen}
          onClose={() => setSignInRequiredOpen(false)}
          returnUrl={galleryReturnUrl}
          locale={locale}
        />
      </>
    );
  }

  return (
    <div className="min-h-screen">
      <div className="mx-auto px-6 py-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-lg font-bold text-text mb-2">
              {t("HEADER_MY_GALLERY")}
            </h1>
            <p className="text-sm text-text-muted">
              {t("GALLERY_SUBTITLE")}
            </p>
          </div>
          {fromVisualizer && (
            <button
              type="button"
              onClick={() => {
                if (typeof window !== "undefined") {
                  const returnTo =
                    sessionStorage.getItem(SESSION_STORAGE_KEYS.VISUALIZER_GALLERY_RETURN) ||
                    withLocale(locale, "/visualizer");
                  sessionStorage.removeItem(GALLERY_FROM_VISUALIZER_KEY);
                  sessionStorage.removeItem(SESSION_STORAGE_KEYS.VISUALIZER_GALLERY_RETURN);
                  router.push(returnTo);
                  return;
                }
                router.push(withLocale(locale, "/visualizer"));
              }}
              className={`${filterButtonClass(false)} flex items-center gap-1.5 shrink-0`}
              aria-label={t("GALLERY_BACK_TO_VISUALIZATION")}
            >
              <ArrowBackIcon className="!text-sm" aria-hidden />
              <span className="hidden sm:inline">{t("GALLERY_BACK_TO_VISUALIZATION")}</span>
            </button>
          )}
        </div>

        <div className="flex gap-4 items-center mb-6">
          <div className="flex-1 relative">
            <Search className="absolute left-2.5 rtl:left-auto rtl:right-2.5 top-1/2 -translate-y-1/2 text-text-muted w-4 h-4" />
            <input
              type="text"
              placeholder={t("GALLERY_SEARCH_PLACEHOLDER")}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="field-comp--md w-full pl-9 pr-3 rtl:pl-3 rtl:pr-9 text-xs"
            />
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => setFilter("all")}
              className={filterButtonClass(filter === "all")}
            >
              {t("GALLERY_FILTER_ALL")} ({items.length})
            </button>
            <button
              onClick={() => setFilter("visualization")}
              className={filterButtonClass(filter === "visualization")}
            >
              <BarChart3 className="w-4 h-4" />
              {t("GALLERY_FILTER_VISUALIZATIONS")} (
              {items.filter((i) => i.type === "visualization").length})
            </button>
            <button
              onClick={() => setFilter("table")}
              className={filterButtonClass(filter === "table")}
            >
              <Table2 className="w-4 h-4" />
              {t("GALLERY_FILTER_TABLES")} ({items.filter((i) => i.type === "table").length})
            </button>
          </div>
        </div>

        {filteredItems.length === 0 ? (
          <div
            className="flex items-center justify-center"
            style={{ minHeight: "calc(100vh - 300px)" }}
          >
            <div className="text-center">
              <div className="w-24 h-24 rounded-full flex items-center justify-center mx-auto mb-6 shadow-lg bg-primary-light/20 border border-primary/30">
                {filter === "visualization" ? (
                  <BarChart3 className="w-12 h-12 text-primary" />
                ) : filter === "table" ? (
                  <Table2 className="w-12 h-12 text-primary" />
                ) : (
                  <Search className="w-12 h-12 text-primary" />
                )}
              </div>
              <h3 className="text-lg font-bold text-text mb-3">
                {t("GALLERY_NO_ITEMS_FOUND")}
              </h3>
              <p className="text-md text-text-muted max-w-md mx-auto">
                {searchQuery
                  ? t("GALLERY_ADJUST_SEARCH_OR_FILTERS")
                  : t("GALLERY_START_BOOKMARKING")}
              </p>
            </div>
          </div>
        ) : (
          <div className="gallery-cards-grid grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredItems.map((item) => (
              <div
                key={item.id}
                className="bg-surface rounded-lg border border-border hover:shadow-lg transition-shadow"
              >
                <div className="p-4 border-b border-border bg-surface-muted">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2">
                      {item.type === "visualization" ? (
                        <BarChart3 className="w-5 h-5 text-primary" />
                      ) : (
                        <Table2 className="w-5 h-5 text-primary" />
                      )}
                      <span className="text-sm font-medium text-text capitalize">
                        {item.type === "visualization"
                          ? t("VISUALIZER_TAB_VISUALIZATION")
                          : t("VISUALIZER_TAB_DATA_TABLE")}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="p-4 bg-surface-muted border-b border-border">
                  {item.type === "visualization" ? (
                    <div
                      className={`h-32 rounded border border-border overflow-hidden flex items-center justify-center ${
                        item.vizSettings?.chartAreaBackgroundColor?.trim() ? "" : "bg-surface"
                      }`}
                      style={
                        item.vizSettings?.chartAreaBackgroundColor?.trim()
                          ? { backgroundColor: item.vizSettings.chartAreaBackgroundColor.trim() }
                          : undefined
                      }
                    >
                      {isPreviewLoading(item) ? (
                        <div className="flex h-full w-full items-center justify-center rounded">
                          <Loader
                            size={30}
                            showStatusText={true}
                            loadingLabel={t("COMMON_LOADING")}
                            ariaLabel={t("COMMON_LOADING_PREVIEW")}
                          />
                        </div>
                      ) : getPreviewChartData(item) ? (
                        <ChartRendererWrapper
                          data={getPreviewChartData(item)!}
                          config={getPreviewChartConfig(item)}
                          height={128}
                          minHeight={128}
                        />
                      ) : (
                        <p className="text-sm text-text-muted px-2 text-center">
                          {t("GALLERY_OPEN_TO_VIEW_CHART")}
                        </p>
                      )}
                    </div>
                  ) : (
                    <div className="h-32 bg-surface rounded border border-border overflow-hidden flex items-center justify-center">
                      <p className="text-sm text-text-muted px-2 text-center">
                        {t("GALLERY_OPEN_TO_VIEW_DATA")}
                      </p>
                    </div>
                  )}
                </div>

                <div className="p-4">
                  <h3 className="text-md text-text mb-2 line-clamp-2 font-semibold">
                    {item.indicator?.name ?? "—"}
                  </h3>

                  <div className="space-y-1 mb-4">
                    {(() => {
                      const area = item.selectedComponents?.area;
                      const areaLabels =
                        area && area.length > 0
                          ? area.map((a) => a.label ?? a.id)
                          : (item.filters?.area ?? []).map(String);
                      if (areaLabels.length === 0) return null;
                      const show = areaLabels.slice(0, 2).join(", ");
                      const more = areaLabels.length > 2 ? ` +${areaLabels.length - 2} more` : "";
                      return (
                        <p className="text-xs text-text-muted">
                          <span className="font-medium">{t("GALLERY_LABEL_AREAS")}</span> {show}
                          {more}
                        </p>
                      );
                    })()}
                    {item.filters?.timeStart != null &&
                      item.filters?.timeEnd != null &&
                      !(Number(item.filters.timeStart) === 2020 && Number(item.filters.timeEnd) === 2024) && (
                        <p className="text-xs text-text-muted">
                          <span className="font-medium">{t("GALLERY_LABEL_PERIOD")}</span>{" "}
                          {item.filters.timeStart}–{item.filters.timeEnd}
                        </p>
                      )}
                  </div>

                  <div className="flex gap-2">
                    <button
                      onClick={() => handleOpenItem(item)}
                      className="flex-1 px-3 py-2 btn-comp-primary rounded-md flex items-center justify-center gap-2 text-sm"
                      title={t("GALLERY_OPEN")}
                    >
                      <ExternalLink className="w-4 h-4" />
                      {t("GALLERY_OPEN")}
                    </button>

                    <div className="relative">
                      <button
                        onClick={() =>
                          setExportMenuOpen(
                            exportMenuOpen === item.id ? null : item.id
                          )
                        }
                        className="px-3 py-2 bg-surface border border-border text-text rounded-md hover:bg-surface-muted transition-colors"
                        title={t("GALLERY_EXPORT")}
                      >
                        <Download className="w-4 h-4" />
                      </button>
                      {exportMenuOpen === item.id && (
                        <>
                          <div
                            className="fixed inset-0 z-10"
                            onClick={() => setExportMenuOpen(null)}
                          />
                          <div className="absolute right-0 rtl:right-auto rtl:left-0 mt-2 w-48 bg-surface border border-border rounded-md shadow-lg z-20">
                            <button
                              onClick={() => {
                                void handleDataExport(item, "csv");
                                setExportMenuOpen(null);
                              }}
                              className="w-full px-4 py-2 text-left rtl:text-right text-sm text-text hover:bg-surface-muted transition-colors"
                            >
                              {t("VISUALIZER_TOOLBAR_DOWNLOAD_CSV")}
                            </button>
                            <button
                              onClick={() => {
                                void handleDataExport(item, "xlsx");
                                setExportMenuOpen(null);
                              }}
                              className="w-full px-4 py-2 text-left rtl:text-right text-sm text-text hover:bg-surface-muted transition-colors"
                            >
                              {t("VISUALIZER_TOOLBAR_DOWNLOAD_XLSX")}
                            </button>
                            <button
                              onClick={() => {
                                void handleDataExport(item, "json");
                                setExportMenuOpen(null);
                              }}
                              className="w-full px-4 py-2 text-left rtl:text-right text-sm text-text hover:bg-surface-muted transition-colors"
                            >
                              {t("VISUALIZER_TOOLBAR_DOWNLOAD_JSON")}
                            </button>
                            {item.type === "visualization" && (
                              <>
                                <button
                                  onClick={() => {
                                    setExportMenuOpen(null);
                                    window.open(buildVisualizerUrl(item, locale), "_blank");
                                  }}
                                  className="w-full px-4 py-2 text-left rtl:text-right text-sm text-text hover:bg-surface-muted transition-colors"
                                >
                                  {t("GALLERY_OPEN_TO_EXPORT_IMAGE")}
                                </button>
                              </>
                            )}
                          </div>
                        </>
                      )}
                    </div>

                    <button
                      onClick={() => setShareItem(item)}
                      className="px-3 py-2 bg-surface border border-border text-text rounded-md hover:bg-surface-muted transition-colors"
                      title={t("GALLERY_SHARE")}
                    >
                      <Share2 className="w-4 h-4" />
                    </button>

                    <button
                      onClick={() => {
                        if (window.confirm(t("GALLERY_DELETE_CONFIRM"))) {
                          handleDelete(item.id);
                        }
                      }}
                      className="px-3 py-2 bg-surface border border-error text-error rounded-md hover:bg-error/10 transition-colors"
                      title={t("GALLERY_DELETE")}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>

                  <p className="text-xs text-text-muted mt-3">
                    {t("GALLERY_SAVED")}{" "}
                    {new Date(item.timestamp).toLocaleDateString()}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}

        {shareItem && (
          <ShareModal
            isOpen={true}
            onClose={() => setShareItem(null)}
            indicator={
              shareItem.indicator
                ? {
                    id: shareItem.indicator.id,
                    name: shareItem.indicator.name,
                    code: shareItem.indicator.code,
                    description: "",
                    defaultTimeStart: 0,
                    defaultTimeEnd: 0,
                    defaultArea: "",
                    defaultSubgroup: "",
                    unit: "",
                    source: "",
                    frequency: "",
                    tags: [],
                    aliases: [],
                  }
                : null
            }
            filters={itemFiltersToFilterValues(shareItem)}
            selectedComponents={buildSelectedComponentsFromItem(shareItem)}
            locale={locale}
          />
        )}
      </div>
    </div>
  );
}
