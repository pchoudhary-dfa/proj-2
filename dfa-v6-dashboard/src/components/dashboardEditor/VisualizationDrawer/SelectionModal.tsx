"use client";

import {
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { useCore } from "@/contexts/CoreContext";

const DESKTOP_RESIZE_MIN_W = 320;
const DESKTOP_RESIZE_MIN_H = 280;
const DESKTOP_RESIZE_MAX_W = 1200;
const MOBILE_BREAKPOINT_PX = 768;

export type SelectionModalApi = {
  getSelected(): unknown[];
  clear(): void;
};

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
  getApi: () => SelectionModalApi | null;
  children: ReactNode;
  showClear?: boolean;
  applyDisabled?: boolean;
  applyLabel?: string;
};

export function SelectionModal<T>({
  isOpen,
  onClose,
  title,
  onApply,
  getApi,
  children,
  showClear = true,
  applyDisabled = false,
  applyLabel,
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

  function handleResizePointerDown(e: ReactPointerEvent<HTMLButtonElement>) {
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
    if (applyDisabled) return;
    const selected = (getApi()?.getSelected() ?? []) as T[];
    onApply(selected);
    queueMicrotask(() => onClose());
  }

  if (!isOpen) return null;
  if (typeof document === "undefined") return null;

  const useMobileLayout = isMobile;
  const desktopHasCustomSize = !useMobileLayout && desktopSize != null;
  const mobileMargin = 20;

  const panelStyle = useMobileLayout
    ? {
        position: "fixed" as const,
        top: "max(16px, env(safe-area-inset-top))",
        left: `max(${mobileMargin}px, env(safe-area-inset-left))`,
        right: `max(${mobileMargin}px, env(safe-area-inset-right))`,
        bottom: "auto",
        maxHeight: "calc(100vh - 40px)",
        height: 480,
        maxWidth: `calc(100vw - ${mobileMargin * 2}px)`,
        boxSizing: "border-box" as const,
      }
    : undefined;

  const panelClass = [
    "bg-surface shadow-xl flex flex-col overflow-hidden rounded-xl relative",
    useMobileLayout
      ? "w-full max-w-[calc(100vw-40px)]"
      : desktopHasCustomSize
        ? "w-auto min-w-0 max-h-[90vh]"
        : "w-full max-w-[560px] max-h-[82vh] h-[min(620px,82vh)]",
  ]
    .filter(Boolean)
    .join(" ");

  const overlay = (
    <div
      className="fixed inset-0 z-[600] bg-black/40 pointer-events-auto flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        ref={panelRef}
        className={panelClass}
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
        <div
          className={`py-2 border-b border-border flex items-center justify-between flex-shrink-0 bg-surface-muted min-w-0 ${useMobileLayout ? "px-5" : "px-4"}`}
        >
          <h2 className="text-sm font-semibold text-text truncate min-w-0 flex-1 mr-2 rtl:mr-0 rtl:ml-2">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="text-text-muted hover:text-text text-xl leading-none flex-shrink-0 w-8 h-8 flex items-center justify-center"
            aria-label={t("COMMON_CLOSE", "Close")}
          >
            &times;
          </button>
        </div>

        <div className="flex-1 min-h-0 min-w-0 flex flex-col overflow-x-auto overflow-y-auto">
          {children}
        </div>

        <div
          className={`py-2 border-t border-border flex items-center justify-between flex-shrink-0 bg-surface-muted ${useMobileLayout ? "px-5" : "px-4"}`}
        >
          {showClear ? (
            <button
              type="button"
              className="btn-comp-secondary btn-comp--comfortable text-xs px-2"
              onClick={handleClear}
            >
              {t("CLEAR", "Clear")}
            </button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="btn-comp-secondary btn-comp--comfortable text-xs"
            >
              {t("CANCEL", "Cancel")}
            </button>
            <button
              type="button"
              onClick={handleApply}
              disabled={applyDisabled}
              className="btn-comp-primary btn-comp--comfortable text-xs"
            >
              {applyLabel ?? t("MODAL_APPLY", "Apply")}
            </button>
          </div>
        </div>

        {!useMobileLayout && (
          <button
            type="button"
            aria-label={t("COMMON_ARIA_RESIZE", "Resize")}
            className="absolute bottom-0 right-0 rtl:right-auto rtl:left-0 z-10 h-4 w-4 cursor-se-resize rtl:cursor-sw-resize touch-none select-none border-0 bg-transparent p-0 opacity-0 focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1"
            onPointerDown={handleResizePointerDown}
          />
        )}
      </div>
    </div>
  );

  return createPortal(overlay, document.body);
}
