"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type FocusEvent,
  type KeyboardEvent,
} from "react";
import { ENABLE_GRID_AUTOSUGGESTIONS } from "@/lib/constants";

export type GridAutoSuggestInputProps = {
  value: string;
  onChange: (e: ChangeEvent<HTMLInputElement>) => void;
  suggestions?: string[];
  /** When true, Tab accepts ghost suggestion; when false, Tab keeps native focus traversal. */
  acceptSuggestionOnTab?: boolean;
  placeholder?: string;
  autoFocus?: boolean;
  className?: string;
  disabled?: boolean;
  "aria-invalid"?: boolean;
  "aria-label"?: string;
  "aria-expanded"?: boolean;
  "aria-autocomplete"?: "none" | "inline" | "list" | "both";
  autoComplete?: string;
  onKeyDown?: (e: KeyboardEvent<HTMLInputElement>) => void;
  onFocus?: (e: FocusEvent<HTMLInputElement>) => void;
  onBlur?: (e: FocusEvent<HTMLInputElement>) => void;
  type?: React.HTMLInputTypeAttribute;
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"];
  /** TableView grid keyboard navigation (e.g. add row). */
  "data-tv-enter-field"?: string | boolean;
};

/**
 * Ghost-text autocomplete for the last word (NIS.Cost CustomTableGrid-style).
 * Disabled unless {@link ENABLE_GRID_AUTOSUGGESTIONS} is true.
 */
export const GridAutoSuggestInput = forwardRef<
  HTMLInputElement,
  GridAutoSuggestInputProps
