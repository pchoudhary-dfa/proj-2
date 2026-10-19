"use client";

import { ReactNode, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useCore } from "@/contexts/CoreContext";

const DESKTOP_RESIZE_MIN_W = 320;
const DESKTOP_RESIZE_MIN_H = 280;
const DESKTOP_RESIZE_MAX_W = 1200;

/** Above `.app-header--surface` (z-250) and settings drawers (z-210). */
const SELECTION_MODAL_Z_CLASS = "z-[300]";

export type SelectionModalApi = {
  getSelected(): unknown[];
  clear(): void;
};

const MOBILE_BREAKPOINT_PX = 768;

function useIsMobileViewport() {
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT_PX - 1}px)`);
    const update = () => setIsMobile(mql.matches);
    update();
    mql.addEventListener("change", update);
    return () => mql.removeEventListener("change", update);
  }, []);
  return isMobile;
}

type SelectionModalProps<T> = {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  onApply: (selected: T[]) => void;
  /** Callback to get the child API (e.g. from IndicatorSelect onReady). Modal calls getApi()?.clear() and getApi()?.getSelected() for Clear/Apply. */
  getApi: () => SelectionModalApi | null;
  children: ReactNode;
  showClear?: boolean;
  /** When set, modal is positioned with its left edge at this offset (e.g. filter sidebar width) instead of centered. */
  anchorLeft?: number;
  /** When anchorLeft is set, top offset in px so the dialog aligns with filter content (default 48). */
  anchorTop?: number;
};

export function SelectionModal<T>({
  isOpen,
  onClose,
  title,
  onApply,
  getApi,
  children,
  showClear = true,
  anchorLeft,
  anchorTop = 48,
}: SelectionModalProps<T>) {
  const { t } = useCore();
  const isMobile = useIsMobileViewport();
  const panelRef = useRef<HTMLDivElement>(null);
  const resizeCleanupRef = useRef<(() => void) | null>(null);
  const [desktopSize, setDesktopSize] = useState<{ w: number; h: number } | null>(null);

  useEffect(() => {
    if (!isOpen) {
      setDesktopSize(null);
      resizeCleanupRef.current?.();
      resizeCleanupRef.current = null;
    }
  }, [isOpen]);

  useEffect(() => {
    return () => {
      resizeCleanupRef.current?.();
      resizeCleanupRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (isMobile) {
      setDesktopSize(null);
      resizeCleanupRef.current?.();
      resizeCleanupRef.current = null;
    }
  }, [isMobile]);

  function handleResizePointerDown(e: React.PointerEvent<HTMLButtonElement>) {
    if (isMobile) return;
    e.preventDefault();
    e.stopPropagation();
    const el = panelRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const pointerId = e.pointerId;
    const startX = e.clientX;
    const startY = e.clientY;
    const baseW = desktopSize?.w ?? rect.width;
    const baseH = desktopSize?.h ?? rect.height;
    const prevUserSelect = document.body.style.userSelect;
    document.body.style.userSelect = "none";

    function onMove(ev: PointerEvent) {
      if (ev.pointerId !== pointerId) return;
      const maxW = Math.min(window.innerWidth - 24, DESKTOP_RESIZE_MAX_W);
      const maxH = window.innerHeight * 0.82;
      const dw = ev.clientX - startX;
      const dh = ev.clientY - startY;
      setDesktopSize({
        w: Math.round(Math.max(DESKTOP_RESIZE_MIN_W, Math.min(maxW, baseW + dw))),
        h: Math.round(Math.max(DESKTOP_RESIZE_MIN_H, Math.min(maxH, baseH + dh))),
      });
    }

    function cleanup() {
      document.body.style.userSelect = prevUserSelect;
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      resizeCleanupRef.current = null;
    }

    function onUp(ev: PointerEvent) {
      if (ev.pointerId !== pointerId) return;
      cleanup();
    }

    resizeCleanupRef.current = cleanup;
    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
  }

  function handleClear() {
    getApi()?.clear();
  }

  function handleApply() {
    const selected = (getApi()?.getSelected() ?? []) as T[];
    onApply(selected);
    // Defer close so parent state update (e.g. selectedComponents.timePeriod) is committed before modal unmounts
    queueMicrotask(() => onClose());
  }

  if (!isOpen) return null;

  const content = (
    <div className="flex-1 min-h-0 min-w-0 flex flex-col overflow-x-auto overflow-y-auto">
      {children}
    </div>
  );

  /** On mobile, always use centered full-width layout so the dialog stays on screen. */
  const useMobileLayout = isMobile;
  const isAnchored = !useMobileLayout && anchorLeft != null;
  const desktopHasCustomSize = !useMobileLayout && desktopSize != null;

  const overlayStyle = isAnchored
    ? undefined
    : { display: "flex" as const, alignItems: "center", justifyContent: "center", padding: 16 };

  /** Mobile: generous side margins and safe-area so nothing is cropped on notched devices. */
  const mobileMargin = 20;
  const panelStyle = useMobileLayout
    ? {
        position: "fixed" as const,
        top: "max(16px, env(safe-area-inset-top))",
        left: `max(${mobileMargin}px, env(safe-area-inset-left))`,
        right: `max(${mobileMargin}px, env(safe-area-inset-right))`,
        bottom: "auto",
        maxHeight: "82vh",
        height: 620,
        maxWidth: `calc(100vw - ${mobileMargin * 2}px)`,
        boxSizing: "border-box" as const,
      }
    : isAnchored
      ? { top: anchorTop, left: anchorLeft }
      : undefined;

  return createPortal(
    <div
      className={`fixed inset-0 ${SELECTION_MODAL_Z_CLASS} bg-black/40`}
      onClick={onClose}
      style={overlayStyle}
    >
      <div
        ref={panelRef}
        className={`bg-surface shadow-xl flex flex-col overflow-hidden rounded-xl relative ${
          useMobileLayout
            ? "w-full max-w-[calc(100vw-40px)]"
            : desktopHasCustomSize
              ? "w-auto min-w-0 max-h-[90vh]"
              : "w-full max-w-[560px] max-h-[82vh] h-[min(620px,82vh)]"
        } ${isAnchored ? "fixed" : ""}`}
        style={{
          ...panelStyle,
          ...(desktopHasCustomSize && desktopSize
            ? {
                width: desktopSize.w,
                height: desktopSize.h,
                maxWidth: `min(90vw, ${DESKTOP_RESIZE_MAX_W}px)`,
              }
            : {}),
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={`py-2 border-b border-border flex items-center justify-between flex-shrink-0 bg-surface-muted min-w-0 ${useMobileLayout ? "px-5" : "px-4"}`}>
          <h2 className="text-sm font-semibold text-text truncate min-w-0 flex-1 mr-2 rtl:mr-0 rtl:ml-2">{title}</h2>
          <button
            onClick={onClose}
            className="text-text-muted hover:text-text text-xl leading-none flex-shrink-0 w-8 h-8 flex items-center justify-center"
            aria-label={t("COMMON_CLOSE")}
          >
            ×
          </button>
        </div>
        {content}
        <div className={`py-2 border-t border-border flex items-center justify-between flex-shrink-0 bg-surface-muted ${useMobileLayout ? "px-5" : "px-4"}`}>
          {showClear ? (
            <button
              type="button"
              className="btn-comp-secondary text-xs py-1.5 px-2"
              onClick={handleClear}
            >
              {t("MODAL_CLEAR")}
            </button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="btn-comp-secondary text-xs py-1.5 px-3">
              {t("MODAL_CANCEL")}
            </button>
            <button type="button" onClick={handleApply} className="btn-comp-primary text-xs py-1.5 px-3">
              {t("MODAL_APPLY")}
            </button>
          </div>
        </div>
        {!useMobileLayout && (
          <button
            type="button"
            aria-label={t("COMMON_ARIA_RESIZE")}
            className="absolute bottom-0 right-0 rtl:right-auto rtl:left-0 z-10 h-4 w-4 cursor-se-resize rtl:cursor-sw-resize touch-none select-none border-0 bg-transparent p-0 opacity-0 focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1"
            onPointerDown={handleResizePointerDown}
          />
        )}
      </div>
    </div>,
    document.body,
  );
}
