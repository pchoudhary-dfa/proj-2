"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type HTMLAttributes,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
} from "react";

function cx(...parts: (string | undefined | false)[]) {
  return parts.filter(Boolean).join(" ");
}

export type SideNavListColumnProps = {
  /** Pixel width; merged into `style` so resizable panels can update it. */
  width?: number;
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
};

/**
 * Narrow sidebar column (metadata categories, compute subgroup list, etc.).
 * Pair with {@link SideNavList} and {@link SideNavItem}; styles live in `globals.css` under `.side-nav-*`.
 */
export function SideNavListColumn({
  width,
  className,
  style,
  children,
}: SideNavListColumnProps) {
  return (
    <div
      className={cx("side-nav-col", className)}
      style={{ ...style, ...(width != null ? { width } : undefined) }}
    >
      {children}
    </div>
  );
}

export type SideNavListProps = {
  className?: string;
  children: ReactNode;
};

export function SideNavList({ className, children }: SideNavListProps) {
  return <div className={cx("side-nav-list", className)}>{children}</div>;
}

export type SideNavItemProps = {
  active?: boolean;
  children: ReactNode;
  className?: string;
  onClick?: () => void;
  onDoubleClick?: (e: MouseEvent<HTMLDivElement>) => void;
  onKeyDown?: (e: KeyboardEvent<HTMLDivElement>) => void;
} & Omit<
  HTMLAttributes<HTMLDivElement>,
  | "role"
  | "tabIndex"
  | "onClick"
  | "onDoubleClick"
  | "onKeyDown"
  | "children"
>;

/**
 * Selectable row in a side nav list. Adds `active` state and default Enter/Space handling
 * unless `onKeyDown` is provided (metadata tab uses a custom handler).
 */
export function SideNavItem({
  active,
  children,
  className,
  onClick,
  onDoubleClick,
  onKeyDown,
  ...rest
}: SideNavItemProps) {
  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (onKeyDown) {
      onKeyDown(e);
      return;
    }
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onClick?.();
    }
  };

  return (
    <div
      role="button"
      tabIndex={0}
      className={cx("side-nav-item", active && "active", className)}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      onKeyDown={handleKeyDown}
      {...rest}
    >
      {children}
    </div>
  );
}

/** Label cell: truncates with ellipsis; click to expand/collapse full text. */
export function SideNavTruncatingLabel({
  text,
  className,
  expandable = false,
}: {
  text: string;
  className?: string;
  expandable?: boolean;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const [isTruncated, setIsTruncated] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const measure = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    setIsTruncated(el.scrollWidth > el.clientWidth);
  }, []);

  useLayoutEffect(() => {
    if (!expanded) measure();
  }, [text, measure, expanded]);

  useEffect(() => {
    if (expanded) return;
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => measure());
    ro.observe(el);
    return () => ro.disconnect();
  }, [measure, expanded]);

  useEffect(() => {
    setExpanded(false);
  }, [text]);

  const handleClick = useCallback(() => {
    if (!expandable) return;
    if (isTruncated || expanded) setExpanded((p) => !p);
  }, [expandable, isTruncated, expanded]);

  return (
    <span
      ref={ref}
      className={cx(
        expanded ? "side-nav-item-label-expanded" : "side-nav-item-label",
        expandable && isTruncated && !expanded ? "cursor-pointer" : undefined,
        expandable && expanded ? "cursor-pointer" : undefined,
        className
      )}
      title={!expanded && isTruncated ? text : undefined}
      onClick={handleClick}
    >
      {text}
    </span>
  );
}
