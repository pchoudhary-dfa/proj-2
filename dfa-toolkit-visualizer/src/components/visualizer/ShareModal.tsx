"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { X, Copy, Check, Facebook, Loader2 } from "lucide-react";
import { useCore } from "@/contexts/CoreContext";
import TableChartIcon from "@mui/icons-material/TableChart";
import { getTooltipHandlers } from "@/components/CustomTooltip";
import type { Indicator, FilterValues, SelectedComponents, VisualizationConfig } from "@/lib/visualizer/types";
import {
  getMinimalSharePayload,
  sharePayloadToQueryString,
} from "@/lib/visualizer/embed/shareUrl";

interface ShareModalProps {
  isOpen: boolean;
  onClose: () => void;
  indicator: Indicator | null;
  filters: FilterValues;
  /** Current selected components; used to build minimal share URL (only what user selected). */
  selectedComponents?: SelectedComponents;
  /** @deprecated No longer used. */
  hasEditedChart?: boolean;
  /** Current viz settings; when set with indicator selection, the full state is stored server-side. */
  vizSettings?: VisualizationConfig | null;
  /** Locale for share URL path (e.g. en). Default "en". */
  locale?: string;
}

async function createShareLink(
  fetchParams: Record<string, unknown>,
  chartConfig: Record<string, unknown>,
): Promise<string | null> {
  try {
    const res = await fetch("/api/proxy/share-links", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fetchParams, chartConfig }),
    });
    if (!res.ok) return null;
    const json = await res.json();
    return json?.data?.code ?? null;
  } catch {
    return null;
  }
}

