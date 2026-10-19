import type { Indicator, FontStyle } from "@/lib/visualizer/types";
import type { MetadataReportItem } from "@/lib/api/reference";
import { AlertCircle } from 'lucide-react';
import { Loader } from "@/components/Loader";
import { useCore } from "@/contexts/CoreContext";
import { useMemo, type ReactNode } from "react";
import { VisualizerTabIcons } from "./VisualizerTabIcons";
import type { VisualizerContentViewTab } from "./VisualizerTabIcons";

function getFontStyle(font?: FontStyle): React.CSSProperties {
  if (!font) return {};
  return {
    fontSize: `${font.size}px`,
    fontFamily: `${font.family}, system-ui, -apple-system, sans-serif`,
    fontWeight: font.bold ? 'bold' : 'normal',
    fontStyle: font.italic ? 'italic' : 'normal',
    textDecoration: font.underline ? 'underline' : undefined,
  };
}

interface MetadataTabProps {
  items: Array<{
    indicator: Indicator;
    metadata: Record<string, MetadataReportItem> | null;
  }>;
  /** While chart/data is not ready or metadata requests are in flight. */
  metadataLoading?: boolean;
  /** When provided with onTabChange, shows icon-only tab switchers at the top. */
  activeTab?: VisualizerContentViewTab;
  onTabChange?: (tab: VisualizerContentViewTab) => void;
  /** Title font style from viz settings; applied to all h3 headings. */
  titleFont?: FontStyle;
  /** Subtitle font style from viz settings; applied to p text. */
  subtitleFont?: FontStyle;
  /** Called when the Insights icon button is clicked in the tab bar. */
  onInsightsClick?: () => void;
  /** Whether the Insights panel is currently active/open. */
  insightsActive?: boolean;
}

function stripHtml(html: string): string {
  if (typeof document !== "undefined") {
    const div = document.createElement("div");
    div.innerHTML = html;
    return div.textContent ?? div.innerText ?? "";
  }
  return html.replace(/<[^>]*>/g, "");
}

/** Single indicator metadata section (no card wrapper); used inside the scrollable card body. */
function MetadataSection({
  indicator,
  metadata,
  titleFont,
  subtitleFont,
}: {
  indicator: Indicator;
  metadata: Record<string, MetadataReportItem> | null;
  titleFont?: FontStyle;
  subtitleFont?: FontStyle;
}) {
  const { t } = useCore();

  const sortedEntries = useMemo(() => {
    if (!metadata) return [];
    return Object.values(metadata).sort((a, b) => a.mt_catg_order - b.mt_catg_order);
  }, [metadata]);

  return (
    <section className="py-4 first:pt-0 border-b border-gray-200 last:border-b-0">
      <h3 className="text-sm text-gray-900 font-semibold mb-4" style={getFontStyle(titleFont)}>
        {indicator.name}
      </h3>
      {metadata === null || sortedEntries.length === 0 ? (
        <p className="text-gray-500" style={getFontStyle(subtitleFont)}>{t("VISUALIZER_METADATA_METADATA_NOT_AVAILABLE")}</p>
      ) : (
        <div className="space-y-4">
          {sortedEntries.map((entry, idx) => (
            <div
              key={entry.mt_rpt_nid}
              className={`grid grid-cols-1 md:grid-cols-3 gap-2 md:gap-4 py-3 ${idx < sortedEntries.length - 1 ? "border-b border-gray-200" : ""
                }`}
            >
              <div className="text-gray-600 text-xs font-medium md:font-normal">
                {entry.mt_catg_name}
              </div>
              <div className="col-span-1 md:col-span-2 text-gray-900 text-xs min-w-0 break-words">
                {stripHtml(entry.mt_rpt_metadata)}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

export function MetadataTab({
  items,
  metadataLoading = false,
  activeTab = "metadata",
  onTabChange,
  titleFont,
  subtitleFont,
  onInsightsClick,
  insightsActive = false,
}: MetadataTabProps) {
  const { t } = useCore();

  const tabIconsNode: ReactNode =
    onTabChange ? (
      <VisualizerTabIcons activeTab={activeTab} onTabChange={onTabChange} onInsightsClick={onInsightsClick} insightsActive={insightsActive} />
    ) : null;

  return (
    <div id="metadata-tab-export-target" className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-gray-200 bg-white w-full">
      {/* Fixed header: title + tab switchers */}
      <div className="flex-shrink-0 flex items-center justify-between gap-3 px-4 sm:px-6 py-4 border-b border-gray-200">
        <h3 className="text-sm text-gray-900 font-semibold" style={getFontStyle(titleFont)}>{t("VISUALIZER_TAB_METADATA")}</h3>
        {tabIconsNode}
      </div>
      {/* Scrollable body: all indicators' metadata, one by one */}
      <div className="flex-1 min-h-0 overflow-auto px-4 sm:px-6 py-4">
        {metadataLoading ? (
          <div
            className="flex h-full min-h-[12rem] items-center justify-center"
            aria-busy
            aria-label={t("VISUALIZER_ARIA_LOADING_METADATA")}
          >
            <Loader
              ariaLabel={t("VISUALIZER_ARIA_LOADING_METADATA")}
              loadingLabel={t("COMMON_LOADING")}
            />
          </div>
        ) : items.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center max-w-md">
              <AlertCircle className="w-16 h-16 text-gray-300 mx-auto mb-4" />
              <h3 className="text-gray-900 mb-2" style={getFontStyle(titleFont)}>{t("VISUALIZER_METADATA_NO_INDICATOR_SELECTED")}</h3>
              <p className="text-gray-500" style={getFontStyle(subtitleFont)}>
                {t("VISUALIZER_METADATA_SELECT_INDICATOR_TO_VIEW")}
              </p>
            </div>
          </div>
        ) : (
          items.map(({ indicator, metadata }) => (
            <MetadataSection
              key={indicator.id}
              indicator={indicator}
              metadata={metadata}
              titleFont={titleFont}
              subtitleFont={subtitleFont}
            />
          ))
        )}
      </div>
    </div>
  );
}
