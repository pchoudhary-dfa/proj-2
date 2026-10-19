"use client";

import { useEffect } from "react";
import type {
  FocusEvent as ReactFocusEvent,
  KeyboardEvent as ReactKeyboardEvent,
  MouseEvent as ReactMouseEvent,
} from "react";

/**
 * Standalone custom tooltip: single DOM element, positioned above anchor.
 * Uses classes tooltip / tooltip-visible so styles from app globals.css apply.
 */

const TOOLTIP_DELAY_MS = 150;
const TOOLTIP_VIEWPORT_PADDING = 8;
const TOOLTIP_ANCHOR_GAP = 8;
const TOOLTIP_SUPPRESS_AFTER_POINTERDOWN_MS = 220;

export interface CustomTooltipApi {
  show(text: string, anchorEl: HTMLElement): void;
  hide(): void;
  scheduleShow(text: string, anchorEl: HTMLElement): void;
  destroy(): void;
}

type TooltipText = string | null | undefined;
type TooltipEventHandlers<T extends HTMLElement> = {
  onMouseEnter: (event: ReactMouseEvent<T>) => void;
  onMouseLeave: () => void;
  onFocus: (event: ReactFocusEvent<T>) => void;
  onBlur: () => void;
  onKeyDown: (event: ReactKeyboardEvent<T>) => void;
};

let sharedTooltip: CustomTooltipApi | null = null;

function normalizeTooltipText(text: TooltipText): string {
  return typeof text === "string" ? text.trim() : "";
}

/**
 * Creates a single shared tooltip element appended to document.body.
 * Returns an API used by chip search (or any consumer) to show/hide/schedule tooltip.
 */
