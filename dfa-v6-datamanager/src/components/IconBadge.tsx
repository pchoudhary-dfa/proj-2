"use client";

type IconBadgeSymbol = "tick" | "cross";
type IconBadgeTone = "success" | "error" | "warning" | "muted" | "primary";
type IconBadgeSize = "sm" | "md";
type IconBadgeShape = "circle" | "square";
type IconBadgeVariant = "filled" | "inline";

const SYMBOL_CHAR: Record<IconBadgeSymbol, string> = {
  tick: "✓",
  cross: "✗",
};

const DEFAULT_TONE: Record<IconBadgeSymbol, IconBadgeTone> = {
  tick: "success",
  cross: "error",
};

function cx(...parts: (string | undefined | false)[]) {
  return parts.filter(Boolean).join(" ");
}

export type IconBadgeProps = {
  symbol: IconBadgeSymbol;
  tone?: IconBadgeTone;
  size?: IconBadgeSize;
  shape?: IconBadgeShape;
  /** `filled` — solid badge; `inline` — symbol color only (no background). */
  variant?: IconBadgeVariant;
  className?: string;
  title?: string;
  ariaLabel?: string;
  ariaHidden?: boolean;
};

/**
 * Compact tick/cross indicator — side nav configured state, tab badges, CRUD matrix, password rules.
 */
export function IconBadge({
  symbol,
  tone,
  size = "md",
  shape = "circle",
  variant = "filled",
  className,
  title,
  ariaLabel,
  ariaHidden,
}: IconBadgeProps) {
  const resolvedTone = tone ?? DEFAULT_TONE[symbol];

  return (
    <span
      className={cx(
        "icon-badge",
        variant === "filled" && `icon-badge--${resolvedTone}`,
        variant === "inline" && `icon-badge--inline-${resolvedTone}`,
        variant === "filled" && `icon-badge--${shape}`,
        `icon-badge--${size}`,
        className
      )}
      title={title}
      aria-label={ariaHidden ? undefined : ariaLabel}
      aria-hidden={ariaHidden ? true : ariaLabel ? undefined : true}
    >
      {SYMBOL_CHAR[symbol]}
    </span>
  );
}

/** Invisible width/height match for rows that optionally show an {@link IconBadge}. */
export function IconBadgeSpacer({ size = "md" }: { size?: IconBadgeSize }) {
  return (
    <span
      className={cx("icon-badge-spacer", `icon-badge--${size}`)}
      aria-hidden
    />
  );
}
