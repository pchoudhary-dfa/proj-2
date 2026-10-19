"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useCore } from "@/contexts/CoreContext";
import AccessibilityNewIcon from "@mui/icons-material/AccessibilityNew";
import PersonIcon from "@mui/icons-material/Person";
import FormatSizeIcon from "@mui/icons-material/FormatSize";
import ContrastIcon from "@mui/icons-material/Contrast";
import InvertColorsIcon from "@mui/icons-material/InvertColors";
import ZoomOutIcon from "@mui/icons-material/ZoomOut";
import ZoomInIcon from "@mui/icons-material/ZoomIn";
import RestartAltIcon from "@mui/icons-material/RestartAlt";
import CloseIcon from "@mui/icons-material/Close";

const STORAGE_KEY = "dfa-accessibility";
const FONT_SCALE_MIN = 0.5;
const FONT_SCALE_MAX = 1.8;
const FONT_SCALE_STEP = 0.125;

export type AccessibilityState = {
  screenReader: boolean;
  fontScale: number;
  highContrast: boolean;
  invertColor: boolean;
};

const DEFAULT_STATE: AccessibilityState = {
  screenReader: false,
  fontScale: 1,
  highContrast: false,
  invertColor: false,
};

function loadState(): AccessibilityState {
  if (typeof window === "undefined") return DEFAULT_STATE;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_STATE;
    const parsed = JSON.parse(raw) as Partial<AccessibilityState>;
    return {
      screenReader: !!parsed.screenReader,
      fontScale: clampFontScale(parsed.fontScale ?? DEFAULT_STATE.fontScale),
      highContrast: !!parsed.highContrast,
      invertColor: !!parsed.invertColor,
    };
  } catch {
    return DEFAULT_STATE;
  }
}

function clampFontScale(v: number): number {
  const n = Math.round(v / FONT_SCALE_STEP) * FONT_SCALE_STEP;
  return Math.min(FONT_SCALE_MAX, Math.max(FONT_SCALE_MIN, n));
}

const injectedStyleId = "dfa-accessibility-injected-styles";

const FONT_TOKEN_STEPS = ["xs", "sm", "md", "lg", "xl", "xxl"] as const;

/** dfa-toolkit selection modals / lists / tree: --font-size-* set on :root in package styles.css */
const COMPONENT_FONT_SIZE_SUFFIXES = [
  "control",
  "list-item",
  "label",
  "path",
  "type",
  "quick",
  "empty",
] as const;

/**
 * Copy current --font-size-* from the design-token cascade onto --dfa-a11y-token-* (inline).
 * Must run before the a11y stylesheet is appended: a pure-CSS "capture" block cannot work here
 * because var(--font-size-xs) in a sibling :root rule resolves after the scaled value and goes circular.
 */
function captureFontTokensIntoRootStyle() {
  const root = document.documentElement;
  const cs = getComputedStyle(root);
  for (const step of FONT_TOKEN_STEPS) {
    const name = `--font-size-${step}`;
    const v = cs.getPropertyValue(name).trim();
    if (v) root.style.setProperty(`--dfa-a11y-token-${step}`, v);
  }
}

/** Capture rem-based --font-size-control etc. from package :root before we replace them with scaled values. */
function captureComponentFontVarsIntoRootStyle() {
  const root = document.documentElement;
  const cs = getComputedStyle(root);
  for (const suffix of COMPONENT_FONT_SIZE_SUFFIXES) {
    const prop = `--font-size-${suffix}`;
    const v = cs.getPropertyValue(prop).trim();
    if (v) root.style.setProperty(`--dfa-a11y-token-${suffix}`, v);
  }
}

/**
 * Fallbacks on --dfa-a11y-token-* match dfa-toolkit package :root defaults (indicator, list-view, tree-view, area, time-period).
 * Without them, first paint on a route that has not yet loaded lazy toolkit CSS leaves tokens unset; var() is then invalid and
 * toolkit UIs inherit body font-size until a full reload.
 */
