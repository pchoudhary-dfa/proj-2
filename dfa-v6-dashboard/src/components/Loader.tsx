"use client";

import { useCoreOptional } from "@/contexts/CoreContext";
import { getTranslationsFallback } from "@/lib/i18n/translations";
import type { CSSProperties } from "react";
import { useId } from "react";

const LOADING_LABEL_FALLBACK =
  getTranslationsFallback("en")["LOADING"] ?? "Loading...";

export interface LoaderProps {
  className?: string;
  ariaLabel?: string;
  size?: number;
  loadingLabel?: string;
  showStatusText?: boolean;
}

export function Loader({
  className,
  ariaLabel,
  size,
  loadingLabel,
  showStatusText = true,
}: LoaderProps) {
  const core = useCoreOptional();
  const resolvedLabel =
    loadingLabel ?? core?.t("LOADING") ?? LOADING_LABEL_FALLBACK;
  const maskId = useId();
  const containerStyle: CSSProperties =
    size !== undefined
      ? ({ "--loader-size": String(size) } as CSSProperties)
      : {};

  return (
    <div
      className={`loader ${className ?? ""}`.trim()}
      role="status"
      aria-label={ariaLabel ?? (resolvedLabel || undefined)}
      style={containerStyle}
    >
      <div className="loader__logo">
        <svg
          className="loader__svg"
          viewBox="0 0 100 100"
          aria-hidden
          focusable={false}
        >
          <defs>
            <mask id={maskId}>
              <path
                d="M10,15 L30,15 L50,75 L70,15 L90,15 L55,95 L45,95 L10,15 Z M28,45 L72,45 L72,55 L28,55 Z"
                fill="white"
              />
            </mask>
          </defs>
          <path
            d="M10,15 L30,15 L50,75 L70,15 L90,15 L55,95 L45,95 L10,15 Z M28,45 L72,45 L72,55 L28,55 Z"
            fill="rgba(255,255,255,0.2)"
            className="loader__ghost"
          />
          <g mask={`url(#${maskId})`}>
            <rect
              className="loader__fill-rect"
              x="0"
              y="0"
              width="100"
              height="100"
              fill="white"
            />
          </g>
        </svg>
      </div>
      {showStatusText ? (
        <p className="loader__status-text">{resolvedLabel}</p>
      ) : null}
    </div>
  );
}
