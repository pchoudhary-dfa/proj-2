"use client";

import { useRef } from "react";
import {
  ChartRendererWrapper,
  type ChartRendererWrapperRef,
} from "dfa-v6-comp-visualization";
import "dfa-v6-comp-visualization/styles";

import type { VisualizationTypeId } from "@/lib/dashboards/types";
import type { VisualizationSettings } from "@/lib/visualizations/types";
import { useChartData } from "@/hooks/useChartData";

const SUPPORTED_CHART_TYPES = new Set<VisualizationTypeId>([
  "bar",
  "line",
  "area",
  "pie",
]);

const CUSTOM_TYPES = new Set<VisualizationTypeId>(["html", "text", "image", "video"]);

type ChartPreviewProps = {
  vizSettings?: VisualizationSettings;
  typeId: VisualizationTypeId | null;
  baseUrl: string;
  height?: number;
  className?: string;
};

export function ChartPreview({
  vizSettings,
  typeId,
  baseUrl,
  height = 280,
  className = "",
}: ChartPreviewProps) {
  const chartRef = useRef<ChartRendererWrapperRef | null>(null);
  const { chartData, chartConfig, isLoading, error } = useChartData(
    vizSettings,
    typeId,
    baseUrl,
  );

  if (typeId && CUSTOM_TYPES.has(typeId)) {
    return (
      <CustomTypePreview
        typeId={typeId}
        vizSettings={vizSettings}
        height={height}
        className={className}
      />
    );
  }

  if (!typeId || !SUPPORTED_CHART_TYPES.has(typeId)) {
    return (
      <div
        className={`flex items-center justify-center rounded-md border border-dashed border-border bg-surface-muted text-xs text-text-muted ${className}`}
        style={{ height }}
      >
        <span
          className="material-icons mr-1 !text-base opacity-50"
          aria-hidden
        >
          info
        </span>
        Preview not available for &ldquo;{typeId}&rdquo; type
      </div>
    );
  }

  if (isLoading) {
    return (
      <div
        className={`flex items-center justify-center rounded-md border border-dashed border-border bg-surface-muted text-xs text-text-muted ${className}`}
        style={{ height }}
      >
        <span
          className="material-icons mr-1 !text-base animate-spin"
          aria-hidden
        >
          autorenew
        </span>
        Loading chart data&hellip;
      </div>
    );
  }

  if (error) {
    return (
      <div
        className={`flex items-center justify-center rounded-md border border-dashed border-border bg-surface-muted text-xs text-text-muted ${className}`}
        style={{ height }}
      >
        <span
          className="material-icons mr-1 !text-base opacity-50 text-red-500"
          aria-hidden
        >
          error_outline
        </span>
        {error}
      </div>
    );
  }

  if (!chartData) {
    return (
      <div
        className={`flex flex-col items-center justify-center rounded-md border border-dashed border-border bg-surface-muted text-xs text-text-muted gap-1 ${className}`}
        style={{ height }}
      >
        <span
          className="material-icons !text-base opacity-50"
          aria-hidden
        >
          bar_chart
        </span>
        Select indicators to preview chart
      </div>
    );
  }

  return (
    <div className={`w-full ${className}`} style={{ height }}>
      <ChartRendererWrapper
        data={chartData}
        config={chartConfig}
        minHeight={height - 20}
        chartRef={chartRef}
      />
    </div>
  );
}

// ─── Custom Type Renderers ──────────────────────────────────────────────────

function CustomTypePreview({
  typeId,
  vizSettings,
  height,
  className = "",
}: {
  typeId: VisualizationTypeId;
  vizSettings?: VisualizationSettings;
  height: number;
  className?: string;
}) {
  switch (typeId) {
    case "html":
      return <HtmlPreview vizSettings={vizSettings} height={height} className={className} />;
    case "text":
      return <TextPreview vizSettings={vizSettings} height={height} className={className} />;
    case "image":
      return <ImagePreview vizSettings={vizSettings} height={height} className={className} />;
    case "video":
      return <VideoPreview vizSettings={vizSettings} height={height} className={className} />;
    default:
      return null;
  }
}