const INJECTED_CSS = `
:root {
  --font-size-xs: calc(var(--dfa-a11y-token-xs) * var(--font-scale, 1));
  --font-size-sm: calc(var(--dfa-a11y-token-sm) * var(--font-scale, 1));
  --font-size-md: calc(var(--dfa-a11y-token-md) * var(--font-scale, 1));
  --font-size-lg: calc(var(--dfa-a11y-token-lg) * var(--font-scale, 1));
  --font-size-xl: calc(var(--dfa-a11y-token-xl) * var(--font-scale, 1));
  --font-size-xxl: calc(var(--dfa-a11y-token-xxl) * var(--font-scale, 1));
  --font-size-control: calc(var(--dfa-a11y-token-control, 0.75rem) * var(--font-scale, 1));
  --font-size-list-item: calc(var(--dfa-a11y-token-list-item, 0.8125rem) * var(--font-scale, 1));
  --font-size-label: calc(var(--dfa-a11y-token-label, 0.8125rem) * var(--font-scale, 1));
  --font-size-path: calc(var(--dfa-a11y-token-path, 0.75rem) * var(--font-scale, 1));
  --font-size-type: calc(var(--dfa-a11y-token-type, 0.6875rem) * var(--font-scale, 1));
  --font-size-quick: calc(var(--dfa-a11y-token-quick, 0.875rem) * var(--font-scale, 1));
  --font-size-empty: calc(var(--dfa-a11y-token-empty, 0.8125rem) * var(--font-scale, 1));
}
[data-contrast="high"] {
  --color-surface: #ffffff;
  --color-surface-muted: #f5f5f5;
  --color-surface-elevated: #ffffff;
  --color-text: #000000;
  --color-text-muted: #333333;
  --color-border: #000000;
}
[data-invert="true"] {
  filter: invert(1);
}
/* Double-invert raster images only so photos look natural. Do not double-invert SVG:
   that restores original dark icon fills while card/text stays singly inverted → black icons on dark cards. */
[data-invert="true"] img,
[data-invert="true"] picture img {
  filter: invert(1);
}
[data-screen-reader="true"] *:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: 2px;
}
/* Search (dfa-v6-comp-kw-search): blend height-based sizing with a11y font scaling.
   When options.style.height is set, --sc-*-fs variables are set on .dtk-sch-root
   and cascade to all children. We use those as the base and multiply by --font-scale so both
   height-proportional sizing and accessibility scaling work together.
   When style.height is omitted, --sc-*-fs is unset and the fallback is the un-scaled design token
   (--dfa-a11y-token-*) × --font-scale, which equals the old var(--font-size-*) behaviour. */
.dtk-sch-placeholder { font-size: calc(var(--sc-input-fs, var(--dfa-a11y-token-lg)) * var(--font-scale, 1)) !important; }
.dtk-sch-input { font-size: calc(var(--sc-input-fs, var(--dfa-a11y-token-lg)) * var(--font-scale, 1)) !important; }
.dtk-sch-suggestionText { font-size: calc(var(--sc-suggestion-fs, var(--dfa-a11y-token-lg)) * var(--font-scale, 1)) !important; }
.dtk-sch-badge { font-size: calc(var(--sc-badge-fs, var(--dfa-a11y-token-xs)) * var(--font-scale, 1)) !important; }
.dtk-sch-empty { font-size: calc(var(--sc-empty-fs, var(--dfa-a11y-token-sm)) * var(--font-scale, 1)) !important; }
.dtk-sch-chip { font-size: calc(var(--sc-chip-fs, var(--dfa-a11y-token-sm)) * var(--font-scale, 1)) !important; }
.dtk-sch-chipX { font-size: calc(var(--sc-chip-fs, var(--dfa-a11y-token-md)) * var(--font-scale, 1)) !important; }
.dtk-sch-btn { font-size: calc(var(--dfa-a11y-token-sm) * var(--font-scale, 1)) !important; }
.dtk-sch-chipMore { font-size: calc(var(--sc-chip-fs, var(--dfa-a11y-token-sm)) * var(--font-scale, 1)) !important; }
.dtk-sch-chipsListItemText { font-size: calc(var(--dfa-a11y-token-md) * var(--font-scale, 1)) !important; }
@media (max-width: 640px) {
  .dtk-sch-btn { font-size: calc(var(--dfa-a11y-token-sm) * var(--font-scale, 1)) !important; }
  .dtk-sch-input, .dtk-sch-placeholder { font-size: calc(var(--sc-input-fs, var(--dfa-a11y-token-md)) * var(--font-scale, 1)) !important; }
}
/* Gallery page: card labels and export dropdown use scaled tokens */
.gallery-cards-grid { font-size: var(--font-size-md); }
.gallery-cards-grid .text-sm { font-size: var(--font-size-sm) !important; }
.gallery-cards-grid .text-xs { font-size: var(--font-size-xs) !important; }
.gallery-cards-grid .text-md { font-size: var(--font-size-md) !important; }
`;