export function ShareModal({
  isOpen,
  onClose,
  indicator,
  filters,
  selectedComponents = {},
  hasEditedChart = false,
  vizSettings = null,
  locale = "en",
}: ShareModalProps) {
  const { t } = useCore();
  const [activeTab, setActiveTab] = useState<"share" | "embed" | "info">("share");
  const [copied, setCopied] = useState(false);
  const [shortCode, setShortCode] = useState<string | null>(null);
  const [isCreatingLink, setIsCreatingLink] = useState(false);
  const lastPayloadKeyRef = useRef<string>("");

  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const minimalPayload = getMinimalSharePayload(selectedComponents);
  const queryString = sharePayloadToQueryString(minimalPayload);

  const hasFullState = !!(vizSettings && minimalPayload.indicator?.length);

  // Stable serialized key so the effect doesn't re-fire on referential identity changes.
  const payloadKey = useMemo(
    () => (hasFullState ? JSON.stringify(minimalPayload) + JSON.stringify(vizSettings) : ""),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [hasFullState, JSON.stringify(minimalPayload), JSON.stringify(vizSettings)]
  );

  useEffect(() => {
    if (!isOpen) {
      setShortCode(null);
      lastPayloadKeyRef.current = "";
      return;
    }
    if (!hasFullState || !payloadKey) return;
    if (payloadKey === lastPayloadKeyRef.current) return;
    lastPayloadKeyRef.current = payloadKey;

    setIsCreatingLink(true);
    createShareLink(
      minimalPayload as unknown as Record<string, unknown>,
      vizSettings as unknown as Record<string, unknown>,
    ).then((code) => {
      setShortCode(code);
      setIsCreatingLink(false);
    });
    // payloadKey already captures minimalPayload + vizSettings content;
    // lastPayloadKeyRef prevents duplicate requests across re-renders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, payloadKey]);

  const shareUrl = shortCode
    ? `${origin}/${locale}/visualize?v=${shortCode}`
    : queryString
      ? `${origin}/${locale}/visualize?${queryString}`
      : `${origin}/${locale}/visualize`;

  const embedUrl = shortCode
    ? `${origin}/${locale}/visualize/embed?v=${shortCode}`
    : queryString
      ? `${origin}/${locale}/visualize/embed?${queryString}`
      : "";

  if (!isOpen) return null;

  const embedCode =
    embedUrl
      ? `<iframe src="${embedUrl}" width="800" height="500" frameborder="0" allowfullscreen></iframe>`
      : "";

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  /** Share the same URL as Copy URL to a platform. urlToShare must be the exact shareUrl so social share never drifts from copy. */
  const handleShare = (platform: string, urlToShare: string) => {
    const introText = `${t("VISUALIZER_SHARE_CHECKOUT_PREFIX")} ${indicator?.name ?? t("VISUALIZER_SHARE_CHART_FALLBACK")}`;
    const encodedUrl = encodeURIComponent(urlToShare);

    const urls: Record<string, string> = {
      whatsapp: `https://wa.me/?text=${encodeURIComponent(introText + " " + urlToShare)}`,
      // LinkedIn share-offsite may strip query params or fail for some users; if so, use Copy URL above.
      linkedin: `https://www.linkedin.com/sharing/share-offsite/?url=${encodedUrl}`,
      gmail: `https://mail.google.com/mail/?view=cm&su=${encodeURIComponent(introText)}&body=${encodeURIComponent(introText + "\n\n" + urlToShare)}`,
      facebook: `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`,
    };

    const target = urls[platform];
    if (target) window.open(target, "_blank");
  };

  return (
    <div
      className="fixed inset-0 flex items-center justify-center z-50"
      onClick={onClose}
      style={{ backgroundColor: "rgba(0, 0, 0, 0.3)" }}
    >
      <div
        className="bg-surface rounded-lg shadow-xl max-w-3xl w-full mx-4 max-h-[90vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 className="text-text">{t("VISUALIZER_SHARE_MODAL_TITLE")}</h2>
          <button
            onClick={onClose}
            className="text-text-muted hover:text-text transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex border-b border-border">
          <button
            onClick={() => setActiveTab("share")}
            className={`px-6 py-3 font-medium transition-colors ${activeTab === "share"
              ? "border-b-2 border-primary text-primary"
              : "text-text-muted hover:text-text"
              }`}
          >
            {t("VISUALIZER_SHARE_TAB")}
          </button>
          <button
            onClick={() => setActiveTab("embed")}
            className={`px-6 py-3 font-medium transition-colors ${activeTab === "embed"
              ? "border-b-2 border-primary text-primary"
              : "text-text-muted hover:text-text"
              }`}
          >
            {t("VISUALIZER_SHARE_EMBED")}
          </button>
          <button
            onClick={() => setActiveTab("info")}
            className={`px-6 py-3 font-medium transition-colors ${activeTab === "info"
              ? "border-b-2 border-primary text-primary"
              : "text-text-muted hover:text-text"
              }`}
          >
            {t("VISUALIZER_SHARE_INFO_TAB")}
          </button>
        </div>

        <div className="p-6 overflow-y-auto flex-1">
          {activeTab === "share" && (
            <div className="space-y-6">
              <div>
                <label className="block text-text font-medium mb-3">
                  {t("VISUALIZER_SHARE_URL_LABEL")}
                </label>
                <div className="flex gap-2">
                  <div className="flex-1 relative">
                    <input
                      type="text"
                      value={isCreatingLink ? "" : shareUrl}
                      readOnly
                      className="w-full px-4 py-2 border border-border rounded-lg bg-surface-muted text-text text-sm"
                    />
                    {isCreatingLink && (
                      <div className="absolute inset-0 flex items-center px-4">
                        <Loader2 className="w-4 h-4 animate-spin text-text-muted mr-2" />
                        <span className="text-sm text-text-muted">{t("VISUALIZER_SHARE_GENERATING") || "Generating link..."}</span>
                      </div>
                    )}
                  </div>
                  <button
                    onClick={() => handleCopy(shareUrl)}
                    disabled={isCreatingLink}
                    className="btn-comp-primary px-6 py-2 font-medium flex items-center gap-2 disabled:opacity-50"
                  >
                    {copied ? (
                      <Check className="w-4 h-4" />
                    ) : (
                      <Copy className="w-4 h-4" />
                    )}
                    {copied ? t("VISUALIZER_SHARE_COPIED") : t("VISUALIZER_SHARE_COPY")}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-text font-medium mb-3">
                  {t("VISUALIZER_SHARE_SOCIAL_LABEL")}
                </label>
                <div className="flex gap-3">
                  <button
                    onClick={() => handleShare("whatsapp", shareUrl)}
                    className="p-3 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors"
                    {...getTooltipHandlers(t("VISUALIZER_SHARE_WHATSAPP_TOOLTIP"))}
                  >
                    <svg
                      className="w-6 h-6"
                      fill="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z" />
                    </svg>
                  </button>
                  <button
                    onClick={() => handleShare("linkedin", shareUrl)}
                    className="p-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                    {...getTooltipHandlers(t("VISUALIZER_SHARE_LINKEDIN_TOOLTIP"))}
                  >
                    <svg
                      className="w-6 h-6"
                      fill="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
                    </svg>
                  </button>
                  <button
                    onClick={() => handleShare("facebook", shareUrl)}
                    className="p-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
                    {...getTooltipHandlers(t("VISUALIZER_SHARE_FACEBOOK_TOOLTIP"))}
                  >
                    <Facebook className="w-6 h-6" />
                  </button>
                  <button
                    onClick={() => handleShare("gmail", shareUrl)}
                    className="p-3 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors"
                    {...getTooltipHandlers(t("VISUALIZER_SHARE_MAIL_TOOLTIP"))}
                  >
                    <svg
                      className="w-6 h-6"
                      fill="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path d="M24 5.457v13.909c0 .904-.732 1.636-1.636 1.636h-3.819V11.73L12 16.64l-6.545-4.91v9.273H1.636A1.636 1.636 0 0 1 0 19.366V5.457c0-2.023 2.309-3.178 3.927-1.964L12 9.545l8.073-6.052C21.69 2.28 24 3.434 24 5.457z" />
                    </svg>
                  </button>
                </div>
              </div>
            </div>
          )}

          {activeTab === "embed" && (
            <div className="space-y-4">
              <div className="flex items-start gap-3 bg-surface-muted p-4 rounded-lg">
                <TableChartIcon className="w-5 h-5 text-text-muted mt-1" sx={{ fontSize: 20 }} />
                <div className="text-text text-sm">{t("VISUALIZER_SHARE_EMBED_INFO")}</div>
              </div><div><label className="block text-text font-medium mb-3">{t("VISUALIZER_SHARE_EMBED_CODE_LABEL")}</label>
                {embedUrl ? (
                  <div className="relative">
                    <pre className="p-4 bg-surface-muted border border-border rounded-lg text-xs text-text whitespace-pre-wrap break-all">
                      {embedCode}
                    </pre>
                    <button
                      onClick={() => handleCopy(embedCode)}
                      className="absolute top-3 right-3 rtl:right-auto rtl:left-3 btn-comp-primary px-4 py-1.5 text-sm font-medium"
                    >
                      {copied ? t("VISUALIZER_SHARE_COPIED") : t("VISUALIZER_SHARE_COPY")}
                    </button>
                  </div>
                ) : (
                  <p className="text-sm text-text-muted">
                    {t("VISUALIZER_SHARE_EMBED_EMPTY")}
                  </p>
                )}
              </div>
            </div>
          )}

          {activeTab === "info" && (
            <div className="space-y-4 text-text">
              <p>
                <strong className="text-text">{t("VISUALIZER_SHARE_INFO_SHARE_LEAD")}</strong>{" "}
                {t("VISUALIZER_SHARE_INFO_SHARE_TEXT")}
              </p>
              <p>
                <strong className="text-text">{t("VISUALIZER_SHARE_INFO_EMBED_LEAD")}</strong>{" "}
                {t("VISUALIZER_SHARE_INFO_EMBED_TEXT")}
              </p>
            </div>
          )}
        </div>

      </div>
    </div >
  );
}
