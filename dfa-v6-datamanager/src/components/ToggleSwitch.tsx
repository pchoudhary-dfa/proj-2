"use client";

import { forwardRef, type MouseEvent, type Ref } from "react";

export type ToggleSwitchSize = "sm" | "md";
export type ToggleSwitchAppearance = "pill" | "rounded";

export interface ToggleSwitchProps {
  checked: boolean;
  onCheckedChange?: (checked: boolean) => void;
  /**
   * Disables interaction on buttons. With `readOnly`, applies the same muted visuals
   * (`cursor-not-allowed`, reduced opacity) without rendering a focusable control.
   */
  disabled?: boolean;
  /** Non-interactive display (grid cells, banners). Same visuals; no focus or click. */
  readOnly?: boolean;
  id?: string;
  title?: string;
  "aria-label"?: string;
  /**
   * `sm` = `.tog-track--sm` (grids, IAM); knob on via CSS when track has `.tog-on`.
   * `md` = `.tog-track--md` (workflow drawer). Ignored when `appearance` is `rounded`.
   */
  size?: ToggleSwitchSize;
  /** `pill` = `.tog-track--sm`. `rounded` = `.tog-track--rounded` (subgroup default). */
  appearance?: ToggleSwitchAppearance;
  className?: string;
  "data-tv-enter-field"?: string;
  /** Runs before the built-in toggle (e.g. `stopPropagation` on table cells). */
  onClick?: (e: MouseEvent<HTMLButtonElement>) => void;
}

function trackBase(size: ToggleSwitchSize, appearance: ToggleSwitchAppearance): string {
  if (appearance === "rounded") return "tog-track--rounded";
  if (size === "md") return "tog-track--md";
  return "tog-track--sm";
}

function knobClass(): string {
  return "tog-k";
}

export const ToggleSwitch = forwardRef<HTMLButtonElement | HTMLSpanElement, ToggleSwitchProps>(
  function ToggleSwitch(
    {
      checked,
      onCheckedChange,
      disabled = false,
      readOnly = false,
      id,
      title,
      "aria-label": ariaLabel,
      size = "sm",
      appearance = "pill",
      className = "",
      "data-tv-enter-field": dataTvEnterField,
      onClick: onClickProp,
    },
    ref
  ) {
    const track = trackBase(size, appearance);
    const knob = knobClass();
    const on = checked ? " bg-primary tog-on" : "";
    const disabledVisual = disabled ? "cursor-not-allowed opacity-40" : "";
    const mergedTrack = [track + on, readOnly ? disabledVisual : "", className]
      .filter(Boolean)
      .join(" ");

    if (readOnly) {
      return (
        <span
          ref={ref as Ref<HTMLSpanElement>}
          className={mergedTrack}
          title={title}
          role="img"
          aria-label={ariaLabel ?? title ?? undefined}
        >
          <span className={knob} aria-hidden />
        </span>
      );
    }

    return (
      <button
        ref={ref as Ref<HTMLButtonElement>}
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        title={title}
        aria-label={ariaLabel}
        data-tv-enter-field={dataTvEnterField}
        className={`${mergedTrack} disabled:cursor-not-allowed disabled:opacity-40`.trim()}
        onClick={(e) => {
          onClickProp?.(e);
          if (disabled) return;
          onCheckedChange?.(!checked);
        }}
      >
        <span className={knob} aria-hidden />
      </button>
    );
  }
);

ToggleSwitch.displayName = "ToggleSwitch";