type AccessibilityContextValue = {
  state: AccessibilityState;
  setScreenReader: (v: boolean) => void;
  setFontScale: (v: number) => void;
  setHighContrast: (v: boolean) => void;
  setInvertColor: (v: boolean) => void;
  resetAll: () => void;
};

const AccessibilityContext = createContext<AccessibilityContextValue | null>(null);

function useAccessibility() {
  const ctx = useContext(AccessibilityContext);
  if (!ctx) throw new Error("Accessibility used outside AccessibilityProvider");
  return ctx;
}

function injectStyle() {
  if (document.getElementById(injectedStyleId)) return;
  const append = () => {
    if (document.getElementById(injectedStyleId)) return;
    const el = document.createElement("style");
    el.id = injectedStyleId;
    el.textContent = INJECTED_CSS;
    document.head.appendChild(el);
  };
  captureFontTokensIntoRootStyle();
  captureComponentFontVarsIntoRootStyle();
  const root = document.documentElement;
  const tokensReady = FONT_TOKEN_STEPS.every((s) =>
    root.style.getPropertyValue(`--dfa-a11y-token-${s}`).trim()
  );
  if (tokensReady) {
    append();
  } else {
    requestAnimationFrame(() => {
      captureFontTokensIntoRootStyle();
      captureComponentFontVarsIntoRootStyle();
      append();
    });
  }
}

/** Re-append so scaled :root rules stay after any lazily loaded stylesheets that set --font-size-*. */
function ensureInjectedStyleLast() {
  const el = document.getElementById(injectedStyleId);
  if (el) document.head.appendChild(el);
}

function applyToDocument(state: AccessibilityState) {
  const root = document.documentElement;
  root.style.setProperty("--font-scale", String(state.fontScale));
  root.setAttribute("data-screen-reader", state.screenReader ? "true" : "false");
  root.setAttribute("data-contrast", state.highContrast ? "high" : "normal");
  root.setAttribute("data-invert", state.invertColor ? "true" : "false");
  ensureInjectedStyleLast();
}

function AccessibilityProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AccessibilityState>(DEFAULT_STATE);

  useEffect(() => {
    setState(loadState());
  }, []);

  useEffect(() => {
    injectStyle();
  }, []);

  useEffect(() => {
    applyToDocument(state);
  }, [state]);

  const persist = useCallback((next: AccessibilityState) => {
    setState(next);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // ignore
    }
  }, []);

  const setScreenReader = useCallback(
    (v: boolean) => persist({ ...state, screenReader: v }),
    [state, persist]
  );
  const setFontScale = useCallback(
    (v: number) => persist({ ...state, fontScale: clampFontScale(v) }),
    [state, persist]
  );
  const setHighContrast = useCallback(
    (v: boolean) => persist({ ...state, highContrast: v }),
    [state, persist]
  );
  const setInvertColor = useCallback(
    (v: boolean) => persist({ ...state, invertColor: v }),
    [state, persist]
  );
  const resetAll = useCallback(() => persist(DEFAULT_STATE), [persist]);

  const value = useMemo(
    () => ({
      state,
      setScreenReader,
      setFontScale,
      setHighContrast,
      setInvertColor,
      resetAll,
    }),
    [
      state,
      setScreenReader,
      setFontScale,
      setHighContrast,
      setInvertColor,
      resetAll,
    ]
  );

  return (
    <AccessibilityContext.Provider value={value}>
      {children}
    </AccessibilityContext.Provider>
  );
}

const LABEL_HIDE_DELAY_MS = 200;