function HtmlPreview({
  vizSettings,
  height,
  className,
}: {
  vizSettings?: VisualizationSettings;
  height: number;
  className: string;
}) {
  const html = vizSettings?.customHtml?.html;
  const noDataText = vizSettings?.customHtml?.noDataText || "No data available";

  if (!html) {
    return (
      <div
        className={`flex items-center justify-center bg-surface text-xs text-text-muted ${className}`}
        style={{ height }}
      >
        <span className="material-icons mr-1 !text-base opacity-50" aria-hidden>code</span>
        {noDataText}
      </div>
    );
  }

  return (
    <div
      className={`w-full h-full overflow-auto bg-surface ${className}`}
      style={{ minHeight: height }}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

function TextPreview({
  vizSettings,
  height,
  className,
}: {
  vizSettings?: VisualizationSettings;
  height: number;
  className: string;
}) {
  const textSettings = vizSettings?.customText;
  const text = textSettings?.text;

  if (!text) {
    return (
      <div
        className={`flex items-center justify-center bg-surface text-xs text-text-muted ${className}`}
        style={{ height }}
      >
        <span className="material-icons mr-1 !text-base opacity-50" aria-hidden>edit</span>
        No text content
      </div>
    );
  }

  const style: React.CSSProperties = {
    fontFamily: textSettings?.fontFamily || undefined,
    fontWeight: textSettings?.bold ? "bold" : undefined,
    fontStyle: textSettings?.italic ? "italic" : undefined,
    textDecoration: textSettings?.underline ? "underline" : undefined,
    color: textSettings?.color || undefined,
    minHeight: height,
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
  };

  return (
    <div
      className={`w-full h-full overflow-auto bg-surface p-3 text-sm ${className}`}
      style={style}
    >
      {text}
    </div>
  );
}

function ImagePreview({
  vizSettings,
  height,
  className,
}: {
  vizSettings?: VisualizationSettings;
  height: number;
  className: string;
}) {
  const imgSettings = vizSettings?.customImage;
  const src = imgSettings?.source === "url" ? imgSettings?.url : imgSettings?.mediaFile;

  if (!src) {
    return (
      <div
        className={`flex items-center justify-center bg-surface text-xs text-text-muted ${className}`}
        style={{ height }}
      >
        <span className="material-icons mr-1 !text-base opacity-50" aria-hidden>image</span>
        No image selected
      </div>
    );
  }

  const unit = imgSettings?.unit ?? "%";
  const imgStyle: React.CSSProperties = {
    width: imgSettings?.width ? `${imgSettings.width}${unit}` : "100%",
    height: imgSettings?.height ? `${imgSettings.height}${unit}` : "auto",
    borderWidth: imgSettings?.borderWidth ?? 0,
    borderStyle: (imgSettings?.borderWidth ?? 0) > 0 ? "solid" : "none",
    borderRadius: imgSettings?.borderRadius ?? 0,
    objectFit: "contain",
  };

  const alignClass =
    imgSettings?.align === "left" ? "items-start" :
    imgSettings?.align === "right" ? "items-end" : "items-center";

  return (
    <div
      className={`flex flex-col justify-center ${alignClass} w-full h-full overflow-hidden bg-surface ${className}`}
      style={{ minHeight: height }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt="" style={imgStyle} />
    </div>
  );
}

function VideoPreview({
  vizSettings,
  height,
  className,
}: {
  vizSettings?: VisualizationSettings;
  height: number;
  className: string;
}) {
  const vidSettings = vizSettings?.customVideo;
  const videoUrl = vidSettings?.videoUrl;
  const mediaSrc = vidSettings?.source === "media" ? vidSettings?.mediaFile : null;
  const src = videoUrl || mediaSrc;

  if (!src) {
    return (
      <div
        className={`flex items-center justify-center bg-surface text-xs text-text-muted ${className}`}
        style={{ height }}
      >
        <span className="material-icons mr-1 !text-base opacity-50" aria-hidden>videocam</span>
        No video source
      </div>
    );
  }

  const isEmbed = src.includes("youtube") || src.includes("vimeo") || src.includes("youtu.be");
  const autoSize = vidSettings?.autoSize ?? true;

  const containerStyle: React.CSSProperties = {
    minHeight: height,
    width: autoSize ? "100%" : (vidSettings?.width ? `${vidSettings.width}px` : "100%"),
    height: autoSize ? "100%" : (vidSettings?.height ? `${vidSettings.height}px` : "100%"),
  };

  if (isEmbed) {
    const embedUrl = src
      .replace("watch?v=", "embed/")
      .replace("youtu.be/", "youtube.com/embed/");

    return (
      <div
        className={`w-full h-full overflow-hidden bg-surface ${className}`}
        style={containerStyle}
      >
        <iframe
          src={embedUrl}
          title="Video"
          className="w-full h-full border-0"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        />
      </div>
    );
  }

  return (
    <div
      className={`flex items-center justify-center w-full h-full overflow-hidden bg-surface ${className}`}
      style={containerStyle}
    >
      <video src={src} controls className="w-full h-full object-contain">
        <track kind="captions" />
      </video>
    </div>
  );
}
