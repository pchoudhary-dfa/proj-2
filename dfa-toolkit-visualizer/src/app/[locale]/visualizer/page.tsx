"use client";

import { useState, useMemo, useEffect, useCallback, useRef, useLayoutEffect } from "react";
import type React from "react";
import { 
  useParams, 
  usePathname, 
  useSearchParams, 
  useRouter 
} from "next/navigation";
import {
  Bookmark,
  Share2,
  Download,
  ChevronDown,
  Settings,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { getTooltipHandlers } from "@/components/CustomTooltip";
import { TileComponent } from "@/components/TileComponent";
import type {
  FilterValues,
  DataPoint,
  VisualizerDataResponse,
  FilterSectionKey,
  SelectedComponents,
  SelectedItem,
  SectionTheme,
  Indicator,
  VisualizationConfig,
} from "@/lib/visualizer/types";
import { apiIndicatorToIndicator } from "@/lib/visualizer/indicatorAdapter";
import type { MetadataReportItem, IndicatorWithMetaEnvelope } from "@/lib/api/reference";
import { fetchDataApi, isDataApiError, type DataApiParams } from "@/lib/api/data";
import {
  dataApiResponseToVisualizerDataResponse,
  dataApiResponseToLegacyDataPoints,
  previewDataToVisualizerResponse,
  previewDataToLegacyDataPoints,
  type SnapshotAxisMapping,
} from "@/lib/visualizer/dataApiAdapter";
import {
  chipsToSelectedComponents,
  drainVizSearchHandoffChips,
  setVisualizerSelectionToSession,
  getVisualizerSelectionFromSession,
  setVisualizerVizConfigToSession,
  getVisualizerVizConfigFromSession,
  getVisualizerUiStateFromSession,
  setPendingVizConfigToSession,
  getPendingVizConfigFromSession,
  clearPendingVizConfigFromSession,
  clearVizSearchHandoffFromSession,
} from "@/lib/visualizer/sessionAdapter";
import { urlSearchParamsToSelectedComponents } from "@/lib/visualizer/urlParamsAdapter";
import { fetchParamsToSelectedComponents, decodeShareState, type MinimalSharePayload } from "@/lib/visualizer/embed/shareUrl";
import { buildDataApiParams as buildDataApiParamsShared } from "@/lib/visualizer/dataApiParams";
import { getCachedSubgroups } from "@/lib/visualizer/optionsCache";
import { REFERENCE_PATH_INDICATORS } from "@/lib/constants";
import { getReferenceApiClientBaseUrl } from "@/lib/appConfig/utils";
import { apiGet } from "@/lib/api/client";
import {
  fetchIndicatorsFromBackend,
  fetchAreasTreeFromBackend,
  type IndicatorOption,
} from "@/lib/api/referenceClient";
import { useCore } from "@/contexts/CoreContext";
import { useAuth } from "@/contexts/AuthContext";
import { useVisualizerState } from "@/contexts/VisualizerStateContext";
import { SignInRequiredModal } from "@/components/SignInRequiredModal";
import { IndicatorSelectionModal } from "@/components/IndicatorSelectionModal";
import { AreaSelectionModal } from "@/components/AreaSelectionModal";
import { SubgroupSelectionModal } from "@/components/SubgroupSelectionModal";
import { TimePeriodSelectionModal } from "@/components/TimePeriodSelectionModal";
import { Loader } from "@/components/Loader";
import {
  VisualizationTab,
  type VisualizationTabExportHandle,
} from "@/components/visualizer/VisualizationTab";
import { DataTableTab } from "@/components/visualizer/DataTableTab";
import { MetadataTab } from "@/components/visualizer/MetadataTab";
import { ShareModal } from "@/components/visualizer/ShareModal";
import { type GalleryItem, buildSelectedComponentsFromItem } from "@/lib/gallery/types";
import { getGalleryRepository } from "@/lib/gallery/galleryRepository";
import { getTimeRangeFromSelection } from "@/lib/visualizer/timeRangeFromSelection";
import { getDefaultChartConfig } from "@/lib/visualizer/defaultChartConfig";
import type { AxisSeriesMapping } from "@/lib/visualizer/chartTransform";
import {
  buildExportPayloadFromRows,
  getExportFilename,
  downloadCSV,
  downloadJSON,
  downloadXLSX,
} from "@/lib/visualizer/export";
import { selectedComponentsToFilters } from "@/lib/visualizer/selectedComponentsToFilters";
import { exportMetadataAsPdf, exportMetadataAsJpg } from "@/lib/visualizer/metadataExport";
import { isLineBarAreaData } from "dfa-v6-comp-visualization";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import RestartAltIcon from "@mui/icons-material/RestartAlt";
import FilterListIcon from "@mui/icons-material/FilterList";
import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import BarChartIcon from "@mui/icons-material/BarChart";
import CalendarMonthIcon from "@mui/icons-material/CalendarMonth";
import GroupIcon from "@mui/icons-material/Group";
import PlaceIcon from "@mui/icons-material/Place";
import { fetchAppVersion } from "@/lib/fetchAppVersion";

type IndicatorItem = { id: string | number; label: string };

const SIDEBAR_WIDTH_FALLBACK_PX = 256;
const DRAWER_WIDTH_COLLAPSED = 72;

/** Sidebar expanded width from :root tokens */
function readRootCssLengthPx(varName: string, fallbackPx: number): number {
  if (typeof window === "undefined") return fallbackPx;
  const raw = getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
  const n = parseFloat(raw);
  return Number.isFinite(n) ? Math.round(n) : fallbackPx;
}

/** Horizontal padding of the app-main-body wrapper (px-md = --spacing-md). */
const MAIN_BODY_PADDING_X = 16;
/** Top offset: header height (72px) + app-main-body top padding (16px). */
const SELECTION_MODAL_ANCHOR_TOP = 88;

/** True when the string is a single numeric id (e.g. "13"), used to resolve by nid when option list keys by gid. */
function isNumericId(s: string): boolean {
  return s !== "" && String(Number(s)) === s;
}

/**
 * Which indicators are selected (chip id + optional nid). Same basis as metadata fetch key.
 * Stable across metadata/detail fetch; do not use `currentIndicator.id` for gallery binding.
 */
function indicatorSelectionKey(components: SelectedComponents): string {
  return (components.indicator ?? [])
    .map((i) => `${String(i.id)}:${i.nid != null ? String(i.nid) : ""}`)
    .join("|");
}

/** Resolve raw selected components (id = label) to display names using option lists. Same dual lookup (id + nid) as in-page effect. */
function resolveSelectedComponentsLabels(
  sel: SelectedComponents,
  indicators: IndicatorOption[],
  flatAreas: { id: string; label: string; nid?: number }[],
  subgroups: { id: string | number; label: string; nid?: number }[]
): SelectedComponents {
  const indById = new Map(indicators.map((i) => [String(i.id), i]));
  const indByNid = new Map<number, IndicatorOption>();
  for (const i of indicators) {
    if (i.nid != null) indByNid.set(i.nid, i);
  }
  const areaById = new Map(flatAreas.map((a) => [String(a.id), a]));
  const areaByNid = new Map(flatAreas.filter((a) => a.nid != null).map((a) => [a.nid!, a]));
  const subgroupById = new Map(subgroups.map((s) => [String(s.id), s]));
  const subgroupByNid = new Map(subgroups.filter((s) => s.nid != null).map((s) => [s.nid!, s]));
  const resolved: SelectedComponents = {};
  if (sel.indicator?.length) {
    resolved.indicator = sel.indicator.map((item) => {
      const idStr = String(item.id);
      const opt = indById.get(idStr) ?? (isNumericId(idStr) ? indByNid.get(Number(item.id)) : undefined);
      return {
        id: item.id,
        label: opt?.label ?? item.label,
        ...(opt?.nid != null ? { nid: opt.nid } : {}),
      };
    });
  }
  if (sel.area?.length) {
    resolved.area = sel.area.map((item) => {
      const idStr = String(item.id);
      const opt = areaById.get(idStr) ?? (isNumericId(idStr) ? areaByNid.get(Number(item.id)) : undefined);
      return {
        id: item.id,
        label: opt?.label ?? item.label,
        ...(opt?.nid != null ? { nid: opt.nid } : {}),
      };
    });
  }
  if (sel.subgroup?.length) {
    resolved.subgroup = sel.subgroup.map((item) => {
      const idStr = String(item.id);
      const opt = subgroupById.get(idStr) ?? (isNumericId(idStr) ? subgroupByNid.get(Number(item.id)) : undefined);
      return {
        id: item.id,
        label: opt?.label ?? item.label,
        ...(opt?.nid != null ? { nid: opt.nid } : {}),
      };
    });
  }
  if (sel.timePeriod?.length) {
    resolved.timePeriod = sel.timePeriod;
  }
  return resolved;
}

const SECTION_CONFIG: Array<{
  key: FilterSectionKey;
  titleKey: string;
  icon: React.ReactNode;
  theme: SectionTheme;
}> = [
    {
      key: "indicator",
      titleKey: "visualizer.filter.indicator",
      icon: <BarChartIcon style={{ fontSize: 16 }} />,
      theme: { bgColor: "#fef2f2", primaryColor: "#dc2626" },
    },
    {
      key: "subgroup",
      titleKey: "visualizer.filter.subgroup",
      icon: <GroupIcon style={{ fontSize: 16 }} />,
      theme: { bgColor: "#f5f3ff", primaryColor: "#7c3aed" },
    },
    {
      key: "timePeriod",
      titleKey: "visualizer.filter.timePeriod",
      icon: <CalendarMonthIcon style={{ fontSize: 16 }} />,
      theme: { bgColor: "#fff7ed", primaryColor: "#ea580c" },
    },
    {
      key: "area",
      titleKey: "visualizer.filter.area",
      icon: <PlaceIcon style={{ fontSize: 16 }} />,
      theme: { bgColor: "#f0fdf4", primaryColor: "#16a34a" },
    },
  ];

function IndicatorBadge({
  count,
  "aria-label": ariaLabel,
}: {
  count: number;
  "aria-label"?: string;
}) {
  return (
    <span
      className="filter-panel__badge inline-flex min-w-[1.5rem] items-center justify-center rounded-sm px-2 py-0.5 text-sm font-normal"
      aria-label={ariaLabel ?? `${count} selected`}
    >
      {count}
    </span>
  );
}

function FilterSectionBlock({
  title,
  icon,
  theme,
  items,
  onItemsChangeAction,
  onSectionClick,
}: {
  title: string;
  icon: React.ReactNode;
  theme: SectionTheme;
  items: SelectedItem[];
  onItemsChangeAction: (nextItems: SelectedItem[]) => void;
  onSectionClick?: () => void;
}) {
  const count = items.length;
  const headerContent = (
    <>
      <span className="flex-shrink-0 text-text-muted" aria-hidden>
        {icon}
      </span>
      <span className="filter-panel__label min-w-0 flex-1 truncate text-sm font-bold">{title}</span>
      <span className="flex flex-shrink-0 items-center gap-1.5">
        {count > 0 && (
          <IndicatorBadge count={count} aria-label={`${count} ${title} selected`} />
        )}
        <span className="flex-shrink-0 text-text-muted" aria-hidden>
          <ChevronRightIcon style={{ fontSize: 16 }} />
        </span>
      </span>
    </>
  );
  return (
    <div
      id={`section-${title.replace(/\s+/g, "-")}`}
      className="filter-panel__card rounded-md transition-colors"
    >
      {onSectionClick ? (
        <button
          type="button"
          onClick={onSectionClick}
          className="flex w-full cursor-pointer items-center gap-3 px-3 py-2 text-left rtl:text-right transition-colors hover:bg-black/5 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-border rounded-t-xl"
          aria-label={`Open ${title} selection`}
        >
          {headerContent}
        </button>
      ) : (
        <div className="flex w-full items-center gap-3 px-4 py-3 text-left rtl:text-right">
          {headerContent}
        </div>
      )}
      <div
        id={`sub-section-${title.replace(/\s+/g, "-")}`}
        role="region"
        aria-label={`${title} selections`}
        className="px-2 pb-2 pt-2 max-h-[200px] overflow-y-auto"
      >
        <TileComponent
          items={items}
          chipClassName="filter-panel__chip"
          onChangeAction={onItemsChangeAction}
        />
      </div>
    </div>
  );
}

export default function VisualizerPage() {
  const {
    selectedComponents,
    setSelectedComponents,
    hasChipsFromSearch,
    setHasChipsFromSearch,
  } = useVisualizerState();
  const [showModal, setShowModal] = useState(false);
  const [showAreaModal, setShowAreaModal] = useState(false);
  const [showSubgroupModal, setShowSubgroupModal] = useState(false);
  const [showTimePeriodModal, setShowTimePeriodModal] = useState(false);
  const [selectedItems, setSelectedItems] = useState<SelectedItem[]>([]);
  const [indicatorDetails, setIndicatorDetails] = useState<Indicator | null>(null);
  /** Per-indicator metadata from the reference API (?metadata=true), fetched after chart data loads. One entry per selected indicator. */
  const [indicatorMetadataList, setIndicatorMetadataList] = useState<
    Array<{ indicator: Indicator; metadata: Record<string, MetadataReportItem> | null }>
  >([]);
  /** True while waiting for chart data or metadata API (avoids "no indicator" / empty flash). */
  const [metadataLoading, setMetadataLoading] = useState(false);
  const [appVersion, setAppVersion] = useState("0.0.0");
  const [drawerOpen, setDrawerOpen] = useState(true);
  const sidebarWidthPx = drawerOpen
    ? readRootCssLengthPx("--width-sidebar", SIDEBAR_WIDTH_FALLBACK_PX)
    : DRAWER_WIDTH_COLLAPSED;
  /** On mobile (same breakpoint as hidden header search: md), start with filter collapsed; user can still open it. */
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    if (mq.matches) setDrawerOpen(false);
  }, []);
  useEffect(() => {
    fetchAppVersion().then(setAppVersion);
  }, []);
  /** Increment to tell VisualizationTab to close the Edit Visualization panel (e.g. when filter panel expands). */
  const [closeVisualizationSettingsTrigger, setCloseVisualizationSettingsTrigger] = useState(0);
  /** Increment to tell VisualizationTab to open the Edit Visualization panel (e.g. when user clicks Edit in page toolbar). */
  const [openVisualizationSettingsTrigger, setOpenVisualizationSettingsTrigger] = useState(0);
  /** Increment to open the Insights side panel (same shell as edit). */
  const [openInsightsPanelTrigger, setOpenInsightsPanelTrigger] = useState(0);
  /** Track whether the Edit/Insights side panel is open (from VisualizationTab callback). */
  const [visualizationSettingsOpen, setVisualizationSettingsOpen] = useState(false);
  /** Which side panel view is active when open (for toolbar toggle styling). */
  const [visualizationPanelView, setVisualizationPanelView] = useState<"edit" | "insights">("edit");
  /** When opening the panel we also close edit viz; ignore the next stale onVisualizationSettingsChange(true) so the panel stays open. */
  const ignoreNextSettingsOpenRef = useRef(false);
  const onVisualizationSettingsChangeStable = useCallback((isOpen: boolean, view?: "edit" | "insights") => {
    setVisualizationSettingsOpen(isOpen);
    if (isOpen && view) {
      setVisualizationPanelView(view);
    }
    if (!isOpen) {
      setVisualizationPanelView("edit");
      // Expand-from-collapsed sets ignore only when a panel was open; clear when it actually closes
      // so we never leave the ref stuck true (no child callback when side panel was already closed).
      ignoreNextSettingsOpenRef.current = false;
    }
    if (isOpen) {
      if (ignoreNextSettingsOpenRef.current) {
        ignoreNextSettingsOpenRef.current = false;
        return;
      }
      setDrawerOpen(false);
    }
  }, []);
  const [activeTab, setActiveTab] = useState<
    "visualization" | "data" | "metadata"
  >("visualization");
  const [openShareTrigger, setOpenShareTrigger] = useState(0);
  const [isBookmarked, setIsBookmarked] = useState(false);
  const [loadedGalleryItem, setLoadedGalleryItem] = useState<GalleryItem | null>(null);
  const [galleryHydrating, setGalleryHydrating] = useState(false);
  const galleryHydrationCompleteRef = useRef(false);
  /** Indicator selection key at gallery bind time (after resolve). Used to detect real user indicator changes without false positives from metadata. */
  const galleryBoundSelectionKeyRef = useRef<string | null>(null);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [mobileFilterOpen, setMobileFilterOpen] = useState(false);
  /** Chart config from viz state (when URL has v=); passed to VisualizationTab so shared chart restores edits. */
  const [initialChartConfigFromUrl, setInitialChartConfigFromUrl] = useState<VisualizationConfig | null>(null);
  /** Settings sub-tab (Basic/Appearance/Typography) to show when Edit panel opens; restored on refresh. */
  const [initialEditSettingsTabFromSession, setInitialEditSettingsTabFromSession] = useState<"basic" | "colors" | "typography">("basic");
  /** Last viz settings synced from VisualizationTab; used for Data Table title/mapping and Share/Save when on data tab. */
  const [lastVizSettings, setLastVizSettings] = useState<VisualizationConfig | null>(null);
  /** When opening a share URL: 'resolving' = waiting for list APIs and resolving labels; then 'ready'. No share URL uses 'ready'. */
  const [shareHydrationStatus, setShareHydrationStatus] = useState<"idle" | "resolving" | "ready">("idle");
  const [saveToGallerySignInModalOpen, setSaveToGallerySignInModalOpen] = useState(false);
  /** Latest indicator list (id + nid) for resolving gid → nid when building Data API params. */
  const indicatorOptionsRef = useRef<IndicatorOption[]>([]);
  /** Ref to trigger chart image export (SVG/PNG/JPG) from toolbar when visualization tab is active. */
  const visualizationTabExportRef = useRef<VisualizationTabExportHandle>(null);
  /** Resolved area items for display when no area is selected but DWS_DEFAULT_AREA is set (chips + modal checked). */
  const [defaultAreaDisplayItems, setDefaultAreaDisplayItems] = useState<SelectedItem[] | null>(null);
  /** Guards the "repopulate time period options on refresh" fetch so we don't run overlapping requests. */
  const timePeriodOptionsFetchInFlightRef = useRef(false);
  /** Preserves effective (response-derived) subgroup display items during data loading to prevent tile flicker. */
  const lastEffectiveSubgroupsRef = useRef<SelectedItem[]>([]);
  /** Tracks the previous indicator set (sorted IDs) to detect indicator changes and clear stale time period selections. */
  const prevIndicatorIdsRef = useRef<string | null>(null);
  /** Dedupes metadata fetches: same key after chart data reload (e.g. time filter) should not refetch. */
  const metadataFetchedForIndicatorKeyRef = useRef<string | null>(null);
  /** Latest indicator key for metadata (avoids stale Promise.all resolution). */
  const indicatorKeyForMetadataRef = useRef<string>("");

  const [dataApiResponse, setDataApiResponse] = useState<VisualizerDataResponse | null>(null);
  const [dataLegacyData, setDataLegacyData] = useState<DataPoint[]>([]);
  const [dataLoading, setDataLoading] = useState(false);
  const [dataError, setDataError] = useState<string | null>(null);
  /** Full list of time periods from the last "unfiltered" data response (no time filter). Used for the time period selector options; only updated when indicator/area/subgroup change or when response had no time filter. */
  const [timePeriodOptionsFromData, setTimePeriodOptionsFromData] = useState<SelectedItem[] | null>(null);

  const searchParams = useSearchParams();
  const params = useParams();
  const pathname = usePathname() ?? "";
  const locale = (params?.locale as string) ?? "en";
  const { user } = useAuth();
  const { dataWarehouseId, t, getConfig } = useCore();
  const router = useRouter();
  const visualizerReturnUrl =
    pathname + (searchParams.toString() ? `?${searchParams.toString()}` : "");
  /** Return URL for save-to-gallery sign-in flow: includes param so we auto-run save after redirect. */
  const saveToGalleryReturnUrl =
    pathname +
    (searchParams.toString() ? `?${searchParams.toString()}&` : "?") +
    "pendingSaveToGallery=1";

  const hasShareParams = Boolean(
    searchParams.get("s") ||
    searchParams.get("v") ||
    searchParams.get("p") ||
    searchParams.get("indicator") ||
    searchParams.get("filters")
  );

  // Gallery hydration: when URL has ?gid= (and no share params), fetch the item and hydrate the visualizer.
  // When share params are also present, just fetch the item for bookmark state (share hydration handles state).
  useEffect(() => {
    const gid = searchParams.get("gid");
    if (!gid) {
      setLoadedGalleryItem(null);
      galleryHydrationCompleteRef.current = false;
      galleryBoundSelectionKeyRef.current = null;
      return;
    }

    if (hasShareParams) {
      let cancelled = false;
      getGalleryRepository()
        .getById(gid)
        .then((item) => { if (!cancelled) setLoadedGalleryItem(item ?? null); })
        .catch(() => { if (!cancelled) setLoadedGalleryItem(null); });
      return () => { cancelled = true; };
    }

    galleryHydrationCompleteRef.current = false;
    galleryBoundSelectionKeyRef.current = null;
    setGalleryHydrating(true);
    let cancelled = false;
    (async () => {
      try {
        const item = await getGalleryRepository().getById(gid);
        if (cancelled) return;
        if (!item) {
          const params = new URLSearchParams(searchParams.toString());
          params.delete("gid");
          const newQuery = params.toString();
          router.replace(pathname + (newQuery ? `?${newQuery}` : ""));
          setLoadedGalleryItem(null);
          galleryBoundSelectionKeyRef.current = null;
          return;
        }

        setLoadedGalleryItem(item);

        const selected =
          item.selectedComponents && Object.keys(item.selectedComponents).length > 0
            ? item.selectedComponents
            : buildSelectedComponentsFromItem(item);

        const [indicators, areaTree, subgroups] = await Promise.all([
          fetchIndicatorsFromBackend(locale, { dwId: dataWarehouseId }),
          fetchAreasTreeFromBackend(locale, { dwId: dataWarehouseId }),
          getCachedSubgroups(locale, dataWarehouseId),
        ]);
        if (cancelled) return;

        const flatAreas = areaTree.getFlat();
        const resolved = resolveSelectedComponentsLabels(selected, indicators, flatAreas, subgroups);

        setSelectedComponents(resolved);
        galleryBoundSelectionKeyRef.current = indicatorSelectionKey(resolved);
        setHydrationDone(true);

        if (item.vizSettings) {
          setInitialChartConfigFromUrl(item.vizSettings as VisualizationConfig);
          setLastVizSettings(item.vizSettings as VisualizationConfig);
        }
      } catch {
        if (!cancelled) {
          setLoadedGalleryItem(null);
          galleryBoundSelectionKeyRef.current = null;
          setHydrationDone(true);
        }
      } finally {
        if (!cancelled) {
          setGalleryHydrating(false);
          setTimeout(() => { galleryHydrationCompleteRef.current = true; }, 200);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [searchParams, hasShareParams, locale, dataWarehouseId, router, pathname]);

  /**
   * Gate that prevents the persist effect from running before session restore finishes.
   * Must be **state** (not a ref): state is captured in the effect closure, so even if a stale
   * render-1 effect leaks through, its closure sees `false` and skips. A ref is shared across
   * all renders and would let the stale closure through.
   */
  const [hydrationDone, setHydrationDone] = useState(false);

  /**
   * Restore sidebar + chart config from session/handoff synchronously (before paint).
   * `setSelectedComponents` + `setInitialChartConfigFromUrl` + `setHydrationDone` are
   * batched into one re-render by React 18. Gallery and share URLs are handled by their
   * own async effects which call `setHydrationDone`.
   */
  useLayoutEffect(() => {
    if (searchParams.get("gid") || searchParams.get("s") || searchParams.get("v")) {
      return;
    }
    const fromUrl = urlSearchParamsToSelectedComponents(searchParams);
    if (fromUrl && Object.keys(fromUrl).some((k) => (fromUrl[k as FilterSectionKey]?.length ?? 0) > 0)) {
      setHydrationDone(true);
      return;
    }
    const handoffChips = drainVizSearchHandoffChips();
    if (handoffChips && handoffChips.length > 0) {
      const next = chipsToSelectedComponents(handoffChips);
      setHasChipsFromSearch(true);
      setSelectedComponents(next);
      setVisualizerSelectionToSession(next);
      setHydrationDone(true);
      return;
    }
    if (!hasShareParams) {
      const saved = getVisualizerSelectionFromSession();
      if (saved && (saved.indicator?.length ?? 0) > 0) {
        setSelectedComponents(saved);
        const savedVizConfig = getVisualizerVizConfigFromSession();
        if (savedVizConfig) {
          setInitialChartConfigFromUrl(savedVizConfig);
          setLastVizSettings(savedVizConfig);
        }
        const ui = getVisualizerUiStateFromSession();
        if (ui) {
          setInitialEditSettingsTabFromSession(ui.editSettingsTab);
          if (ui.sidePanelOpen) {
            // Open the same side panel shell that was open pre-refresh.
            if (ui.sidePanelView === "insights") {
              setOpenInsightsPanelTrigger((n) => n + 1);
            } else {
              setOpenVisualizationSettingsTrigger((n) => n + 1);
            }
          }
        }
      } else {
        setSelectedComponents({});
        setHasChipsFromSearch(false);
        clearVizSearchHandoffFromSession();
      }
    }
    setHydrationDone(true);
  }, [searchParams, hasShareParams]);

  /** Persist sidebar to `dfa_visualizer_selection` whenever it changes — but only after hydration. */
  useEffect(() => {
    if (!hydrationDone) return;
    setVisualizerSelectionToSession(selectedComponents);
  }, [selectedComponents, hydrationDone]);

  /** Persist chart config to `dfa_visualizer_viz_config` whenever it changes — but only after hydration. */
  useEffect(() => {
    if (!hydrationDone) return;
    setVisualizerVizConfigToSession(lastVizSettings);
  }, [lastVizSettings, hydrationDone]);

  const filters = useMemo(
    () => selectedComponentsToFilters(selectedComponents),
    [selectedComponents]
  );
  const indicatorId = selectedComponents.indicator?.[0]?.id;
  // When metadata isn't loaded yet (fetch runs after chart data), use chip label for chart/tabs.
  const chipIndicatorLabel = selectedComponents.indicator?.[0]?.label;
  const currentIndicator = useMemo(() => {
    const fallback: Indicator | null =
      indicatorId && chipIndicatorLabel
        ? {
          id: String(indicatorId),
          name: chipIndicatorLabel,
          code: String(indicatorId),
          description: "",
          defaultTimeStart: 2020,
          defaultTimeEnd: 2024,
          defaultArea: "India",
          defaultSubgroup: "Total",
          unit: "",
          source: "",
          frequency: "",
          tags: [],
          aliases: [],
          definition: "",
          disaggregation: "",
          methodOfComputation: "",
        }
        : null;
    if (indicatorDetails) {
      const displayName =
        (indicatorDetails.name && indicatorDetails.name.trim()) || chipIndicatorLabel || indicatorDetails.name;
      return { ...indicatorDetails, name: displayName ?? indicatorDetails.name };
    }
    return fallback;
  }, [indicatorDetails, indicatorId, chipIndicatorLabel]);
  const hasFiltersApplied: boolean =
    filters.indicator.length > 0 ||
    (filters.area.length > 0 && filters.area[0] !== "India") ||
    (filters.subgroup.length > 0 && filters.subgroup[0] !== "Total") ||
    !!(filters.selectedYears && filters.selectedYears.length > 0);

  // Sync bookmark icon: ON when gid is present (gallery item loaded), else check findMatching by indicator.
  useEffect(() => {
    const gid = searchParams.get("gid");
    if (gid && loadedGalleryItem) {
      setIsBookmarked(true);
      return;
    }
    if (gid) return;
    if (!currentIndicator || (activeTab !== "visualization" && activeTab !== "data")) {
      setIsBookmarked(false);
      return;
    }
    const type = activeTab === "data" ? "table" : "visualization";
    getGalleryRepository()
      .findMatching({ indicatorId: currentIndicator.id, type })
      .then((matched) => setIsBookmarked(!!matched));
  }, [loadedGalleryItem, currentIndicator?.id, activeTab, searchParams]);

  /** True when we returned from sign-in with pending save; run save once then clear. */
  const [runSaveAfterSignIn, setRunSaveAfterSignIn] = useState(false);

  const persistPendingVizConfigForSignIn = useCallback(
    (preferred?: VisualizationConfig | null) => {
      const current =
        preferred ??
        visualizationTabExportRef.current?.getCurrentVizSettings() ??
        lastVizSettings ??
        null;
      setPendingVizConfigToSession(current);
    },
    [lastVizSettings]
  );

  const performSaveToGallery = useCallback(async () => {
    if (!currentIndicator) return;
    const type = activeTab === "data" ? "table" : "visualization";
    const repo = getGalleryRepository();
    const gid = searchParams.get("gid");

    if (gid && loadedGalleryItem) {
      await repo.remove(gid);
      setLoadedGalleryItem(null);
      setIsBookmarked(false);
      galleryHydrationCompleteRef.current = false;
      galleryBoundSelectionKeyRef.current = null;
      const params = new URLSearchParams(searchParams.toString());
      params.delete("gid");
      const newQuery = params.toString();
      router.replace(pathname + (newQuery ? `?${newQuery}` : ""));
      return;
    }

    const matched = await repo.findMatching({
      indicatorId: currentIndicator.id,
      type,
    });
    if (matched) {
      await repo.remove(matched.id);
      setIsBookmarked(false);
    } else {
      const timeRange = getTimeRangeFromSelection(selectedComponents.timePeriod);
      const hasExplicitTimePeriod =
        (selectedComponents.timePeriod?.length ?? 0) > 0;
      const baseFilters = {
        ...filters,
        area: selectedComponents.area?.map((a) => a.id) ?? [],
        subgroup: selectedComponents.subgroup?.map((s) => s.id) ?? [],
      };
      const filtersWithTime =
        hasExplicitTimePeriod && timeRange
          ? {
              ...baseFilters,
              timeStart: timeRange.timeStart,
              timeEnd: timeRange.timeEnd,
            }
          : {
              ...baseFilters,
              timeStart: hasExplicitTimePeriod ? filters.timeStart : null,
              timeEnd: hasExplicitTimePeriod ? filters.timeEnd : null,
            };
      const indicatorWithTime =
        timeRange && currentIndicator
          ? {
              ...currentIndicator,
              defaultTimeStart: timeRange.defaultTimeStart,
              defaultTimeEnd: timeRange.defaultTimeEnd,
            }
          : currentIndicator;
      const vizSettings =
        visualizationTabExportRef.current?.getCurrentVizSettings() ??
        lastVizSettings ??
        null;
      const previewData =
        activeTab === "visualization"
          ? visualizationTabExportRef.current?.getCurrentChartData() ?? null
          : null;
      const newItem = await repo.add({
        type,
        indicator: indicatorWithTime as unknown as GalleryItem["indicator"],
        filters: filtersWithTime,
        selectedComponents,
        vizSettings: vizSettings ?? undefined,
        previewData: previewData ?? undefined,
        isDynamic: false,
        chartType: vizSettings?.chartType,
        dataWarehouseId,
      });
      setIsBookmarked(true);
      setLoadedGalleryItem(newItem);
      galleryHydrationCompleteRef.current = true;
      galleryBoundSelectionKeyRef.current = indicatorSelectionKey(selectedComponents);
      const params = new URLSearchParams(searchParams.toString());
      params.set("gid", newItem.id);
      router.replace(pathname + `?${params.toString()}`);
    }
  }, [
    currentIndicator,
    activeTab,
    loadedGalleryItem,
    filters,
    selectedComponents,
    lastVizSettings,
    dataWarehouseId,
    searchParams,
    pathname,
    router,
  ]);

  // After redirect from sign-in with ?pendingSaveToGallery=1, run save once and drop the param.
  useEffect(() => {
    if (!user || !currentIndicator) return;
    if (searchParams.get("pendingSaveToGallery") !== "1") return;
    const pendingViz = getPendingVizConfigFromSession();
    if (pendingViz) {
      // Restore the same viz config (colors/chart options) before auto-saving to gallery.
      setInitialChartConfigFromUrl((prev) => prev ?? pendingViz);
      setLastVizSettings((prev) => prev ?? pendingViz);
    }
    const params = new URLSearchParams(searchParams.toString());
    params.delete("pendingSaveToGallery");
    const newQuery = params.toString();
    router.replace(pathname + (newQuery ? `?${newQuery}` : ""));
    setRunSaveAfterSignIn(true);
  }, [user, currentIndicator, pathname, router, searchParams]);

  useEffect(() => {
    if (!runSaveAfterSignIn || !user || !currentIndicator) return;
    const t = setTimeout(() => {
      performSaveToGallery()
        .then(() => {
          clearPendingVizConfigFromSession();
          setRunSaveAfterSignIn(false);
        })
        .catch(() => {
          clearPendingVizConfigFromSession();
          setRunSaveAfterSignIn(false);
        });
    }, 500);
    return () => clearTimeout(t);
  }, [runSaveAfterSignIn, user, currentIndicator, performSaveToGallery]);

  // Auto-PATCH: when a gallery item is loaded and the user edits filters/chart, debounce-save changes back.
  // If the indicator changes, disconnect from the gallery item instead of overwriting.
  useEffect(() => {
    const gid = searchParams.get("gid");
    if (!gid || !loadedGalleryItem || !galleryHydrationCompleteRef.current) return;
    if (!currentIndicator) return;

    const keyBound = galleryBoundSelectionKeyRef.current;
    const keyNow = indicatorSelectionKey(selectedComponents);
    if (
      keyBound != null &&
      keyBound !== "" &&
      keyNow !== "" &&
      keyNow !== keyBound
    ) {
      galleryHydrationCompleteRef.current = false;
      galleryBoundSelectionKeyRef.current = null;
      setLoadedGalleryItem(null);
      setIsBookmarked(false);
      const params = new URLSearchParams(searchParams.toString());
      params.delete("gid");
      const newQuery = params.toString();
      router.replace(pathname + (newQuery ? `?${newQuery}` : ""));
      return;
    }

    const timer = setTimeout(async () => {
      try {
        const vizSettings =
          visualizationTabExportRef.current?.getCurrentVizSettings() ??
          lastVizSettings ??
          null;
        const previewData =
          activeTab === "visualization"
            ? visualizationTabExportRef.current?.getCurrentChartData() ?? null
            : null;
        const timeRange = getTimeRangeFromSelection(selectedComponents.timePeriod);
        const hasExplicitTimePeriod = (selectedComponents.timePeriod?.length ?? 0) > 0;
        const patchFilters = {
          area: selectedComponents.area?.map((a) => a.id) ?? [],
          subgroup: selectedComponents.subgroup?.map((s) => s.id) ?? [],
          timeStart: hasExplicitTimePeriod ? (timeRange?.timeStart ?? filters.timeStart ?? null) : null,
          timeEnd: hasExplicitTimePeriod ? (timeRange?.timeEnd ?? filters.timeEnd ?? null) : null,
        };

        await getGalleryRepository().update(gid, {
          indicator: currentIndicator as unknown as GalleryItem["indicator"],
          filters: patchFilters,
          selectedComponents,
          vizSettings: vizSettings ?? undefined,
          previewData: previewData ?? undefined,
          isDynamic: false,
        });
      } catch {
        // silent — background save failure is non-critical
      }
    }, 3000);

    return () => clearTimeout(timer);
  }, [
    searchParams,
    loadedGalleryItem,
    currentIndicator,
    filters,
    selectedComponents,
    lastVizSettings,
    activeTab,
    pathname,
    router,
  ]);

  // When URL has share params: wait for list APIs, resolve ids to names, then set state. Blocks render until ready.
  useEffect(() => {
    if (!hasShareParams) {
      setShareHydrationStatus("ready");
      return;
    }
    setShareHydrationStatus("resolving");
    let cancelled = false;

    const finishHydration = () => { setHydrationDone(true); };

    (async () => {
      let selected: SelectedComponents;
      let chartConfig: VisualizationConfig | null = null;
      const s = searchParams.get("s");
      const v = searchParams.get("v");
      if (s) {
        const decoded = decodeShareState(s);
        if (!decoded) {
          if (!cancelled) { finishHydration(); setShareHydrationStatus("ready"); }
          return;
        }
        selected = fetchParamsToSelectedComponents(decoded.fetchParams);
        if (Object.keys(selected).length === 0) {
          if (!cancelled) { finishHydration(); setShareHydrationStatus("ready"); }
          return;
        }
        chartConfig = decoded.chartConfig;
      } else if (v) {
        const origin = typeof window !== "undefined" ? window.location.origin : "";
        const raw = await fetch(`${origin}/api/proxy/share-links/${encodeURIComponent(v)}`)
          .then((r) => (r.ok ? r.json() : null));
        const data = (raw?.data ?? raw) as { fetchParams?: MinimalSharePayload; chartConfig?: VisualizationConfig } | null;
        if (cancelled) return;
        if (!data?.fetchParams || !data?.chartConfig) {
          if (!cancelled) { finishHydration(); setShareHydrationStatus("ready"); }
          return;
        }
        selected = fetchParamsToSelectedComponents(data.fetchParams);
        chartConfig = data.chartConfig;
      } else {
        const fromUrl = urlSearchParamsToSelectedComponents(searchParams);
        if (!fromUrl || !Object.keys(fromUrl).some((k) => (fromUrl[k as FilterSectionKey]?.length ?? 0) > 0)) {
          if (!cancelled) { finishHydration(); setShareHydrationStatus("ready"); }
          return;
        }
        selected = fromUrl;
      }
      if (cancelled) return;
      const [indicators, areaTree, subgroups] = await Promise.all([
        fetchIndicatorsFromBackend(locale, { dwId: dataWarehouseId }),
        fetchAreasTreeFromBackend(locale, { dwId: dataWarehouseId }),
        getCachedSubgroups(locale, dataWarehouseId),
      ]);
      if (cancelled) return;
      const flatAreas = areaTree.getFlat();
      const resolved = resolveSelectedComponentsLabels(selected, indicators, flatAreas, subgroups);
      if (cancelled) return;
      setSelectedComponents(resolved);
      finishHydration();
      if (chartConfig) {
        setInitialChartConfigFromUrl(chartConfig);
        setLastVizSettings(chartConfig);
      }
      setShareHydrationStatus("ready");
    })();
    return () => {
      cancelled = true;
    };
  }, [searchParams, hasShareParams, locale, dataWarehouseId]);

  // When no area is selected and DWS_DEFAULT_AREA is set, fetch area tree and resolve default area ids to items for chips and modal.
  const hasUserAreaSelection = (selectedComponents.area?.length ?? 0) > 0;
  useEffect(() => {
    if (hasUserAreaSelection) {
      setDefaultAreaDisplayItems(null);
      return;
    }
    const defaultAreaStr = getConfig("DWS_DEFAULT_AREA").trim();
    if (!defaultAreaStr) {
      setDefaultAreaDisplayItems([]);
      return;
    }
    let cancelled = false;
    fetchAreasTreeFromBackend(locale, { dwId: dataWarehouseId }).then((areaTree) => {
      if (cancelled) return;
      const flatAreas = areaTree.getFlat();
      const areaById = new Map(flatAreas.map((a) => [String(a.id), a]));
      const areaByNid = new Map(flatAreas.filter((a) => a.nid != null).map((a) => [a.nid!, a]));
      const tokens = defaultAreaStr.split(",").map((s) => s.trim()).filter(Boolean);
      const items: SelectedItem[] = [];
      for (const token of tokens) {
        const area = areaById.get(token) ?? (isNumericId(token) ? areaByNid.get(Number(token)) : undefined);
        if (area) items.push({ id: area.id, label: area.label, ...(area.nid != null ? { nid: area.nid } : {}) });
      }
      setDefaultAreaDisplayItems(items);
    }).catch(() => {
      if (!cancelled) setDefaultAreaDisplayItems([]);
    });
    return () => {
      cancelled = true;
    };
  }, [hasUserAreaSelection, getConfig, locale, dataWarehouseId]);

  const buildDataApiParams = useCallback(
    (f: FilterValues, selected: SelectedComponents): DataApiParams => {
      const params = buildDataApiParamsShared(f, selected, {
        indicatorNidResolver: (id) =>
          indicatorOptionsRef.current.find((o) => String(o.id) === String(id))?.nid,
      });
      // Use default area only when user has never set area (undefined). Empty array means user explicitly cleared area.
      if (selected.area == null) {
        const defaultArea = getConfig("DWS_DEFAULT_AREA").trim();
        if (defaultArea) params.ar_identifier = defaultArea;
      }
      return params;
    },
    [getConfig]
  );

  // Clear stored time period options when indicator, area, or subgroup change so we refill from the next data response.
  useEffect(() => {
    setTimePeriodOptionsFromData(null);
  }, [
    selectedComponents.indicator,
    selectedComponents.area,
    selectedComponents.subgroup,
  ]);

  // When the indicator set changes (add/remove) AFTER hydration, clear the explicit time
  // period selection so the panel tiles fall back to chart-derived time periods.
  // Gated by `hydrationDone` so the initial handoff→selectedComponents transition does not
  // count as "indicator changed" and wipe the time period that came with the handoff.
  useEffect(() => {
    if (!hydrationDone) return;
    const currentIds = (selectedComponents.indicator ?? [])
      .map((i) => String(i.id))
      .sort()
      .join(",");
    if (prevIndicatorIdsRef.current !== null && currentIds !== prevIndicatorIdsRef.current) {
      setSelectedComponents((prev) => ({
        ...prev,
        timePeriod: undefined,
      }));
    }
    prevIndicatorIdsRef.current = currentIds;
  }, [selectedComponents.indicator, setSelectedComponents, hydrationDone]);

  // On refresh (or any load) when indicator + time period are restored but options list is empty,
  // fetch data API without time filter to repopulate time period options from the same source as "selecting indicator from scratch".
  useEffect(() => {
    const hasIndicator = filters.indicator.length > 0;
    const hasTimeFilter = (selectedComponents.timePeriod?.length ?? 0) > 0;
    if (!hasIndicator || !hasTimeFilter || timePeriodOptionsFromData != null) return;
    if (timePeriodOptionsFetchInFlightRef.current) return;

    timePeriodOptionsFetchInFlightRef.current = true;
    let cancelled = false;
    const selectedWithoutTime: SelectedComponents = { ...selectedComponents, timePeriod: undefined };
    const filtersWithoutTime = selectedComponentsToFilters(selectedWithoutTime);
    const apiParams = buildDataApiParams(filtersWithoutTime, selectedWithoutTime);
    fetchDataApi(apiParams, { acceptLanguage: locale, dwId: dataWarehouseId })
      .then((res) => {
        if (cancelled) return;
        if (isDataApiError(res)) return;
        const vizResponse = dataApiResponseToVisualizerDataResponse(res);
        if (!vizResponse?.rows?.length) return;
        const seen = new Map<string, SelectedItem>();
        for (const r of vizResponse.rows) {
          const id = r.timePeriodId ?? r.timePeriodName ?? "";
          if (id && !seen.has(id)) {
            seen.set(id, { id, label: r.timePeriodName ?? r.timePeriodId ?? id });
          }
        }
        if (!cancelled && seen.size > 0) setTimePeriodOptionsFromData([...seen.values()]);
      })
      .catch(() => { /* ignore; modal will fall back to time-periods API if needed */ })
      .finally(() => {
        timePeriodOptionsFetchInFlightRef.current = false;
      });

    return () => {
      cancelled = true;
    };
  }, [
    filters.indicator.length,
    selectedComponents,
    timePeriodOptionsFromData,
    buildDataApiParams,
    locale,
    dataWarehouseId,
  ]);

  useEffect(() => {
    if (filters.indicator.length === 0) {
      setDataApiResponse(null);
      setDataLegacyData([]);
      setDataError(null);
      return;
    }

    // Clear previous response immediately so we never show a stale chart when selection changes
    // (e.g. user cleared filters then selected again: without this, one frame can show old data).
    setDataApiResponse(null);
    setDataLegacyData([]);

    // Use saved snapshot data when this view was opened from a snapshot gallery item and selection matches.
    const itemArea = (loadedGalleryItem?.filters?.area ?? []).slice().sort();
    const curArea = (filters.area ?? []).slice().sort();
    const areaMatch = itemArea.length === curArea.length && itemArea.every((id, i) => id === curArea[i]);
    const itemSubgroup = (loadedGalleryItem?.filters?.subgroup ?? []).slice().sort();
    const curSubgroup = (filters.subgroup ?? []).slice().sort();
    const subgroupMatch = itemSubgroup.length === curSubgroup.length && itemSubgroup.every((id, i) => id === curSubgroup[i]);
    // Narrow previewData to LineBarAreaData only — heatmap snapshots fall through to a fresh API fetch.
    const lineBarPreviewData =
      loadedGalleryItem?.previewData && isLineBarAreaData(loadedGalleryItem.previewData)
        ? loadedGalleryItem.previewData
        : null;
    const useSnapshot =
      lineBarPreviewData &&
      loadedGalleryItem?.indicator?.id === filters.indicator[0] &&
      String(loadedGalleryItem?.filters?.timeStart) === String(filters.timeStart) &&
      String(loadedGalleryItem?.filters?.timeEnd) === String(filters.timeEnd) &&
      areaMatch &&
      subgroupMatch;

    if (useSnapshot && lineBarPreviewData && loadedGalleryItem?.indicator) {
      const mapping: SnapshotAxisMapping =
        (loadedGalleryItem.vizSettings?.mapping as SnapshotAxisMapping | undefined) ?? {
          xDimension: "time",
          seriesDimension: null,
        };
      setDataLoading(false);
      setDataError(null);
      setDataApiResponse(
        previewDataToVisualizerResponse(
          lineBarPreviewData,
          { id: loadedGalleryItem.indicator.id, name: loadedGalleryItem.indicator.name ?? loadedGalleryItem.indicator.id },
          mapping
        )
      );
      setDataLegacyData(
        previewDataToLegacyDataPoints(
          lineBarPreviewData,
          { id: loadedGalleryItem.indicator.id, name: loadedGalleryItem.indicator.name ?? loadedGalleryItem.indicator.id },
          mapping
        )
      );
      return;
    }

    let cancelled = false;
    const hadTimeFilter = (selectedComponents.timePeriod?.length ?? 0) > 0;
    setDataLoading(true);
    setDataError(null);
    const apiParams = buildDataApiParams(filters, selectedComponents);
    fetchDataApi(apiParams, { acceptLanguage: locale, dwId: dataWarehouseId })
      .then((res) => {
        if (cancelled) return;
        if (isDataApiError(res)) {
          setDataApiResponse(null);
          setDataLegacyData([]);
          setDataError(res.err_message || res.errors?.code || t("VISUALIZER_DATA_FETCH_FAILED"));
          return;
        }
        const vizResponse = dataApiResponseToVisualizerDataResponse(res);
        
        setDataApiResponse(vizResponse);
        setDataLegacyData(dataApiResponseToLegacyDataPoints(res));
        setDataError(null);
        if (!hadTimeFilter && vizResponse?.rows?.length) {
          const seen = new Map<string, SelectedItem>();
          for (const r of vizResponse.rows) {
            const id = r.timePeriodId ?? r.timePeriodName ?? "";
            if (id && !seen.has(id)) {
              seen.set(id, { id, label: r.timePeriodName ?? r.timePeriodId ?? id });
            }
          }
          if (!cancelled) setTimePeriodOptionsFromData([...seen.values()]);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setDataApiResponse(null);
          setDataLegacyData([]);
          setDataError(t("VISUALIZER_DATA_NETWORK_ERROR"));
        }
      })
      .finally(() => {
        if (!cancelled) setDataLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [filters, selectedComponents, loadedGalleryItem, buildDataApiParams, locale, dataWarehouseId, t]);

  const indicatorKeyForMetadata = useMemo(
    () => indicatorSelectionKey(selectedComponents),
    [selectedComponents.indicator]
  );
  indicatorKeyForMetadataRef.current = indicatorKeyForMetadata;

  const chartDataReadyForMetadata =
    !dataLoading && !dataError && dataApiResponse !== null;

  // Drop stale indicator metadata when the selected indicator set changes (before new chart data arrives).
  useEffect(() => {
    setIndicatorMetadataList([]);
    setIndicatorDetails(null);
    metadataFetchedForIndicatorKeyRef.current = null;
  }, [indicatorKeyForMetadata]);

  // Fetch indicator metadata (?metadata=true) after chart data has loaded; sets indicatorDetails from the first indicator.
  // Uses query-based API: /indicators?i_identifier=...&u_identifier=...&metadata=true
  useEffect(() => {
    const indicators = selectedComponents.indicator ?? [];
    if (indicators.length === 0) {
      setMetadataLoading(false);
      return;
    }
    if (!chartDataReadyForMetadata) {
      setMetadataLoading(true);
      return;
    }
    if (metadataFetchedForIndicatorKeyRef.current === indicatorKeyForMetadata) {
      setMetadataLoading(false);
      return;
    }

    setMetadataLoading(true);
    let cancelled = false;
    const fetchKey = indicatorKeyForMetadata;
    const baseUrl = getReferenceApiClientBaseUrl(dataWarehouseId);
    // Metadata is indicator-specific (not unit-specific), so collapse multiple
    // selected units of the same indicator to a single entry. This avoids duplicate
    // React keys (key={indicator.id}) and redundant metadata sections/fetches.
    const seenIndicatorKeys = new Set<string>();
    const uniqueIndicators = indicators.filter((item) => {
      const itemBaseId = item.id.includes("_") ? item.id.split("_")[0] : item.id;
      const dedupeKey = item.nid != null ? `nid:${item.nid}` : `gid:${itemBaseId}`;
      if (seenIndicatorKeys.has(dedupeKey)) return false;
      seenIndicatorKeys.add(dedupeKey);
      return true;
    });
    const fetches = uniqueIndicators.map((item) => {
      // Extract base indicator identifier (NID preferred, fallback to id without unit suffix)
      const baseId = item.id.includes("_") ? item.id.split("_")[0] : item.id;
      const identifier = item.nid != null ? String(item.nid) : baseId;
      
      // Build query params for the list endpoint
      const params = new URLSearchParams();
      params.set("i_identifier", identifier);
      params.set("metadata", "true");
      // NOTE: Metadata is indicator-specific, not unit-specific, so we don't include u_identifier
      
      const url = `${baseUrl}${REFERENCE_PATH_INDICATORS}?${params.toString()}`;
      return apiGet<IndicatorWithMetaEnvelope>(url, { acceptLanguage: locale })
        .then((result): { indicator: Indicator; metadata: Record<string, MetadataReportItem> | null } => {
          if (result.ok && result.data) {
            const envelope = result.data as unknown as IndicatorWithMetaEnvelope;
            // Handle both single object and array response from list endpoint
            const indicatorData = Array.isArray(envelope.data) ? envelope.data[0] : envelope.data;
            if (!indicatorData) {
              return {
                indicator: { id: item.id, name: item.label, code: item.id, description: "", defaultTimeStart: 2020, defaultTimeEnd: 2024, defaultArea: "", defaultSubgroup: "", unit: item.unitName ?? "", source: "", frequency: "", tags: [], aliases: [] },
                metadata: null,
              };
            }
            const ind = apiIndicatorToIndicator(indicatorData);
            // Use unitName from selection if available (more specific than API default)
            if (item.unitName && !ind.unit) {
              ind.unit = item.unitName;
            }
            const meta = envelope.meta?.metadata ?? null;
            return { indicator: ind, metadata: meta };
          }
          return {
            indicator: { id: item.id, name: item.label, code: item.id, description: "", defaultTimeStart: 2020, defaultTimeEnd: 2024, defaultArea: "", defaultSubgroup: "", unit: item.unitName ?? "", source: "", frequency: "", tags: [], aliases: [] },
            metadata: null,
          };
        })
        .catch((): { indicator: Indicator; metadata: Record<string, MetadataReportItem> | null } => ({
          indicator: { id: item.id, name: item.label, code: item.id, description: "", defaultTimeStart: 2020, defaultTimeEnd: 2024, defaultArea: "", defaultSubgroup: "", unit: item.unitName ?? "", source: "", frequency: "", tags: [], aliases: [] },
          metadata: null,
        }));
    });
    Promise.all(fetches)
      .then((results) => {
        if (cancelled) return;
        if (fetchKey !== indicatorKeyForMetadataRef.current) return;
        metadataFetchedForIndicatorKeyRef.current = fetchKey;
        setIndicatorMetadataList(results);
        if (results.length > 0) {
          setIndicatorDetails(results[0].indicator);
        }
      })
      .finally(() => {
        if (!cancelled && fetchKey === indicatorKeyForMetadataRef.current) {
          setMetadataLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [
    selectedComponents.indicator,
    locale,
    dataWarehouseId,
    chartDataReadyForMetadata,
    indicatorKeyForMetadata,
  ]);

  const apiResponse = dataApiResponse;
  const legacyData = dataLegacyData;

  // Show actual number of data points from the API response, not a product of filter cardinalities.
  const dataPointsCount = apiResponse?.rows?.length ?? legacyData?.length ?? 0;

  // When user selected no subgroup, show effective subgroup(s) from API response (default subgroup) in tile and modal.
  const effectiveSubgroupsFromResponse = useMemo(() => {
    if (!apiResponse?.rows?.length || (selectedComponents.subgroup?.length ?? 0) > 0) return [];
    const seen = new Map<string, string>();
    for (const r of apiResponse.rows) {
      if (r.subgroupId && !seen.has(r.subgroupId)) {
        seen.set(r.subgroupId, r.subgroupName || r.subgroupId);
      }
    }
    return [...seen.entries()].map(([id, label]) => ({ id, label }));
  }, [apiResponse?.rows, selectedComponents.subgroup?.length]);

  // Cache last non-empty effective subgroups so tiles stay stable during data loading (prevents flicker).
  useEffect(() => {
    if (effectiveSubgroupsFromResponse.length > 0) {
      lastEffectiveSubgroupsRef.current = effectiveSubgroupsFromResponse;
    } else if ((selectedComponents.indicator?.length ?? 0) === 0) {
      lastEffectiveSubgroupsRef.current = [];
    }
  }, [effectiveSubgroupsFromResponse, selectedComponents.indicator?.length]);

  const subgroupItemsForDisplay =
    (selectedComponents.subgroup?.length ?? 0) > 0
      ? selectedComponents.subgroup ?? []
      : effectiveSubgroupsFromResponse.length > 0
        ? effectiveSubgroupsFromResponse
        : dataLoading && (selectedComponents.indicator?.length ?? 0) > 0
          ? lastEffectiveSubgroupsRef.current
          : [];

  /** Area items for chips and modal: when no indicator, show none; when area is undefined use default; when area is [] or has items use that ([] = user cleared). */
  const areaItemsForDisplay: SelectedItem[] =
    (selectedComponents.indicator?.length ?? 0) === 0
      ? []
      : selectedComponents.area === undefined
        ? (defaultAreaDisplayItems ?? [])
        : (selectedComponents.area ?? []);

  /** Time periods present in current chart data; used only for chip display when user has no explicit selection. */
  const timePeriodsFromChartData = useMemo(() => {
    const rows = apiResponse?.rows;
    if (!rows?.length) return undefined;
    const seen = new Map<string, { id: string; label: string }>();
    for (const r of rows) {
      const id = r.timePeriodId ?? r.timePeriodName ?? "";
      if (id && !seen.has(id)) {
        seen.set(id, { id, label: r.timePeriodName ?? r.timePeriodId ?? id });
      }
    }
    const list = [...seen.values()];
    return list.length > 0 ? list : undefined;
  }, [apiResponse?.rows]);

  /** Chips for the time period filter section: shows user's explicit selection, or effective time periods from chart when no selection. */
  const timePeriodItemsForDisplay =
    (selectedComponents.timePeriod?.length ?? 0) > 0
      ? selectedComponents.timePeriod ?? []
      : (timePeriodsFromChartData ?? []);

  /**
   * Full time period options list for the selector modal.
   * Only set from a "full" (no time filter) data response so it always contains all available years.
   * When null (not yet set, or context changed), the modal falls back to fetching from the time-periods API,
   * ensuring the complete list is always shown regardless of any active time filter.
   * Never falls back to timePeriodsFromChartData so a filtered chart response never narrows the options.
   */
  const timePeriodOptionsForFilter = timePeriodOptionsFromData;

  /** Chart title for Data Table when lastVizSettings not yet synced; matches VisualizationTab derivedTitle. */
  const derivedChartTitle = useMemo(() => {
    const indicatorPart = selectedComponents.indicator?.length
      ? selectedComponents.indicator.map((i) => i.label).join(", ")
      : (currentIndicator?.name ?? "Chart Title");
    const subgroupPart =
      selectedComponents.subgroup?.length === 1
        ? selectedComponents.subgroup[0].label
        : apiResponse?.rows?.length
          ? (() => {
            const names = [...new Set(apiResponse.rows.map((r) => r.subgroupName))].filter(Boolean);
            return names.length === 1 ? names[0] : undefined;
          })()
          : undefined;
    const areaPart = filters.area?.length === 1 ? filters.area[0] : undefined;
    const parts = [indicatorPart, subgroupPart, areaPart].filter(Boolean);
    return parts.length > 0 ? parts.join(", ") : "Chart Title";
  }, [selectedComponents.indicator, selectedComponents.subgroup, currentIndicator?.name, filters.area, apiResponse?.rows]);

  /** Mapping for Data Table (rows = series, columns = x); same as chart. */
  const dataTableMapping = useMemo((): AxisSeriesMapping | null => {
    if (!apiResponse?.rows?.length) return null;
    const defaultConfig = getDefaultChartConfig(apiResponse);
    return {
      xDimension: defaultConfig.xDimension,
      seriesDimension: defaultConfig.seriesDimension,
      seriesDimension2: defaultConfig.seriesDimension2 ?? undefined,
    };
  }, [apiResponse]);
  const dataTableMappingResolved: AxisSeriesMapping | null =
    lastVizSettings?.mapping
      ? {
        xDimension: lastVizSettings.mapping.xDimension,
        seriesDimension: lastVizSettings.mapping.seriesDimension,
        seriesDimension2: lastVizSettings.mapping.seriesDimension2 ?? undefined,
      }
      : dataTableMapping;

  const insightsActive = visualizationSettingsOpen && visualizationPanelView === "insights";

  const handleInsightsClick = useCallback(() => {
    if (visualizationSettingsOpen && visualizationPanelView === "insights") {
      setCloseVisualizationSettingsTrigger((c) => c + 1);
    } else {
      if (activeTab !== "visualization") {
        setActiveTab("visualization");
      }
      setOpenInsightsPanelTrigger((n) => n + 1);
    }
  }, [visualizationSettingsOpen, visualizationPanelView, activeTab]);

  const handleToolbarDataExport = async (format: "csv" | "xlsx" | "json") => {
    const rows = apiResponse?.rows ?? [];
    if (rows.length === 0) return;
    const payload = buildExportPayloadFromRows(rows, filters);
    if (!payload) return;
    const filename = getExportFilename(
      payload.meta.indicatorCode,
      payload.meta.timeStart,
      payload.meta.timeEnd,
      format
    );
    if (format === "csv") {
      downloadCSV(payload, filename);
    } else if (format === "json") {
      downloadJSON(payload, filename);
    } else {
      await downloadXLSX(payload, filename);
    }
    setShowExportMenu(false);
  };

  const handleCopyMetadata = () => {
    const notAvailable = t("VISUALIZER_METADATA_NOT_AVAILABLE");

    const stripHtml = (html: string): string => {
      if (typeof document !== "undefined") {
        const div = document.createElement("div");
        div.innerHTML = html;
        return div.textContent ?? div.innerText ?? "";
      }
      return html.replace(/<[^>]*>/g, "");
    };

    const blocks: string[] = [];

    if (indicatorMetadataList.length > 0) {
      for (const item of indicatorMetadataList) {
        if (item.metadata && Object.keys(item.metadata).length > 0) {
          const sortedEntries = Object.values(item.metadata).sort((a, b) => a.mt_catg_order - b.mt_catg_order);
          const sections = sortedEntries.map(
            (entry) => `${entry.mt_catg_name}\n${stripHtml(entry.mt_rpt_metadata)}`
          );
          blocks.push(`Indicator: ${item.indicator.name}

${sections.join("\n\n")}`);
        } else {
          blocks.push(`Indicator: ${item.indicator.name}

Definition
${item.indicator.definition ?? item.indicator.description ?? notAvailable}

Unit
${item.indicator.unit ?? notAvailable}

Source
${item.indicator.source ?? notAvailable}

Disaggregation
${item.indicator.disaggregation ?? notAvailable}

Method of Computation
${item.indicator.methodOfComputation ?? notAvailable}`);
        }
      }
    } else if (currentIndicator) {
      blocks.push(`Indicator: ${currentIndicator.name}

Definition
${currentIndicator.definition ?? currentIndicator.description ?? notAvailable}

Unit
${currentIndicator.unit ?? notAvailable}

Source
${currentIndicator.source ?? notAvailable}

Disaggregation
${currentIndicator.disaggregation ?? notAvailable}

Method of Computation
${currentIndicator.methodOfComputation ?? notAvailable}`);
    }

    if (blocks.length === 0) return;

    const metadataText = blocks.join("\n\n———\n\n");

    navigator.clipboard
      .writeText(metadataText)
      .then(() => alert(t("VISUALIZER_METADATA_COPY_SUCCESS")))
      .catch(() => alert(t("VISUALIZER_METADATA_COPY_FAILED")));
  };

  function handleApply(items: { id: string | number; label: string; nid?: number; unitGid?: string; unitName?: string }[]) {
    const normalized: SelectedItem[] = items.map(({ id, label, nid, unitGid, unitName }) => ({
      id: String(id),
      label,
      ...(nid != null ? { nid } : {}),
      ...(unitGid != null ? { unitGid } : {}),
      ...(unitName != null ? { unitName } : {}),
    }));
    setSelectedItems(normalized);
    setSelectedComponents((prev) => ({
      ...prev,
      indicator: normalized.length ? normalized : undefined,
    }));
  }

  function handleApplyArea(items: { id: string; label: string; nid?: number }[]) {
    const normalized: SelectedItem[] = items.map(({ id, label, nid }) => ({
      id: String(id),
      label,
      ...(nid != null ? { nid } : {}),
    }));
    setSelectedComponents((prev) => ({
      ...prev,
      area: normalized.length ? normalized : undefined,
    }));
  }

  function handleApplySubgroup(items: { id: string | number; label: string; nid?: number }[]) {
    const normalized: SelectedItem[] = items.map(({ id, label, nid }) => ({
      id: String(id),
      label,
      ...(nid != null ? { nid } : {}),
    }));
    setSelectedComponents((prev) => ({
      ...prev,
      subgroup: normalized.length ? normalized : undefined,
    }));
  }

  function handleApplyTimePeriod(items: { id: string | number; label: string; nid?: number }[]) {
    const normalized: SelectedItem[] = items.map(({ id, label, nid }) => ({
      id: String(id),
      label,
      ...(nid != null ? { nid } : {}),
    }));
    setSelectedComponents((prev) => ({
      ...prev,
      timePeriod: normalized.length ? normalized : undefined,
    }));
  }

  const handleReset = () => {
    setSelectedComponents({});
    setSelectedItems([]);
  };

  const totalSelections =
    (selectedComponents.indicator?.length ?? 0) +
    (selectedComponents.area?.length ?? 0) +
    (selectedComponents.subgroup?.length ?? 0) +
    (selectedComponents.timePeriod?.length ?? 0);

  useEffect(() => {
    if (mobileFilterOpen) {
      const prev = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = prev;
      };
    }
  }, [mobileFilterOpen]);

  if ((hasShareParams && shareHydrationStatus !== "ready") || galleryHydrating) {
    return (
      <div
        className="flex flex-1 min-h-0 h-full items-center justify-center bg-surface-muted"
        aria-busy
        aria-label={t("VISUALIZER_ARIA_LOADING_DATA")}
      >
        <Loader ariaLabel={t("VISUALIZER_ARIA_LOADING_DATA")} loadingLabel={t("COMMON_LOADING")} />
      </div>
    );
  }

  return (
    <div
      className="flex flex-1 min-h-0 h-full overflow-hidden bg-surface-muted"
    >
      {/* Filter drawer (side panel) — hidden on mobile, replaced by bottom-sheet */}
      <aside
        className="filter-panel max-md:hidden flex-shrink-0 border-r rtl:border-r-0 rtl:border-l border-border transition-[width] duration-200 ease-out"
        style={{
          width: drawerOpen
            ? `var(--width-sidebar, ${SIDEBAR_WIDTH_FALLBACK_PX}px)`
            : DRAWER_WIDTH_COLLAPSED,
        }}
      >
        {drawerOpen ? (
          <div className="flex h-full flex-col">
            <div className="flex items-center justify-between gap-2 px-4 py-3">
              <button
                type="button"
                onClick={() => setDrawerOpen(false)}
                className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-text-muted transition-colors hover:bg-surface-muted hover:text-text"
                aria-label={t("VISUALIZER_FILTER_COLLAPSE_PANEL")}
              >
                <FilterListIcon style={{ fontSize: 20 }} />
                <ChevronLeftIcon style={{ fontSize: 16 }} />
                <span className="font-body text-sm font-bold text-text">{t("VISUALIZER_FILTER_FILTER")}</span>
              </button>
              <button
                type="button"
                onClick={handleReset}
                className="filter-panel inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-normal text-text-muted transition-colors hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-border"
                aria-label={t("VISUALIZER_ARIA_RESET_ALL_FILTERS")}
              >
                <RestartAltIcon style={{ fontSize: 14 }} />
                {t("VISUALIZER_FILTER_RESET")}
              </button>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto px-3 py-2">
              <div className="space-y-3">
                <FilterSectionBlock
                  key="indicator"
                  title={t("VISUALIZER_FILTER_INDICATOR")}
                  icon={<BarChartIcon style={{ fontSize: 16 }} />}
                  theme={{ bgColor: "#fef2f2", primaryColor: "#dc2626" }}
                  items={selectedComponents.indicator ?? []}
                  onItemsChangeAction={(nextItems) => {
                    const hasIndicator = nextItems.length > 0;
                    setSelectedComponents((prev) => ({
                      ...prev,
                      indicator: hasIndicator ? nextItems : undefined,
                      // When indicator is cleared, clear dependent selections so they don't persist without an indicator.
                      ...(hasIndicator ? {} : { area: undefined, subgroup: undefined, timePeriod: undefined }),
                    }));
                    setSelectedItems(nextItems);
                  }}
                  onSectionClick={() => setShowModal(true)}
                />
                <FilterSectionBlock
                  key="subgroup"
                  title={t("VISUALIZER_FILTER_SUBGROUP")}
                  icon={<GroupIcon style={{ fontSize: 16 }} />}
                  theme={{ bgColor: "#f5f3ff", primaryColor: "#7c3aed" }}
                  items={subgroupItemsForDisplay}
                  onItemsChangeAction={(nextItems) =>
                    setSelectedComponents((prev) => ({
                      ...prev,
                      subgroup: nextItems.length ? nextItems : undefined,
                    }))
                  }
                  onSectionClick={() => setShowSubgroupModal(true)}
                />
                <FilterSectionBlock
                  key="timePeriod"
                  title={t("VISUALIZER_FILTER_TIME_PERIOD")}
                  icon={<CalendarMonthIcon style={{ fontSize: 16 }} />}
                  theme={{ bgColor: "#fff7ed", primaryColor: "#ea580c" }}
                  items={timePeriodItemsForDisplay}
                  onItemsChangeAction={(nextItems) => {
                    // When chips were showing chart-derived time periods (no explicit user selection),
                    // snapshot the current full chart list as options BEFORE the new selection
                    // causes a filtered fetch and shrinks timePeriodsFromChartData.
                    const wasChartDerived = (selectedComponents.timePeriod?.length ?? 0) === 0;
                    if (wasChartDerived && !timePeriodOptionsFromData && timePeriodsFromChartData?.length) {
                      setTimePeriodOptionsFromData([...timePeriodsFromChartData]);
                    }
                    setSelectedComponents((prev) => ({
                      ...prev,
                      timePeriod: nextItems.length ? nextItems : undefined,
                    }));
                  }}
                  onSectionClick={() => setShowTimePeriodModal(true)}
                />
                <FilterSectionBlock
                  key="area"
                  title={t("VISUALIZER_FILTER_AREA")}
                  icon={<PlaceIcon style={{ fontSize: 16 }} />}
                  theme={{ bgColor: "#f0fdf4", primaryColor: "#16a34a" }}
                  items={areaItemsForDisplay}
                  onItemsChangeAction={(nextItems) =>
                    setSelectedComponents((prev) => ({
                      ...prev,
                      // Use [] when user clears so we don't fall back to default area (chip goes away).
                      area: nextItems.length ? nextItems : [],
                    }))
                  }
                  onSectionClick={() => setShowAreaModal(true)}
                />
              </div>
            </div>
            <div className="px-4 py-2 text-center">
              <span className="text-xs text-text-muted">v{appVersion}</span>
            </div>
          </div>
          
        ) : (
          <div className="flex h-full flex-col items-center py-4">
            <button
              type="button"
              onClick={() => {
                // Only swallow a spurious open() after we close the viz panel; if nothing was open,
                // leaving this true would block the next real open from collapsing the filter drawer.
                if (visualizationSettingsOpen) {
                  ignoreNextSettingsOpenRef.current = true;
                }
                setDrawerOpen(true);
                setCloseVisualizationSettingsTrigger((c) => c + 1);
              }}
              className="flex flex-row items-center gap-1 rounded-lg px-2 py-2 text-text-muted transition-colors hover:bg-surface-muted hover:text-text"
              aria-label={t("VISUALIZER_FILTER_EXPAND_PANEL")}
            >
              <FilterListIcon style={{ fontSize: 24 }} />
              <ChevronRightIcon style={{ fontSize: 14 }} />
            </button>
            <div className="mt-4 flex flex-col gap-3">
              {SECTION_CONFIG.map(({ key, titleKey, icon, theme }) => {
                const items =
                  key === "subgroup"
                    ? subgroupItemsForDisplay
                    : key === "timePeriod"
                      ? timePeriodItemsForDisplay
                      : key === "area"
                        ? areaItemsForDisplay
                        : (selectedComponents[key] ?? []);
                const count = items.length;
                const hasSelection = count > 0;
                const openSectionModal = () => {
                  if (key === "indicator") setShowModal(true);
                  else if (key === "subgroup") setShowSubgroupModal(true);
                  else if (key === "timePeriod") setShowTimePeriodModal(true);
                  else if (key === "area") setShowAreaModal(true);
                };
                const sectionTitle = t(titleKey);
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={openSectionModal}
                    className={`relative flex h-9 w-9 items-center justify-center rounded-lg transition-colors hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-primary ${hasSelection ? "filter-panel__card text-[var(--fp-chip-text)]" : "bg-surface-muted text-text-muted"}`}
                    style={hasSelection ? undefined : { boxShadow: "none" }}
                    aria-label={hasSelection ? `Open ${sectionTitle} selection (${count} selected)` : `Open ${sectionTitle} selection`}
                  >
                    {icon}
                    {hasSelection && (
                      <span
                        className="filter-panel__badge_collapsed absolute -top-1 -left-1 rtl:left-auto rtl:-right-1 inline-flex min-h-[1.25rem] min-w-[1.25rem] items-center justify-center rounded-full px-1 text-[11px] font-semibold shadow-sm pointer-events-none"
                        aria-hidden
                      >
                        {count}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
            <div className="mt-auto pb-2 text-center">
              <span className="text-xs text-text-muted">v{appVersion}</span>
            </div>
          </div>
        )}
      </aside>

      {/* Main content: visualization tabs and settings */}
      <div
        className="content-canvas flex flex-1 flex-col overflow-hidden min-w-0"
      >
        <div className="flex-1 min-h-0 overflow-hidden p-4 pb-20 md:pb-4 flex flex-col">
          <div className="mb-3 flex-shrink-0">
            <div className="flex items-center justify-end flex-wrap gap-2 md:gap-3 min-w-0">
              <div className="flex items-center gap-2 xl:gap-4 min-w-0 shrink-0">
                {currentIndicator && (
                  <div className="flex items-center flex-nowrap gap-1.5 xl:gap-2 min-w-0">
                    {(activeTab === "visualization" || activeTab === "data") && (
                      <button
                        onClick={async () => {
                          if (!user) {
                            persistPendingVizConfigForSignIn();
                            setSaveToGallerySignInModalOpen(true);
                            return;
                          }
                          await performSaveToGallery();
                        }}
                        className={`px-2.5 py-1.5 bg-surface border border-border rounded-md hover:bg-surface-muted transition-colors ${isBookmarked ? "bg-warning/10 border-warning" : ""}`}
                        {...getTooltipHandlers(t("VISUALIZER_TOOLBAR_SAVE_TO_GALLERY"))}
                      >
                        <Bookmark
                          className={`w-4 h-4 ${isBookmarked ? "fill-warning text-warning" : "text-text"}`}
                        />
                      </button>
                    )}

                    {activeTab === "metadata" && (
                      <button
                        onClick={handleCopyMetadata}
                        className="btn-comp-secondary px-3 py-1.5"
                        {...getTooltipHandlers(t("VISUALIZER_TOOLBAR_COPY_METADATA"))}
                      >
                        <ContentCopyIcon className="w-4 h-4" />
                      </button>
                    )}

                    {(activeTab === "visualization" || activeTab === "data") && (
                      <button
                        onClick={() => setOpenShareTrigger((n) => n + 1)}
                        className="btn-comp-secondary px-3 py-1.5"
                        {...getTooltipHandlers(t("VISUALIZER_TOOLBAR_SHARE"))}
                      >
                        <Share2 className="w-4 h-4" />
                      </button>
                    )}

                    <div className="relative shrink-0">
                      <button
                        onClick={() => setShowExportMenu(!showExportMenu)}
                        className="btn-comp-secondary p-1.5 xl:px-3 xl:py-1.5 flex items-center gap-1.5"
                        {...getTooltipHandlers(t("VISUALIZER_TOOLBAR_EXPORT_AS"))}
                      >
                        <Download className="w-4 h-4 shrink-0" />
                        <span className="hidden xl:inline text-sm">{t("VISUALIZER_TOOLBAR_EXPORT_AS")}</span>
                        <ChevronDown className="w-4 h-4 hidden xl:block shrink-0" />
                      </button>
                      {showExportMenu && (
                        <>
                          <div
                            className="fixed inset-0 z-10"
                            onClick={() => setShowExportMenu(false)}
                          />
                          <div className="absolute right-0 rtl:right-auto rtl:left-0 mt-2 w-48 bg-surface border border-border rounded-md shadow-lg z-20">
                            {activeTab === "visualization" && (
                              <>
                                <button
                                  className="list-opt--panel"
                                  onClick={() => void handleToolbarDataExport("csv")}
                                >
                                  {t("VISUALIZER_TOOLBAR_DOWNLOAD_CSV")}
                                </button>
                                <button
                                  className="list-opt--panel"
                                  onClick={() => void handleToolbarDataExport("xlsx")}
                                >
                                  {t("VISUALIZER_TOOLBAR_DOWNLOAD_XLSX")}
                                </button>
                                <button
                                  className="list-opt--panel"
                                  onClick={() => void handleToolbarDataExport("json")}
                                >
                                  {t("VISUALIZER_TOOLBAR_DOWNLOAD_JSON")}
                                </button>
                                <div className="border-t border-border" />
                                <button
                                  className="list-opt--panel"
                                  onClick={() => {
                                    visualizationTabExportRef.current?.exportChartImage("svg");
                                    setShowExportMenu(false);
                                  }}
                                >
                                  {t("VISUALIZER_TOOLBAR_DOWNLOAD_SVG")}
                                </button>
                                <button
                                  className="list-opt--panel"
                                  onClick={() => {
                                    visualizationTabExportRef.current?.exportChartImage("png");
                                    setShowExportMenu(false);
                                  }}
                                >
                                  {t("VISUALIZER_TOOLBAR_DOWNLOAD_PNG")}
                                </button>
                                <button
                                  className="list-opt--panel"
                                  onClick={() => {
                                    visualizationTabExportRef.current?.exportChartImage("jpg");
                                    setShowExportMenu(false);
                                  }}
                                >
                                  {t("VISUALIZER_TOOLBAR_DOWNLOAD_JPG")}
                                </button>
                              </>
                            )}
                            {activeTab === "data" && (
                              <>
                                <button
                                  className="list-opt--panel"
                                  onClick={() => void handleToolbarDataExport("csv")}
                                >
                                  {t("VISUALIZER_TOOLBAR_DOWNLOAD_CSV")}
                                </button>
                                <button
                                  className="list-opt--panel"
                                  onClick={() => void handleToolbarDataExport("xlsx")}
                                >
                                  {t("VISUALIZER_TOOLBAR_DOWNLOAD_XLSX")}
                                </button>
                                <button
                                  className="list-opt--panel"
                                  onClick={() => void handleToolbarDataExport("json")}
                                >
                                  {t("VISUALIZER_TOOLBAR_DOWNLOAD_JSON")}
                                </button>
                              </>
                            )}
                            {activeTab === "metadata" && (
                              <>
                                <button
                                  className="list-opt--panel"
                                  onClick={() => {
                                    const code = currentIndicator?.code ?? "metadata";
                                    void exportMetadataAsPdf(`${code}_metadata.pdf`);
                                    setShowExportMenu(false);
                                  }}
                                >
                                  {t("VISUALIZER_TOOLBAR_DOWNLOAD_PDF")}
                                </button>
                                <button
                                  className="list-opt--panel"
                                  onClick={() => {
                                    const code = currentIndicator?.code ?? "metadata";
                                    void exportMetadataAsJpg(`${code}_metadata.jpg`);
                                    setShowExportMenu(false);
                                  }}
                                >
                                  {t("VISUALIZER_TOOLBAR_DOWNLOAD_JPG")}
                                </button>
                              </>
                            )}
                          </div>
                        </>
                      )}
                    </div>

                    {activeTab === "visualization" && (
                      <button
                        type="button"
                        onClick={() => {
                          if (visualizationSettingsOpen && visualizationPanelView === "edit") {
                            setCloseVisualizationSettingsTrigger((c) => c + 1);
                          } else {
                            setOpenVisualizationSettingsTrigger((n) => n + 1);
                          }
                        }}
                        className={`btn-comp-secondary px-3 py-1.5 flex items-center gap-2 shrink-0 ${visualizationSettingsOpen && visualizationPanelView === "edit"
                          ? "ring-2 ring-offset-1 ring-primary border-primary"
                          : ""
                          }`}
                        {...getTooltipHandlers(
                          visualizationSettingsOpen && visualizationPanelView === "edit"
                            ? t("VISUALIZER_TOOLBAR_CLOSE_VISUALIZATION_SETTINGS")
                            : t("VISUALIZER_TOOLBAR_EDIT_VISUALIZATION")
                        )}
                      >
                        <Settings className="w-4 h-4 shrink-0" />
                        <span className="hidden xl:inline text-sm">{t("VISUALIZER_TOOLBAR_EDIT_VISUALIZATION")}</span>
                        {visualizationSettingsOpen && visualizationPanelView === "edit" ? (
                          <ChevronRight className="w-4 h-4 hidden xl:block shrink-0" />
                        ) : (
                          <ChevronLeft className="w-4 h-4 hidden xl:block shrink-0" />
                        )}
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>

          {dataError && hasFiltersApplied && (
            <div className="mb-4 rounded-lg border border-error bg-error/10 px-4 py-3 text-sm text-error">
              {dataError}
            </div>
          )}
          <div
            className="flex-1 min-h-0 flex flex-col relative"
            style={{ display: activeTab === "visualization" ? undefined : "none" }}
          >
            {dataLoading && hasFiltersApplied && (
              <div
                className="absolute inset-0 z-10 flex items-center justify-center bg-surface"
                aria-busy
                aria-label={t("VISUALIZER_ARIA_LOADING_DATA")}
              >
                <Loader ariaLabel={t("VISUALIZER_ARIA_LOADING_DATA")} loadingLabel={t("COMMON_LOADING")} />
              </div>
            )}
            <VisualizationTab
              ref={visualizationTabExportRef}
              indicator={currentIndicator}
              filters={filters}
              hasFiltersApplied={hasFiltersApplied}
              apiResponse={apiResponse}
              legacyData={legacyData}
              useLegacyLayout={true}
              activeTab={activeTab}
              onTabChange={setActiveTab}
              onVisualizationSettingsChange={onVisualizationSettingsChangeStable}
              openVisualizationSettingsTrigger={openVisualizationSettingsTrigger}
              openInsightsPanelTrigger={openInsightsPanelTrigger}
              closeVisualizationSettingsTrigger={closeVisualizationSettingsTrigger}
              onInsightsClick={handleInsightsClick}
              insightsActive={insightsActive}
              locale={locale}
              onRequestShareModal={() => setOpenShareTrigger((n) => n + 1)}
              selectedComponents={selectedComponents}
              effectiveAreas={areaItemsForDisplay}
              onRequireSignIn={(vizConfig) => {
                persistPendingVizConfigForSignIn(vizConfig);
                setSaveToGallerySignInModalOpen(true);
              }}
              initialChartConfig={initialChartConfigFromUrl}
              initialEditSettingsTab={initialEditSettingsTabFromSession}
              onVizSettingsSync={setLastVizSettings}
            />
          </div>
          <div
            className="flex-1 min-h-0 flex flex-col"
            style={{ display: activeTab === "data" ? undefined : "none" }}
          >
            <DataTableTab
              indicator={currentIndicator}
              filters={filters}
              hasFiltersApplied={hasFiltersApplied}
              data={legacyData.length > 0 ? legacyData : undefined}
              title={lastVizSettings?.title ?? derivedChartTitle}
              titleFont={lastVizSettings?.titleFont}
              subtitleFont={lastVizSettings?.subtitleFont}
              dataRows={apiResponse?.rows}
              mapping={dataTableMappingResolved}
              chartSortOptions={
                apiResponse?.meta?.subgroupOrderByGid &&
                Object.keys(apiResponse.meta.subgroupOrderByGid).length > 0
                  ? { subgroupOrderByGid: apiResponse.meta.subgroupOrderByGid }
                  : undefined
              }
              dataPointsCount={dataPointsCount}
              unitFromData={
                apiResponse?.rows?.length
                  ? (() => {
                    const units = [...new Set(apiResponse.rows.map((r) => r.unit).filter(Boolean))] as string[];
                    if (units.length === 1) return units[0];
                    if (units.length > 1) return units.join(", ");
                    return undefined;
                  })()
                  : undefined
              }
              selectedComponents={selectedComponents}
              activeTab={activeTab}
              onTabChange={setActiveTab}
              onInsightsClick={handleInsightsClick}
              insightsActive={insightsActive}
            />
          </div>
          <div
            className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
            style={{ display: activeTab === "metadata" ? undefined : "none" }}
          >
            <MetadataTab
              items={indicatorMetadataList}
              metadataLoading={metadataLoading}
              activeTab={activeTab}
              onTabChange={setActiveTab}
              titleFont={lastVizSettings?.titleFont}
              subtitleFont={lastVizSettings?.subtitleFont}
              onInsightsClick={handleInsightsClick}
              insightsActive={insightsActive}
            />
          </div>
        </div>
      </div>

      {/* ── Mobile filter FAB (only on narrow screens) ── */}
      <button
        type="button"
        className="md:hidden fixed bottom-5 left-1/2 -translate-x-1/2 z-30 flex items-center gap-2 bg-primary text-on-primary rounded-full px-5 py-3 shadow-xl font-semibold text-sm"
        onClick={() => setMobileFilterOpen(true)}
        aria-label={t("VISUALIZER_FILTER_FILTER")}
      >
        <FilterListIcon style={{ fontSize: 18 }} />
        {t("VISUALIZER_FILTER_FILTER")}
        {totalSelections > 0 && (
          <span className="inline-flex items-center justify-center min-w-[1.25rem] h-5 rounded-full bg-on-primary text-primary text-xs font-bold px-1">
            {totalSelections}
          </span>
        )}
      </button>

      {/* ── Mobile filter bottom sheet ── */}
      {mobileFilterOpen && (
        <>
          {/* backdrop */}
          <div
            className="md:hidden fixed inset-0 z-40 bg-black/40"
            onClick={() => setMobileFilterOpen(false)}
            aria-hidden
          />
          {/* sheet */}
          <div className="md:hidden fixed inset-x-0 bottom-0 z-50 flex flex-col rounded-t-2xl bg-surface shadow-xl max-h-[85vh]">
            {/* drag handle */}
            <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
              <div className="w-10 h-1 rounded-full bg-border" aria-hidden />
            </div>
            {/* sheet header */}
            <div className="flex items-center justify-between px-4 py-2 border-b border-border flex-shrink-0">
              <div className="flex items-center gap-2">
                <FilterListIcon style={{ fontSize: 20 }} />
                <span className="font-bold text-sm text-text">{t("VISUALIZER_FILTER_FILTER")}</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleReset}
                  className="filter-panel inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-sm font-normal text-text-muted transition-colors hover:opacity-90 focus:outline-none"
                  aria-label={t("VISUALIZER_ARIA_RESET_ALL_FILTERS")}
                >
                  <RestartAltIcon style={{ fontSize: 14 }} />
                  {t("VISUALIZER_FILTER_RESET")}
                </button>
                <button
                  type="button"
                  onClick={() => setMobileFilterOpen(false)}
                  className="btn-comp-icon--ghost text-xl w-8 h-8 flex items-center justify-center"
                  aria-label={t("COMMON_CLOSE")}
                >
                  ×
                </button>
              </div>
            </div>
            {/* filter sections */}
            <div className="flex-1 min-h-0 overflow-y-auto px-3 py-2">
              <div className="space-y-3">
                <FilterSectionBlock
                  title={t("VISUALIZER_FILTER_INDICATOR")}
                  icon={<BarChartIcon style={{ fontSize: 16 }} />}
                  theme={{ bgColor: "#fef2f2", primaryColor: "#dc2626" }}
                  items={selectedComponents.indicator ?? []}
                  onItemsChangeAction={(nextItems) => {
                    const hasIndicator = nextItems.length > 0;
                    setSelectedComponents((prev) => ({
                      ...prev,
                      indicator: hasIndicator ? nextItems : undefined,
                      ...(hasIndicator ? {} : { area: undefined, subgroup: undefined, timePeriod: undefined }),
                    }));
                    setSelectedItems(nextItems);
                  }}
                  onSectionClick={() => { setMobileFilterOpen(false); setShowModal(true); }}
                />
                <FilterSectionBlock
                  title={t("VISUALIZER_FILTER_SUBGROUP")}
                  icon={<GroupIcon style={{ fontSize: 16 }} />}
                  theme={{ bgColor: "#f5f3ff", primaryColor: "#7c3aed" }}
                  items={subgroupItemsForDisplay}
                  onItemsChangeAction={(nextItems) =>
                    setSelectedComponents((prev) => ({
                      ...prev,
                      subgroup: nextItems.length ? nextItems : undefined,
                    }))
                  }
                  onSectionClick={() => { setMobileFilterOpen(false); setShowSubgroupModal(true); }}
                />
                <FilterSectionBlock
                  title={t("VISUALIZER_FILTER_TIME_PERIOD")}
                  icon={<CalendarMonthIcon style={{ fontSize: 16 }} />}
                  theme={{ bgColor: "#fff7ed", primaryColor: "#ea580c" }}
                  items={timePeriodItemsForDisplay}
                  onItemsChangeAction={(nextItems) => {
                    const wasChartDerived = (selectedComponents.timePeriod?.length ?? 0) === 0;
                    if (wasChartDerived && !timePeriodOptionsFromData && timePeriodsFromChartData?.length) {
                      setTimePeriodOptionsFromData([...timePeriodsFromChartData]);
                    }
                    setSelectedComponents((prev) => ({
                      ...prev,
                      timePeriod: nextItems.length ? nextItems : undefined,
                    }));
                  }}
                  onSectionClick={() => { setMobileFilterOpen(false); setShowTimePeriodModal(true); }}
                />
                <FilterSectionBlock
                  title={t("VISUALIZER_FILTER_AREA")}
                  icon={<PlaceIcon style={{ fontSize: 16 }} />}
                  theme={{ bgColor: "#f0fdf4", primaryColor: "#16a34a" }}
                  items={areaItemsForDisplay}
                  onItemsChangeAction={(nextItems) =>
                    setSelectedComponents((prev) => ({
                      ...prev,
                      area: nextItems.length ? nextItems : [],
                    }))
                  }
                  onSectionClick={() => { setMobileFilterOpen(false); setShowAreaModal(true); }}
                />
              </div>
            </div>
          </div>
        </>
      )}

      <IndicatorSelectionModal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        onApply={handleApply}
        baseUrl={getReferenceApiClientBaseUrl(dataWarehouseId)}
        locale={locale}
        initialSelectedItems={Array.isArray(selectedComponents.indicator) ? selectedComponents.indicator : selectedItems}
        anchorLeft={sidebarWidthPx + MAIN_BODY_PADDING_X}
        anchorTop={SELECTION_MODAL_ANCHOR_TOP}
      />
      <AreaSelectionModal
        isOpen={showAreaModal}
        onClose={() => setShowAreaModal(false)}
        onApply={handleApplyArea}
        baseUrl={getReferenceApiClientBaseUrl(dataWarehouseId)}
        locale={locale}
        initialSelectedItems={areaItemsForDisplay}
        anchorLeft={sidebarWidthPx + MAIN_BODY_PADDING_X}
        anchorTop={SELECTION_MODAL_ANCHOR_TOP}
      />
      <SubgroupSelectionModal
        isOpen={showSubgroupModal}
        onClose={() => setShowSubgroupModal(false)}
        onApply={handleApplySubgroup}
        baseUrl={getReferenceApiClientBaseUrl(dataWarehouseId)}
        initialSelectedItems={subgroupItemsForDisplay}
        selectedIndicators={selectedComponents.indicator ?? []}
        onPreloadedOptionsReady={(options) => {
          const validIds = new Set(
            options.flatMap((o) => [String(o.id), ...(o.nid != null ? [String(o.nid)] : [])])
          );
          setSelectedComponents((prev) => {
            const current = prev.subgroup ?? [];
            const filtered = current.filter(
              (s) =>
                validIds.has(String(s.id)) ||
                (s.nid != null && validIds.has(String(s.nid)))
            );
            if (filtered.length === current.length) return prev;
            return { ...prev, subgroup: filtered.length ? filtered : undefined };
          });
        }}
        locale={locale}
        anchorLeft={sidebarWidthPx + MAIN_BODY_PADDING_X}
        anchorTop={SELECTION_MODAL_ANCHOR_TOP}
      />
      <TimePeriodSelectionModal
        isOpen={showTimePeriodModal}
        onClose={() => setShowTimePeriodModal(false)}
        onApply={handleApplyTimePeriod}
        baseUrl={getReferenceApiClientBaseUrl(dataWarehouseId)}
        locale={locale}
        preloadedData={(timePeriodOptionsForFilter?.length ?? 0) > 0 ? timePeriodOptionsForFilter : undefined}
        initialSelectedItems={timePeriodItemsForDisplay}
        anchorLeft={sidebarWidthPx + MAIN_BODY_PADDING_X}
        anchorTop={SELECTION_MODAL_ANCHOR_TOP}
      />
      <SignInRequiredModal
        open={saveToGallerySignInModalOpen}
        onClose={() => setSaveToGallerySignInModalOpen(false)}
        returnUrl={saveToGalleryReturnUrl}
        locale={locale}
      />
      {openShareTrigger > 0 && (
        <ShareModal
          isOpen={true}
          onClose={() => setOpenShareTrigger(0)}
          indicator={currentIndicator}
          filters={filters}
          selectedComponents={selectedComponents}
          vizSettings={lastVizSettings ?? null}
          locale={locale}
        />
      )}
    </div>
  );
}