function AccessibilityButton({
  isMenuOpen,
  onToggle,
  label,
}: {
  isMenuOpen: boolean;
  onToggle: () => void;
  label: string;
}) {
  const [showLabel, setShowLabel] = useState(false);
  const hideTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearHideTimeout = useCallback(() => {
    if (hideTimeoutRef.current != null) {
      clearTimeout(hideTimeoutRef.current);
      hideTimeoutRef.current = null;
    }
  }, []);

  const handleEnter = useCallback(() => {
    clearHideTimeout();
    setShowLabel(true);
  }, [clearHideTimeout]);

  const handleLeave = useCallback(() => {
    clearHideTimeout();
    hideTimeoutRef.current = setTimeout(() => setShowLabel(false), LABEL_HIDE_DELAY_MS);
  }, [clearHideTimeout]);

  useEffect(() => {
    return () => clearHideTimeout();
  }, [clearHideTimeout]);

  const expanded = showLabel || isMenuOpen;

  return (
    <div
      className="a11y-floating-anchor fixed z-30 flex flex-col items-start"
    >
      <button
        type="button"
        onClick={onToggle}
        onMouseEnter={handleEnter}
        onMouseLeave={handleLeave}
        onFocus={handleEnter}
        onBlur={handleLeave}
        className="inline-flex items-center rounded-full bg-primary text-on-primary h-12 flex-shrink-0 justify-center shadow-md hover:bg-primary-hover transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 overflow-hidden"
        style={{
          fontFamily: "var(--font-body)",
          width: expanded ? "auto" : 48,
          minWidth: 48,
          paddingLeft: expanded ? 12 : 12,
          paddingRight: expanded ? 12 : 12,
          gap: expanded ? 6 : 0,
          transition: "background-color 0.2s, width 0.2s ease-out, gap 0.2s ease-out",
        }}
        aria-label={label}
        aria-expanded={isMenuOpen}
        aria-haspopup="true"
      >
        <AccessibilityNewIcon className="w-6 h-6 shrink-0" aria-hidden />
        <span
          className="overflow-hidden whitespace-nowrap text-xs font-medium"
          style={{
            fontFamily: "var(--font-body)",
            maxWidth: expanded ? 160 : 0,
            opacity: expanded ? 1 : 0,
            transition: "max-width 0.2s ease-out, opacity 0.15s ease-out",
          }}
        >
          {label}
        </span>
      </button>
    </div>
  );
}

