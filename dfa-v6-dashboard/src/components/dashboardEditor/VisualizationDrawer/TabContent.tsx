// ─── Tab content dispatcher ─────────────────────────────────────────────────

import { VisualizationState } from "@/lib/visualizations/types";
import ChartsTab from "./ChartsTab";
import DataTab from "./DataTab";
import GeneralTab from "./GeneralTab";
import SeriesTab from "./SeriesTab";
import CategoriesTab from "./CategoriesTab";
import ThemeTab from "./ThemeTab";
import AdvanceTab from "./AdvanceTab";
import CustomizeHtmlTab from "./CustomizeHtmlTab";
import HtmlAdvanceTab from "./HtmlAdvanceTab";
import ContextMenuTab from "./ContextMenuTab";
import TextSettingsTab from "./TextSettingsTab";
import ImageGeneralTab from "./ImageGeneralTab";
import VideoGeneralTab from "./VideoGeneralTab";
import { DEFAULT_CUSTOM_HTML, DEFAULT_CUSTOM_TEXT, DEFAULT_CUSTOM_IMAGE, DEFAULT_CUSTOM_VIDEO } from "@/lib/visualizations/defaults";

export default function TabContent({
    activeTab,
    vizState,
    setVizState,
    baseUrl,
  }: {
    activeTab: string;
    vizState: VisualizationState;
    setVizState: React.Dispatch<React.SetStateAction<VisualizationState>>;
    baseUrl: string;
  }) {
    switch (activeTab) {
      // ── Shared chart tabs ───────────────────────────────────────────────
      case "charts":
        return (
          <ChartsTab
            vizName={vizState.name}
            chartsState={vizState.settings.charts}
            setVizState={setVizState}
          />
        );
      case "data":
        return (
          <DataTab
            baseUrl={baseUrl}
            dataState={vizState.settings.data}
            setVizState={setVizState}
          />
        );
      case "general":
        return (
          <GeneralTab
            generalState={vizState.settings.general}
            setVizState={setVizState}
          />
        );
      case "series":
        return (
          <SeriesTab
            seriesState={vizState.settings.series}
            setVizState={setVizState}
          />
        );
      case "categories":
        return (
          <CategoriesTab
            categoriesState={vizState.settings.categories}
            setVizState={setVizState}
          />
        );
      case "theme":
        return (
          <ThemeTab
            themeState={vizState.settings.theme}
            setVizState={setVizState}
          />
        );
      case "advance":
        return (
          <AdvanceTab
            advanceState={vizState.settings.advance}
            setVizState={setVizState}
          />
        );
  
      case "customize_html":
        return (
          <CustomizeHtmlTab
            htmlState={vizState.settings.customHtml ?? DEFAULT_CUSTOM_HTML}
            setVizState={setVizState}
          />
        );
      case "html_advance":
        return (
          <HtmlAdvanceTab
            htmlState={vizState.settings.customHtml ?? DEFAULT_CUSTOM_HTML}
            setVizState={setVizState}
          />
        );
      case "context_menu":
        return (
          <ContextMenuTab
            htmlState={vizState.settings.customHtml ?? DEFAULT_CUSTOM_HTML}
            setVizState={setVizState}
          />
        );
  
      // ── Text tab ────────────────────────────────────────────────────────
      case "text_settings":
        return (
          <TextSettingsTab
            textState={vizState.settings.customText ?? DEFAULT_CUSTOM_TEXT}
            setVizState={setVizState}
          />
        );
  
      // ── Image tab ───────────────────────────────────────────────────────
      case "image_general":
        return (
          <ImageGeneralTab
            imageState={vizState.settings.customImage ?? DEFAULT_CUSTOM_IMAGE}
            setVizState={setVizState}
          />
        );
  
      // ── Video tab ───────────────────────────────────────────────────────
      case "video_general":
        return (
          <VideoGeneralTab
            videoState={vizState.settings.customVideo ?? DEFAULT_CUSTOM_VIDEO}
            setVizState={setVizState}
          />
        );
  
      default:
        return null;
    }
  }