import { useState, useMemo, useRef, useEffect, useLayoutEffect, useImperativeHandle, forwardRef, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { Download, Bookmark, Share2, ChevronDown, Edit2, Check, ArrowUp, ArrowDown, } from 'lucide-react';
import { getTooltipHandlers, useTooltipCleanup } from "@/components/CustomTooltip";
import type { Indicator, FilterValues, SelectedComponents, SelectedItem, DataPoint, VisualizerDataResponse, DimensionKind } from "@/lib/visualizer/types";
import { getDefaultVisualizationConfig } from "@/lib/visualizer/types";
import { VisualizationSettings, VisualizationConfig, type VisualizationSettingsTabId } from './VisualizationSettings';
import { InsightsPanel } from '@/components/insights/InsightsPanel';
import { useCore } from "@/contexts/CoreContext";
import { useAuth } from "@/contexts/AuthContext";
import type { ChartRendererWrapperRef } from 'dfa-v6-comp-visualization';
import { Loader } from "@/components/Loader";
import { VisualizerTabIcons } from "./VisualizerTabIcons";

function LoaderChartPlaceholder() {
  const { t } = useCore();
  return (
    <div className="flex min-h-[384px] w-full items-center justify-center rounded">
      <Loader showStatusText={false} ariaLabel={t("COMMON_LOADING")} />
    </div>
  );
}

const ChartRendererWrapper = dynamic(
  () => import('dfa-v6-comp-visualization').then((m) => ({ default: m.ChartRendererWrapper })),
  { ssr: false, loading: () => <LoaderChartPlaceholder /> }
);
import { toLineBarAreaDataFromRows, toPieDataFromRows, toScatterXYDataFromRows, toHeatmapDataFromRows, toTreemapDataFromRows, toRadarDataFromRows, toPyramidDataFromRows, toMapDataFromRows, filterRowsForMapSingleTimePeriod, getMapEffectiveTimePeriodLabel, extractDimensionValues, getDefaultScatterMapping, mapVizConfigToChartConfig, type AxisSeriesMapping, type ChartTransformSortOptions } from '@/lib/visualizer/chartTransform';
import { resolveUnitDisplayValue } from "@/lib/visualizer/unitFormatDisplay";
import { getDefaultChartConfig } from '@/lib/visualizer/defaultChartConfig';
import { validateMappingStructure } from '@/lib/visualizer/axisMapping';
import { enrichAreasWithLevel, resolveMapRenderLevel, resolveMapUrl, parseDfaMaps, classifyValues, fetchGeoJSON, type DfaMapsConfig } from '@/lib/visualizer/mapUtils';
import { fetchAreasTreeFromBackend } from '@/lib/api/referenceClient';
import { getPaletteForViz } from '@/lib/visualizer/colorThemes';
import {
  buildExportPayloadFromRows,
  getExportFilename,
  downloadCSV,
  downloadJSON,
  downloadXLSX,
} from '@/lib/visualizer/export';
import {
  exportChartAsImage,
  exportChartAsSvg,
  getChartExportFilename,
} from '@/lib/visualizer/chartExport';
import type { GalleryItem } from '@/lib/gallery/types';
import { getGalleryRepository } from '@/lib/gallery/galleryRepository';
import { getTimeRangeFromSelection } from '@/lib/visualizer/timeRangeFromSelection';
import { isLineBarAreaData, isHeatmapData, isRadarData, isPyramidData, isMapChartData, type LineBarAreaData, type HeatmapData, type RadarData, type PyramidData, type MapChartData } from 'dfa-v6-comp-visualization';
import { getVisualizerUiStateFromSession, setVisualizerUiStateToSession } from '@/lib/visualizer/sessionAdapter';

interface VisualizationTabProps {
  indicator: Indicator | null;
  filters: FilterValues;
  hasFiltersApplied: boolean | null;
  /** Spec-shaped response; when present, chart uses config layer default and rows + mapping for transform. */
  apiResponse?: VisualizerDataResponse | null;
  /** Legacy DataPoint[] derived from apiResponse.rows (for export and chartData used in export). */
  legacyData?: DataPoint[];
  useLegacyLayout?: boolean;
  activeTab?: 'visualization' | 'data' | 'metadata';
  onTabChange?: (tab: 'visualization' | 'data' | 'metadata') => void;
  isSidebarCollapsed?: boolean;
  onToggleSidebar?: () => void;
  onVisualizationSettingsChange?: (isOpen: boolean, view?: 'edit' | 'insights') => void;
  /** Increment to open the Edit Visualization panel from the parent (e.g. page toolbar). */
  openVisualizationSettingsTrigger?: number;
  /** Increment to open the Insights panel (same shell as edit) from the parent toolbar. */
  openInsightsPanelTrigger?: number;
  closeVisualizationSettingsTrigger?: number;
  /** Locale for share URL (e.g. en). */
  locale?: string;
  /** Called when user requests the Share modal (toolbar or in-chart Share). Parent should open the Share modal. */
  onRequestShareModal?: () => void;
  /** Current selected components (for minimal share URL). */
  selectedComponents?: SelectedComponents;
  /** Effective area items for display — includes the default area when selectedComponents.area is undefined. Passed straight to InsightsPanel so the correct area labels appear in the insights payload. */
  effectiveAreas?: SelectedItem[];
  /** When loading from share URL with viz state (v=), use this config instead of default. */
  initialChartConfig?: VisualizationConfig | null;
  /** Which settings tab to show when the edit panel opens (restored on refresh). */
  initialEditSettingsTab?: VisualizationSettingsTabId;
  /** Called when viz settings change so parent can sync title/mapping to Data Table tab and Share/Save. */
  onVizSettingsSync?: (config: VisualizationConfig) => void;
  /** When provided and user is not signed in, called instead of saving to gallery (e.g. to open sign-in modal). */
  onRequireSignIn?: (vizConfig: VisualizationConfig) => void;
  /** Called when the Insights icon is clicked. When provided, replaces the internal toggle so the parent controls insights state. */
  onInsightsClick?: () => void;
  /** Whether the Insights panel is currently active (for icon active styling). When provided, overrides internal sidePanelView === 'insights'. */
  insightsActive?: boolean;
}

export interface VisualizationTabExportHandle {
  exportChartImage(format: 'svg' | 'png' | 'jpg'): void;
  getCurrentVizSettings(): VisualizationConfig | null;
  getCurrentChartData(): LineBarAreaData | HeatmapData | RadarData | PyramidData | null;
}

const MOBILE_SIDE_PANEL_MAX_PX = 768;

/** Matches Tailwind `md` breakpoint — used for body scroll lock when the slide-in panel is open. */
function useIsMobileViewportForSidePanel() {
  const [isMobile, setIsMobile] = useState(false);
  useLayoutEffect(() => {
    const mql = window.matchMedia(`(max-width: ${MOBILE_SIDE_PANEL_MAX_PX - 1}px)`);
    const update = () => setIsMobile(mql.matches);
    update();
    mql.addEventListener("change", update);
    return () => mql.removeEventListener("change", update);
  }, []);
  return isMobile;
}

function VisualizationTabInner({ indicator, filters, hasFiltersApplied, apiResponse, legacyData = [], useLegacyLayout = true, activeTab, onTabChange, isSidebarCollapsed: _isSidebarCollapsed, onToggleSidebar: _onToggleSidebar, onVisualizationSettingsChange, openVisualizationSettingsTrigger, openInsightsPanelTrigger, closeVisualizationSettingsTrigger, locale = 'en', onRequestShareModal, selectedComponents = {}, effectiveAreas, initialChartConfig = null, initialEditSettingsTab = "basic", onVizSettingsSync, onRequireSignIn, onInsightsClick, insightsActive }: VisualizationTabProps, ref: React.Ref<VisualizationTabExportHandle | null>) {
  useTooltipCleanup();
  const { t, dataWarehouseId, getConfig } = useCore();
  const { user } = useAuth();
  const primaryVar = 'var(--color-primary)';
  const primaryLightVar = 'var(--color-primary)';
  const primaryColor =
    (typeof document !== "undefined"
      ? getComputedStyle(document.documentElement).getPropertyValue("--color-primary").trim()
      : "");
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [isBookmarked, setIsBookmarked] = useState(false);
  const [sidePanelOpen, setSidePanelOpen] = useState(false);
  const [sidePanelView, setSidePanelView] = useState<'edit' | 'insights'>('edit');
  const [editSettingsTab, setEditSettingsTab] = useState<VisualizationSettingsTabId>(initialEditSettingsTab);
  const isMobileViewport = useIsMobileViewportForSidePanel();
  const isEditSidePanel = sidePanelOpen && sidePanelView === 'edit';
  const [editingTitle, setEditingTitle] = useState(false);
  const [editingSubtitle, setEditingSubtitle] = useState(false);
  const [editingDescription, setEditingDescription] = useState(false);
  const chartRef = useRef<HTMLDivElement>(null);
  const chartExportRef = useRef<ChartRendererWrapperRef | null>(null);

  // Notify parent when side panel (edit or insights) open/close
  useEffect(() => {
    if (onVisualizationSettingsChange) {
      onVisualizationSettingsChange(sidePanelOpen, sidePanelOpen ? sidePanelView : undefined);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only sync when panel state or callback identity changes
  }, [sidePanelOpen, sidePanelView, onVisualizationSettingsChange]);

  // Restore UI state from session (tab/view/open). Parent triggers will open the panel; this ensures
  // the correct settings tab is active when the edit panel renders.
  useEffect(() => {
    const ui = getVisualizerUiStateFromSession();
    if (!ui) return;
    setEditSettingsTab(ui.editSettingsTab);
    // Keep view in sync so if panel is opened by triggers, it opens to the same view.
    setSidePanelView(ui.sidePanelView);
    // Do not open here: parent controls open via triggers and also needs to coordinate with filter drawer.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once on mount
  }, []);

  // Persist UI state for refresh continuity.
  useEffect(() => {
    setVisualizerUiStateToSession({
      sidePanelOpen,
      sidePanelView,
      editSettingsTab,
    });
  }, [sidePanelOpen, sidePanelView, editSettingsTab]);

  // Open edit panel when triggered by parent (e.g. page toolbar "Edit Visualization")
  useEffect(() => {
    if (openVisualizationSettingsTrigger && openVisualizationSettingsTrigger > 0) {
      setSidePanelOpen(true);
      setSidePanelView('edit');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only run when trigger counter changes
  }, [openVisualizationSettingsTrigger]);

  // Open insights panel when triggered by parent toolbar
  useEffect(() => {
    if (openInsightsPanelTrigger && openInsightsPanelTrigger > 0) {
      setSidePanelOpen(true);
      setSidePanelView('insights');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only run when trigger counter changes
  }, [openInsightsPanelTrigger]);

  // Close side panel when triggered by parent (e.g., when filters expand)
  useEffect(() => {
    if (closeVisualizationSettingsTrigger && closeVisualizationSettingsTrigger > 0) {
      if (sidePanelOpen) {
        setSidePanelOpen(false);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only run when trigger counter changes
  }, [closeVisualizationSettingsTrigger]);

  useEffect(() => {
    if (!sidePanelOpen || !isMobileViewport) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [sidePanelOpen, isMobileViewport]);

  // Sync "is bookmarked" from gallery repository when indicator changes
  useEffect(() => {
    if (!indicator) return;
    getGalleryRepository()
      .findMatching({ indicatorId: indicator.id, type: 'visualization' })
      .then((matched) => setIsBookmarked(!!matched));
  }, [indicator?.id]);

  // Single source of truth for chart title: indicators, subgroup (if single), area (if single).
  const derivedTitle = useMemo(() => {
    const indicatorPart = selectedComponents.indicator?.length
      ? selectedComponents.indicator.map((i) => i.label).join(', ')
      : (indicator?.name ?? 'Chart Title');
    const subgroupPart =
      selectedComponents.subgroup?.length === 1
        ? selectedComponents.subgroup[0].label
        : apiResponse?.rows?.length
          ? (() => {
            const names = [...new Set(apiResponse.rows.map((r) => r.subgroupName))].filter(Boolean);
            return names.length === 1 ? names[0] : undefined;
          })()
          : undefined;
    const areaPart =
      filters.area?.length === 1
        ? filters.area[0]
        : !filters.area?.length && apiResponse?.rows?.length
          ? (() => {
              const names = [...new Set(apiResponse.rows.map((r) => r.areaName))].filter(Boolean);
              return names.length === 1 ? names[0] : undefined;
            })()
          : undefined;
    const parts = [indicatorPart, subgroupPart, areaPart].filter(Boolean);
    return parts.length > 0 ? parts.join(', ') : 'Chart Title';
  }, [selectedComponents.indicator, selectedComponents.subgroup, indicator?.name, filters.area, apiResponse?.rows]);

  // Subtitle = unit from data or indicator; when only one time period applies, add time period (format: "unit, timeperiod").
  const derivedSubtitle = useMemo(() => {
    const unitPart =
      apiResponse?.rows?.length
        ? (() => {
          const units = [...new Set(apiResponse.rows.map((r) => r.unit).filter(Boolean))] as string[];
          if (units.length === 1) return units[0];
          if (units.length > 1) return units.join(', ');
          return '';
        })()
        : (indicator?.unit ?? '');

    const rows = apiResponse?.rows ?? [];
    const singleTimeSelected = selectedComponents?.timePeriod?.length === 1;
    const uniqueTimeInData =
      rows.length > 0
        ? [...new Set(rows.map((r) => r.timePeriodName || r.timePeriodId).filter(Boolean))]
        : [];
    const noTimeSelectedButSingleInData =
      !selectedComponents?.timePeriod?.length && uniqueTimeInData.length === 1;

    let timePart = '';
    if (singleTimeSelected || noTimeSelectedButSingleInData) {
      timePart = singleTimeSelected
        ? (selectedComponents?.timePeriod?.[0]?.label ?? '')
        : (uniqueTimeInData[0] ?? '');
    }

    // When multiple periods exist but only one is effectively shown (e.g. map),
    // surface the chosen period so the user knows which one they're looking at.
    if (!timePart && rows.length > 0) {
      const mapTimePeriod = getMapEffectiveTimePeriodLabel(rows, selectedComponents?.timePeriod);
      if (mapTimePeriod) timePart = mapTimePeriod;
    }

    const parts = [unitPart, timePart].filter(Boolean);
    return parts.join(', ');
  }, [apiResponse?.rows, indicator?.unit, selectedComponents?.timePeriod]);

  const [vizSettings, setVizSettings] = useState<VisualizationConfig>(() => {
    if (initialChartConfig) {
      const defaults = getDefaultVisualizationConfig({
        title: derivedTitle,
        primaryColor: initialChartConfig.chartColor ?? primaryColor,
        theme: initialChartConfig.theme ?? 'Warm',
      });
      // Keep persisted/share titles — do not overwrite with derivedTitle after merge.
      return { ...defaults, ...initialChartConfig };
    }
    return getDefaultVisualizationConfig({
      title: derivedTitle,
      primaryColor: primaryColor,
      theme: 'Warm',
    });
  });

  // When viz state loads (initialChartConfig set after v= fetch), apply it once.
  useEffect(() => {
    if (!initialChartConfig) return;
    const defaults = getDefaultVisualizationConfig({
      title: derivedTitle,
      primaryColor: initialChartConfig.chartColor ?? primaryColor,
      theme: initialChartConfig.theme ?? 'Warm',
    });
    setVizSettings(() => ({ ...defaults, ...initialChartConfig }));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only when we receive config from URL
  }, [initialChartConfig]);

  // Identity of current dimension selection; used to apply default config only on first load or after clear+reselect.
  // Do not include `indicator?.id`: after refresh it can change when metadata loads (chip id vs API id) while the
  // sidebar selection is unchanged, which falsely triggered "selection changed" and reset chartType to the matrix default (e.g. line).
  const selectionIdentity = useMemo(
    () =>
      [
        (filters.indicator ?? []).slice().sort().join(','),
        (filters.area ?? []).slice().sort().join(','),
        (filters.subgroup ?? []).slice().sort().join(','),
        String(filters.timeStart ?? ''),
        String(filters.timeEnd ?? ''),
        (filters.selectedYears ?? []).slice().sort().join(','),
      ].join('|'),
    [filters.indicator, filters.area, filters.subgroup, filters.timeStart, filters.timeEnd, filters.selectedYears]
  );

  const lastSelectionIdentityWhenDefaultsApplied = useRef<string | null>(null);

  // Reset the "defaults applied" ref only when the user has cleared their selection (no filters).
  // Do NOT reset when apiResponse is temporarily empty during a fetch (we clear it at fetch start to avoid stale chart flicker), or we would lose persistence when changing dimensions.
  useEffect(() => {
    if (!hasFiltersApplied) {
      lastSelectionIdentityWhenDefaultsApplied.current = null;
      axisMappingUserOverride.current = false;
      chartTypeUserOverride.current = false;
    }
  }, [hasFiltersApplied]);

  // Sync vizSettings: when loaded from gallery or share URL (initialChartConfig), preserve user's
  // customizations (chart type, colors, etc.) but still update derived title/subtitle when selection changes.
  // First load or after clear+reselect: apply full default viz config (chart type, mapping, fonts, colors, etc.).
  // When user only changes dimensions (e.g. adds an indicator): preserve chart type, variant, fonts, etc.; update only title, subtitle, and mapping so the new data shape is plotted correctly.
  // useLayoutEffect so this runs before paint: avoids a blink where the chart first renders with stale/wrong config then re-renders with correct config.
  useLayoutEffect(() => {
    if (initialChartConfig) {
      // On initial load, preserve config as-is (mark selection identity so we don't run full reset)
      if (lastSelectionIdentityWhenDefaultsApplied.current === null) {
        lastSelectionIdentityWhenDefaultsApplied.current = selectionIdentity;
        return;
      }
      // After initial load, if selection changed, update derived title/subtitle from API data
      // (unit may have changed when user selected a different indicator+unit combo)
      if (lastSelectionIdentityWhenDefaultsApplied.current !== selectionIdentity) {
        const hasData = apiResponse && apiResponse.rows.length > 0;
        if (hasData) {
          const defaultChart = getDefaultChartConfig(apiResponse!);
          const matrixMapping: AxisSeriesMapping = {
            xDimension: defaultChart.xDimension,
            seriesDimension: defaultChart.seriesDimension,
            seriesDimension2: defaultChart.seriesDimension2 ?? undefined,
          };
          const matrixChartType = defaultChart.chartType as VisualizationConfig['chartType'];
          setVizSettings(prev => {
            // Preserve user's axis layout if valid
            if (axisMappingUserOverride.current && prev.mapping && validateMappingStructure(prev.mapping as AxisSeriesMapping)) {
              const chartTypeUpdate = chartTypeUserOverride.current ? {} : { chartType: matrixChartType };
              return { ...prev, ...chartTypeUpdate, title: derivedTitle, subtitle: derivedSubtitle };
            }
            const chartTypeUpdate = chartTypeUserOverride.current ? {} : { chartType: matrixChartType };
            return { ...prev, ...chartTypeUpdate, title: derivedTitle, subtitle: derivedSubtitle, mapping: matrixMapping };
          });
        } else {
          setVizSettings(prev => ({ ...prev, title: derivedTitle, subtitle: derivedSubtitle }));
        }
        lastSelectionIdentityWhenDefaultsApplied.current = selectionIdentity;
      }
      return;
    }
    const hasData = apiResponse && apiResponse.rows.length > 0;
    const isFirstLoadOrAfterClear = hasData && lastSelectionIdentityWhenDefaultsApplied.current === null;

    if (isFirstLoadOrAfterClear) {
      // Full reset: all viz settings to defaults so chart type, variant, fonts, colors, mapping all reset.
      const fullDefaults = getDefaultVisualizationConfig({
        title: derivedTitle,
        primaryColor,
        theme: 'Warm',
      });
      const defaultChart = getDefaultChartConfig(apiResponse!);
      setVizSettings({
        ...fullDefaults,
        title: derivedTitle,
        subtitle: derivedSubtitle,
        chartType: defaultChart.chartType as VisualizationConfig['chartType'],
        mapping: {
          xDimension: defaultChart.xDimension,
          seriesDimension: defaultChart.seriesDimension,
          seriesDimension2: defaultChart.seriesDimension2 ?? undefined,
        },
      });
      axisMappingUserOverride.current = false;
      chartTypeUserOverride.current = false;
      lastSelectionIdentityWhenDefaultsApplied.current = selectionIdentity;
      return;
    }

    if (hasData) {
      const defaultChart = getDefaultChartConfig(apiResponse!);
      const matrixMapping: AxisSeriesMapping = {
        xDimension: defaultChart.xDimension,
        seriesDimension: defaultChart.seriesDimension,
        seriesDimension2: defaultChart.seriesDimension2 ?? undefined,
      };
      const matrixChartType = defaultChart.chartType as VisualizationConfig['chartType'];

      setVizSettings(prev => {
        // Preserve user's axis layout as long as it is structurally valid (no duplicate slots).
        if (axisMappingUserOverride.current && prev.mapping && validateMappingStructure(prev.mapping as AxisSeriesMapping)) {
          const chartTypeUpdate = chartTypeUserOverride.current
            ? {}
            : { chartType: matrixChartType };
          return { ...prev, ...chartTypeUpdate, title: derivedTitle, subtitle: derivedSubtitle };
        }
        // When the user hasn't explicitly chosen a chart type, also apply the matrix default
        // so the chart type tracks the data shape (e.g. line for time on X, bar for categorical).
        const chartTypeUpdate = chartTypeUserOverride.current
          ? {}
          : { chartType: matrixChartType };
        return { ...prev, ...chartTypeUpdate, title: derivedTitle, subtitle: derivedSubtitle, mapping: matrixMapping };
      });
    } else {
      setVizSettings(prev => ({ ...prev, title: derivedTitle, subtitle: derivedSubtitle }));
    }
  }, [derivedTitle, derivedSubtitle, primaryColor, apiResponse, initialChartConfig, selectionIdentity]);

  // Sync viz settings to parent so Data Table tab and Share/Save can use same title and mapping.
  useEffect(() => {
    onVizSettingsSync?.(vizSettings);
  }, [vizSettings, onVizSettingsSync]);

  // Tracks the last auto-computed radar max so we can detect when the user overrides it.
  const prevRadarComputedMax = useRef<number | null>(null);

  const [hasUserEditedChart, setHasUserEditedChart] = useState(false);
  /** When true, the user has explicitly chosen an axis/series layout via the settings panel; filter changes will preserve it as long as it remains valid against the new cardinality. */
  const axisMappingUserOverride = useRef(false);
  /** When true, the user has explicitly chosen a chart type via the settings panel; filter changes will not override it. */
  const chartTypeUserOverride = useRef(false);
  const applyVizSettingsUpdate = useCallback((patch: Partial<VisualizationConfig>) => {
    setVizSettings(prev => ({ ...prev, ...patch }));
    setHasUserEditedChart(true);
  }, []);

  const handleVisualizationPanelSettingsChange = useCallback((next: VisualizationConfig) => {
    setVizSettings(next);
    setHasUserEditedChart(true);
  }, []);

  const handleUserChangedAxisMapping = useCallback(() => {
    axisMappingUserOverride.current = true;
  }, []);

  const handleUserChangedChartType = useCallback(() => {
    chartTypeUserOverride.current = true;
  }, []);

  const data = legacyData;

  // Transform data for chart - group by year for multiple areas/subgroups (used for export; chart uses echartsChartData)
  const _chartData = useMemo(() => {
    if (data.length === 0) return [];
    const areas = [...new Set(data.map(d => d.area).filter(Boolean))] as string[];
    const subgroups = [...new Set(data.map(d => d.subgroup).filter(Boolean))] as string[];
    const years = [...new Set(data.map(d => d.year))].sort((a, b) => a - b);

    if (areas.length === 1 && subgroups.length === 1) {
      return data.map(d => ({ year: d.year, value: d.value }));
    }

    return years.map(year => {
      const yearData: Record<string, unknown> = { year };
      if (subgroups.length > 1) {
        subgroups.forEach(subgroup => {
          const dataPoint = data.find(d => d.year === year && d.subgroup === subgroup);
          yearData[subgroup] = dataPoint?.value || 0;
        });
      } else {
        areas.forEach(area => {
          const dataPoint = data.find(d => d.year === year && d.area === area);
          yearData[area] = dataPoint?.value || 0;
        });
      }
      return yearData;
    });
  }, [data]);

  // Calculate the number of series in the chart
  const seriesCount = useMemo(() => {
    if (data.length === 0) return 1;

    const areas = [...new Set(data.map(d => d.area))];
    const subgroups = [...new Set(data.map(d => d.subgroup))];

    // Determine what series to render
    const seriesKeys = subgroups.length > 1 ? subgroups : areas.length > 1 ? areas : ['value'];
    const isSingleSeries = seriesKeys.length === 1 && seriesKeys[0] === 'value';

    // For single series, return 1; for multiple series, return the actual count
    return isSingleSeries ? 1 : seriesKeys.length;
  }, [data]);

  // Calculate the actual colors being used in the chart
  const activeChartColors = useMemo(() => {
    if (data.length === 0) return [vizSettings.chartColor];

    const areas = [...new Set(data.map(d => d.area))];
    const subgroups = [...new Set(data.map(d => d.subgroup))];

    // Determine what series to render
    const seriesKeys = subgroups.length > 1 ? subgroups : areas.length > 1 ? areas : ['value'];
    const isSingleSeries = seriesKeys.length === 1 && seriesKeys[0] === 'value';

    // Get active color palette
    const activeColors = getPaletteForViz(vizSettings);

    // For single series, return the chartColor; for multiple series, return the palette
    if (isSingleSeries) {
      return [vizSettings.chartColor];
    } else {
      return seriesKeys.map((_, index) => activeColors[index % activeColors.length]);
    }
  }, [data, vizSettings]);

  const isAdvancedScatter = vizSettings.chartType === 'advanced' && vizSettings.chartVariant === 'scatter';
  const isHeatmapActive = vizSettings.chartType === 'advanced' && vizSettings.chartVariant === 'heatmap';
  const isTreemapActive = vizSettings.chartType === 'advanced' && vizSettings.chartVariant === 'treemap';
  const isSpiderActive = vizSettings.chartType === 'advanced' && vizSettings.chartVariant === 'spider';
  const isPyramidActive = vizSettings.chartType === 'advanced' && vizSettings.chartVariant === 'pyramid';
  const isMapActive = vizSettings.chartType === 'advanced' && vizSettings.chartVariant === 'map';
  const useEcharts = vizSettings.chartType === 'line' || vizSettings.chartType === 'bar' || vizSettings.chartType === 'area'
    || isAdvancedScatter
    || (vizSettings.chartType === 'pie' && vizSettings.chartVariant !== 'waffle')
    || isHeatmapActive
    || isTreemapActive
    || isSpiderActive
    || isPyramidActive
    || isMapActive;
  const defaultConfig = apiResponse && apiResponse.rows.length > 0 ? getDefaultChartConfig(apiResponse) : null;
  const defaultMapping: AxisSeriesMapping | null = defaultConfig
    ? {
      xDimension: defaultConfig.xDimension,
      seriesDimension: defaultConfig.seriesDimension,
      seriesDimension2: defaultConfig.seriesDimension2 ?? undefined,
    }
    : null;
  const mapping: AxisSeriesMapping = vizSettings.mapping ?? defaultMapping ?? { xDimension: 'time', seriesDimension: null };

  const chartSortOptions: ChartTransformSortOptions | undefined = useMemo(() => {
    const byGid = apiResponse?.meta?.subgroupOrderByGid;
    return byGid && Object.keys(byGid).length > 0 ? { subgroupOrderByGid: byGid } : undefined;
  }, [apiResponse?.meta?.subgroupOrderByGid]);

  // Dimension values for scatter correlation dropdowns
  const dimensionValues = useMemo(() => {
    if (!apiResponse || apiResponse.rows.length === 0) return undefined;
    return extractDimensionValues(apiResponse.rows, chartSortOptions);
  }, [apiResponse, chartSortOptions]);

  // Auto-initialize scatterMapping when switching to scatter and none exists
  useEffect(() => {
    if (isAdvancedScatter && !vizSettings.scatterMapping && dimensionValues) {
      const defaultScatter = getDefaultScatterMapping(dimensionValues);
      if (defaultScatter) {
        setVizSettings((prev) => ({ ...prev, scatterMapping: defaultScatter }));
      }
    }
  }, [isAdvancedScatter, vizSettings.scatterMapping, dimensionValues]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-initialize Y (seriesDimension) when switching to heatmap with a single-series mapping
  useEffect(() => {
    if (isHeatmapActive && mapping.seriesDimension === null) {
      const dims: DimensionKind[] = ['time', 'indicator', 'subgroup', 'area'];
      const autoY = dims.find(d => d !== mapping.xDimension) ?? null;
      if (autoY) {
        setVizSettings(prev => ({
          ...prev,
          mapping: {
            xDimension: prev.mapping?.xDimension ?? 'time',
            seriesDimension: autoY,
          },
        }));
      }
    }
  }, [isHeatmapActive, mapping.seriesDimension, mapping.xDimension]); // eslint-disable-line react-hooks/exhaustive-deps

  // Pyramid needs a non-null series dimension (two wings); pick a default when switching from single-series layouts.
  useEffect(() => {
    if (isPyramidActive && mapping.seriesDimension === null) {
      const dims: DimensionKind[] = ['time', 'indicator', 'subgroup', 'area'];
      const autoY = dims.find(d => d !== mapping.xDimension) ?? null;
      if (autoY) {
        setVizSettings(prev => ({
          ...prev,
          mapping: {
            xDimension: prev.mapping?.xDimension ?? 'time',
            seriesDimension: autoY,
          },
        }));
      }
    }
  }, [isPyramidActive, mapping.seriesDimension, mapping.xDimension]); // eslint-disable-line react-hooks/exhaustive-deps

  // Data once, then only settings: cartesian data ref is stable when only viz settings (e.g. chart type line/bar/area) change.
  const echartsChartDataCartesian = useMemo(() => {
    if (!apiResponse || apiResponse.rows.length === 0) return null;
    return toLineBarAreaDataFromRows(apiResponse.rows, mapping, 'bar', indicator?.name ?? 'Value', chartSortOptions);
  }, [apiResponse, mapping, indicator?.name, chartSortOptions]);
  const echartsChartDataPie = useMemo(() => {
    if (!apiResponse || apiResponse.rows.length === 0) return null;
    return toPieDataFromRows(apiResponse.rows, mapping, chartSortOptions);
  }, [apiResponse, mapping, chartSortOptions]);
  const echartsChartDataScatter = useMemo(() => {
    if (!apiResponse || apiResponse.rows.length === 0 || !vizSettings.scatterMapping) return null;
    return toScatterXYDataFromRows(apiResponse.rows, vizSettings.scatterMapping);
  }, [apiResponse, vizSettings.scatterMapping]);
  const heatmapChartData = useMemo(() => {
    if (!apiResponse || apiResponse.rows.length === 0) return null;
    return toHeatmapDataFromRows(apiResponse.rows, mapping, indicator?.name, chartSortOptions);
  }, [apiResponse, mapping, indicator?.name, chartSortOptions]);
  const radarChartData = useMemo(() => {
    if (!apiResponse || apiResponse.rows.length === 0) return null;
    return toRadarDataFromRows(apiResponse.rows, mapping, indicator?.name ?? 'Value', chartSortOptions);
  }, [apiResponse, mapping, indicator?.name, chartSortOptions]);
  const pyramidChartData = useMemo(() => {
    if (!apiResponse || apiResponse.rows.length === 0) return null;
    return toPyramidDataFromRows(apiResponse.rows, mapping, chartSortOptions);
  }, [apiResponse, mapping, chartSortOptions]);
  const treemapChartData = useMemo(() => {
    if (!apiResponse || apiResponse.rows.length === 0) return null;
    return toTreemapDataFromRows(apiResponse.rows, mapping, chartSortOptions);
  }, [apiResponse, mapping, chartSortOptions]);

  // ---- Map (choropleth) data pipeline ----
  const [mapGeoJSON, setMapGeoJSON] = useState<unknown>(null);
  const [mapLoading, setMapLoading] = useState(false);
  const [mapError, setMapError] = useState<string | null>(null);

  const mapAreas = effectiveAreas ?? selectedComponents?.area ?? [];

  const mapResolveResult = useMemo(() => {
    if (!isMapActive || !apiResponse) return null;
    const dmlUrl = getConfig('DFA_DML_URL');
    const dfaMapsRaw = getConfig('DW_MAPS') || getConfig('DFA_MAPS');
    if (!dmlUrl) return { ok: false as const, error: 'Map service is not configured. Contact your administrator to set DFA_DML_URL.' };
    const dfaMaps = parseDfaMaps(dfaMapsRaw);
    if (mapAreas.length === 0) return { ok: false as const, error: 'Please select at least one area to display the map.' };

    return { _dmlUrl: dmlUrl, _dfaMaps: dfaMaps, _selectedAreas: mapAreas };
  }, [isMapActive, apiResponse, getConfig, mapAreas]);

  const [areaLookupMap, setAreaLookupMap] = useState<Map<string, import('@/lib/api/referenceClient').AreaLookupEntry> | null>(null);

  useEffect(() => {
    if (!isMapActive) return;
    let cancelled = false;
    (async () => {
      try {
        const tree = await fetchAreasTreeFromBackend(locale, { dwId: dataWarehouseId });
        if (!cancelled) setAreaLookupMap(tree.getAreaLookup());
      } catch { /* area tree not available */ }
    })();
    return () => { cancelled = true; };
  }, [isMapActive, locale, dataWarehouseId]);

  const mapResolvedUrl = useMemo(() => {
    if (!mapResolveResult || 'ok' in mapResolveResult) return mapResolveResult as { ok: false; error: string } | null;
    if (!areaLookupMap) return null; // still loading
    const { _dmlUrl, _dfaMaps, _selectedAreas } = mapResolveResult as { _dmlUrl: string; _dfaMaps: DfaMapsConfig; _selectedAreas: import('@/lib/visualizer/types').SelectedItem[] };
    const enriched = enrichAreasWithLevel(_selectedAreas, areaLookupMap);
    const renderLevel = resolveMapRenderLevel(enriched);
    return resolveMapUrl(_dmlUrl, _dfaMaps, renderLevel, enriched);
  }, [mapResolveResult, areaLookupMap]);

  // Fetch GeoJSON when URL resolves
  useEffect(() => {
    if (!isMapActive || !mapResolvedUrl || !mapResolvedUrl.ok) {
      setMapGeoJSON(null);
      return;
    }
    let cancelled = false;
    setMapLoading(true);
    setMapError(null);
    const dmlUrl = getConfig('DFA_DML_URL');
    fetchGeoJSON(dmlUrl, mapResolvedUrl.url).then((result) => {
      if (cancelled) return;
      setMapLoading(false);
      if (result.ok) {
        setMapGeoJSON(result.geoJSON);
      } else {
        setMapError(result.error);
      }
    });
    return () => { cancelled = true; };
  }, [isMapActive, mapResolvedUrl, getConfig]); // eslint-disable-line react-hooks/exhaustive-deps

  const mapChartData: MapChartData | null = useMemo(() => {
    if (!isMapActive || !apiResponse || !mapGeoJSON || !mapResolvedUrl?.ok) return null;
    const mapRows = filterRowsForMapSingleTimePeriod(apiResponse.rows, selectedComponents?.timePeriod);
    if (mapRows.length === 0) return null;
    const selectedIds = new Set(mapAreas.map((a) => a.id.toUpperCase()));
    const values = mapRows.map((r) => r.value).filter((v) => v != null && !Number.isNaN(v));
    const cls = vizSettings.mapClassification ?? { method: 'equal_interval' as const, k: 4 };
    const classification = classifyValues(
      values,
      cls.method,
      cls.k,
      cls.customBreaks,
      cls.colors,
    );
    const mapName = `choropleth-${mapResolvedUrl.renderLevel}-${Date.now()}`;
    return toMapDataFromRows(mapGeoJSON, mapRows, selectedIds, classification, mapName);
  }, [isMapActive, apiResponse, mapGeoJSON, mapResolvedUrl, mapAreas, selectedComponents?.timePeriod, vizSettings.mapClassification]);

  const echartsChartData = useEcharts
    ? isMapActive
      ? mapChartData
      : isAdvancedScatter
        ? echartsChartDataScatter
        : isHeatmapActive
          ? heatmapChartData
          : isTreemapActive
            ? treemapChartData
            : isSpiderActive
              ? radarChartData
              : isPyramidActive
                ? pyramidChartData
                : vizSettings.chartType === 'pie'
                  ? echartsChartDataPie
                  : echartsChartDataCartesian
    : null;
  // Depend only on chart-relevant fields so title/description typing doesn't trigger chart re-renders.
  // mapVizConfigToChartConfig does not use title, description, showDescription, descriptionPosition, titleFont, descriptionFont.
  const echartsChartConfig = useMemo(
    () => mapVizConfigToChartConfig(vizSettings),
    [
      vizSettings.chartType,
      vizSettings.showXAxis,
      vizSettings.showYAxis,
      vizSettings.showGrid,
      vizSettings.showLabels,
      vizSettings.showLegend,
      vizSettings.legendPosition,
      vizSettings.labelOrientation,
      vizSettings.chartColor,
      vizSettings.theme,
      vizSettings.customColors,
      vizSettings.labelFont,
      vizSettings.legendFont,
      vizSettings.columnSpacing,
      vizSettings.lineThickness,
      vizSettings.chartVariant,
      vizSettings.pieSettings,
      vizSettings.scatterSettings,
      vizSettings.scatterMapping,
      vizSettings.yAxisRange,
      vizSettings.dataValues,
      vizSettings.plotAreaBackgroundColor,
      vizSettings.mapLabels,
    ]
  );

  // Auto-populate yAxisRange.max with the computed radar uniform max when spider chart loads.
  // Only overrides if the user hasn't set a custom value (i.e., current max is empty or still
  // matches the previous auto-computed value). Resets when switching away from spider.
  useEffect(() => {
    if (!isSpiderActive || !radarChartData) {
      prevRadarComputedMax.current = null;
      return;
    }
    const computedMax = radarChartData.indicators[0]?.max ?? 0;
    if (computedMax <= 0) return;
    const prevComputed = prevRadarComputedMax.current;
    prevRadarComputedMax.current = computedMax;
    setVizSettings(prev => {
      const currentMax = prev.yAxisRange?.max;
      // Do not use "prevComputed === null" here — on first mount after gallery load, a saved
      // custom max must win over the data-derived max. Only auto-fill when unset or still
      // tracking the previous auto value (user has not changed max).
      const shouldAutoSet =
        currentMax === '' ||
        currentMax === undefined ||
        currentMax === prevComputed;
      if (!shouldAutoSet) return prev;
      return {
        ...prev,
        yAxisRange: {
          min: prev.yAxisRange?.min ?? '',
          max: computedMax,
          interval: prev.yAxisRange?.interval ?? '',
        },
      };
    });
  }, [radarChartData, isSpiderActive]);

  // When switching TO pyramid, clear any inherited yAxisRange (e.g. from a previous bar/line chart)
  // so the auto-scale from data takes over. The user can set a custom symmetric bound afterwards
  // via the "Value Axis Bound" control in the settings panel.
  const prevPyramidActiveRef = useRef(false);
  useEffect(() => {
    const wasActive = prevPyramidActiveRef.current;
    prevPyramidActiveRef.current = isPyramidActive;
    if (isPyramidActive && !wasActive) {
      setVizSettings((prev) => ({
        ...prev,
        yAxisRange: {
          min: '',
          max: '',
          interval: '',
        },
      }));
    }
  }, [isPyramidActive]);

  // Key so the chart remounts when the data request identity changes (e.g. area unselected → all areas).
  // Ensures the chart always reflects the latest apiResponse for the current filters.
  const chartDataKey = useMemo(
    () =>
      [
        (filters.indicator ?? []).join(','),
        (filters.area ?? []).join(','),
        (filters.subgroup ?? []).join(','),
        filters.timeStart,
        filters.timeEnd,
      ].join('|'),
    [filters.indicator, filters.area, filters.subgroup, filters.timeStart, filters.timeEnd]
  );

  const handleExport = async (format: 'csv' | 'xlsx' | 'json' | 'png' | 'jpg' | 'svg') => {
    if (format === 'csv' || format === 'xlsx' || format === 'json') {
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
      if (format === 'csv') {
        downloadCSV(payload, filename);
      } else if (format === 'json') {
        downloadJSON(payload, filename);
      } else {
        await downloadXLSX(payload, filename);
      }
      setShowExportMenu(false);
      return;
    }

    if (format === 'svg' || format === 'png' || format === 'jpg') {
      doExportChartImage(format);
    }

    setShowExportMenu(false);
  };

  const doExportChartImage = async (format: 'svg' | 'png' | 'jpg') => {
    // Always capture as PNG — ECharts canvas renderer cannot produce SVG via getDataURL.
    // For SVG output we embed the PNG snapshot as an <image> element in the outer SVG.
    const chartDataUrl = chartExportRef.current?.getDataURL('png');
    if (!chartDataUrl) {
      alert(`Image export as ${format.toUpperCase()} is available for line, bar, area, and pie charts.`);
      return;
    }
    const timeStart = data.length ? Math.min(...data.map((d) => d.year)) : null;
    const timeEnd = data.length ? Math.max(...data.map((d) => d.year)) : null;
    const filename = getChartExportFilename(
      indicator?.code ?? 'chart',
      timeStart,
      timeEnd,
      format
    );
    const common = {
      title: vizSettings.title,
      subtitle: vizSettings.subtitle,
      description: vizSettings.description,
      showDescription: vizSettings.showDescription,
      descriptionPosition: vizSettings.descriptionPosition,
      titleFont: vizSettings.titleFont,
      subtitleFont: vizSettings.subtitleFont,
      descriptionFont: vizSettings.descriptionFont,
      filename,
      chartAreaBackgroundColor: vizSettings.chartAreaBackgroundColor?.trim() || undefined,
    };
    if (format === 'svg') {
      await exportChartAsSvg({ ...common, chartImageDataUrl: chartDataUrl });
    } else {
      void exportChartAsImage({
        ...common,
        chartDataUrl,
        format,
      });
    }
  };

  useImperativeHandle(
    ref,
    () => ({
      exportChartImage(format: 'svg' | 'png' | 'jpg') {
        doExportChartImage(format);
      },
      getCurrentVizSettings() {
        return vizSettings;
      },
      getCurrentChartData(): LineBarAreaData | HeatmapData | RadarData | PyramidData | null {
        if (!echartsChartData) return null;
        if (
          (vizSettings.chartType === 'line' || vizSettings.chartType === 'bar' || vizSettings.chartType === 'area') &&
          isLineBarAreaData(echartsChartData)
        ) {
          return echartsChartData;
        }
        if (isHeatmapActive && isHeatmapData(echartsChartData)) {
          return echartsChartData;
        }
        if (isSpiderActive && isRadarData(echartsChartData)) {
          return echartsChartData;
        }
        if (isPyramidActive && isPyramidData(echartsChartData)) {
          return echartsChartData;
        }
        return null;
      },
    }),
    [
      data,
      indicator?.code,
      vizSettings,
      echartsChartData,
      vizSettings.title,
      vizSettings.description,
      vizSettings.showDescription,
      vizSettings.descriptionPosition,
      vizSettings.titleFont,
      vizSettings.subtitleFont,
      vizSettings.descriptionFont,
    ]
  );

  const getFontStyle = (fontConfig: VisualizationConfig['titleFont']) => ({
    fontSize: `${fontConfig.size}px`,
    fontFamily: `${fontConfig.family}, system-ui, -apple-system, sans-serif`,
    fontWeight: fontConfig.bold ? 'bold' : 'normal',
    fontStyle: fontConfig.italic ? 'italic' : 'normal',
    textDecoration: fontConfig.underline ? 'underline' : 'none',
  });

  // Format numbers based on the selected format (or use server-formatted value if useUnitDefaultFormat is on)
  const formatNumber = (value: number, preFormatted?: string, unitCode?: string): string => {
    const useUnitDefault = vizSettings.dataValues?.useUnitDefaultFormat ?? true;
    const format = vizSettings.dataValues?.numberFormat || '1,000[.00]';
    return resolveUnitDisplayValue(value, {
      unitFormatCode: unitCode,
      preFormatted,
      useUnitDefault,
      vizNumberFormat: format,
    });
  };

  const toggleDescriptionPosition = () => {
    applyVizSettingsUpdate({
      descriptionPosition: vizSettings.descriptionPosition === 'above' ? 'below' : 'above'
    });
  };

  const renderChart = () => {
    const activeColors = getPaletteForViz(vizSettings);

    if (vizSettings.chartType === 'pie') {
      const isWaffle = vizSettings.chartVariant === 'waffle';
      if (isWaffle) {
        const segments = echartsChartDataPie?.segments?.slice(0, 8) ?? [];
        if (segments.length === 0) {
          return (
            <div className="w-full h-full flex items-center justify-center text-text-muted text-sm">
              No data to display.
            </div>
          );
        }

        const total = segments.reduce((sum, s) => sum + s.value, 0);
        const gridSize = 10;
        const totalCells = gridSize * gridSize;

        const segmentsWithCells = segments.map((seg, i) => ({
          ...seg,
          cells: Math.round((seg.value / total) * totalCells),
          color: activeColors[i % activeColors.length],
        }));

        const cells: Array<{ label: string; value: number; color: string; formattedValue?: string; unitFormatCode?: string }> = [];
        segmentsWithCells.forEach(item => {
          for (let i = 0; i < item.cells; i++) {
            cells.push({ label: item.label, value: item.value, color: item.color, formattedValue: item.formattedValue, unitFormatCode: item.unitFormatCode });
          }
        });
        while (cells.length < totalCells) {
          cells.push({ label: '', value: 0, color: '#f0f0f0', unitFormatCode: undefined });
        }

        const pos = vizSettings.legendPosition;
        const isVerticalLegend = pos === 'left' || pos === 'right';
        const legendFirst = pos === 'top' || pos === 'left';

        const waffleGrid = (
          <div className="grid gap-1" style={{
            gridTemplateColumns: `repeat(${gridSize}, minmax(0, 1fr))`,
            maxWidth: '320px',
            maxHeight: '320px',
            width: '100%',
            aspectRatio: '1',
          }}>
            {cells.map((cell, index) => (
              <div
                key={index}
                className="aspect-square rounded-sm transition-all hover:scale-110"
                style={{ backgroundColor: cell.color }}
                {...getTooltipHandlers(cell.label ? `${cell.label}: ${formatNumber(cell.value, cell.formattedValue, cell.unitFormatCode)}` : '')}
              />
            ))}
          </div>
        );

        const waffleLegend = vizSettings.showLegend ? (
          <div className={`flex gap-3 ${isVerticalLegend ? 'flex-col items-start max-h-[320px] overflow-y-auto' : 'flex-wrap justify-center max-w-2xl'}`}>
            {segments.map((seg, index) => (
              <div key={seg.id} className="flex items-center gap-2" style={getFontStyle(vizSettings.legendFont)}>
                <div
                  className="w-3 h-3 rounded flex-shrink-0"
                  style={{ backgroundColor: activeColors[index % activeColors.length] }}
                />
                <span className="text-sm whitespace-nowrap">{seg.label}: {formatNumber((seg.value / total) * 100, undefined, seg.unitFormatCode)}%</span>
              </div>
            ))}
          </div>
        ) : null;

        return (
          <div className={`w-full h-full flex items-center justify-center py-4 px-4 ${isVerticalLegend ? 'flex-row gap-6' : 'flex-col gap-4'}`}>
            {legendFirst && waffleLegend}
            {waffleGrid}
            {!legendFirst && waffleLegend}
          </div>
        );
      }
      return null;
    }

    if (vizSettings.chartType === 'advanced') {
      if (vizSettings.chartVariant === 'spider') {
        return (
          <div className="w-full h-full flex items-center justify-center bg-gray-50 rounded border border-gray-200">
            <div className="text-center p-8 max-w-md">
              <div className="text-4xl mb-4">🕸️</div>
              <p className="text-text font-medium mb-2">{t("VISUALIZER_ADVANCED_SPIDER_TITLE")}</p>
              <p className="text-sm text-text-muted max-w-md">
                {t("VISUALIZER_ADVANCED_SPIDER_BODY")}
              </p>
            </div>
          </div>
        );
      } else if (vizSettings.chartVariant === 'treemap') {
        return (
          <div className="w-full h-full flex items-center justify-center bg-gray-50 rounded border border-gray-200">
            <div className="text-center p-8 max-w-md">
              <div className="text-4xl mb-4">🌳</div>
              <p className="text-text font-medium mb-2">{t("VISUALIZER_ADVANCED_TREEMAP_TITLE")}</p>
              <p className="text-sm text-text-muted max-w-md">
                {t("VISUALIZER_ADVANCED_TREEMAP_BODY")}
              </p>
            </div>
          </div>
        );
      } else if (vizSettings.chartVariant === 'heatmap') {
        return (
          <div className="w-full h-full flex items-center justify-center bg-gray-50 rounded border border-gray-200">
            <div className="text-center p-8 max-w-md">
              <div className="text-4xl mb-4">🔥</div>
              <p className="text-text font-medium mb-2">{t("VISUALIZER_ADVANCED_HEATMAP_TITLE")}</p>
              <p className="text-sm text-text-muted">
                {t("VISUALIZER_ADVANCED_HEATMAP_BODY")}
              </p>
            </div>
          </div>
        );
      } else if (vizSettings.chartVariant === 'pyramid') {
        return (
          <div className="w-full h-full flex items-center justify-center bg-gray-50 rounded border border-gray-200">
            <div className="text-center p-8 max-w-md">
              <div className="text-4xl mb-4">🔺</div>
              <p className="text-text font-medium mb-2">{t("VISUALIZER_ADVANCED_PYRAMID_TITLE")}</p>
              <p className="text-sm text-text-muted max-w-md">
                {t("VISUALIZER_ADVANCED_PYRAMID_BODY")}
              </p>
            </div>
          </div>
        );
      } else if (vizSettings.chartVariant === 'map') {
        // Map visualization — loading / error states rendered here; actual chart goes through useEcharts path
        const resolveErr = mapResolvedUrl && !mapResolvedUrl.ok ? (mapResolvedUrl as { ok: false; error: string }).error : null;
        const displayError = resolveErr ?? mapError;
        if (displayError) {
          return (
            <div className="w-full h-full flex items-center justify-center bg-gray-50 rounded border border-gray-200">
              <div className="text-center p-8 max-w-md">
                <p className="text-text font-medium mb-2">{t("COMMON_ERROR") || "Error"}</p>
                <p className="text-sm text-text-muted">{displayError}</p>
              </div>
            </div>
          );
        }
        if (mapLoading || !mapGeoJSON || !areaLookupMap) {
          return <LoaderChartPlaceholder />;
        }
        // Map data is ready — fall through to ECharts rendering via useEcharts path
        return null;
      }
      return null;
    }
    return null;
  };

  // Toggle component
  const Toggle = ({ checked, onChange, label }: { checked: boolean; onChange: (checked: boolean) => void; label: string }) => (
    <label className="flex items-center cursor-pointer gap-2">
      <span className="text-sm text-text whitespace-nowrap">{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors ${checked ? '' : 'bg-border'
          }`}
        style={checked ? { backgroundColor: primaryVar } : undefined}
      >
        <span
          className={`inline-block h-4 w-4 transform rounded-full bg-surface transition-transform ${checked ? 'translate-x-6 rtl:-translate-x-6' : 'translate-x-1 rtl:-translate-x-1'
            }`}
        />
      </button>
    </label>
  );

  const hasNoData =
    (legacyData?.length ?? 0) === 0 &&
    (apiResponse?.rows?.length ?? 0) === 0;

  if (!hasFiltersApplied) {
    return (
      <div
        className="flex items-center justify-center min-h-[400px] bg-surface rounded-lg border-2 border-dashed border-primary-light"
      >
        <div className="text-center px-6 max-w-2xl">
          <svg className="w-20 h-20 mx-auto mb-6 text-primary-light" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
          </svg>
          <h3 className="text-lg font-bold text-text mb-3">{t("VISUALIZER_NO_FILTERS_SELECTED")}</h3>
          <p className="text-md text-text-muted mb-6">
            {t("VISUALIZER_SELECT_FILTERS_INSTRUCTION")}
          </p>
          <div
            className="border border-primary-light rounded-lg p-6 mt-4 text-left rtl:text-right bg-primary-light/10"
          >
            <p className="text-sm mb-3 font-bold text-primary">💡 {t("VISUALIZER_GETTING_STARTED_TITLE")}</p>
            <ol className="text-sm space-y-2 ml-6 rtl:ml-0 rtl:mr-6 list-decimal text-primary">
              <li>{t("VISUALIZER_GETTING_STARTED_STEP_1")}</li>
              <li>{t("VISUALIZER_GETTING_STARTED_STEP_2")}</li>
            </ol>
          </div>
        </div>
      </div>
    );
  }

  if (hasNoData) {
    return (
      <div
        className="flex items-center justify-center min-h-[400px] bg-surface rounded-lg border-2 border-dashed border-primary-light"
      >
        <div className="text-center px-6 max-w-2xl">
          <svg className="w-20 h-20 mx-auto mb-6 text-primary-light" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
          </svg>
          <h3 className="text-lg font-bold text-text mb-3">{t("VISUALIZER_NO_DATA_AVAILABLE")}</h3>
          <p className="text-text-muted text-md">
            {t("VISUALIZER_NO_DATA_FOR_FILTERS")}
          </p>
        </div>
      </div>
    );
  }

  const sidePanelContent =
    sidePanelView === "edit" ? (
      <VisualizationSettings
        settings={vizSettings}
        onSettingsChange={handleVisualizationPanelSettingsChange}
        onClose={() => setSidePanelOpen(false)}
        seriesCount={seriesCount}
        activeColors={activeChartColors}
        onUserChangedAxisMapping={handleUserChangedAxisMapping}
        onUserChangedChartType={handleUserChangedChartType}
        dimensionValues={dimensionValues}
        activeTab={editSettingsTab}
        onActiveTabChange={setEditSettingsTab}
      />
    ) : (
      <InsightsPanel
        onClose={() => setSidePanelOpen(false)}
        apiResponse={apiResponse ?? null}
        echartsChartData={echartsChartData}
        locale={locale}
        dataWarehouseId={dataWarehouseId}
        selectedComponents={selectedComponents}
        effectiveAreas={effectiveAreas}
      />
    );

  return (
    <>
      <div className="grid grid-cols-12 gap-4 flex-1 min-h-0 flex flex-col" style={{ gridTemplateRows: "1fr" }}>
        {/* Main Chart Area — full width on mobile; 8/12 when desktop panel open */}
        <div
          className={`flex-1 min-h-0 flex flex-col overflow-hidden space-y-6 ${sidePanelOpen ? "col-span-12 md:col-span-8" : "col-span-12"}`}
        >
        {/* Chart Controls - Only for non-legacy or when not passed from parent */}
        {!useLegacyLayout && onTabChange && activeTab && (
          <div className="bg-surface rounded-lg border border-border p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="flex gap-1">
                  <button
                    onClick={() => onTabChange('visualization')}
                    className={`px-6 py-2 border-b-2 transition-colors ${activeTab === 'visualization'
                      ? 'border-primary text-primary'
                      : 'border-transparent text-text-muted hover:text-text'
                      }`}
                  >
                    {t("VISUALIZER_TAB_VISUALIZATION")}
                  </button>
                  <button
                    onClick={() => onTabChange('data')}
                    className={`px-6 py-2 border-b-2 transition-colors ${activeTab === 'data'
                      ? 'border-primary text-primary'
                      : 'border-transparent text-text-muted hover:text-text'
                      }`}
                  >
                    {t("VISUALIZER_TAB_DATA_TABLE")}
                  </button>
                  <button
                    onClick={() => onTabChange('metadata')}
                    className={`px-6 py-2 border-b-2 transition-colors ${activeTab === 'metadata'
                      ? 'border-primary text-primary'
                      : 'border-transparent text-text-muted hover:text-text'
                      }`}
                  >
                    {t("VISUALIZER_TAB_METADATA")}
                  </button>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-2">
                {/* Bookmark Button */}
                <button
                  onClick={async () => {
                    if (!indicator) return;
                    if (!user && onRequireSignIn) {
                      onRequireSignIn(vizSettings);
                      return;
                    }
                    const repo = getGalleryRepository();
                    const matched = await repo.findMatching({ indicatorId: indicator.id, type: 'visualization' });
                    if (matched) {
                      await repo.remove(matched.id);
                      setIsBookmarked(false);
                    } else {
                      const timeRange = getTimeRangeFromSelection(selectedComponents?.timePeriod);
                      const filtersWithTime =
                        timeRange && (selectedComponents?.timePeriod?.length ?? 0) > 0
                          ? { ...filters, timeStart: timeRange.timeStart, timeEnd: timeRange.timeEnd }
                          : filters;
                      const indicatorWithTime =
                        timeRange && indicator
                          ? { ...indicator, defaultTimeStart: timeRange.defaultTimeStart, defaultTimeEnd: timeRange.defaultTimeEnd }
                          : indicator;
                      const addPayload: Parameters<typeof repo.add>[0] = {
                        type: 'visualization',
                        indicator: { ...indicatorWithTime },
                        filters: { ...filtersWithTime },
                        vizSettings,
                        selectedComponents: selectedComponents ?? {},
                        previewData: echartsChartData && (isLineBarAreaData(echartsChartData) || isHeatmapData(echartsChartData) || isRadarData(echartsChartData) || isPyramidData(echartsChartData)) ? echartsChartData : undefined,
                        isDynamic: false,
                        chartType: vizSettings.chartType,
                        dataWarehouseId,
                      };
                      await repo.add(addPayload);
                      setIsBookmarked(true);
                    }
                  }}
                  className={`p-2 bg-surface border border-border rounded-md hover:bg-surface-muted transition-colors ${isBookmarked ? 'bg-warning/10 border-warning' : ''
                    }`}
                  {...getTooltipHandlers(t("VISUALIZER_TOOLBAR_SAVE_TO_GALLERY"))}
                >
                  <Bookmark className={`w-5 h-5 ${isBookmarked ? 'fill-warning text-warning' : 'text-text'}`} />
                </button>

                {/* Share Button */}
                <button
                  onClick={() => onRequestShareModal?.()}
                  className="p-2 bg-surface border border-border text-text rounded-md hover:bg-surface-muted transition-colors"
                  {...getTooltipHandlers(t("VISUALIZER_TOOLBAR_SHARE"))}
                >
                  <Share2 className="w-5 h-5" />
                </button>

                {/* Export Button with Dropdown */}
                <div className="relative">
                  <button
                    onClick={() => setShowExportMenu(!showExportMenu)}
                    className="px-4 py-2 bg-surface border border-border text-text rounded-md hover:bg-surface-muted transition-colors flex items-center gap-2"
                  >
                    <Download className="w-4 h-4" />
                    {t("VISUALIZER_TOOLBAR_EXPORT_AS")}
                    <ChevronDown className="w-4 h-4" />
                  </button>

                  {showExportMenu && (
                    <>
                      <div
                        className="fixed inset-0 z-10"
                        onClick={() => setShowExportMenu(false)}
                      />
                      <div className="absolute right-0 rtl:right-auto rtl:left-0 mt-2 w-48 bg-white border border-gray-200 rounded-md shadow-lg z-20">
                        <button
                          onClick={() => handleExport('csv')}
                          className="w-full px-4 py-2 text-left rtl:text-right text-text hover:bg-surface-muted transition-colors"
                        >
                          {t("VISUALIZER_TOOLBAR_DOWNLOAD_CSV")}
                        </button>
                        <button
                          onClick={() => handleExport('xlsx')}
                          className="w-full px-4 py-2 text-left rtl:text-right text-text hover:bg-surface-muted transition-colors"
                        >
                          {t("VISUALIZER_TOOLBAR_DOWNLOAD_XLSX")}
                        </button>
                        <button
                          onClick={() => handleExport('json')}
                          className="w-full px-4 py-2 text-left rtl:text-right text-text hover:bg-surface-muted transition-colors"
                        >
                          {t("VISUALIZER_TOOLBAR_DOWNLOAD_JSON")}
                        </button>
                        <div className="border-t border-gray-200" />
                        <button
                          onClick={() => handleExport('svg')}
                          className="w-full px-4 py-2 text-left rtl:text-right text-text hover:bg-surface-muted transition-colors"
                        >
                          {t("VISUALIZER_TOOLBAR_DOWNLOAD_SVG")}
                        </button>
                        <button
                          onClick={() => handleExport('png')}
                          className="w-full px-4 py-2 text-left rtl:text-right text-text hover:bg-surface-muted transition-colors"
                        >
                          {t("VISUALIZER_TOOLBAR_DOWNLOAD_PNG")}
                        </button>
                        <button
                          onClick={() => handleExport('jpg')}
                          className="w-full px-4 py-2 text-left rtl:text-right text-text hover:bg-surface-muted transition-colors"
                        >
                          {t("VISUALIZER_TOOLBAR_DOWNLOAD_JPG")}
                        </button>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Chart container: chart area background is the card (title, toggles, margins); ECharts stays transparent outside the grid. */}
        <div
          id="viz-container"
          className={`rounded-lg border border-gray-200 p-6 relative flex-1 min-h-0 flex flex-col overflow-hidden ${vizSettings.chartAreaBackgroundColor?.trim() ? '' : 'bg-white'}`}
          style={
            vizSettings.chartAreaBackgroundColor?.trim()
              ? { backgroundColor: vizSettings.chartAreaBackgroundColor.trim() }
              : undefined
          }
          ref={chartRef}
        >
          {/* Editable Title with Settings Button */}
          <div className={`mb-2 flex items-start justify-between gap-4 ${isEditSidePanel ? '' : 'group'}`}>
            <div className="flex-1">
              {editingTitle ? (
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={vizSettings.title}
                    onChange={(e) => applyVizSettingsUpdate({ title: e.target.value })}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        setEditingTitle(false);
                      }
                    }}
                    className="flex-1 px-2 py-1 border border-border rounded focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
                    style={getFontStyle(vizSettings.titleFont)}
                    autoFocus
                  />
                  <button
                    onClick={() => setEditingTitle(false)}
                    className="p-1 text-success hover:bg-success/10 rounded transition-colors"
                    {...getTooltipHandlers(t("VISUALIZER_TT_SAVE"))}
                  >
                    <Check className="w-5 h-5" />
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2 group/title flex-wrap">
                  <h3 className="text-text" style={getFontStyle(vizSettings.titleFont)}>
                    {vizSettings.title}
                  </h3>
                  <button
                    onClick={() => setEditingTitle(true)}
                    className="btn-comp-icon--ghost opacity-0 group-hover/title:opacity-100 transition-opacity"
                    onFocus={getTooltipHandlers(t("VISUALIZER_TT_EDIT_TITLE")).onFocus}
                    onBlur={getTooltipHandlers(t("VISUALIZER_TT_EDIT_TITLE")).onBlur}
                    onKeyDown={getTooltipHandlers(t("VISUALIZER_TT_EDIT_TITLE")).onKeyDown}
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>
                </div>
              )}
              {editingSubtitle ? (
                <div className="flex items-center gap-2 mt-1">
                  <input
                    type="text"
                    value={vizSettings.subtitle ?? ''}
                    onChange={(e) => applyVizSettingsUpdate({ subtitle: e.target.value })}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        setEditingSubtitle(false);
                      }
                    }}
                    className="flex-1 px-2 py-1 border border-border rounded focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
                    style={getFontStyle(vizSettings.subtitleFont)}
                    autoFocus
                  />
                  <button
                    onClick={() => setEditingSubtitle(false)}
                    className="p-1 text-success hover:bg-success/10 rounded transition-colors"
                    {...getTooltipHandlers(t("VISUALIZER_TT_SAVE"))}
                  >
                    <Check className="w-5 h-5" />
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2 mt-1 group/subtitle flex-wrap">
                  <p className="text-text" style={getFontStyle(vizSettings.subtitleFont)}>
                    {vizSettings.subtitle ?? ''}
                  </p>
                  <button
                    onClick={() => setEditingSubtitle(true)}
                    className="btn-comp-icon--ghost opacity-0 group-hover/subtitle:opacity-100 transition-opacity"
                    onFocus={getTooltipHandlers(t("VISUALIZER_TT_EDIT_SUBTITLE")).onFocus}
                    onBlur={getTooltipHandlers(t("VISUALIZER_TT_EDIT_SUBTITLE")).onBlur}
                    onKeyDown={getTooltipHandlers(t("VISUALIZER_TT_EDIT_SUBTITLE")).onKeyDown}
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>
            {/* Icon-only tab switchers (top right) */}
            <VisualizerTabIcons
              activeTab={activeTab ?? "visualization"}
              onTabChange={onTabChange}
              className="border-border pr-2 xl:pr-3 rtl:pr-0 rtl:pl-2 xl:rtl:pl-3"
              onInsightsClick={onInsightsClick ?? (() => {
                if (sidePanelOpen && sidePanelView === 'insights') {
                  setSidePanelOpen(false);
                } else {
                  setSidePanelView('insights');
                  setSidePanelOpen(true);
                }
              })}
              insightsActive={insightsActive ?? (sidePanelOpen && sidePanelView === 'insights')}
            />
          </div>

          {/* Description Above */}
          {vizSettings.descriptionPosition === 'above' && (
            <div className={`mb-4 ${isEditSidePanel ? '' : 'group'}`}>
              {editingDescription ? (
                <div className="flex items-start gap-2">
                  <textarea
                    value={vizSettings.description}
                    onChange={(e) => {
                      applyVizSettingsUpdate({ description: e.target.value, showDescription: true });
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        setEditingDescription(false);
                      }
                    }}
                    className="flex-1 px-2 py-1 border border-border rounded focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
                    style={getFontStyle(vizSettings.descriptionFont)}
                    rows={2}
                    placeholder={t("VISUALIZER_PLACEHOLDER_ADD_DESCRIPTION")}
                    autoFocus
                  />
                  <button
                    onClick={() => setEditingDescription(false)}
                    className="btn-comp-icon--ghost"
                    {...getTooltipHandlers(t("VISUALIZER_TT_SAVE"))}
                  >
                    <Check className="w-5 h-5" />
                  </button>
                </div>
              ) : (
                <div className="flex items-start gap-2">
                  {vizSettings.showDescription && vizSettings.description ? (
                    <p className="text-text-muted flex-1" style={getFontStyle(vizSettings.descriptionFont)}>
                      {vizSettings.description}
                    </p>
                  ) : (
                    isEditSidePanel && (
                      <p className="text-text-muted flex-1 italic text-sm">
                        {t("VISUALIZER_DESCRIPTION_CLICK_HINT")}
                      </p>
                    )
                  )}
                  {isEditSidePanel && (
                    <div className="flex gap-1">
                      <button
                        onClick={() => setEditingDescription(true)}
                        className="btn-comp-icon--ghost"
                        onFocus={getTooltipHandlers(t("VISUALIZER_TT_EDIT_DESCRIPTION")).onFocus}
                        onBlur={getTooltipHandlers(t("VISUALIZER_TT_EDIT_DESCRIPTION")).onBlur}
                        onKeyDown={getTooltipHandlers(t("VISUALIZER_TT_EDIT_DESCRIPTION")).onKeyDown}
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={toggleDescriptionPosition}
                        className="btn-comp-icon--ghost"
                        onFocus={getTooltipHandlers(t("VISUALIZER_TT_MOVE_DESCRIPTION_BELOW")).onFocus}
                        onBlur={getTooltipHandlers(t("VISUALIZER_TT_MOVE_DESCRIPTION_BELOW")).onBlur}
                        onKeyDown={getTooltipHandlers(t("VISUALIZER_TT_MOVE_DESCRIPTION_BELOW")).onKeyDown}
                      >
                        <ArrowDown className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          <div className="flex-1 min-h-0 w-full flex flex-col">
            {useEcharts && echartsChartData ? (
              <ChartRendererWrapper
                key={chartDataKey}
                data={echartsChartData}
                config={echartsChartConfig}
                chartRef={chartExportRef}
                minHeight={200}
              />
            ) : (
              renderChart()
            )}
          </div>

          {/* Description Below */}
          {vizSettings.descriptionPosition === 'below' && (
            <div className={`mt-4 ${isEditSidePanel ? '' : 'group'}`}>
              {editingDescription ? (
                <div className="flex items-start gap-2">
                  <textarea
                    value={vizSettings.description}
                    onChange={(e) => {
                      applyVizSettingsUpdate({ description: e.target.value, showDescription: true });
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        setEditingDescription(false);
                      }
                    }}
                    className="flex-1 px-2 py-1 border border-border rounded focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
                    style={getFontStyle(vizSettings.descriptionFont)}
                    rows={2}
                    placeholder={t("VISUALIZER_PLACEHOLDER_ADD_DESCRIPTION")}
                    autoFocus
                  />
                  <button
                    onClick={() => setEditingDescription(false)}
                    className="btn-comp-icon--ghost"
                    {...getTooltipHandlers(t("VISUALIZER_TT_SAVE"))}
                  >
                    <Check className="w-5 h-5 text-success" />
                  </button>
                </div>
              ) : (
                <div className="flex items-start gap-2">
                  {vizSettings.showDescription && vizSettings.description ? (
                    <p className="text-text-muted flex-1" style={getFontStyle(vizSettings.descriptionFont)}>
                      {vizSettings.description}
                    </p>
                  ) : (
                    isEditSidePanel && (
                      <p className="text-text-muted flex-1 italic text-sm">
                        {t("VISUALIZER_DESCRIPTION_CLICK_HINT")}
                      </p>
                    )
                  )}
                  {isEditSidePanel && (
                    <div className="flex gap-1">
                      <button
                        onClick={() => setEditingDescription(true)}
                        className="btn-comp-icon--ghost"
                        onFocus={getTooltipHandlers(t("VISUALIZER_TT_EDIT_DESCRIPTION")).onFocus}
                        onBlur={getTooltipHandlers(t("VISUALIZER_TT_EDIT_DESCRIPTION")).onBlur}
                        onKeyDown={getTooltipHandlers(t("VISUALIZER_TT_EDIT_DESCRIPTION")).onKeyDown}
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={toggleDescriptionPosition}
                        className="btn-comp-icon--ghost"
                        onFocus={getTooltipHandlers(t("VISUALIZER_TT_MOVE_DESCRIPTION_ABOVE")).onFocus}
                        onBlur={getTooltipHandlers(t("VISUALIZER_TT_MOVE_DESCRIPTION_ABOVE")).onBlur}
                        onKeyDown={getTooltipHandlers(t("VISUALIZER_TT_MOVE_DESCRIPTION_ABOVE")).onKeyDown}
                      >
                        <ArrowUp className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Axes & Labels Toggles - Shown when edit panel is active (desktop only; mobile gets them in the overlay footer) */}
          {isEditSidePanel && !isMobileViewport && (
            <div className="mt-6 pt-6 border-t border-gray-200">
              <div className="flex flex-wrap justify-between gap-4 sm:gap-6 md:gap-8">
                <Toggle
                  checked={vizSettings.showXAxis}
                  onChange={(checked) => applyVizSettingsUpdate({ showXAxis: checked })}
                  label={t("VISUALIZER_SETTINGS_HORIZONTAL_AXIS")}
                />
                <Toggle
                  checked={vizSettings.showYAxis}
                  onChange={(checked) => applyVizSettingsUpdate({ showYAxis: checked })}
                  label={t("VISUALIZER_SETTINGS_VERTICAL_AXIS")}
                />
                <Toggle
                  checked={vizSettings.showLabels}
                  onChange={(checked) => applyVizSettingsUpdate({ showLabels: checked })}
                  label={t("VISUALIZER_TOGGLE_DATA_LABELS")}
                />
                <Toggle
                  checked={vizSettings.showLegend}
                  onChange={(checked) => applyVizSettingsUpdate({ showLegend: checked })}
                  label={t("VISUALIZER_TOGGLE_LEGEND")}
                />
                <Toggle
                  checked={vizSettings.showGrid}
                  onChange={(checked) => applyVizSettingsUpdate({ showGrid: checked })}
                  label={t("VISUALIZER_TOGGLE_GRID_LINES")}
                />
              </div>
            </div>
          )}
        </div>
      </div>

        {/* Edit / Insights — desktop grid column (single mount; not rendered on mobile viewport) */}
        {sidePanelOpen && !isMobileViewport && (
          <div className="col-span-4 flex flex-col min-h-0 overflow-hidden">
            <div
              className="sticky top-6 min-h-0 w-full flex flex-col overflow-hidden self-start h-full"
              style={{ maxHeight: "calc(98vh - 8rem)" }}
            >
              {sidePanelContent}
            </div>
          </div>
        )}
      </div>

      {/* Mobile: slide-in overlay (single mount; not rendered on md+ viewport) */}
      {sidePanelOpen && isMobileViewport && (
        <>
          <div
            className="fixed inset-0 z-[60] bg-black/40"
            onClick={() => setSidePanelOpen(false)}
            aria-hidden
          />
          <div
            className="fixed inset-y-0 right-0 rtl:right-auto rtl:left-0 z-[70] flex w-[min(90vw,24rem)] min-h-0 flex-col border-l rtl:border-l-0 rtl:border-r border-border bg-surface shadow-xl"
            role="dialog"
            aria-modal="true"
            aria-label={
              sidePanelView === "edit"
                ? t("VISUALIZER_TOOLBAR_EDIT_VISUALIZATION")
                : t("INSIGHTS")
            }
          >
            {/* Scrollable panel content */}
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
              {sidePanelContent}
            </div>

            {/* Quick-toggle footer — pinned at bottom, always visible in edit mode */}
            {sidePanelView === "edit" && (
              <div className="flex-shrink-0 border-t border-border bg-surface px-4 py-3">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-muted">
                  {t("VISUALIZER_SETTINGS_DISPLAY")}
                </p>
                <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                  <Toggle
                    checked={vizSettings.showXAxis}
                    onChange={(checked) => applyVizSettingsUpdate({ showXAxis: checked })}
                    label={t("VISUALIZER_SETTINGS_HORIZONTAL_AXIS")}
                  />
                  <Toggle
                    checked={vizSettings.showYAxis}
                    onChange={(checked) => applyVizSettingsUpdate({ showYAxis: checked })}
                    label={t("VISUALIZER_SETTINGS_VERTICAL_AXIS")}
                  />
                  <Toggle
                    checked={vizSettings.showLabels}
                    onChange={(checked) => applyVizSettingsUpdate({ showLabels: checked })}
                    label={t("VISUALIZER_TOGGLE_DATA_LABELS")}
                  />
                  <Toggle
                    checked={vizSettings.showLegend}
                    onChange={(checked) => applyVizSettingsUpdate({ showLegend: checked })}
                    label={t("VISUALIZER_TOGGLE_LEGEND")}
                  />
                  <Toggle
                    checked={vizSettings.showGrid}
                    onChange={(checked) => applyVizSettingsUpdate({ showGrid: checked })}
                    label={t("VISUALIZER_TOGGLE_GRID_LINES")}
                  />
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </>
  );
}

export const VisualizationTab = forwardRef<
  VisualizationTabExportHandle | null,
  VisualizationTabProps
>(VisualizationTabInner);