function AccessibilityMenu({
  onClose,
  isOpen,
}: {
  onClose: () => void;
  isOpen: boolean;
}) {
  const { t } = useCore();
  const {
    state,
    setScreenReader,
    setFontScale,
    setHighContrast,
    setInvertColor,
    resetAll,
  } = useAccessibility();

  const handleDecreaseFont = () =>
    setFontScale(state.fontScale - FONT_SCALE_STEP);
  const handleIncreaseFont = () =>
    setFontScale(state.fontScale + FONT_SCALE_STEP);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const cardBase =
    "rounded-lg p-3 flex flex-col items-center justify-center gap-1.5 transition-colors hover:border-primary h-[96px] w-full min-w-0";
  const cardBorder = (enabled: boolean) =>
    enabled ? "border-2 border-primary" : "border border-border";
  const cardBg = (enabled: boolean) =>
    enabled ? "bg-primary/10" : "bg-surface";

  return (
    <>
      <div
        className="fixed inset-0 z-[39]"
        aria-hidden
        onClick={onClose}
      />
      <div
        className="fixed z-40 w-[min(280px,calc(100vw-2*var(--spacing-lg)))] rounded-lg shadow-lg overflow-hidden flex flex-col bg-surface"
        style={{
          boxShadow: "var(--shadow-md)",
          bottom: "max(var(--spacing-lg), env(safe-area-inset-bottom))",
          left: "max(var(--spacing-lg), env(safe-area-inset-left))",
        }}
        role="dialog"
        aria-labelledby="accessibility-menu-title"
      >
      <div className="bg-primary text-on-primary px-3 py-2 flex items-center justify-between flex-shrink-0">
        <h2
          id="accessibility-menu-title"
          className="font-body text-xs font-semibold flex items-center gap-1.5"
          style={{ fontFamily: "var(--font-body)" }}
        >
          <AccessibilityNewIcon className="w-4 h-4" aria-hidden />
          {t("ACCESSIBILITY_OPTIONS")}
        </h2>
        <button
          type="button"
          onClick={onClose}
          className="p-1 rounded text-on-primary hover:bg-white/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
          aria-label={t("MODAL_CANCEL")}
        >
          <CloseIcon className="w-4 h-4" />
        </button>
      </div>
      <div className="p-3 flex-1 grid grid-cols-2 gap-2">
        {false && (
        <button
          type="button"
          onClick={() => setScreenReader(!state.screenReader)}
          className={`${cardBase} ${cardBorder(state.screenReader)} ${cardBg(state.screenReader)}`}
          aria-pressed={state.screenReader}
        >
          <PersonIcon className="w-6 h-6 text-text" />
          <span className="text-xs font-body text-text" style={{ fontFamily: "var(--font-body)" }}>
            {t("A11Y_SCREEN_READER")}
          </span>
        </button>
        )}
        <div className={`${cardBase} ${cardBorder(false)} ${cardBg(false)} cursor-default`}>
          <FormatSizeIcon className="w-6 h-6 text-text" />
          <span className="text-xs font-body text-text" style={{ fontFamily: "var(--font-body)" }}>
            {t("A11Y_FONT_SIZE")}
          </span>
          <div className="flex items-center justify-center gap-1 mt-0.5">
            <button
              type="button"
              onClick={handleDecreaseFont}
              disabled={state.fontScale <= FONT_SCALE_MIN}
              className="p-1 min-w-0 rounded-md border border-border bg-surface hover:bg-surface-muted hover:border-primary disabled:opacity-50 disabled:cursor-not-allowed text-text inline-flex items-center justify-center"
              aria-label={t("A11Y_FONT_SIZE_DECREASE")}
            >
              <ZoomOutIcon className="w-3 h-3 shrink-0" />
            </button>
            <span className="text-xs font-body text-text min-w-[2.25rem] text-center" style={{ fontFamily: "var(--font-body)" }}>
              {Math.round(state.fontScale * 100)}%
            </span>
            <button
              type="button"
              onClick={handleIncreaseFont}
              disabled={state.fontScale >= FONT_SCALE_MAX}
              className="p-1 min-w-0 rounded-md border border-border bg-surface hover:bg-surface-muted hover:border-primary disabled:opacity-50 disabled:cursor-not-allowed text-text inline-flex items-center justify-center"
              aria-label={t("A11Y_FONT_SIZE_INCREASE")}
            >
              <ZoomInIcon className="w-3 h-3 shrink-0" />
            </button>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setHighContrast(!state.highContrast)}
          className={`${cardBase} ${cardBorder(state.highContrast)} ${cardBg(state.highContrast)}`}
          aria-pressed={state.highContrast}
        >
          <ContrastIcon className="w-6 h-6 text-text" />
          <span className="text-xs font-body text-text" style={{ fontFamily: "var(--font-body)" }}>
            {t("A11Y_HIGH_CONTRAST")}
          </span>
        </button>
        <button
          type="button"
          onClick={() => setInvertColor(!state.invertColor)}
          className={`${cardBase} ${cardBorder(state.invertColor)} ${cardBg(state.invertColor)}`}
          aria-pressed={state.invertColor}
        >
          <InvertColorsIcon className="w-6 h-6 text-text" />
          <span className="text-xs font-body text-text" style={{ fontFamily: "var(--font-body)" }}>
            {t("A11Y_INVERT_COLOR")}
          </span>
        </button>
      </div>
      <div className="p-2 border-t border-border flex justify-center flex-shrink-0">
        <button
          type="button"
          onClick={() => {
            resetAll();
            onClose();
          }}
          className="flex items-center gap-1.5 text-primary font-body text-xs font-medium hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 rounded px-2 py-1"
          style={{ fontFamily: "var(--font-body)" }}
        >
          <RestartAltIcon className="w-4 h-4" />
          {t("A11Y_RESET_ALL_SETTINGS")}
        </button>
      </div>
    </div>
    </>
  );
}

function AccessibilityControl() {
  const { t } = useCore();
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <>
      <AccessibilityButton
        isMenuOpen={menuOpen}
        onToggle={() => setMenuOpen((o) => !o)}
        label={t("ACCESSIBILITY_OPTIONS")}
      />
      <AccessibilityMenu isOpen={menuOpen} onClose={() => setMenuOpen(false)} />
    </>
  );
}

export function AccessibilityRoot({ children }: { children: ReactNode }) {
  return (
    <AccessibilityProvider>
      {children}
      <AccessibilityControl />
    </AccessibilityProvider>
  );
}