export function createCustomTooltip(): CustomTooltipApi {
  if (typeof document === "undefined" || typeof window === "undefined") {
    return {
      show: () => {},
      hide: () => {},
      scheduleShow: () => {},
      destroy: () => {},
    };
  }

  let tooltipEl: HTMLElement | null = null;
  let showTimeout: ReturnType<typeof setTimeout> | null = null;
  let destroyed = false;
  let suppressUntilTs = 0;

  tooltipEl = document.createElement("div");
  tooltipEl.className = "tooltip";
  tooltipEl.setAttribute("data-sc", "tooltip");
  tooltipEl.setAttribute("role", "tooltip");
  tooltipEl.setAttribute("aria-hidden", "true");
  document.body.appendChild(tooltipEl);

  function clearShowTimeout(): void {
    if (showTimeout) {
      clearTimeout(showTimeout);
      showTimeout = null;
    }
  }

  function show(text: string, anchorEl: HTMLElement): void {
    if (!tooltipEl || destroyed || !text) return;
    if (!tooltipEl || destroyed) return;
    clearShowTimeout();
    if (Date.now() < suppressUntilTs) return;
    if (!text) {
      hide();
      return;
    }
    if (!anchorEl.isConnected) return;
    tooltipEl.textContent = text;
    const rect = anchorEl.getBoundingClientRect();
    tooltipEl.style.left = `${rect.left + rect.width / 2}px`;
    tooltipEl.style.top = `${rect.top}px`;
    tooltipEl.style.transform = "translate(-50%, -100%) translateY(-8px)";

    const viewportWidth = window.innerWidth || document.documentElement.clientWidth;
    const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
    const tooltipWidth = Math.max(tooltipEl.offsetWidth, 1);
    const tooltipHeight = Math.max(tooltipEl.offsetHeight, 1);

    // Preferred: tooltip centered over anchor (left edge computed from center).
    const preferredLeft = rect.left + rect.width / 2 - tooltipWidth / 2;
    const minLeft = TOOLTIP_VIEWPORT_PADDING;
    const maxLeft = viewportWidth - TOOLTIP_VIEWPORT_PADDING - tooltipWidth;
    const left =
      maxLeft >= minLeft
        ? Math.min(Math.max(preferredLeft, minLeft), maxLeft)
        : TOOLTIP_VIEWPORT_PADDING;

    // Keep tooltip in upper-middle of anchor by default.
    let top = rect.top - tooltipHeight - TOOLTIP_ANCHOR_GAP;

    const minTop = TOOLTIP_VIEWPORT_PADDING;
    const maxTop = Math.max(
      TOOLTIP_VIEWPORT_PADDING,
      viewportHeight - tooltipHeight - TOOLTIP_VIEWPORT_PADDING,
    );
    top = Math.min(Math.max(top, minTop), maxTop);

    tooltipEl.style.left = `${left}px`;
    tooltipEl.style.top = `${top}px`;
    tooltipEl.style.transform = ""; /* let CSS drive slide-up animation */
    tooltipEl.classList.add("tooltip-visible");
    tooltipEl.setAttribute("aria-hidden", "false");
  }

  function hide(): void {
    if (showTimeout) {
      clearTimeout(showTimeout);
      showTimeout = null;
    }
    clearShowTimeout();
    if (tooltipEl) {
      tooltipEl.classList.remove("tooltip-visible");
      tooltipEl.setAttribute("aria-hidden", "true");
    }
  }

  function scheduleShow(text: string, anchorEl: HTMLElement): void {
    clearShowTimeout();
    if (Date.now() < suppressUntilTs) return;
    showTimeout = setTimeout(() => {
      showTimeout = null;
      show(text, anchorEl);
    }, TOOLTIP_DELAY_MS);
  }

  const hideOnEscape = (event: KeyboardEvent) => {
    if (event.key === "Escape") hide();
  };
  const hideOnLayoutChange = () => hide();
  const hideOnPointerDown = () => {
    suppressUntilTs = Date.now() + TOOLTIP_SUPPRESS_AFTER_POINTERDOWN_MS;
    hide();
  };

  document.addEventListener("keydown", hideOnEscape, true);
  document.addEventListener("pointerdown", hideOnPointerDown, true);
  window.addEventListener("scroll", hideOnLayoutChange, true);
  window.addEventListener("resize", hideOnLayoutChange);
  window.addEventListener("blur", hideOnLayoutChange);

  function destroy(): void {
    if (destroyed) return;
    destroyed = true;
    hide();
    document.removeEventListener("keydown", hideOnEscape, true);
    document.removeEventListener("pointerdown", hideOnPointerDown, true);
    window.removeEventListener("scroll", hideOnLayoutChange, true);
    window.removeEventListener("resize", hideOnLayoutChange);
    window.removeEventListener("blur", hideOnLayoutChange);
    if (tooltipEl?.parentNode) {
      tooltipEl.parentNode.removeChild(tooltipEl);
      tooltipEl = null;
    }
  }

  return {
    show,
    hide,
    scheduleShow,
    destroy,
  };
}

/** Returns an app-wide singleton tooltip instance for consistent behavior across screens. */
export function getSharedCustomTooltip(): CustomTooltipApi {
  if (!sharedTooltip) sharedTooltip = createCustomTooltip();
  return sharedTooltip;
}

export function destroySharedCustomTooltip(): void {
  if (!sharedTooltip) return;
  sharedTooltip.destroy();
  sharedTooltip = null;
}

/**
 * Returns a consistent set of hover/focus handlers that show/hide the shared app tooltip.
 */
export function getTooltipHandlers<T extends HTMLElement>(
  text: TooltipText,
): TooltipEventHandlers<T> {
  const tooltip = getSharedCustomTooltip();

  const showFromTarget = (target: EventTarget | null) => {
    const tooltipText = normalizeTooltipText(text);
    if (!tooltipText) {
      tooltip.hide();
      return;
    }
    if (!(target instanceof HTMLElement)) return;
    tooltip.scheduleShow(tooltipText, target);
  };

  return {
    onMouseEnter: (event) => showFromTarget(event.currentTarget),
    onMouseLeave: () => tooltip.hide(),
    onFocus: (event) => showFromTarget(event.currentTarget),
    onBlur: () => tooltip.hide(),
    onKeyDown: (event) => {
      if (event.key === "Escape") tooltip.hide();
    },
  };
}

/** Ensures no tooltip remains visible when the current component unmounts. */
export function useTooltipCleanup(): void {
  useEffect(() => {
    return () => {
      getSharedCustomTooltip().hide();
    };
  }, []);
}