>(function GridAutoSuggestInput(
  {
    value,
    onChange,
    suggestions = [],
    acceptSuggestionOnTab = true,
    onKeyDown,
    onFocus,
    onBlur,
    className = "",
    disabled = false,
    "aria-invalid": ariaInvalid,
    "data-tv-enter-field": dataTvEnterField,
    ...rest
  },
  ref
) {
  const [fullCompletion, setFullCompletion] = useState("");
  const [suffix, setSuffix] = useState("");
  const [isFocused, setIsFocused] = useState(false);
  const [cursorAtEnd, setCursorAtEnd] = useState(true);
  const realRef = useRef<HTMLInputElement | null>(null);
  const ghostRef = useRef<HTMLInputElement | null>(null);

  const setRefs = useCallback(
    (el: HTMLInputElement | null) => {
      realRef.current = el;
      if (typeof ref === "function") ref(el);
      else if (ref) ref.current = el;
    },
    [ref]
  );

  const enabled = ENABLE_GRID_AUTOSUGGESTIONS;

  useEffect(() => {
    if (!enabled || !value) {
      setFullCompletion("");
      setSuffix("");
      return;
    }
    const str = String(value);
    const words = str.split(/\s+/);
    const currentWord = words[words.length - 1] || "";
    if (!currentWord) {
      setFullCompletion("");
      setSuffix("");
      return;
    }

    const vocab = new Set<string>();
    suggestions.forEach((s) => {
      if (typeof s === "string") {
        s.split(/\s+/).forEach((w) => {
          const t = w.trim();
          if (t) vocab.add(t);
        });
      }
    });

    const nextWord = Array.from(vocab).find(
      (w) =>
        w.toLowerCase().startsWith(currentWord.toLowerCase()) &&
        w.toLowerCase() !== currentWord.toLowerCase()
    );
    if (!nextWord) {
      setFullCompletion("");
      setSuffix("");
      return;
    }

    const prev = words.slice(0, -1).join(" ");
    const completed = prev ? `${prev} ${nextWord}` : nextWord;
    setFullCompletion(completed);
    setSuffix(nextWord.slice(currentWord.length));
  }, [value, suggestions, enabled]);

  const syncScroll = useCallback(() => {
    if (!realRef.current || !ghostRef.current) return;
    ghostRef.current.scrollLeft = realRef.current.scrollLeft;
  }, []);

  useEffect(() => {
    syncScroll();
  }, [value, suffix, syncScroll]);

  const updateCursorAtEnd = useCallback(() => {
    const el = realRef.current;
    if (!el) return;
    const { selectionStart, selectionEnd, value: v } = el;
    setCursorAtEnd(selectionStart === v.length && selectionEnd === v.length);
  }, []);

  useEffect(() => {
    if (isFocused) updateCursorAtEnd();
  }, [value, isFocused, updateCursorAtEnd]);

  const showGhost =
    enabled && suffix && !disabled && isFocused && cursorAtEnd;

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (enabled && acceptSuggestionOnTab && e.key === "Tab" && fullCompletion) {
      e.preventDefault();
      onChange({ target: { value: fullCompletion } } as ChangeEvent<HTMLInputElement>);
      setFullCompletion("");
      setSuffix("");
      return;
    }
    if (enabled && e.key === "Escape" && (fullCompletion || suffix)) {
      e.preventDefault();
      setFullCompletion("");
      setSuffix("");
      return;
    }
    onKeyDown?.(e);
  };

  if (!enabled) {
    return (
      <input
        ref={setRefs}
        type="text"
        value={value}
        onChange={(e) => {
          e.stopPropagation();
          onChange(e);
        }}
        onKeyDown={onKeyDown}
        onKeyUp={(e) => {
          e.stopPropagation();
        }}
        onClick={(e) => e.stopPropagation()}
        onFocus={(e) => {
          setIsFocused(true);
          onFocus?.(e);
        }}
        onBlur={(e) => {
          setIsFocused(false);
          onBlur?.(e);
        }}
        disabled={disabled}
        aria-invalid={ariaInvalid}
        className={className}
        {...rest}
        data-tv-enter-field={
          dataTvEnterField === true || dataTvEnterField === "true"
            ? "true"
            : typeof dataTvEnterField === "string" && dataTvEnterField !== ""
              ? dataTvEnterField
              : undefined
        }
      />
    );
  }

  return (
    <div className="relative w-full min-w-0" style={{ position: "relative", width: "100%" }}>
      {showGhost ? (
        <input
          ref={ghostRef}
          type="text"
          value={value + suffix}
          readOnly
          aria-hidden
          tabIndex={-1}
          className={className}
          spellCheck={false}
          autoCorrect="off"
          autoCapitalize="off"
          style={{
            position: "absolute",
            inset: 0,
            zIndex: 1,
            color: "#9ca3af",
            background: "transparent",
            pointerEvents: "none",
            border: "none",
            outline: "none",
            boxShadow: "none",
            appearance: "none",
            boxSizing: "border-box",
            whiteSpace: "pre",
            direction: "inherit",
            caretColor: "transparent",
          }}
        />
      ) : null}

      <input
        ref={setRefs}
        type="text"
        value={value}
        onChange={(e) => {
          e.stopPropagation();
          onChange(e);
          updateCursorAtEnd();
        }}
        onKeyDown={handleKeyDown}
        onKeyUp={(e) => {
          e.stopPropagation();
          updateCursorAtEnd();
        }}
        onClick={(e) => {
          e.stopPropagation();
          updateCursorAtEnd();
        }}
        onSelect={(e) => {
          e.stopPropagation();
          updateCursorAtEnd();
        }}
        onScroll={syncScroll}
        onFocus={(e) => {
          setIsFocused(true);
          updateCursorAtEnd();
          onFocus?.(e);
        }}
        onBlur={(e) => {
          setIsFocused(false);
          onBlur?.(e);
        }}
        disabled={disabled}
        aria-invalid={ariaInvalid}
        className={className}
        spellCheck={false}
        autoComplete="off"
        {...rest}
        data-tv-enter-field={
          dataTvEnterField === true || dataTvEnterField === "true"
            ? "true"
            : typeof dataTvEnterField === "string" && dataTvEnterField !== ""
              ? dataTvEnterField
              : undefined
        }
      />
    </div>
  );
});
