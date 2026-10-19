"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";
import { X, Info } from "lucide-react";
import { useCore } from "@/contexts/CoreContext";

export interface AboutPanelProps {
  open: boolean;
  onClose: () => void;
}

export function AboutPanel({ open, onClose }: AboutPanelProps) {
  const { t } = useCore();

  useEffect(() => {
    if (!open) return;
    function handleEsc(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleEsc);
    return () => document.removeEventListener("keydown", handleEsc);
  }, [open, onClose]);

  if (!open) return null;

  const panelUi = (
    <>
      <div
        className="fixed inset-0 top-[var(--height-header)] z-[200] bg-black/40"
        onClick={onClose}
        aria-hidden
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-label={t("ABOUT_US", "About")}
        className="fixed top-[var(--height-header)] bottom-0 right-0 rtl:right-auto rtl:left-0 z-[210] flex w-[min(90vw,24rem)] min-h-0 flex-col border-l rtl:border-l-0 rtl:border-r border-border bg-surface shadow-xl"
      >
        <div className="px-4 py-3 bg-surface-muted border-b border-border">
          <div className="flex items-center justify-between">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-text">
              <Info className="w-4 h-4 text-primary" />
              {t("ABOUT_US", "About")}
            </h3>
            <button
              type="button"
              onClick={onClose}
              className="p-1 text-text-muted hover:text-text hover:bg-surface rounded transition-colors"
              aria-label={t("CLOSE", "Close")}
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-4">
          <p className="text-sm leading-relaxed text-text">
            {t("ABOUT_US_DESCRIPTION", "DFA Visualizer is a data visualization platform for exploring indicators by area, subgroup, and time period.")}
          </p>
        </div>
      </div>
    </>
  );

  if (typeof document === "undefined") return null;
  return createPortal(panelUi, document.body);
}
